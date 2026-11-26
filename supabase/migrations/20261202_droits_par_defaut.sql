-- Droits par défaut du schéma public (audit de sécurité du 23/11/2026, NV-02, lot 6). En production, pg_default_acl
-- donnait tous les droits à anon et authenticated sur les tables, fonctions et séquences créées par postgres dans public :
-- une table future créée sans « revoke » ni RLS aurait été ouverte au public. Le site n'appelle la base qu'avec la clé de
-- service : service_role n'est touché nulle part ici.
--   1. droits par défaut de postgres (le rôle des migrations) retirés à anon et authenticated, pour les objets à venir ;
--   2. EXECUTE retiré à public, anon et authenticated sur les fonctions déclencheurs existantes du schéma public, retrouvées
--      par leur type de retour (13 en production le 26/11 : factures_figees, paiements_figes, finances_tracer…). Un
--      déclencheur ne vérifie pas EXECUTE quand il se déclenche ; service_role garde ce qu'il avait ;
--   3. tous droits retirés à anon et authenticated sur les séquences existantes du schéma public.
-- Les droits par défaut de supabase_admin ne sont pas modifiés : postgres n'en est pas membre et Supabase refuse ce
-- changement (« permission denied to change default privileges », note « Can't change the default privileges of
-- supabase_admin in the public schema »). Ils ne valent que pour les objets créés par supabase_admin, aucun ici.
-- Limite connue : PostgreSQL donne EXECUTE à PUBLIC sur toute fonction nouvelle ; chaque migration le retire donc
-- elle-même (« revoke all on function … from public, anon, authenticated »). Idempotente.

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as fonction, has_function_privilege('service_role', p.oid, 'EXECUTE') as service
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.fonction);
    -- service_role garde exactement ce qu'il avait (EXECUTE reçu par PUBLIC compris)
    if f.service then execute format('grant execute on function %s to service_role', f.fonction); end if;
  end loop;
end $$;

revoke all on all sequences in schema public from anon, authenticated;
