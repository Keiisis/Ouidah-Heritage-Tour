-- Demandes et dossiers voyage (lot L4 du plan de liaison, 02/11/2026) : attribution d'une demande à un agent, étapes du
-- dossier, note de l'équipe, fiches clients, moments datés d'un dossier (arc du soleil des accueils, agenda). Migration
-- additive : ADD COLUMN et CREATE TABLE seulement, rien n'est supprimé ni réécrit. Accès serveur seulement : RLS active,
-- aucune politique, aucun droit pour anon / authenticated ; le serveur écrit avec la clé secrète (rôle service_role).

-- demandes : agent attribué (null tant que personne), étape du dossier, date d'attribution, note interne de l'équipe
alter table public.demandes add column if not exists agent_id uuid references public.equipe_profils (id) on delete set null;
alter table public.demandes add column if not exists etape text not null default 'nouvelle'
  check (etape in ('nouvelle', 'devis_envoye', 'payee', 'en_voyage', 'terminee', 'perdue'));
alter table public.demandes add column if not exists attribuee_le timestamptz;
alter table public.demandes add column if not exists note_equipe text check (char_length(note_equipe) <= 2000);
create index if not exists demandes_agent on public.demandes (agent_id, etape);

-- clients : une fiche par adresse e-mail (en minuscules), remplie depuis les demandes, complétée par l'équipe
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  nom text not null check (char_length(nom) between 1 and 120),
  email text not null unique check (char_length(email) between 3 and 254 and email = lower(email)),
  pays text check (char_length(pays) <= 2),
  langue text not null default 'FR' check (langue in ('FR', 'EN', 'ES', 'DE', 'PT', 'HT', 'GCF')),
  telephone text check (char_length(telephone) <= 32),
  notes text check (char_length(notes) <= 2000)
);
alter table public.clients enable row level security;
revoke all on public.clients from anon, authenticated;
grant select, insert, update on public.clients to service_role;

-- moments datés d'un dossier : visite, départ, rendez-vous, appel, retrait. fait_le : moment traité (un moment passé et
-- non traité va « À clore » sur l'arc du soleil). lieu_id : identifiant d'un lieu du contenu (fr.ts) ou « r:… » du relevé.
create table if not exists public.dossier_moments (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  demande_id uuid not null references public.demandes (id) on delete cascade,
  agent_id uuid references public.equipe_profils (id) on delete set null,
  debut timestamptz not null,
  fin timestamptz not null,
  type text not null check (type in ('visite', 'depart', 'rdv', 'appel', 'retrait')),
  lieu_id text check (char_length(lieu_id) <= 80),
  ordre smallint not null default 0 check (ordre between 0 and 999),
  note text check (char_length(note) <= 280),
  fait_le timestamptz,
  check (fin > debut and fin <= debut + interval '12 hours')
);
create index if not exists dossier_moments_demande on public.dossier_moments (demande_id, debut);
create index if not exists dossier_moments_agent on public.dossier_moments (agent_id, debut);
alter table public.dossier_moments enable row level security;
revoke all on public.dossier_moments from anon, authenticated;
grant select, insert, update, delete on public.dossier_moments to service_role;

-- remplissage des fiches depuis les demandes envoyées déjà en base (une par adresse : la plus récente l'emporte)
insert into public.clients (nom, email, pays, langue, telephone)
select distinct on (lower(d.email)) left(d.nom, 120), lower(d.email), d.pays, d.langue, nullif(d.whatsapp, '')
from public.demandes d
where d.statut = 'envoyee' and d.email is not null and d.nom is not null and char_length(trim(d.nom)) > 0
order by lower(d.email), d.cree_le desc
on conflict (email) do nothing;
