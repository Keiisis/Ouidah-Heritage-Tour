-- Réservations d'événements payées en ligne (section Agenda de l'accueil). Paiement complet, jamais d'acompte.
-- L'acheteur lit l'état et ses billets avec une clé signée (HMAC, BILLET_SECRET) : rien de secret n'est stocké. Accès
-- serveur seulement : RLS active, aucune politique, aucun droit pour anon / authenticated ; le serveur écrit avec la clé
-- secrète (rôle service_role). Migration additive.

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  evenement text not null check (evenement ~ '^[a-z0-9-]{1,60}$'),
  occurrence date not null, -- premier jour de l'édition réservée, calculé par le serveur
  formule smallint not null check (formule between 0 and 20),
  formule_nom text not null check (char_length(formule_nom) between 1 and 80),
  quantite smallint not null check (quantite between 1 and 10),
  prix_unitaire integer not null check (prix_unitaire > 0), -- FCFA, lu dans le contenu par le serveur
  montant integer not null check (montant > 0),
  devise text not null default 'XOF' check (devise = 'XOF'),
  passerelle text not null check (passerelle in ('kkiapay', 'fedapay', 'stripe', 'flutterwave', 'paystack')),
  transaction_id text check (char_length(transaction_id) <= 120),
  -- un paiement raté laisse la réservation en attente (le client peut réessayer) : pas d'état « échec »
  statut text not null default 'attente' check (statut in ('attente', 'paye', 'rembourse')),
  nom text not null check (char_length(nom) between 1 and 120),
  email text not null check (char_length(email) <= 254),
  telephone text check (char_length(telephone) <= 32),
  pays text check (pays ~ '^[A-Z]{2}$'),
  langue text not null check (langue in ('FR', 'EN', 'ES', 'DE', 'PT', 'HT', 'GCF')),
  consentement_le timestamptz not null,
  ip_hash text not null,
  paye_le timestamptz,
  montant_recu integer,
  courriel_envoye boolean not null default false,
  -- dossier unique : billets et accompagnement envoyés ensemble ; la demande de devis porte la référence commune
  demande_id uuid references public.demandes (id) on delete restrict,
  check (montant = prix_unitaire * quantite),
  check (statut <> 'paye' or (transaction_id is not null and paye_le is not null and montant_recu >= montant))
);
-- une transaction ne paie qu'une seule réservation
create unique index if not exists reservations_transaction on public.reservations (passerelle, transaction_id) where transaction_id is not null;
create index if not exists reservations_ip_cree on public.reservations (ip_hash, cree_le);
create index if not exists reservations_evenement on public.reservations (evenement, occurrence, statut);
create index if not exists reservations_demande on public.reservations (demande_id) where demande_id is not null;
alter table public.reservations enable row level security;
revoke all on public.reservations from anon, authenticated;
grant select, insert, update on public.reservations to service_role;

-- Passerelles que l'admin rend opérationnelles. Le site n'en propose une que si elle est active ICI et que ses clés
-- sont présentes côté serveur (variables d'environnement). Aucune clé n'est stockée dans cette table.
create table if not exists public.passerelles_paiement (
  nom text primary key check (nom in ('kkiapay', 'fedapay', 'stripe', 'flutterwave', 'paystack')),
  active boolean not null default false,
  ordre smallint not null default 0,
  modifie_le timestamptz not null default now()
);
insert into public.passerelles_paiement (nom, ordre) values ('kkiapay', 1), ('fedapay', 2), ('stripe', 3), ('flutterwave', 4), ('paystack', 5)
  on conflict (nom) do nothing;
alter table public.passerelles_paiement enable row level security;
revoke all on public.passerelles_paiement from anon, authenticated;
grant select, update on public.passerelles_paiement to service_role;
