-- Paiement en ligne des commandes de la boutique (09/11/2026). Migration additive : aucune donnée effacée.
-- Les liens de paiement servent aussi aux commandes confirmées par l'équipe. Un lien a exactement une source :
-- un devis (devis_id + demande_id, inchangé) ou une commande (commande_id). Montant = total_xof de la commande,
-- recopié par le serveur ; paiement complet en une fois, jamais d'acompte ; encaissement en XOF.
-- Comptes : la commande additionne ses paiements manuels confirmés ET ses liens payés (montant_recu) ; la clôture et
-- les écrans comptent déjà les liens payés d'un côté, les paiements manuels de l'autre : une même somme n'entre qu'une fois.

alter table public.liens_paiement alter column devis_id drop not null;
alter table public.liens_paiement alter column demande_id drop not null;
alter table public.liens_paiement add column if not exists commande_id uuid references public.boutique_commandes (id) on delete restrict;
alter table public.liens_paiement add constraint liens_paiement_source check (
  (commande_id is null and devis_id is not null and demande_id is not null)
  or (commande_id is not null and devis_id is null and demande_id is null and facture_id is null)
);
-- un seul lien vivant par commande (comme par devis) ; recherche des liens payés d'une commande
create unique index if not exists liens_paiement_commande_vivant on public.liens_paiement (commande_id) where commande_id is not null and annule_le is null and paye_le is null;
create index if not exists liens_paiement_commande on public.liens_paiement (commande_id) where commande_id is not null;

-- Source, montant, devise, langue, passerelles et échéance restent figés ; un lien payé le reste.
create or replace function public.liens_figes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.devis_id is distinct from old.devis_id or new.demande_id is distinct from old.demande_id or new.commande_id is distinct from old.commande_id
     or new.montant <> old.montant or new.devise <> old.devise
     or new.langue <> old.langue or new.passerelles <> old.passerelles or new.expire_le <> old.expire_le or new.cree_le <> old.cree_le
     or (old.paye_le is not null and new.paye_le is distinct from old.paye_le) then
    raise exception 'lien_fige' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Taux figé : le lien d'un devis reprend celui du devis publié, le lien d'une commande celui de la commande.
create or replace function public.figer_taux_document()
returns trigger language plpgsql set search_path = public as $$
declare v record; v_fige boolean;
begin
  if tg_op = 'UPDATE' then
    v_fige := true;
    if tg_table_name = 'devis' then
      v_fige := old.publie_le is not null;
      if v_fige and new.publie_le is distinct from old.publie_le then
        raise exception 'taux_document_fige' using errcode = 'P0001';
      end if;
    end if;
    if v_fige then
      if row(new.taux_eur,new.taux_usd,new.taux_usd_le,new.taux_usd_source)
        is distinct from row(old.taux_eur,old.taux_usd,old.taux_usd_le,old.taux_usd_source) then
        raise exception 'taux_document_fige' using errcode = 'P0001';
      end if;
      return new;
    end if;
  end if;
  if tg_table_name = 'devis' then
    if new.publie_le is null then return new; end if;
    select taux_eur,taux_usd,taux_usd_le,taux_usd_source into v from public.reglages_site where id = true;
  elsif tg_table_name = 'factures' then
    select taux_eur,taux_usd,taux_usd_le,taux_usd_source into v from public.devis where id = new.devis_id and publie_le is not null;
  elsif tg_table_name = 'liens_paiement' then
    if new.commande_id is null then
      select taux_eur,taux_usd,taux_usd_le,taux_usd_source into v from public.devis where id = new.devis_id and publie_le is not null;
    else
      select taux_eur,taux_usd,taux_usd_le,taux_usd_source into v from public.boutique_commandes where id = new.commande_id;
    end if;
  else
    -- Le taux fourni par l'API boutique est figé à l'insertion ; aucun taux d'aujourd'hui ne remplace ensuite ce choix.
    return new;
  end if;
  if not found then raise exception 'taux_document_indisponible' using errcode = 'P0001'; end if;
  new.taux_eur := v.taux_eur; new.taux_usd := v.taux_usd; new.taux_usd_le := v.taux_usd_le; new.taux_usd_source := v.taux_usd_source;
  return new;
end;
$$;

-- État de règlement d'une commande : paiements manuels confirmés (écritures inverses comprises, euros au taux fixe)
-- + liens payés. Total exact : « paye », reçu R- émis et lien encore ouvert annulé ; rien : « attente » ; sinon écart.
create or replace function public.boutique_recalculer_commande(p_commande uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c public.boutique_commandes; manuel bigint; en_ligne bigint; total bigint; attendu integer; v_etat text;
begin
  select * into c from public.boutique_commandes where id = p_commande for update;
  if not found then raise exception 'commande_introuvable'; end if;
  attendu := coalesce(c.total_xof,round(c.total_eur * 655.957)::integer);
  select coalesce(sum(case when devise = 'EUR' then sign(montant)*round(abs(montant)::numeric*655957/100000) else montant end),0)
    into manuel from public.paiements_manuels where commande_id = c.id and etat = 'confirme';
  select coalesce(sum(montant),0) into en_ligne from public.liens_paiement where commande_id = c.id and paye_le is not null;
  total := manuel + en_ligne;
  v_etat := case when attendu > 0 and total = attendu then 'paye' when total = 0 then 'attente' else 'a_regulariser' end;
  update public.boutique_commandes set montant_recu = total, paiement_etat = v_etat,
    paye_le = case when v_etat = 'paye' then coalesce(paye_le,now()) else null end where id = c.id;
  if v_etat = 'paye' then
    perform public.emettre_document('R','commande',c.id);
    update public.liens_paiement set annule_le = now(), modifie_le = now()
      where commande_id = c.id and paye_le is null and annule_le is null;
  end if;
  return v_etat;
end;
$$;
revoke all on function public.boutique_recalculer_commande(uuid) from public, anon, authenticated;

-- Paiement manuel d'une commande : mêmes refus qu'avant, plus une commande déjà réglée en ligne (jamais deux règlements).
create or replace function public.boutique_recalculer_paiement()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.boutique_commandes; attendu integer;
begin
  if new.commande_id is null then return new; end if;
  select * into c from public.boutique_commandes where id = new.commande_id for update;
  if not found then raise exception 'commande_introuvable'; end if;
  attendu := coalesce(c.total_xof,round(c.total_eur * 655.957)::integer);
  if new.etat = 'confirme' and new.inverse_de is null and (c.statut in ('a_confirmer','annulee') or attendu is null or attendu <= 0
      or exists (select 1 from public.liens_paiement where commande_id = c.id and paye_le is not null)) then
    raise exception 'commande_non_payable';
  end if;
  perform public.boutique_recalculer_commande(c.id);
  return new;
end;
$$;

-- Lien d'une commande payé (passerelle relue par le serveur) : la commande est recalculée dans la même transaction.
create or replace function public.liens_commande_regle()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.boutique_recalculer_commande(new.commande_id);
  return new;
end;
$$;
revoke all on function public.liens_commande_regle() from public, anon, authenticated;
create trigger liens_commande_regle after update of paye_le on public.liens_paiement
  for each row when (new.commande_id is not null and old.paye_le is null and new.paye_le is not null)
  execute function public.liens_commande_regle();
