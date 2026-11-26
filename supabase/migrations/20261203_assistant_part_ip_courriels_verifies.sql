-- Sécurité, LOT 6 B (26/11/2026). Migration additive et rejouable, aucune ligne perdue ni réécrite.
-- 1. assistant_compteurs.jetons et genre « jetons » : jetons de l'assistant public dépensés par une connexion (empreinte
--    IP, /64 en IPv6), pour la part du budget du jour qu'une seule connexion peut dépenser en 24 h (fournisseur.ts,
--    partIpEpuisee). Même table que les autres limites par connexion : aucun contenu, effacée après 2 jours.
-- 2. courriels_recus.expediteur_verifie : vrai seulement si le serveur de réception a authentifié l'expéditeur
--    (Authentication-Results : dmarc=pass, ou spf=pass et dkim=pass alignés ; imap.ts, expediteurVerifie). Le rattachement
--    au dossier d'après l'adresse From reste ; l'équipe voit « Expéditeur non vérifié ». Lignes déjà reçues : false.
--    imap_terminer garde la même signature, les mêmes droits et la même règle de rattachement ; il enregistre ce champ.
-- Idempotente ; sans begin/commit : scripts/migrations-production.mjs met chaque migration dans sa transaction.

alter table public.assistant_compteurs add column if not exists jetons integer check (jetons between 0 and 200000);
alter table public.assistant_compteurs drop constraint if exists assistant_compteurs_genre_check;
alter table public.assistant_compteurs add constraint assistant_compteurs_genre_check check (genre in ('message', 'conversation', 'jetons'));

alter table public.courriels_recus add column if not exists expediteur_verifie boolean not null default false;

create or replace function public.imap_terminer(p_boite text,p_jeton uuid,p_validite text,p_uid bigint,p_messages jsonb,p_erreur boolean default false)
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
      insert into courriels_recus(boite,validite,uid,message_id,recu_le,expediteur,expediteur_verifie,nom,objet,texte,pieces,volumineux,demande_id)
      values(p_boite,p_validite,(m->>'uid')::bigint,m->>'message_id',(m->>'recu_le')::timestamptz,lower(m->>'expediteur'),coalesce((m->>'expediteur_verifie')::boolean,false),coalesce(m->>'nom',''),coalesce(m->>'objet',''),coalesce(m->>'texte',''),coalesce(m->'pieces','[]'),coalesce((m->>'volumineux')::boolean,false),dossier)
      on conflict(boite,validite,uid) do nothing;
    end loop;
  end if;
  update imap_releves set jeton=null,reserve_jusqu_au=null,erreur=p_erreur,
    validite=case when p_erreur then validite else p_validite end,
    dernier_uid=case when p_erreur then dernier_uid else p_uid end,
    releve_le=case when p_erreur then releve_le else now() end where boite=p_boite;
  return true;
end $$;
revoke all on function public.imap_terminer(text,uuid,text,bigint,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.imap_terminer(text,uuid,text,bigint,jsonb,boolean) to service_role;
