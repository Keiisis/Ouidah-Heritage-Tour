-- Taux USD d'affichage : BCE automatique, forçage équipe, validation admin des écarts > 5 %.
-- Migration additive ; aucun montant historique ni taux de document existant n'est recalculé.
alter table public.reglages_site
  add column if not exists taux_usd_source text check (taux_usd_source in ('bce', 'manuel')),
  add column if not exists taux_usd_mode text not null default 'auto' check (taux_usd_mode in ('auto', 'manuel')),
  add column if not exists taux_usd_verifie_le timestamptz,
  add column if not exists taux_usd_propose numeric(10,3) check (taux_usd_propose between 100 and 5000),
  add column if not exists taux_usd_propose_le date;

-- Préserve le taux manuel éventuellement déjà saisi avant cette migration.
update public.reglages_site set taux_usd_source = 'manuel', taux_usd_mode = 'manuel'
where taux_usd is not null and taux_usd_source is null;

create table if not exists public.taux_historique (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  taux numeric(10,3) check (taux between 100 and 5000),
  date_cours date,
  source text check (source in ('bce', 'manuel')),
  evenement text not null check (evenement in ('applique', 'propose', 'auto')),
  auteur_id uuid references public.equipe_profils(id) on delete restrict,
  check (taux is null or (date_cours is not null and source is not null))
);
alter table public.taux_historique enable row level security;
revoke all on public.taux_historique from public, anon, authenticated, service_role;
grant select, insert on public.taux_historique to service_role;
create index if not exists taux_historique_date on public.taux_historique(cree_le desc);

insert into public.taux_historique(taux, date_cours, source, evenement, auteur_id)
select taux_usd, (taux_usd_le at time zone 'UTC')::date, 'manuel', 'applique', modifie_par
from public.reglages_site where taux_usd is not null and not exists (select 1 from public.taux_historique);

create or replace function public.taux_historique_immuable()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'historique_taux_immuable' using errcode = 'P0001';
end;
$$;
create or replace trigger taux_historique_immuable before update or delete on public.taux_historique
for each row execute function public.taux_historique_immuable();
create or replace trigger taux_historique_sans_truncate before truncate on public.taux_historique
for each statement execute function public.taux_historique_immuable();

-- Le serveur fournit l'auteur issu de sa session, jamais du formulaire. Les profils actifs sont revérifiés ici.
-- Verrou de ligne : réglage + historique atomiques, vérification BCE au plus une fois par heure entre instances.
create or replace function public.regler_taux_usd(p_operation text, p_auteur uuid default null, p_taux numeric default null, p_date date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.reglages_site;
  v_role text;
  v_taux numeric(10,3);
  v_date date;
  v_source text;
begin
  if p_operation not in ('manuel','auto','valider','bce','verifier') or p_operation is null then
    return jsonb_build_object('erreur','champs');
  end if;
  if p_operation in ('manuel','auto','valider') then
    select role into v_role from public.equipe_profils where id = p_auteur and etat = 'actif';
    if v_role is null or v_role not in ('admin','agent') then return jsonb_build_object('erreur','refuse'); end if;
    if p_operation = 'valider' and v_role <> 'admin' then return jsonb_build_object('erreur','admin'); end if;
  elsif p_auteur is not null then
    return jsonb_build_object('erreur','champs');
  end if;
  select * into v from public.reglages_site where id = true for update;
  if not found then return jsonb_build_object('erreur','panne'); end if;

  if p_operation = 'verifier' then
    if v.taux_usd_mode <> 'auto' or v.taux_usd_verifie_le > now() - interval '1 hour' then
      return jsonb_build_object('ok',true,'etat','ignore');
    end if;
    update public.reglages_site set taux_usd_verifie_le = now() where id = true;
    return jsonb_build_object('ok',true,'etat','verifier');
  end if;

  if p_operation = 'auto' then
    update public.reglages_site set taux_usd_mode = 'auto', taux_usd_verifie_le = null,
      modifie_le = now(), modifie_par = p_auteur where id = true;
    insert into public.taux_historique(taux,date_cours,source,evenement,auteur_id)
      values(v.taux_usd,(v.taux_usd_le at time zone 'UTC')::date,v.taux_usd_source,'auto',p_auteur);
    return jsonb_build_object('ok',true,'etat','auto');
  end if;

  if p_operation = 'valider' then
    -- Le formulaire désigne exactement la proposition lue : aucune validation d'un taux remplacé entretemps.
    if v.taux_usd_propose is null or p_date is distinct from v.taux_usd_propose_le or p_taux is distinct from v.taux_usd_propose then
      return jsonb_build_object('erreur','taux_perime');
    end if;
    v_taux := v.taux_usd_propose; v_date := v.taux_usd_propose_le; v_source := 'bce';
  else
    if p_taux is not null and (p_taux < 100 or p_taux > 5000 or p_taux <> round(p_taux,3) or p_taux::text in ('NaN','Infinity','-Infinity')) then
      return jsonb_build_object('erreur','champs');
    end if;
    v_taux := p_taux;
    if p_operation = 'manuel' then
      v_date := (now() at time zone 'UTC')::date; v_source := 'manuel';
    else
      if v.taux_usd_mode <> 'auto' then return jsonb_build_object('ok',true,'etat','ignore'); end if;
      if p_taux is null or p_date is null or p_date > (now() at time zone 'UTC')::date then return jsonb_build_object('erreur','champs'); end if;
      v_date := p_date; v_source := 'bce';
      if v.taux_usd_source = 'bce' and (p_date < (v.taux_usd_le at time zone 'UTC')::date
        or (p_date = (v.taux_usd_le at time zone 'UTC')::date and p_taux = v.taux_usd)) then
        return jsonb_build_object('ok',true,'etat','ignore');
      end if;
      -- Une proposition bloquée reste bloquée jusqu'à validation admin, même si le cours revient dans les 5 %.
      if v.taux_usd_propose is not null or (v.taux_usd is not null and abs(p_taux - v.taux_usd) * 100 > v.taux_usd * 5) then
        if v.taux_usd_propose_le is null or p_date >= v.taux_usd_propose_le then
          if p_taux is distinct from v.taux_usd_propose or p_date is distinct from v.taux_usd_propose_le then
            update public.reglages_site set taux_usd_propose = p_taux, taux_usd_propose_le = p_date where id = true;
            insert into public.taux_historique(taux,date_cours,source,evenement) values(p_taux,p_date,'bce','propose');
          end if;
        end if;
        return jsonb_build_object('ok',true,'etat','propose');
      end if;
    end if;
  end if;

  update public.reglages_site set taux_usd = v_taux,
    taux_usd_le = case when v_taux is null then null when p_operation = 'manuel' then now() else v_date::timestamp at time zone 'UTC' end,
    taux_usd_source = case when v_taux is null then null else v_source end,
    taux_usd_mode = case when p_operation = 'manuel' then 'manuel' else 'auto' end,
    taux_usd_propose = case when p_operation = 'valider' then null else taux_usd_propose end,
    taux_usd_propose_le = case when p_operation = 'valider' then null else taux_usd_propose_le end,
    modifie_le = now(), modifie_par = p_auteur where id = true;
  insert into public.taux_historique(taux,date_cours,source,evenement,auteur_id)
    values(v_taux,v_date,v_source,'applique',p_auteur);
  return jsonb_build_object('ok',true,'etat','applique');
end;
$$;
revoke all on function public.regler_taux_usd(text,uuid,numeric,date) from public, anon, authenticated;
grant execute on function public.regler_taux_usd(text,uuid,numeric,date) to service_role;

-- Snapshots : la publication du devis fixe le taux ; facture et lien héritent du devis.
-- Les anciens documents restent sans provenance USD plutôt que de leur attribuer le cours d'aujourd'hui.
alter table public.devis
  add column if not exists taux_eur numeric(10,3) not null default 655.957 check (taux_eur = 655.957),
  add column if not exists taux_usd numeric(10,3) check (taux_usd between 100 and 5000),
  add column if not exists taux_usd_le timestamptz,
  add column if not exists taux_usd_source text check (taux_usd_source in ('bce','manuel'));
alter table public.factures
  add column if not exists taux_eur numeric(10,3) not null default 655.957 check (taux_eur = 655.957),
  add column if not exists taux_usd numeric(10,3) check (taux_usd between 100 and 5000),
  add column if not exists taux_usd_le timestamptz,
  add column if not exists taux_usd_source text check (taux_usd_source in ('bce','manuel'));
alter table public.liens_paiement
  add column if not exists taux_eur numeric(10,3) not null default 655.957 check (taux_eur = 655.957),
  add column if not exists taux_usd numeric(10,3) check (taux_usd between 100 and 5000),
  add column if not exists taux_usd_le timestamptz,
  add column if not exists taux_usd_source text check (taux_usd_source in ('bce','manuel'));
alter table public.boutique_commandes
  add column if not exists taux_eur numeric(10,3) not null default 655.957 check (taux_eur = 655.957),
  add column if not exists taux_usd_source text check (taux_usd_source in ('bce','manuel'));

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
  elsif tg_table_name in ('factures','liens_paiement') then
    select taux_eur,taux_usd,taux_usd_le,taux_usd_source into v from public.devis where id = new.devis_id and publie_le is not null;
  else
    -- Le taux fourni par l'API boutique est figé à l'insertion ; aucun taux d'aujourd'hui ne remplace ensuite ce choix.
    return new;
  end if;
  if not found then raise exception 'taux_document_indisponible' using errcode = 'P0001'; end if;
  new.taux_eur := v.taux_eur; new.taux_usd := v.taux_usd; new.taux_usd_le := v.taux_usd_le; new.taux_usd_source := v.taux_usd_source;
  return new;
end;
$$;
create or replace trigger devis_taux_fige before insert or update on public.devis for each row execute function public.figer_taux_document();
create or replace trigger factures_taux_fige before insert or update on public.factures for each row execute function public.figer_taux_document();
create or replace trigger liens_taux_fige before insert or update on public.liens_paiement for each row execute function public.figer_taux_document();
create or replace trigger boutique_taux_fige before update on public.boutique_commandes for each row execute function public.figer_taux_document();
