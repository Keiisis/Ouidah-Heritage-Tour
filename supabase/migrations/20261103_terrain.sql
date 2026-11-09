-- Lot « terrain » de l'espace de l'équipe (L5, 03/11/2026) : entrées contrôlées des billets QR, préparation des commandes
-- boutique. Migration additive : CREATE TABLE, ADD COLUMN et index seulement, rien n'est supprimé ni réécrit. Accès
-- serveur seulement : RLS active, aucune politique, aucun droit pour anon / authenticated ; le serveur écrit avec la clé
-- secrète (rôle service_role).

-- Entrées : un billet = une réservation payée et son rang (billets() de lib/serveur/paiement/billet.ts, signés HMAC). Le
-- couple (reservation_id, rang) est unique : un billet n'entre qu'une fois, même rejoué par la file hors ligne d'un
-- téléphone. cle : identifiant tiré par le téléphone au moment du scan ; la même entrée renvoyée deux fois (réponse
-- perdue, file rejouée) est reconnue comme la même, pas comme un second passage. entre_le : heure du contrôle sur le
-- téléphone (bornée par le serveur), recu_le : heure d'arrivée en base. appareil : identifiant aléatoire du téléphone,
-- jamais une empreinte du navigateur.
create table if not exists public.billets_entrees (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations (id) on delete restrict,
  rang smallint not null check (rang between 1 and 10),
  numero text not null check (numero ~ '^OHT-[0-9A-F]{8}-[0-9]{1,2}$'),
  evenement text not null check (evenement ~ '^[a-z0-9-]{1,60}$'),
  occurrence date not null,
  cle uuid not null unique,
  entre_le timestamptz not null,
  recu_le timestamptz not null default now(),
  agent_id uuid references public.equipe_profils (id) on delete set null,
  appareil text not null check (appareil ~ '^[A-Za-z0-9_-]{8,64}$'),
  mode text not null check (mode in ('camera', 'saisie')),
  hors_ligne boolean not null default false,
  constraint billets_entrees_billet unique (reservation_id, rang)
);
create index if not exists billets_entrees_edition on public.billets_entrees (evenement, occurrence, entre_le desc);
alter table public.billets_entrees enable row level security;
revoke all on public.billets_entrees from anon, authenticated;
grant select, insert on public.billets_entrees to service_role;

-- Commandes boutique : préparation par l'équipe (statut a_confirmer → a_preparer → prete → remise, posé par le serveur,
-- jamais à rebours). Les colonnes gardent quand et par qui.
alter table public.boutique_commandes add column if not exists prepare_le timestamptz;
alter table public.boutique_commandes add column if not exists prete_le timestamptz;
alter table public.boutique_commandes add column if not exists remise_le timestamptz;
alter table public.boutique_commandes add column if not exists prepare_par uuid references public.equipe_profils (id) on delete set null;
create index if not exists boutique_commandes_statut on public.boutique_commandes (statut, cree_le);
