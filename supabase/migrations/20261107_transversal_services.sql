-- Tâches désactivées à l'installation. Aucun secret de messagerie n'est enregistré en base.
create table public.reglages_transversaux (
  id boolean primary key default true check(id),
  rapport_actif boolean not null default false,
  imap_actif boolean not null default false
);
insert into public.reglages_transversaux(id) values(true);
create table public.rapports_envois (
  id uuid primary key default gen_random_uuid(), semaine date not null,
  destinataire text not null, etat text not null default 'reservee' check(etat in ('reservee','envoyee','incertaine')),
  cree_le timestamptz not null default now(), traite_le timestamptz,
  unique(semaine,destinataire)
);
create function public.rapport_reserver(p_semaine date,p_destinataire text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v uuid;
begin
  if extract(isodow from p_semaine) <> 1 or not exists(select 1 from equipe_profils where role='admin' and etat='actif' and lower(email)=lower(p_destinataire)) then return null; end if;
  insert into rapports_envois(semaine,destinataire) values(p_semaine,lower(p_destinataire)) on conflict do nothing returning id into v;
  return v;
end $$;

create table public.imap_releves (
  boite text primary key, validite text, dernier_uid bigint not null default 0,
  jeton uuid, reserve_jusqu_au timestamptz, releve_le timestamptz, erreur boolean not null default false
);
create table public.courriels_recus (
  id uuid primary key default gen_random_uuid(), boite text not null,
  validite text not null, uid bigint not null,
  message_id text, recu_le timestamptz not null,
  expediteur text not null, nom text not null default '', objet text not null default '',
  texte text not null default '', pieces jsonb not null default '[]', volumineux boolean not null default false,
  demande_id uuid references public.demandes(id) on delete set null,
  unique(boite,validite,uid), check(length(texte)<=100000),check(length(objet)<=1000)
);
create index courriels_recus_dossier on public.courriels_recus(demande_id,recu_le desc);
create function public.imap_reserver(p_boite text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r imap_releves; v uuid:=gen_random_uuid();
begin
  if length(p_boite)<>64 then return null; end if;
  insert into imap_releves(boite) values(p_boite) on conflict do nothing;
  select * into r from imap_releves where boite=p_boite for update;
  if r.reserve_jusqu_au>now() then return null; end if;
  update imap_releves set jeton=v,reserve_jusqu_au=now()+interval '3 minutes' where boite=p_boite;
  return jsonb_build_object('jeton',v,'validite',r.validite,'dernier_uid',r.dernier_uid);
end $$;
create function public.imap_terminer(p_boite text,p_jeton uuid,p_validite text,p_uid bigint,p_messages jsonb,p_erreur boolean default false)
returns boolean language plpgsql security definer set search_path=public as $$
declare r imap_releves; m jsonb; dossier uuid; n integer;
begin
  select * into r from imap_releves where boite=p_boite for update;
  if not found or r.jeton is distinct from p_jeton then return false; end if;
  if not p_erreur then
    if p_validite is null or p_uid<0 or jsonb_typeof(p_messages)<>'array' or jsonb_array_length(p_messages)>200 then return false; end if;
    for m in select * from jsonb_array_elements(p_messages) loop
      select count(*), (array_agg(id))[1] into n,dossier from demandes where statut='envoyee' and lower(email)=lower(m->>'expediteur');
      if n<>1 then dossier:=null; end if;
      insert into courriels_recus(boite,validite,uid,message_id,recu_le,expediteur,nom,objet,texte,pieces,volumineux,demande_id)
      values(p_boite,p_validite,(m->>'uid')::bigint,m->>'message_id',(m->>'recu_le')::timestamptz,lower(m->>'expediteur'),coalesce(m->>'nom',''),coalesce(m->>'objet',''),coalesce(m->>'texte',''),coalesce(m->'pieces','[]'),coalesce((m->>'volumineux')::boolean,false),dossier)
      on conflict(boite,validite,uid) do nothing;
    end loop;
  end if;
  update imap_releves set jeton=null,reserve_jusqu_au=null,erreur=p_erreur,
    validite=case when p_erreur then validite else p_validite end,
    dernier_uid=case when p_erreur then dernier_uid else p_uid end,
    releve_le=case when p_erreur then releve_le else now() end where boite=p_boite;
  return true;
end $$;

alter table public.reglages_transversaux enable row level security;
alter table public.rapports_envois enable row level security;
alter table public.imap_releves enable row level security;
alter table public.courriels_recus enable row level security;
revoke all on public.reglages_transversaux,public.rapports_envois,public.imap_releves,public.courriels_recus from public,anon,authenticated;
grant select,update on public.reglages_transversaux,public.rapports_envois,public.courriels_recus to service_role;
grant select on public.imap_releves to service_role;
revoke all on function public.rapport_reserver(date,text),public.imap_reserver(text),public.imap_terminer(text,uuid,text,bigint,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.rapport_reserver(date,text),public.imap_reserver(text),public.imap_terminer(text,uuid,text,bigint,jsonb,boolean) to service_role;
