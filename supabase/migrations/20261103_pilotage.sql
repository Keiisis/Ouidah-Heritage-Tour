-- Lot « pilotage » de l'espace de l'équipe (vague 2, 03/11/2026) : wiki interne, suivi des pistes, documents des clients.
-- Les statistiques, l'écran En direct, le rapport et les performances ne lisent que des tables existantes : aucune table.
-- Migration additive : CREATE TABLE et index seulement, rien n'est supprimé ni réécrit. Accès serveur seulement : RLS
-- active, aucune politique, aucun droit pour anon / authenticated ; le serveur écrit avec la clé secrète (service_role).
-- Les listes de valeurs sont celles de src/content/espace-pilotage.ts.

-- ---------- wiki : procédures, fiches des lieux, réponses types ----------
-- L'admin écrit (brouillon) et publie ; l'agent propose (propose), l'admin publie ou refuse (refuse, avec motif).
create table if not exists public.wiki_pages (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  categorie text not null check (categorie in ('procedure', 'lieu', 'reponse')),
  titre text not null check (char_length(titre) between 3 and 140),
  corps text not null check (char_length(corps) between 1 and 20000),
  etat text not null check (etat in ('brouillon', 'propose', 'publie', 'refuse')),
  auteur_id uuid references public.equipe_profils (id) on delete set null,
  modifie_par uuid references public.equipe_profils (id) on delete set null,
  publie_le timestamptz,
  publie_par uuid references public.equipe_profils (id) on delete set null,
  motif_refus text check (char_length(motif_refus) between 3 and 280),
  check (etat <> 'publie' or publie_le is not null),
  check (etat <> 'refuse' or motif_refus is not null)
);
create index if not exists wiki_pages_etat on public.wiki_pages (etat, categorie, titre);
create index if not exists wiki_pages_auteur on public.wiki_pages (auteur_id, cree_le desc);
alter table public.wiki_pages enable row level security;
revoke all on public.wiki_pages from anon, authenticated;
grant select, insert, update on public.wiki_pages to service_role;

-- ---------- pistes : priorité et rappel d'une demande à relancer ----------
-- Une ligne par demande, posée par l'agent du dossier (ou un admin). Effacée avec la demande (droit à l'effacement).
create table if not exists public.pistes_suivi (
  demande_id uuid primary key references public.demandes (id) on delete cascade,
  priorite text not null default 'normale' check (priorite in ('haute', 'normale', 'basse')),
  rappel_le date,
  modifie_par uuid references public.equipe_profils (id) on delete set null,
  modifie_le timestamptz not null default now()
);
create index if not exists pistes_suivi_rappel on public.pistes_suivi (rappel_le) where rappel_le is not null;
alter table public.pistes_suivi enable row level security;
revoke all on public.pistes_suivi from anon, authenticated;
grant select, insert, update on public.pistes_suivi to service_role;

-- ---------- documents des clients (passeport, billet d'avion, contrat, justificatif) ----------
-- Le fichier vit dans le compartiment PRIVÉ « equipe-documents » (Supabase Storage, créé par l'API, 10 Mo au plus, PDF,
-- JPEG, PNG, WebP), au chemin <demande_id>/<uuid>. Cette table garde la fiche. « on delete restrict » sur la demande :
-- effacer une demande qui a encore des documents échoue, au lieu de laisser des fichiers sans fiche dans le stockage ;
-- l'effacement passe d'abord par effacerDocumentsDuDossier() (lib/serveur/equipe/pilotage/stockage.ts).
create table if not exists public.equipe_documents (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  demande_id uuid not null references public.demandes (id) on delete restrict,
  type text not null check (type in ('passeport', 'billet_avion', 'contrat', 'justificatif', 'autre')),
  nom text not null check (char_length(nom) between 1 and 120),
  type_mime text not null check (type_mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  taille integer not null check (taille between 1 and 10485760),
  chemin text not null unique check (chemin ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  depose_par uuid references public.equipe_profils (id) on delete set null,
  conserver_jusqu_au date not null
);
create index if not exists equipe_documents_demande on public.equipe_documents (demande_id, cree_le desc);
create index if not exists equipe_documents_conservation on public.equipe_documents (conserver_jusqu_au);
alter table public.equipe_documents enable row level security;
revoke all on public.equipe_documents from anon, authenticated;
grant select, insert, delete on public.equipe_documents to service_role;
