-- Messages de l'espace équipe (lot L6, 03/11/2026) : modèles d'e-mails du composeur (7 langues), e-mails rédigés par
-- l'équipe (brouillon, envoyé, échec), notifications des agents (lues ou non), numéros de La lettre de Ouidah et leurs
-- envois, désinscription des abonnés. Migration additive : CREATE TABLE, ADD COLUMN et index seulement. Accès serveur
-- seulement : RLS active, aucune politique, aucun droit pour anon / authenticated ; le serveur écrit avec la clé secrète
-- (rôle service_role).

-- modèles du composeur : un texte par clé et par langue (les e-mails automatiques des clients n'y sont pas)
create table if not exists public.modeles_courriels (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  cle text not null check (cle ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  langue text not null check (langue in ('FR', 'EN', 'ES', 'DE', 'PT', 'HT', 'GCF')),
  sujet text not null check (char_length(sujet) between 1 and 200),
  corps text not null check (char_length(corps) between 1 and 8000),
  modifie_par uuid references public.equipe_profils (id) on delete set null,
  unique (cle, langue)
);
alter table public.modeles_courriels enable row level security;
revoke all on public.modeles_courriels from anon, authenticated;
grant select, insert, update, delete on public.modeles_courriels to service_role;

-- e-mails rédigés par l'équipe : un par destinataire (un envoi à un groupe partage le même « lot »)
create table if not exists public.courriels_envoyes (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  statut text not null check (statut in ('brouillon', 'envoye', 'echec')),
  auteur_id uuid references public.equipe_profils (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  destinataire text not null check (char_length(destinataire) between 3 and 254),
  modele text check (modele is null or modele ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  langue text not null check (langue in ('FR', 'EN', 'ES', 'DE', 'PT', 'HT', 'GCF')),
  objet text not null check (char_length(objet) <= 200),
  corps text not null default '' check (char_length(corps) <= 8000),
  pieces jsonb not null default '[]'::jsonb check (jsonb_typeof(pieces) = 'array' and jsonb_array_length(pieces) <= 5),
  lot uuid,
  envoye_le timestamptz,
  check (statut = 'brouillon' or envoye_le is not null)
);
create index if not exists courriels_envoyes_auteur on public.courriels_envoyes (auteur_id, cree_le desc);
create index if not exists courriels_envoyes_client on public.courriels_envoyes (client_id, cree_le desc);
alter table public.courriels_envoyes enable row level security;
revoke all on public.courriels_envoyes from anon, authenticated;
grant select, insert, update on public.courriels_envoyes to service_role;

-- notifications d'un membre : une par événement (type + objet), lue ou non. objet_id : la demande concernée.
-- Les autres lots (paiement reçu, devis ouvert) y écrivent la même forme de ligne.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  profil_id uuid not null references public.equipe_profils (id) on delete cascade,
  type text not null check (type in ('dossier_attribue', 'devis_ouvert', 'paiement_recu', 'message_recu')),
  objet_id uuid not null,
  quand timestamptz not null,
  lu_le timestamptz,
  unique (profil_id, type, objet_id)
);
create index if not exists notifications_profil on public.notifications (profil_id, quand desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select, insert, update on public.notifications to service_role;

-- La lettre de Ouidah : désinscription datée (l'abonné reste en base, il ne reçoit plus rien)
alter table public.abonnes_lettre add column if not exists desinscrit_le timestamptz;
create index if not exists abonnes_lettre_langue on public.abonnes_lettre (langue) where desinscrit_le is null;

-- numéros de la lettre : écrits dans une langue, pour les abonnés de cette langue qui ont choisi un des thèmes.
-- curseur : dernier abonné traité (envoi par lots, ordre des identifiants).
create table if not exists public.lettre_numeros (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  auteur_id uuid references public.equipe_profils (id) on delete set null,
  langue text not null check (langue in ('FR', 'EN', 'ES', 'DE', 'PT', 'HT', 'GCF')),
  sujets jsonb not null default '[]'::jsonb check (jsonb_typeof(sujets) = 'array' and jsonb_array_length(sujets) between 1 and 10),
  objet text not null check (char_length(objet) between 1 and 200),
  corps text not null check (char_length(corps) between 1 and 8000),
  statut text not null default 'brouillon' check (statut in ('brouillon', 'en_cours', 'envoye')),
  curseur uuid,
  envoye_le timestamptz
);
alter table public.lettre_numeros enable row level security;
revoke all on public.lettre_numeros from anon, authenticated;
grant select, insert, update on public.lettre_numeros to service_role;

-- un envoi par abonné et par numéro : la ligne est posée AVANT l'envoi (unicité), jamais deux fois le même numéro
create table if not exists public.lettre_envois (
  id bigint generated always as identity primary key,
  cree_le timestamptz not null default now(),
  numero_id uuid not null references public.lettre_numeros (id) on delete cascade,
  abonne_id uuid not null references public.abonnes_lettre (id) on delete cascade,
  statut text not null default 'envoi' check (statut in ('envoi', 'envoye', 'echec')),
  unique (numero_id, abonne_id)
);
alter table public.lettre_envois enable row level security;
revoke all on public.lettre_envois from anon, authenticated;
grant select, insert, update on public.lettre_envois to service_role;
