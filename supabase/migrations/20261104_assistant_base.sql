-- Base de connaissances de l'assistant public, nourrie par l'admin (demande de Kevin du 04/11/2026) : documents (PDF,
-- DOCX, TXT, MD) et notes dont le TEXTE EXTRAIT seul est gardé (jamais le fichier), questions sans réponse anonymisées
-- (l'assistant « apprend » quand l'admin y répond) et argumentaire commercial. Migration additive : aucune ligne perdue
-- ni réécrite, la limite de 4000 caractères d'une fiche est gardée (le texte d'un document est découpé en morceaux).
-- - assistant_sources : un document ou une note ; etat brouillon (aperçu, rien n'entre dans l'assistant), publie, retire.
-- - assistant_fiches.source_id : morceaux d'une source, effacés avec elle. Les fiches d'un brouillon ou d'une source
--   retirée ont publie = false : connaissance.ts ne lit que publie = true.
-- - assistant_questions : questions que l'assistant n'a pas su traiter, déjà anonymisées par le serveur (e-mails,
--   téléphones, numéros longs, nom donné après « je m'appelle » → [retiré]), normalisées et comptées. Aucune IP, aucun
--   identifiant de conversation : elles survivent à l'effacement des conversations. assistant_noter_question compte une
--   question de plus en une seule requête (insert … on conflict).
-- - assistant_reglages.argumentaire : points forts, réponses aux objections, offres en cours (contenu public).
-- Accès serveur seulement, comme les tables voisines : RLS active, aucune politique, rien pour anon / authenticated ; le
-- serveur écrit avec la clé secrète (rôle service_role).
begin;

create table if not exists public.assistant_sources (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  titre text not null check (char_length(titre) between 1 and 160),
  genre text not null check (genre in ('texte', 'pdf', 'docx', 'txt')),
  nom_fichier text check (char_length(nom_fichier) between 1 and 200),
  taille integer check (taille between 1 and 10485760),
  pages integer check (pages between 1 and 300),
  caracteres integer not null check (caracteres between 1 and 200000),
  etat text not null default 'brouillon' check (etat in ('brouillon', 'publie', 'retire')),
  ajoute_par uuid references public.equipe_profils (id) on delete set null,
  check ((genre = 'texte') = (nom_fichier is null)),
  check (pages is null or genre = 'pdf')
);
create index if not exists assistant_sources_cree on public.assistant_sources (cree_le desc);
alter table public.assistant_sources enable row level security;
revoke all on public.assistant_sources from anon, authenticated;
grant select, insert, update, delete on public.assistant_sources to service_role;

alter table public.assistant_fiches add column if not exists source_id uuid references public.assistant_sources (id) on delete cascade;
create index if not exists assistant_fiches_source on public.assistant_fiches (source_id) where source_id is not null;

create table if not exists public.assistant_questions (
  id uuid primary key default gen_random_uuid(),
  texte text not null check (char_length(texte) between 1 and 500),
  langue text not null check (langue in ('FR', 'EN', 'ES', 'DE', 'PT', 'HT', 'GCF')),
  nombre integer not null default 1 check (nombre >= 1),
  premiere_le timestamptz not null default now(),
  derniere_le timestamptz not null default now(),
  repondue_le timestamptz,
  fiche_id uuid references public.assistant_fiches (id) on delete set null,
  unique (langue, texte)
);
create index if not exists assistant_questions_ouvertes on public.assistant_questions (nombre desc, derniere_le desc) where repondue_le is null;
alter table public.assistant_questions enable row level security;
revoke all on public.assistant_questions from anon, authenticated;
grant select, insert, update, delete on public.assistant_questions to service_role;

-- une occurrence de plus (ou la première) ; une question déjà répondue qui revient sans réponse redevient visible
create or replace function public.assistant_noter_question(p_texte text, p_langue text)
returns void
language sql
set search_path = ''
as $$
  insert into public.assistant_questions as q (texte, langue) values (p_texte, p_langue)
  on conflict (langue, texte) do update set nombre = q.nombre + 1, derniere_le = now(), repondue_le = null;
$$;
revoke all on function public.assistant_noter_question(text, text) from public, anon, authenticated;
grant execute on function public.assistant_noter_question(text, text) to service_role;

alter table public.assistant_reglages add column if not exists argumentaire text not null default '' check (char_length(argumentaire) <= 8000);

commit;

notify pgrst, 'reload schema';
