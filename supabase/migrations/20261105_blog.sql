-- Blog du site (05/11/2026) : articles écrits par les agents (droit « site ») et les admins depuis l'espace de l'équipe,
-- lus par les clients sur le site public. Migration additive : CREATE TABLE, CREATE INDEX, CREATE FUNCTION et CREATE
-- TRIGGER seulement, rien n'est supprimé ni réécrit.
-- Un article vit dans une langue (une des 7 du site) ; une traduction pointe vers l'article d'origine (traduction_de),
-- jamais vers une autre traduction, et chaque origine a au plus une version par langue. Le slug est unique par langue et
-- ne change plus une fois l'article publié une première fois (publie_le posé) : trigger blog_slug_fige.
-- corps : markdown restreint (titres ##/###, paragraphes, gras, italique, listes, citations, liens internes ou https,
-- images du compartiment site-medias), relu et nettoyé par le serveur (lib/serveur/blog/regles.ts) avant l'écriture.
-- version : compteur relu à chaque écriture (deux personnes sur le même article : la seconde écriture est refusée au lieu
-- d'écraser la première) ; chaque insertion ou modification laisse une ligne dans blog_versions (trigger, même transaction).
-- Accès serveur seulement : RLS active, aucune politique, aucun droit pour anon / authenticated ; le serveur lit et écrit
-- avec la clé secrète (rôle service_role).
create table if not exists public.blog_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (char_length(slug) <= 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  langue text not null check (langue in ('FR', 'EN', 'ES', 'DE', 'PT', 'HT', 'GCF')),
  traduction_de uuid references public.blog_articles (id) on delete set null,
  titre text not null check (char_length(titre) between 1 and 120),
  chapo text not null default '' check (char_length(chapo) <= 300),
  corps text not null default '' check (char_length(corps) <= 40000),
  couverture_src text check (couverture_src is null or (char_length(couverture_src) <= 500 and couverture_src like 'https://%')),
  couverture_alt text check (couverture_alt is null or char_length(couverture_alt) between 1 and 300),
  categorie text check (categorie is null or char_length(categorie) between 1 and 40),
  mots_cles text[] not null default '{}' check (cardinality(mots_cles) <= 10 and char_length(array_to_string(mots_cles, '')) <= 400),
  auteur_id uuid references public.equipe_profils (id) on delete set null,
  etat text not null default 'brouillon' check (etat in ('brouillon', 'relecture', 'publie', 'retire')),
  publie_le timestamptz,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  modifie_par uuid references public.equipe_profils (id) on delete set null,
  seo_titre text check (seo_titre is null or char_length(seo_titre) <= 70),
  seo_description text check (seo_description is null or char_length(seo_description) <= 160),
  temps_lecture integer not null default 1 check (temps_lecture between 1 and 600),
  version integer not null default 1 check (version >= 1),
  -- texte alternatif obligatoire dès qu'il y a une couverture (et jamais d'alt sans image)
  check ((couverture_src is null) = (couverture_alt is null)),
  check (etat <> 'publie' or publie_le is not null),
  check (traduction_de is null or traduction_de <> id),
  unique (langue, slug)
);
create index if not exists blog_articles_etat on public.blog_articles (etat);
create index if not exists blog_articles_publie_le on public.blog_articles (publie_le desc);
create index if not exists blog_articles_langue on public.blog_articles (langue, etat, publie_le desc);
create index if not exists blog_articles_auteur on public.blog_articles (auteur_id);
-- une version par langue pour chaque article d'origine (l'origine compte pour sa propre langue)
create unique index if not exists blog_articles_une_langue on public.blog_articles ((coalesce(traduction_de, id)), langue);
alter table public.blog_articles enable row level security;
revoke all on public.blog_articles from anon, authenticated;
grant select, insert, update, delete on public.blog_articles to service_role;

-- Historique : une ligne par écriture (création, enregistrement, changement d'état), pour restaurer une version.
create table if not exists public.blog_versions (
  id bigint generated always as identity primary key,
  article_id uuid not null references public.blog_articles (id) on delete cascade,
  version integer not null check (version >= 1),
  etat text not null check (etat in ('brouillon', 'relecture', 'publie', 'retire')),
  contenu jsonb not null check (pg_column_size(contenu) <= 200000),
  auteur uuid references public.equipe_profils (id) on delete set null,
  le timestamptz not null default now(),
  unique (article_id, version)
);
create index if not exists blog_versions_article on public.blog_versions (article_id, version desc);
alter table public.blog_versions enable row level security;
revoke all on public.blog_versions from anon, authenticated;
grant select, insert, delete on public.blog_versions to service_role;

-- Avant chaque modification : version + 1, date de modification, slug figé après la première publication, origine
-- d'une traduction jamais changée ensuite.
create or replace function public.blog_avant_ecriture()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.publie_le is not null and new.slug <> old.slug then
    raise exception 'blog : slug publié, il ne change plus' using errcode = 'P0001';
  end if;
  if new.langue <> old.langue then
    raise exception 'blog : la langue d''un article ne change pas' using errcode = 'P0001';
  end if;
  new.version := old.version + 1;
  new.modifie_le := now();
  return new;
end;
$$;
create or replace trigger blog_slug_fige before update on public.blog_articles for each row execute function public.blog_avant_ecriture();

-- Après chaque création ou modification : la version écrite va à l'historique.
create or replace function public.blog_historique()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.blog_versions (article_id, version, etat, contenu, auteur)
  values (new.id, new.version, new.etat, jsonb_build_object(
    'titre', new.titre, 'slug', new.slug, 'chapo', new.chapo, 'corps', new.corps,
    'couverture_src', new.couverture_src, 'couverture_alt', new.couverture_alt, 'categorie', new.categorie,
    'mots_cles', to_jsonb(new.mots_cles), 'seo_titre', new.seo_titre, 'seo_description', new.seo_description
  ), new.modifie_par);
  return null;
end;
$$;
revoke all on function public.blog_historique() from public, anon, authenticated;
revoke all on function public.blog_avant_ecriture() from public, anon, authenticated;
create or replace trigger blog_historique after insert or update on public.blog_articles for each row execute function public.blog_historique();
