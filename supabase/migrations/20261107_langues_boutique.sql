-- Textes traduits uniquement ; les colonnes métier et les droits restent communs.
alter table public.boutique_produits add column traductions jsonb not null default '{}'::jsonb
  check (jsonb_typeof(traductions) = 'object'
    and octet_length(traductions::text) <= 200000
    and traductions - array['EN','ES','DE','PT','HT','GCF']::text[] = '{}'::jsonb
    and not jsonb_path_exists(traductions, 'strict $.* ? (@.type() != "object")'));

alter table public.boutique_categories add column traductions jsonb not null default '{}'::jsonb
  check (jsonb_typeof(traductions) = 'object'
    and octet_length(traductions::text) <= 20000
    and traductions - array['EN','ES','DE','PT','HT','GCF']::text[] = '{}'::jsonb
    and not jsonb_path_exists(traductions, 'strict $.* ? (@.type() != "object")'));

alter table public.boutique_matieres add column traductions jsonb not null default '{}'::jsonb
  check (jsonb_typeof(traductions) = 'object'
    and octet_length(traductions::text) <= 10000
    and traductions - array['EN','ES','DE','PT','HT','GCF']::text[] = '{}'::jsonb
    and not jsonb_path_exists(traductions, 'strict $.* ? (@.type() != "object")'));

