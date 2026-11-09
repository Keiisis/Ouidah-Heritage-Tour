-- Normalisation e-MECeF explicite depuis l'admin. Aucun appel DGI ni activation dans cette migration.
-- Une requête fiscale est figée avant son envoi. Un appel interrompu ne se remet jamais en file automatiquement.
create table public.emcf_operations (
  id uuid primary key default gen_random_uuid(),
  facture_id uuid not null references public.factures(id) on delete restrict,
  avoir_id uuid references public.avoirs(id) on delete restrict,
  environnement text not null check(environnement in ('test','production')),
  ifu text not null check(ifu ~ '^[0-9]{13}$'),
  requete jsonb not null check(jsonb_typeof(requete)='object' and pg_column_size(requete)<=65536),
  identite jsonb not null check(jsonb_typeof(identite)='object' and pg_column_size(identite)<=16384),
  uid text check(char_length(uid) between 1 and 128 and uid !~ '[[:cntrl:]]'),
  calcul jsonb check(jsonb_typeof(calcul)='object' and pg_column_size(calcul)<=16384),
  securite jsonb check(jsonb_typeof(securite)='object' and pg_column_size(securite)<=16384),
  etat text not null default 'preparee' check(etat in ('preparee','envoi','attente','confirmation','confirmee','annulation','annulee','incertaine','rejetee')),
  erreur text check(erreur in ('configuration','saisie','transport','http','reponse','dgi','total','base','incoherence')),
  cree_par uuid not null references public.equipe_profils(id) on delete restrict,
  cree_le timestamptz not null default clock_timestamp(),
  modifie_le timestamptz not null default clock_timestamp(),
  check(requete?'ifu' and jsonb_typeof(requete->'ifu')='string' and requete->>'ifu'=ifu),
  check(identite?'ifu' and jsonb_typeof(identite->'ifu')='string' and identite->>'ifu'=ifu),
  check(etat not in ('attente','confirmation','confirmee','annulation') or (uid is not null and calcul is not null)),
  check(etat <> 'confirmee' or securite is not null),
  check(securite is null or etat='confirmee'),
  check(calcul is null or (calcul?'uid' and uid is not null and calcul->>'uid'=uid))
);
create unique index emcf_facture_unique on public.emcf_operations(facture_id,environnement) where avoir_id is null;
create unique index emcf_avoir_unique on public.emcf_operations(avoir_id,environnement) where avoir_id is not null;
create unique index emcf_uid_unique on public.emcf_operations(uid,environnement) where uid is not null;
create index emcf_operations_recent on public.emcf_operations(cree_le desc,id);
alter table public.emcf_operations enable row level security;
revoke all on public.emcf_operations from public,anon,authenticated,service_role;
grant select on public.emcf_operations to service_role;

create function public.emcf_operation_figer()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op<>'UPDATE' then raise exception 'emcf_operation_immuable'; end if;
  if old.etat in ('confirmee','annulee','incertaine','rejetee') then raise exception 'emcf_operation_terminee'; end if;
  if new.id<>old.id or new.facture_id<>old.facture_id or new.avoir_id is distinct from old.avoir_id
    or new.environnement<>old.environnement or new.ifu<>old.ifu or new.requete<>old.requete
    or new.identite<>old.identite or new.cree_par<>old.cree_par or new.cree_le<>old.cree_le
    or (old.uid is not null and new.uid is distinct from old.uid)
    or (old.calcul is not null and new.calcul is distinct from old.calcul) then
    raise exception 'emcf_operation_immuable';
  end if;
  if not ((old.etat='preparee' and new.etat in ('envoi','annulee'))
    or (old.etat='envoi' and new.etat in ('attente','incertaine','rejetee'))
    or (old.etat='attente' and new.etat in ('confirmation','annulation'))
    or (old.etat='confirmation' and new.etat in ('confirmee','incertaine','rejetee'))
    or (old.etat='annulation' and new.etat in ('annulee','incertaine','rejetee'))) then
    raise exception 'emcf_transition_interdite';
  end if;
  new.modifie_le:=clock_timestamp();
  return new;
end;
$$;
revoke all on function public.emcf_operation_figer() from public,anon,authenticated;
create trigger emcf_operation_immuable before update or delete on public.emcf_operations
for each row execute function public.emcf_operation_figer();
create trigger emcf_operations_non_vidables before truncate on public.emcf_operations
for each statement execute function public.emcf_operation_figer();

create function public.emcf_operation_creer(p_facture uuid,p_avoir uuid,p_environnement text,p_ifu text,p_requete jsonb,p_identite jsonb,p_par uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare operation public.emcf_operations;
begin
  if not exists(select 1 from public.equipe_profils where id=p_par and role='admin' and etat='actif') then return null; end if;
  -- Même verrou que emettre_avoir : aucune correction locale ne traverse la réservation fiscale.
  perform 1 from public.factures where id=p_facture for update;
  if not found or (p_avoir is not null and not exists(select 1 from public.avoirs where id=p_avoir and facture_id=p_facture)) then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('emcf:'||coalesce(p_avoir,p_facture)::text||':'||p_environnement,0));
  select * into operation from public.emcf_operations
    where facture_id=p_facture and avoir_id is not distinct from p_avoir and environnement=p_environnement;
  if found then return to_jsonb(operation); end if;
  if p_avoir is null and exists(select 1 from public.avoirs where facture_id=p_facture) then return null; end if;
  insert into public.emcf_operations(facture_id,avoir_id,environnement,ifu,requete,identite,cree_par)
    values(p_facture,p_avoir,p_environnement,p_ifu,p_requete,p_identite,p_par) returning * into operation;
  return to_jsonb(operation);
end;
$$;
revoke all on function public.emcf_operation_creer(uuid,uuid,text,text,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.emcf_operation_creer(uuid,uuid,text,text,jsonb,jsonb,uuid) to service_role;

create function public.emcf_operation_prendre(p_id uuid,p_de text,p_vers text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare operation public.emcf_operations; source public.emcf_operations;
begin
  if not ((p_de='preparee' and p_vers in ('envoi','annulee')) or (p_de='attente' and p_vers in ('confirmation','annulation'))) then return null; end if;
  select * into source from public.emcf_operations where id=p_id;
  if not found then return null; end if;
  perform 1 from public.factures where id=source.facture_id for update;
  if source.avoir_id is null and p_vers in ('envoi','confirmation')
    and exists(select 1 from public.avoirs where facture_id=source.facture_id) then return null; end if;
  update public.emcf_operations set etat=p_vers,erreur=null where id=p_id and etat=p_de returning * into operation;
  return case when found then to_jsonb(operation) else null end;
end;
$$;
revoke all on function public.emcf_operation_prendre(uuid,text,text) from public,anon,authenticated;
grant execute on function public.emcf_operation_prendre(uuid,text,text) to service_role;

create function public.emcf_operation_resultat(p_id uuid,p_en_cours text,p_resultat jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare operation public.emcf_operations; prochain text:=p_resultat->>'etat';
begin
  if jsonb_typeof(p_resultat) is distinct from 'object'
    or p_resultat-array['etat','uid','calcul','securite','erreur']<>'{}'::jsonb
    or not ((p_en_cours='envoi' and prochain in ('attente','incertaine','rejetee'))
      or (p_en_cours='confirmation' and prochain in ('confirmee','incertaine','rejetee'))
      or (p_en_cours='annulation' and prochain in ('annulee','incertaine','rejetee'))) then return null; end if;
  update public.emcf_operations set etat=prochain,
    uid=case when p_resultat?'uid' then p_resultat->>'uid' else uid end,
    calcul=case when p_resultat?'calcul' then nullif(p_resultat->'calcul','null'::jsonb) else calcul end,
    securite=case when p_resultat?'securite' then nullif(p_resultat->'securite','null'::jsonb) else securite end,
    erreur=p_resultat->>'erreur'
    where id=p_id and etat=p_en_cours returning * into operation;
  return case when found then to_jsonb(operation) else null end;
end;
$$;
revoke all on function public.emcf_operation_resultat(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.emcf_operation_resultat(uuid,text,jsonb) to service_role;

-- Les avoirs comptables restent possibles après une confirmation fiscale ; leurs traitements DGI sont distincts.
-- Pendant une opération en cours ou incertaine, on préserve la source transmise, y compris en environnement test.
create function public.emcf_avoir_proteger()
returns trigger language plpgsql set search_path=public as $$
begin
  perform 1 from public.factures where id=new.facture_id for update;
  if exists(select 1 from public.emcf_operations where facture_id=new.facture_id and avoir_id is null
    and etat in ('preparee','envoi','attente','confirmation','annulation','incertaine')) then
    raise exception 'emcf_source_verrouillee' using errcode='P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.emcf_avoir_proteger() from public,anon,authenticated;
create trigger emcf_avoir_source before insert on public.avoirs
for each row execute function public.emcf_avoir_proteger();
