-- Espace de l'équipe (/agents, /admins), lot L0 du plan de liaison (30/10/2026). Supabase Auth garde les comptes et les
-- mots de passe ; ces tables gardent le profil, les sessions du site, les codes à 6 chiffres, les essais (verrou) et le
-- journal. Aucun secret en clair : jetons et codes ne sont stockés qu'en empreinte (SHA-256 ou HMAC avec EQUIPE_SEL), les
-- adresses IP en empreinte salée. Accès serveur seulement : RLS active, aucune politique, aucun droit pour anon /
-- authenticated ; le serveur écrit avec la clé secrète (rôle service_role). Migration additive.

create table if not exists public.equipe_profils (
  id uuid primary key references auth.users (id) on delete cascade,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  role text not null check (role in ('agent', 'admin')),
  prenom text not null check (char_length(prenom) between 1 and 80),
  nom text not null check (char_length(nom) between 1 and 80),
  email text not null unique check (char_length(email) between 3 and 254 and email = lower(email)),
  telephone text check (char_length(telephone) <= 32),
  -- la première langue sert aux e-mails envoyés à ce compte
  langues text[] not null default array['FR'] check (cardinality(langues) between 1 and 7 and langues <@ array['FR', 'EN', 'ES', 'DE', 'PT', 'HT', 'GCF']),
  droits jsonb not null default '{}'::jsonb check (jsonb_typeof(droits) = 'object'),
  etat text not null default 'invite' check (etat in ('invite', 'actif', 'suspendu')),
  theme text not null default 'auto' check (theme in ('auto', 'clair', 'sombre')),
  derniere_connexion timestamptz
);
alter table public.equipe_profils enable row level security;
revoke all on public.equipe_profils from anon, authenticated;
grant select, insert, update on public.equipe_profils to service_role;

-- sessions du site : cookie __Host-oht_equipe (jeton de 32 octets), seule son empreinte SHA-256 est gardée.
-- 12 h glissantes (expire_le), 7 jours au plus (fin_max).
create table if not exists public.equipe_sessions (
  id uuid primary key default gen_random_uuid(),
  profil_id uuid not null references public.equipe_profils (id) on delete cascade,
  jeton_hash text not null unique check (jeton_hash ~ '^[0-9a-f]{64}$'),
  cree_le timestamptz not null default now(),
  vu_le timestamptz not null default now(),
  expire_le timestamptz not null,
  fin_max timestamptz not null,
  revoque_le timestamptz,
  ip_hash text not null check (char_length(ip_hash) <= 128),
  check (expire_le <= fin_max and fin_max <= cree_le + interval '7 days 1 minute')
);
create index if not exists equipe_sessions_profil on public.equipe_sessions (profil_id) where revoque_le is null;
alter table public.equipe_sessions enable row level security;
revoke all on public.equipe_sessions from anon, authenticated;
grant select, insert, update on public.equipe_sessions to service_role;

-- codes à 6 chiffres (mot de passe oublié, première connexion) : HMAC-SHA256 avec EQUIPE_SEL, 10 min (fixées par la
-- base), 5 essais. Une fois vérifié, le code laisse un jeton court à usage unique (cookie httpOnly) que « nouveau » exige.
create table if not exists public.equipe_codes (
  id uuid primary key default gen_random_uuid(),
  profil_id uuid not null references public.equipe_profils (id) on delete cascade,
  code_hmac text not null check (code_hmac ~ '^[0-9a-f]{64}$'),
  cree_le timestamptz not null default now(),
  expire_le timestamptz not null default now() + interval '10 minutes',
  essais smallint not null default 0 check (essais between 0 and 5),
  consomme_le timestamptz,
  jeton_hash text unique check (jeton_hash ~ '^[0-9a-f]{64}$'),
  jeton_expire_le timestamptz,
  jeton_utilise_le timestamptz,
  check (expire_le <= cree_le + interval '10 minutes 1 second'),
  check (jeton_hash is null or (consomme_le is not null and jeton_expire_le is not null))
);
create index if not exists equipe_codes_profil on public.equipe_codes (profil_id, cree_le) where consomme_le is null;
alter table public.equipe_codes enable row level security;
revoke all on public.equipe_codes from anon, authenticated;
grant select, insert, update on public.equipe_codes to service_role;

-- essais : verrou (5 échecs par e-mail ou par IP en 15 min) et rythme des codes (renvoi après 60 s). L'adresse e-mail
-- n'y est qu'en HMAC (EQUIPE_SEL), qu'elle corresponde à un compte ou non.
create table if not exists public.equipe_essais (
  id bigint generated always as identity primary key,
  cree_le timestamptz not null default now(),
  type text not null check (type in ('connexion', 'code', 'verifier', 'nouveau')),
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  ip_hash text not null check (char_length(ip_hash) <= 128),
  reussi boolean not null
);
create index if not exists equipe_essais_email on public.equipe_essais (email_hash, cree_le);
create index if not exists equipe_essais_ip on public.equipe_essais (ip_hash, cree_le);
alter table public.equipe_essais enable row level security;
revoke all on public.equipe_essais from anon, authenticated;
grant select, insert, update on public.equipe_essais to service_role;

-- journal : jamais de code, de mot de passe ni de jeton (le serveur n'écrit que des champs choisis).
create table if not exists public.equipe_journal (
  id bigint generated always as identity primary key,
  cree_le timestamptz not null default now(),
  profil_id uuid references public.equipe_profils (id) on delete set null,
  action text not null check (action ~ '^[a-z_.]{1,60}$'),
  ip_hash text check (char_length(ip_hash) <= 128),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 2000)
);
create index if not exists equipe_journal_profil on public.equipe_journal (profil_id, cree_le);
alter table public.equipe_journal enable row level security;
revoke all on public.equipe_journal from anon, authenticated;
grant select, insert on public.equipe_journal to service_role;
