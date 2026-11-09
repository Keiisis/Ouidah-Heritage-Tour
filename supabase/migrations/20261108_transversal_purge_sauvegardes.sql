-- Aucun nettoyage ni envoi à l'installation ; activation explicite dans l'administration.
alter table public.reglages_transversaux add column purge_actif boolean not null default false;

-- Destination choisie par Kevin : stockage privé du même projet Supabase.
-- Aucun accès public/authenticated ; seul le processus opérateur utilise la clé serveur.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('oht-sauvegardes','oht-sauvegardes',false,1073741824,array['application/octet-stream','application/json'])
on conflict(id) do update set public=false;
