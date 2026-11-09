-- Écritures et clôture prennent le même verrou mensuel. Les calculs de clôture
-- s'effectuent dans la transaction, jamais à partir de chiffres du navigateur.
alter table public.reservations add column if not exists reglement_manuel boolean not null default false;
alter table public.reservations add column if not exists mode_manuel text;
alter table public.finances_clotures add column if not exists empreinte text;
alter table public.finances_clotures add column if not exists rouverte_le timestamptz;
alter table public.finances_clotures add column if not exists motif_reouverture text;

create table public.finances_journal (
  id bigint generated always as identity primary key,
  cree_le timestamptz not null default now(),
  objet text not null,
  cible text not null,
  avant jsonb,
  apres jsonb not null
);
alter table public.finances_journal enable row level security;
revoke all on public.finances_journal from public, anon, authenticated;
grant select on public.finances_journal to service_role;

create or replace function public.finances_journal_immuable()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'journal_finances_immuable' using errcode = 'P0001';
end;
$$;
create trigger finances_journal_immuable before update or delete on public.finances_journal
for each row execute function public.finances_journal_immuable();
create trigger finances_journal_sans_truncate before truncate on public.finances_journal
for each statement execute function public.finances_journal_immuable();

create or replace function public.finances_verrou_mois()
returns trigger language plpgsql security definer set search_path = public as $$
declare m date; nouveau_mois date; ancien_mois date; brut jsonb := to_jsonb(new); ancien jsonb;
begin
  if tg_op = 'UPDATE' then ancien := to_jsonb(old); end if;
  if tg_table_name = 'paiements_manuels' then
    nouveau_mois := date_trunc('month',new.recu_le)::date;
    ancien_mois := date_trunc('month',(ancien->>'recu_le')::date)::date;
  elsif tg_table_name = 'depenses' then nouveau_mois := date_trunc('month',new.jour)::date;
  else
    if tg_op = 'UPDATE'
      and row(ancien->'paye_le',ancien->'statut',ancien->'montant_recu',ancien->'montant',ancien->'passerelle',ancien->'reglement_manuel')
        is not distinct from row(brut->'paye_le',brut->'statut',brut->'montant_recu',brut->'montant',brut->'passerelle',brut->'reglement_manuel') then
      return new;
    end if;
    -- Une réservation manuelle est comptée par ses écritures (recu_le), jamais une seconde fois par paye_le.
    -- Son état dérivé peut donc changer après clôture lorsqu'une écriture inverse est passée au mois courant.
    if tg_table_name <> 'reservations' or coalesce((brut->>'reglement_manuel')::boolean,false) = false then
      nouveau_mois := date_trunc('month',(brut->>'paye_le')::timestamptz at time zone 'Africa/Porto-Novo')::date;
    end if;
    if tg_table_name <> 'reservations' or coalesce((ancien->>'reglement_manuel')::boolean,false) = false then
      ancien_mois := date_trunc('month',(ancien->>'paye_le')::timestamptz at time zone 'Africa/Porto-Novo')::date;
    end if;
  end if;
  -- Ancien ET nouveau mois, dans le même ordre pour tous les déplacements : pas de transfert hors d'un mois clos.
  for m in select distinct x from unnest(array[ancien_mois,nouveau_mois]) x where x is not null order by x loop
    perform pg_advisory_xact_lock(hashtext('finances:' || m::text));
    if exists(select 1 from public.finances_clotures where mois = m and rouverte_le is null) then raise exception 'mois_clos'; end if;
  end loop;
  return new;
end;
$$;
create trigger finances_verrou before insert or update on public.paiements_manuels for each row execute function public.finances_verrou_mois();
create trigger finances_verrou before insert on public.depenses for each row execute function public.finances_verrou_mois();
create trigger finances_verrou before insert or update on public.reservations for each row execute function public.finances_verrou_mois();
create trigger finances_verrou before insert or update on public.liens_paiement for each row execute function public.finances_verrou_mois();

create or replace function public.finances_tracer()
returns trigger language plpgsql security definer set search_path = public as $$
declare a jsonb; n jsonb := to_jsonb(new);
begin
  if tg_op = 'UPDATE' then a := to_jsonb(old); end if;
  -- Montants/états uniquement : pas de référence bancaire, payeur, pièce ni contact.
  insert into public.finances_journal(objet,cible,avant,apres) values(tg_table_name,coalesce(n->>'id',n->>'mois'),
    case when a is null then null else jsonb_build_object('montant',a->'montant','etat',a->'etat','statut',a->'statut','encaisse',a->'encaisse','depenses',a->'depenses','rouverte_le',a->'rouverte_le') end,
    jsonb_build_object('montant',n->'montant','devise',n->'devise','mode',n->'mode','etat',n->'etat','statut',n->'statut','encaisse',n->'encaisse','depenses',n->'depenses','rouverte_le',n->'rouverte_le','par',coalesce(n->'confirme_par',n->'saisi_par',n->'close_par')));
  return new;
end;
$$;
create trigger finances_tracer after insert or update on public.paiements_manuels for each row execute function public.finances_tracer();
create trigger finances_tracer after insert on public.depenses for each row execute function public.finances_tracer();
create trigger finances_tracer after insert or update on public.finances_clotures for each row execute function public.finances_tracer();

create or replace function public.reservation_recalculer_manuel()
returns trigger language plpgsql security definer set search_path = public as $$
declare r public.reservations; total bigint;
begin
  if new.reservation_id is null or new.etat <> 'confirme' then return new; end if;
  select * into r from public.reservations where id = new.reservation_id for update;
  if not found or (r.statut <> 'attente' and not r.reglement_manuel) then raise exception 'reservation_non_payable'; end if;
  select coalesce(sum(case when devise = 'EUR' then sign(montant)*round(abs(montant)::numeric*655957/100000) else montant end),0)
    into total from public.paiements_manuels where reservation_id = r.id and etat = 'confirme';
  update public.reservations set reglement_manuel = true, mode_manuel = new.mode, montant_recu = total,
    statut = case when total = montant then 'paye' else 'attente' end,
    transaction_id = 'manuel:' || r.id::text,
    paye_le = case when total = montant then coalesce(paye_le,now()) else null end,
    modifie_le = now() where id = r.id;
  if total = r.montant then
    perform public.emettre_document('T','reservation',r.id);
    perform public.emettre_document('R','reservation',r.id);
  end if;
  return new;
end;
$$;
create trigger reservation_recalculer_manuel after insert or update of etat on public.paiements_manuels for each row execute function public.reservation_recalculer_manuel();

create or replace function public.clore_mois_finances(p_mois date, p_par uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare fin date := (p_mois + interval '1 month')::date; enc bigint; dep bigint; modes jsonb; v_hash text;
begin
  if not exists(select 1 from public.equipe_profils where id = p_par and role = 'admin' and etat = 'actif') then return jsonb_build_object('erreur','admin'); end if;
  if extract(day from p_mois) <> 1 or p_mois >= date_trunc('month',now() at time zone 'Africa/Porto-Novo')::date then return jsonb_build_object('erreur','termine'); end if;
  perform pg_advisory_xact_lock(hashtext('finances:' || p_mois::text));
  if exists(select 1 from public.finances_clotures where mois = p_mois and rouverte_le is null) then return jsonb_build_object('erreur','deja'); end if;
  if exists(select 1 from public.paiements_manuels where etat = 'a_confirmer' and recu_le >= p_mois and recu_le < fin) then return jsonb_build_object('erreur','attente'); end if;
  with mouvements as (
    select passerelle as mode,coalesce(montant_recu,montant)::bigint as montant from public.reservations
      where statut = 'paye' and not reglement_manuel and (paye_le at time zone 'Africa/Porto-Novo')::date >= p_mois and (paye_le at time zone 'Africa/Porto-Novo')::date < fin
    union all select passerelle,montant from public.liens_paiement where (paye_le at time zone 'Africa/Porto-Novo')::date >= p_mois and (paye_le at time zone 'Africa/Porto-Novo')::date < fin
    union all select mode,case when devise = 'EUR' then sign(montant)*round(abs(montant)::numeric*655957/100000)::bigint else montant end from public.paiements_manuels where etat = 'confirme' and recu_le >= p_mois and recu_le < fin
  ), groupes as (select mode,count(*) n,sum(montant) montant from mouvements group by mode)
  select coalesce(sum(montant),0),coalesce(jsonb_agg(to_jsonb(groupes) order by mode),'[]') into enc,modes from groupes;
  select coalesce(sum(montant),0) into dep from public.depenses where jour >= p_mois and jour < fin;
  v_hash := encode(digest(jsonb_build_object('mois',p_mois,'encaisse',enc,'depenses',dep,'modes',modes)::text,'sha256'),'hex');
  insert into public.finances_clotures(mois,close_par,encaisse,a_confirmer,depenses,resultat,par_mode,empreinte)
    values(p_mois,p_par,enc,0,dep,enc-dep,modes,v_hash)
    on conflict (mois) do update set close_par = p_par, cree_le = now(), encaisse = enc, a_confirmer = 0, depenses = dep, resultat = enc-dep, par_mode = modes, empreinte = v_hash, rouverte_le = null, motif_reouverture = null;
  return jsonb_build_object('ok',true,'empreinte',v_hash);
end;
$$;
revoke all on function public.clore_mois_finances(date,uuid) from public,anon,authenticated;
grant execute on function public.clore_mois_finances(date,uuid) to service_role;

create or replace function public.rouvrir_mois_finances(p_mois date, p_par uuid, p_motif text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.equipe_profils where id = p_par and role = 'admin' and etat = 'actif') then return jsonb_build_object('erreur','admin'); end if;
  if char_length(trim(coalesce(p_motif,''))) not between 3 and 280 then return jsonb_build_object('erreur','champs'); end if;
  perform pg_advisory_xact_lock(hashtext('finances:' || p_mois::text));
  update public.finances_clotures set rouverte_le = now(), motif_reouverture = trim(p_motif), close_par = p_par where mois = p_mois and rouverte_le is null;
  if not found then return jsonb_build_object('erreur','etat'); end if;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.rouvrir_mois_finances(date,uuid,text) from public,anon,authenticated;
grant execute on function public.rouvrir_mois_finances(date,uuid,text) to service_role;


-- Les confirmations et inverses respectent les réouvertures tracées.
create or replace function public.confirmer_paiement_manuel(p_id uuid, p_par uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.paiements_manuels;
  v_fid uuid;
  v_emise jsonb;
  v_etat jsonb;
begin
  if not exists(select 1 from public.equipe_profils where id = p_par and role = 'admin' and etat = 'actif') then
    return jsonb_build_object('erreur', 'refuse');
  end if;
  select * into v_p from public.paiements_manuels where id = p_id for update;
  if not found then
    return jsonb_build_object('erreur', 'introuvable');
  end if;
  if v_p.etat <> 'a_confirmer' then
    return jsonb_build_object('erreur', 'etat');
  end if;
  if v_p.saisi_par = p_par then
    return jsonb_build_object('erreur', 'soi');
  end if;
  -- Même ordre que le PATCH passerelle : réservation, puis verrou du mois.
  -- Le recalcul déclenché après l'écriture retrouve ce verrou déjà détenu.
  if v_p.reservation_id is not null then
    perform 1 from public.reservations where id = v_p.reservation_id for update;
  end if;
  if exists (select 1 from public.finances_clotures where mois = date_trunc('month', v_p.recu_le)::date and rouverte_le is null) then
    return jsonb_build_object('erreur', 'mois_clos');
  end if;
  v_fid := v_p.facture_id;
  if v_fid is null and v_p.devis_id is not null then
    v_emise := public.emettre_facture(v_p.devis_id, p_par);
    if v_emise is null then
      return jsonb_build_object('erreur', 'devis');
    end if;
    v_fid := (v_emise ->> 'id')::uuid;
  end if;
  update public.paiements_manuels
     set etat = 'confirme', confirme_par = p_par, confirme_le = now(), facture_id = v_fid, modifie_le = now()
   where id = p_id;
  if v_fid is null then
    return jsonb_build_object('statut', null, 'ecart', null);
  end if;
  v_etat := public.finances_recalculer(v_fid);
  return v_etat || jsonb_build_object('facture_id', v_fid, 'devis_id', v_p.devis_id);
end;
$$;
revoke all on function public.confirmer_paiement_manuel(uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirmer_paiement_manuel(uuid, uuid) to service_role;

-- Écriture inverse d'un paiement confirmé (erreur de saisie) : même mode, montant opposé, confirmée par l'admin qui la
-- passe ; l'original reste tel quel. Une seule écriture inverse par paiement (inverse_de unique).
create or replace function public.inverser_paiement_manuel(p_id uuid, p_par uuid, p_motif text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.paiements_manuels;
  v_i public.paiements_manuels;
  v_jour date := (now() at time zone 'Africa/Porto-Novo')::date;
begin
  if not exists(select 1 from public.equipe_profils where id = p_par and role = 'admin' and etat = 'actif') then
    return jsonb_build_object('erreur', 'refuse');
  end if;
  select * into v_p from public.paiements_manuels where id = p_id for update;
  if not found then
    return jsonb_build_object('erreur', 'introuvable');
  end if;
  if v_p.etat <> 'confirme' or v_p.inverse_de is not null or exists (select 1 from public.paiements_manuels where inverse_de = p_id) then
    return jsonb_build_object('erreur', 'etat');
  end if;
  if v_p.reservation_id is not null then
    perform 1 from public.reservations where id = v_p.reservation_id for update;
  end if;
  if exists (select 1 from public.finances_clotures where mois = date_trunc('month', v_jour)::date and rouverte_le is null) then
    return jsonb_build_object('erreur', 'mois_clos');
  end if;
  insert into public.paiements_manuels (mode, montant, devise, recu_le, payeur, facture_id, devis_id, reservation_id, commande_id,
                                        saisi_par, confirme_par, confirme_le, etat, motif, inverse_de)
    values (v_p.mode, -v_p.montant, v_p.devise, v_jour, v_p.payeur, v_p.facture_id, v_p.devis_id, v_p.reservation_id, v_p.commande_id,
            p_par, p_par, now(), 'confirme', p_motif, p_id)
    returning * into v_i;
  if v_p.facture_id is null then
    return jsonb_build_object('id', v_i.id);
  end if;
  return jsonb_build_object('id', v_i.id) || public.finances_recalculer(v_p.facture_id);
end;
$$;
revoke all on function public.inverser_paiement_manuel(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.inverser_paiement_manuel(uuid, uuid, text) to service_role;
