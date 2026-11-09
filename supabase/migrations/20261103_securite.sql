-- Lot « securite » de l'espace de l'équipe (vague 2, 03/11/2026) : adresses IP bloquées sur les routes de l'équipe,
-- registre des traitements, demandes d'accès et d'effacement traitées, journal des incidents (violations de données).
-- Aucune adresse IP ni adresse e-mail en clair : empreinte SHA-256 salée (EMPREINTE_SEL, même calcul que garde.ts) pour
-- l'IP, HMAC-SHA256 (EQUIPE_SEL) pour l'adresse e-mail d'une personne. Accès serveur seulement : RLS active, aucune
-- politique, aucun droit pour anon / authenticated ; le serveur écrit avec la clé secrète (rôle service_role).
-- Migration additive : tables et index neufs seulement.

-- adresses bloquées par un admin : refusées par /api/equipe et par la lecture de session (pages /agents, /admins et
-- actions serveur). expire_le null : sans fin. Un blocage n'est jamais supprimé : il est levé (leve_le, leve_par).
create table if not exists public.ip_bloquees (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  motif text not null check (char_length(motif) between 3 and 200),
  expire_le timestamptz,
  par uuid references public.equipe_profils (id) on delete set null,
  leve_le timestamptz,
  leve_par uuid references public.equipe_profils (id) on delete set null,
  check (expire_le is null or expire_le > cree_le)
);
create index if not exists ip_bloquees_actives on public.ip_bloquees (ip_hash) where leve_le is null;
alter table public.ip_bloquees enable row level security;
revoke all on public.ip_bloquees from anon, authenticated;
grant select, insert, update on public.ip_bloquees to service_role;

-- registre des traitements (RGPD article 30 ; APDP) : un traitement par ligne, éditable par un admin
create table if not exists public.registre_traitements (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  nom text not null check (char_length(nom) between 3 and 140),
  finalite text not null check (char_length(finalite) between 3 and 1000),
  base_legale text not null check (base_legale in ('consentement', 'contrat', 'obligation_legale', 'interet_legitime', 'mission_publique', 'interets_vitaux')),
  personnes text not null check (char_length(personnes) between 3 and 500),
  donnees text not null check (char_length(donnees) between 3 and 1000),
  destinataires text not null check (char_length(destinataires) between 3 and 1000),
  transferts text check (char_length(transferts) <= 500),
  duree text not null check (char_length(duree) between 2 and 300),
  mesures text check (char_length(mesures) <= 1000),
  modifie_par uuid references public.equipe_profils (id) on delete set null
);
alter table public.registre_traitements enable row level security;
revoke all on public.registre_traitements from anon, authenticated;
grant select, insert, update, delete on public.registre_traitements to service_role;

-- demandes d'accès (export) et d'effacement traitées : la personne n'y est qu'en HMAC de son adresse ; resultat = nombres
-- par catégorie (effacé, conservé), jamais une donnée de la personne
create table if not exists public.donnees_demandes (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  recue_le date not null,
  type text not null check (type in ('acces', 'effacement')),
  email_hmac text not null check (email_hmac ~ '^[0-9a-f]{64}$'),
  resultat jsonb not null default '{}'::jsonb check (jsonb_typeof(resultat) = 'object' and pg_column_size(resultat) <= 4000),
  par uuid references public.equipe_profils (id) on delete set null,
  check (recue_le <= (cree_le at time zone 'Africa/Porto-Novo')::date)
);
create index if not exists donnees_demandes_cree on public.donnees_demandes (cree_le);
alter table public.donnees_demandes enable row level security;
revoke all on public.donnees_demandes from anon, authenticated;
grant select, insert on public.donnees_demandes to service_role;

-- journal des incidents (violations de données) : 72 h comptées depuis decouvert_le
create table if not exists public.donnees_incidents (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  decouvert_le timestamptz not null,
  nature text not null check (char_length(nature) between 3 and 2000),
  donnees text not null check (char_length(donnees) between 3 and 1000),
  personnes text check (char_length(personnes) <= 300),
  mesures text check (char_length(mesures) <= 2000),
  apdp_le timestamptz,
  informees_le timestamptz,
  clos_le timestamptz,
  par uuid references public.equipe_profils (id) on delete set null,
  modifie_par uuid references public.equipe_profils (id) on delete set null,
  check (decouvert_le <= cree_le + interval '5 minutes')
);
alter table public.donnees_incidents enable row level security;
revoke all on public.donnees_incidents from anon, authenticated;
grant select, insert, update on public.donnees_incidents to service_role;
