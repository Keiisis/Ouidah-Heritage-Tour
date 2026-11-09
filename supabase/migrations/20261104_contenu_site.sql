-- Contenu du site public modifiable depuis l'espace de l'équipe (04/11/2026). Migration additive : CREATE TABLE,
-- CREATE FUNCTION et INSERT de compartiments seulement, rien n'est supprimé ni réécrit.
-- Le défaut de chaque rubrique reste dans le code (content/fr.ts, histoire.ts, legal.json…) ; la base ne garde que la
-- surcharge, relue par lib/contenu.ts et validée contre la forme du défaut. cle = « fichier.export » (fr.tours,
-- histoire.histoireChapitres), ou « fichier » pour un JSON entier (legal, lieux-ouidah), ou « site.<rubrique> » pour une
-- rubrique sans défaut dans le code (site.partenaires).
-- valeur : version publiée (null = le défaut du code). brouillon : modifications en attente, jamais lues par le site
-- public (seulement en mode aperçu de l'équipe). version : compteur de la ligne, relu à chaque écriture (deux personnes
-- sur la même rubrique : la seconde écriture est refusée au lieu d'écraser la première).
-- Accès serveur seulement : RLS active, aucune politique, aucun droit pour anon / authenticated ; le serveur lit et écrit
-- avec la clé secrète (rôle service_role).
create table if not exists public.contenu_site (
  cle text primary key check (cle ~ '^[a-z][a-z-]{0,30}(\.[A-Za-z][A-Za-z0-9]{0,40})?$'),
  valeur jsonb check (valeur is null or pg_column_size(valeur) <= 1000000),
  brouillon jsonb check (brouillon is null or pg_column_size(brouillon) <= 1000000),
  version integer not null default 0 check (version >= 0),
  modifie_par uuid references public.equipe_profils (id) on delete set null,
  modifie_le timestamptz not null default now(),
  publie_par uuid references public.equipe_profils (id) on delete set null,
  publie_le timestamptz
);
alter table public.contenu_site enable row level security;
revoke all on public.contenu_site from anon, authenticated;
grant select, insert, update on public.contenu_site to service_role;

-- Historique : une ligne par enregistrement (brouillon ou publication), pour restaurer une version.
create table if not exists public.contenu_versions (
  id bigint generated always as identity primary key,
  cle text not null references public.contenu_site (cle) on delete cascade,
  version integer not null check (version > 0),
  etat text not null check (etat in ('brouillon', 'publie')),
  valeur jsonb not null check (pg_column_size(valeur) <= 1000000),
  auteur uuid references public.equipe_profils (id) on delete set null,
  le timestamptz not null default now(),
  unique (cle, version)
);
create index if not exists contenu_versions_cle on public.contenu_versions (cle, version desc);
alter table public.contenu_versions enable row level security;
revoke all on public.contenu_versions from anon, authenticated;
grant select, insert on public.contenu_versions to service_role;

-- Écriture d'une rubrique en une transaction : brouillon (etat 'brouillon'), publication (etat 'publie' : la valeur
-- devient la version publiée, le brouillon est vidé) ou abandon du brouillon (etat 'abandon', aucune ligne d'historique).
-- p_version : version lue par l'écran ; si la ligne a changé entre-temps, rien n'est écrit et la fonction rend null.
-- Rend la nouvelle version.
create or replace function public.contenu_ecrire(p_cle text, p_valeur jsonb, p_version integer, p_auteur uuid, p_etat text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version integer;
begin
  if p_etat not in ('brouillon', 'publie', 'abandon') or (p_etat <> 'abandon' and p_valeur is null) then
    raise exception 'contenu_ecrire : état ou valeur invalide';
  end if;
  insert into public.contenu_site (cle) values (p_cle) on conflict (cle) do nothing;
  update public.contenu_site
     set brouillon = case when p_etat = 'brouillon' then p_valeur else null end,
         valeur = case when p_etat = 'publie' then p_valeur else valeur end,
         publie_par = case when p_etat = 'publie' then p_auteur else publie_par end,
         publie_le = case when p_etat = 'publie' then now() else publie_le end,
         version = version + 1,
         modifie_par = p_auteur,
         modifie_le = now()
   where cle = p_cle and version = p_version
  returning version into v_version;
  if v_version is null then
    return null;
  end if;
  if p_etat <> 'abandon' then
    insert into public.contenu_versions (cle, version, etat, valeur, auteur) values (p_cle, v_version, p_etat, p_valeur, p_auteur);
  end if;
  return v_version;
end;
$$;
revoke all on function public.contenu_ecrire(text, jsonb, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.contenu_ecrire(text, jsonb, integer, uuid, text) to service_role;

-- Images du site : compartiment PUBLIC en lecture (URL /storage/v1/object/public/site-medias/...), WebP seulement (le
-- serveur convertit chaque image avant de la poser ici). Aucune politique sur storage.objects : seule la clé secrète écrit.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-medias', 'site-medias', true, 5242880, array['image/webp'])
on conflict (id) do nothing;

-- Dépôt PRIVÉ des originaux (JPEG, PNG ou WebP, 8 Mo au plus) : le navigateur y pose le fichier par une URL de dépôt
-- signée (les fonctions Vercel refusent un corps de plus de 4,5 Mo), le serveur le relit, vérifie sa signature, le
-- convertit en WebP vers site-medias, puis l'efface. Aucune politique : rien pour anon ni authenticated.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-medias-depot', 'site-medias-depot', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
