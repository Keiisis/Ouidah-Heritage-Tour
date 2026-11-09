-- Relances de documents déjà émis : aucune échéance contractuelle créée.
-- L'intervalle vient de reglages_paiement.relance_jours ; NULL désactive tout envoi.
-- Une réservation persistante empêche deux tâches ou clics de traiter le même document.
create table public.finances_relances (
  id uuid primary key default gen_random_uuid(),
  facture_id uuid not null references public.factures(id),
  cree_le timestamptz not null default now(),
  traite_le timestamptz,
  etat text not null default 'reservee' check (etat in ('reservee','envoyee','ignoree','incertaine')),
  par uuid references public.equipe_profils(id),
  motif text check (motif in ('reglee','desactivee','donnees','transport'))
);
create unique index finances_relance_unique_en_cours on public.finances_relances(facture_id) where etat in ('reservee','incertaine');
create index finances_relances_facture_date on public.finances_relances(facture_id,cree_le desc);
alter table public.finances_relances enable row level security;
revoke all on public.finances_relances from public,anon,authenticated;
grant select on public.finances_relances to service_role;

create function public.finances_relances_candidates(p_facture uuid default null)
returns table(facture_id uuid,numero text,client text,depuis timestamptz)
language sql stable security definer set search_path = public as $$
  select f.id,f.numero,f.client->>'nom',coalesce(dernier.le,f.cree_le)
  from public.factures f
  cross join public.reglages_paiement r
  left join lateral (select max(coalesce(l.traite_le,l.cree_le)) le from public.finances_relances l where l.facture_id=f.id) dernier on true
  where r.id=true and r.relance_jours between 1 and 90
    and (p_facture is null or f.id=p_facture)
    and f.statut in ('emise','a_regulariser')
    and coalesce(f.client->>'email','') ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and coalesce(dernier.le,f.cree_le) + make_interval(days=>r.relance_jours) <= now()
    and not exists(select 1 from public.finances_relances l where l.facture_id=f.id and l.etat in ('reservee','incertaine'))
  order by coalesce(dernier.le,f.cree_le),f.id limit 50;
$$;

create function public.finances_relance_reserver(p_facture uuid,p_par uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare f public.factures; calcul jsonb; tentative uuid;
begin
  if p_par is not null and not exists(select 1 from public.equipe_profils where id=p_par and role='admin' and etat='actif') then return null; end if;
  select * into f from public.factures where id=p_facture for update;
  if not found or f.statut not in ('emise','a_regulariser') then return null; end if;
  if not exists(select 1 from public.finances_relances_candidates(p_facture)) then return null; end if;
  calcul := public.finances_recalculer(p_facture);
  if calcul is null or (calcul->>'net')::bigint <= (calcul->>'recu')::bigint then return null; end if;
  insert into public.finances_relances(facture_id,par) values(p_facture,p_par) returning id into tentative;
  return tentative;
end;
$$;

-- Dernier contrôle au plus près de l'envoi : solde calculé par l'unique règle comptable existante.
create function public.finances_relance_verifier(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.finances_relances; f public.factures; calcul jsonb; jours integer;
begin
  select * into l from public.finances_relances where id=p_id for update;
  if not found or l.etat <> 'reservee' then return null; end if;
  select relance_jours into jours from public.reglages_paiement where id=true;
  select * into f from public.factures where id=l.facture_id for update;
  if jours is null or f.statut not in ('emise','a_regulariser') then
    update public.finances_relances set etat='ignoree',traite_le=now(),motif=case when jours is null then 'desactivee' else 'reglee' end where id=p_id;
    return null;
  end if;
  calcul := public.finances_recalculer(f.id);
  if calcul is null or (calcul->>'net')::bigint <= (calcul->>'recu')::bigint then
    update public.finances_relances set etat='ignoree',traite_le=now(),motif='reglee' where id=p_id;
    return null;
  end if;
  return jsonb_build_object('id',l.id,'facture',f.id,'numero',f.numero,'client',f.client,
    'montant',(calcul->>'net')::bigint-(calcul->>'recu')::bigint,'devis',f.devis_id);
end;
$$;

create function public.finances_relance_terminer(p_id uuid,p_etat text,p_motif text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if p_etat not in ('envoyee','ignoree','incertaine') then return false; end if;
  update public.finances_relances set etat=p_etat,traite_le=now(),motif=p_motif where id=p_id and etat='reservee';
  get diagnostics n = row_count;
  return n=1;
end;
$$;

revoke all on function public.finances_relances_candidates(uuid) from public,anon,authenticated;
revoke all on function public.finances_relance_reserver(uuid,uuid) from public,anon,authenticated;
revoke all on function public.finances_relance_verifier(uuid) from public,anon,authenticated;
revoke all on function public.finances_relance_terminer(uuid,text,text) from public,anon,authenticated;
grant execute on function public.finances_relances_candidates(uuid) to service_role;
grant execute on function public.finances_relance_reserver(uuid,uuid) to service_role;
grant execute on function public.finances_relance_verifier(uuid) to service_role;
grant execute on function public.finances_relance_terminer(uuid,text,text) to service_role;
