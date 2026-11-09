-- Lecture seule. Exécuter dans le SQL Editor du projet cible, avant puis après les migrations.
-- L'absence de table/fonction est visible sans lire de donnée client ou de secret.
select current_database() as base, current_setting('server_version') as version_postgresql,
  to_regclass('oht_ops.migrations') is not null as journal_migrations_oht;

select c.relname as table_metier,c.relrowsecurity as rls,
  has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') as acces_anon,
  has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') as acces_authenticated
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' order by c.relname;

-- Attendu : aucune ligne. Les fonctions trigger ne sont pas directement appelables comme RPC.
select p.proname as rpc_non_privee,pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef and p.prorettype<>'trigger'::regtype
  and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'));

select id,public,file_size_limit,allowed_mime_types from storage.buckets
where id in ('boutique','site-medias','site-medias-depot','equipe-documents','oht-sauvegardes') order by id;

-- Les migrations OHT ne créent aucune politique Storage. Toute politique préexistante est à examiner,
-- notamment celles qui donnent un accès général aux rôles anon/authenticated.
select policyname,roles,cmd,qual,with_check from pg_policies where schemaname='storage' and tablename='objects';

-- Définitions à comparer avec le manifeste local pour une base ancienne sans journal fiable.
select p.proname,pg_get_function_identity_arguments(p.oid) as arguments,pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('contenu_publier_traduction','traduction_auto_finaliser','regler_taux_usd','chiffrer_commande_boutique')
order by p.proname;
