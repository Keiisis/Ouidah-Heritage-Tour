-- Étend les clés de contenu aux traductions sans modifier les valeurs, droits ou historiques existants.
-- FR garde la clé historique ; les autres langues portent leur préfixe explicite, par exemple EN:fr.nav.
alter table public.contenu_site
  drop constraint if exists contenu_site_cle_check;
alter table public.contenu_site
  add constraint contenu_site_cle_check
  check (cle ~ '^((EN|ES|DE|PT|HT|GCF):)?[a-z][a-z-]{0,30}(\.[A-Za-z][A-Za-z0-9_]{0,40})?$');
