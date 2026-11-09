-- Demandes de voyage (/devis) et abonnés de la lettre (section 12). Accès serveur seulement : RLS active, aucune
-- politique, aucun droit pour anon / authenticated ; le serveur écrit avec la clé secrète (rôle service_role).

create table if not exists public.demandes (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  statut text not null check (statut in ('brouillon', 'envoyee')),
  -- reprise sur un autre appareil : seule l'empreinte SHA-256 du jeton est gardée, jamais le jeton
  jeton_hash text unique,
  jeton_expire_le timestamptz,
  intention text not null default 'voyage' check (intention in ('voyage', 'question', 'groupe')),
  circuit text,
  langue text not null check (langue in ('FR', 'EN', 'ES', 'DE', 'PT', 'HT', 'GCF')),
  dossier jsonb not null default '{}'::jsonb,
  reponses jsonb not null default '{}'::jsonb,
  nom text check (char_length(nom) <= 120),
  email text check (char_length(email) <= 254),
  whatsapp text check (char_length(whatsapp) <= 32),
  pays text check (char_length(pays) <= 2),
  message text check (char_length(message) <= 4000),
  consentement_le timestamptz,
  ip_hash text not null,
  copie_envoyee boolean not null default false,
  oht_prevenu boolean not null default false,
  check (statut = 'brouillon' or (nom is not null and email is not null and consentement_le is not null))
);
create index if not exists demandes_ip_cree on public.demandes (ip_hash, cree_le);
alter table public.demandes enable row level security;
revoke all on public.demandes from anon, authenticated;
grant select, insert, update on public.demandes to service_role;

create table if not exists public.abonnes_lettre (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  email text not null unique check (char_length(email) <= 254),
  langue text not null check (langue in ('FR', 'EN', 'ES', 'DE', 'PT', 'HT', 'GCF')),
  sujets jsonb not null default '[]'::jsonb,
  consentement_le timestamptz not null,
  ip_hash text not null
);
create index if not exists abonnes_ip_cree on public.abonnes_lettre (ip_hash, cree_le);
alter table public.abonnes_lettre enable row level security;
revoke all on public.abonnes_lettre from anon, authenticated;
grant select, insert, update on public.abonnes_lettre to service_role;
