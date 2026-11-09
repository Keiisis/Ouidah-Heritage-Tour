-- Stock global : réservation à la confirmation équipe, consommation à la remise,
-- libération à l'annulation. Aucune réservation de stock lors de l'envoi public.
alter table public.boutique_produits add column if not exists stock integer check (stock >= 0);
alter table public.boutique_produits add column if not exists stock_reserve integer not null default 0 check (stock_reserve >= 0);
alter table public.boutique_produits add constraint boutique_stock_coherent check (stock is null or stock >= stock_reserve);
alter table public.boutique_commandes add column if not exists annule_le timestamptz;
alter table public.boutique_commandes add column if not exists motif_annulation text;
alter table public.boutique_commandes add column if not exists stock_confirme boolean not null default false;
alter table public.boutique_commandes add column if not exists paiement_etat text not null default 'attente' check (paiement_etat in ('attente','paye','a_regulariser'));
alter table public.boutique_commandes add column if not exists paye_le timestamptz;
alter table public.boutique_commandes add column if not exists montant_recu integer not null default 0;

create table public.boutique_reservations_stock (
  commande_id uuid not null references public.boutique_commandes(id),
  produit_id uuid not null references public.boutique_produits(id),
  quantite integer not null check (quantite > 0),
  primaire boolean not null default true,
  primary key (commande_id, produit_id)
);
alter table public.boutique_reservations_stock enable row level security;
revoke all on public.boutique_reservations_stock from public, anon, authenticated;
grant select on public.boutique_reservations_stock to service_role;

create or replace function public.boutique_produit_garde()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.slug <> old.slug then raise exception 'slug_fige'; end if;
  if new.piece_unique then
    new.stock := coalesce(new.stock, 1);
    if new.stock > 1 then raise exception 'piece_unique'; end if;
  end if;
  if tg_op = 'UPDATE' and old.stock is not null and new.stock is null and old.stock_reserve > 0 then raise exception 'stock_reserve'; end if;
  new.modifie_le := clock_timestamp();
  return new;
end;
$$;
create trigger boutique_produit_garde before insert or update on public.boutique_produits for each row execute function public.boutique_produit_garde();

create or replace function public.avancer_commande_boutique(p_id uuid, p_depuis text, p_vers text, p_par uuid, p_motif text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.boutique_commandes;
  p public.boutique_produits;
  l record;
begin
  -- La route contrôle aussi le droit boutique ; la RPC n'est accordée qu'au serveur.
  if not exists (select 1 from public.equipe_profils where id = p_par and etat = 'actif'
    and (role = 'admin' or (role = 'agent' and droits->'boutique' = 'true'::jsonb))) then
    return jsonb_build_object('erreur','refuse');
  end if;
  select * into c from public.boutique_commandes where id = p_id for update;
  if not found or c.statut <> p_depuis then return jsonb_build_object('erreur','etat'); end if;
  if p_vers = 'annulee' then
    if c.statut not in ('a_confirmer','a_preparer','prete') or char_length(trim(coalesce(p_motif,''))) not between 3 and 280 then
      return jsonb_build_object('erreur','champs');
    end if;
  elsif not ((c.statut = 'a_confirmer' and p_vers = 'a_preparer') or (c.statut = 'a_preparer' and p_vers = 'prete') or (c.statut = 'prete' and p_vers = 'remise')) then
    return jsonb_build_object('erreur','etat');
  end if;
  if p_vers = 'a_preparer' and c.total_xof is null and c.total_eur is null then return jsonb_build_object('erreur','prix'); end if;
  if p_vers = 'remise' and c.paiement_etat <> 'paye' then return jsonb_build_object('erreur','paiement'); end if;
  -- Tout le stock du panier est contrôlé AVANT la première écriture. Ordre stable
  -- des verrous : les confirmations concurrentes ne peuvent ni sur-vendre ni s'interbloquer.
  if not c.stock_confirme and p_vers <> 'annulee' then
    if exists (select 1 from jsonb_array_elements(c.lignes) x where not exists (select 1 from public.boutique_produits where slug = x->>'slug')) then
      return jsonb_build_object('erreur','stock');
    end if;
    for p in select pr.* from public.boutique_produits pr where pr.slug in (select x->>'slug' from jsonb_array_elements(c.lignes) x) order by pr.id for update loop
      select sum((x->>'quantite')::integer) as q into l from jsonb_array_elements(c.lignes) x where x->>'slug' = p.slug;
      if not p.publie or l.q < 1 or (p.piece_unique and l.q > 1) or (coalesce(p.stock, case when p.piece_unique then 1 end) is not null and coalesce(p.stock,1) - p.stock_reserve < l.q) then
        return jsonb_build_object('erreur','stock');
      end if;
    end loop;
    for p in select pr.* from public.boutique_produits pr where pr.slug in (select x->>'slug' from jsonb_array_elements(c.lignes) x) order by pr.id loop
      select sum((x->>'quantite')::integer) as q into l from jsonb_array_elements(c.lignes) x where x->>'slug' = p.slug;
      -- Même sans limite, les commandes en préparation restent réservées : une limite ajoutée ensuite
      -- doit couvrir ces quantités, et la remise doit consommer le stock devenu limité entretemps.
      update public.boutique_produits set stock = case when piece_unique then coalesce(stock,1) else stock end,
        stock_reserve = stock_reserve + l.q where id = p.id;
      insert into public.boutique_reservations_stock(commande_id, produit_id, quantite) values (c.id,p.id,l.q);
    end loop;
  end if;
  if p_vers in ('remise','annulee') then
    perform 1 from public.boutique_produits where id in (select produit_id from public.boutique_reservations_stock where commande_id = c.id and primaire) order by id for update;
    for l in select * from public.boutique_reservations_stock where commande_id = c.id and primaire order by produit_id loop
      update public.boutique_produits set stock_reserve = stock_reserve - l.quantite,
        stock = stock - case when p_vers = 'remise' then l.quantite else 0 end where id = l.produit_id;
    end loop;
    update public.boutique_reservations_stock set primaire = false where commande_id = c.id;
  end if;
  update public.boutique_commandes set statut = p_vers, prepare_par = p_par,
    stock_confirme = stock_confirme or p_vers <> 'annulee',
    prepare_le = case when p_vers = 'a_preparer' then now() else prepare_le end,
    prete_le = case when p_vers = 'prete' then now() else prete_le end,
    remise_le = case when p_vers = 'remise' then now() else remise_le end,
    annule_le = case when p_vers = 'annulee' then now() else annule_le end,
    motif_annulation = case when p_vers = 'annulee' then trim(p_motif) else motif_annulation end
    where id = c.id;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.avancer_commande_boutique(uuid,text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.avancer_commande_boutique(uuid,text,text,uuid,text) to service_role;

-- Recalcul du règlement boutique dans la même transaction que la confirmation
-- ou l'écriture inverse. Un reçu n'est disponible que si le total exact est reçu.
create or replace function public.boutique_recalculer_paiement()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.boutique_commandes; total bigint; attendu integer; v_etat text;
begin
  if new.commande_id is null then return new; end if;
  select * into c from public.boutique_commandes where id = new.commande_id for update;
  if not found then raise exception 'commande_introuvable'; end if;
  attendu := coalesce(c.total_xof,round(c.total_eur * 655.957)::integer);
  if new.etat = 'confirme' and new.inverse_de is null and (c.statut in ('a_confirmer','annulee') or attendu is null or attendu <= 0) then
    raise exception 'commande_non_payable';
  end if;
  select coalesce(sum(case when devise = 'EUR' then sign(montant)*round(abs(montant)::numeric*655957/100000) else montant end),0)
    into total from public.paiements_manuels where commande_id = c.id and etat = 'confirme';
  v_etat := case when attendu > 0 and total = attendu then 'paye' when total = 0 then 'attente' else 'a_regulariser' end;
  update public.boutique_commandes set montant_recu = total, paiement_etat = v_etat,
    paye_le = case when v_etat = 'paye' then coalesce(paye_le,now()) else null end where id = c.id;
  if v_etat = 'paye' then perform public.emettre_document('R','commande',c.id); end if;
  return new;
end;
$$;
create trigger boutique_recalculer_paiement after insert or update of etat on public.paiements_manuels for each row execute function public.boutique_recalculer_paiement();
