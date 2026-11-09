-- Assistant du site et discussion avec un agent (03/11/2026) : fiches de la base de connaissances que l'admin modifie,
-- conversations des visiteurs (assistant IA, puis agent), messages (visiteur, assistant, agent), réglages de l'assistant
-- (modèle Groq, plafonds), consommation de jetons (budget du jour) et événements de mesure agrégés, sans identifiant.
-- Migration additive : CREATE TABLE, index et une ligne de réglages seulement. Accès serveur seulement : RLS active, aucune
-- politique, aucun droit pour anon / authenticated ; le serveur écrit avec la clé secrète (rôle service_role).
-- Aucune de ces tables n'est lue par l'assistant IA, sauf assistant_fiches (publiées) : sa connaissance reste publique.

-- fiches de connaissance rédigées par l'admin (questions fréquentes, précisions) ; seules les publiées entrent dans l'assistant
create table if not exists public.assistant_fiches (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  titre text not null check (char_length(titre) between 1 and 160),
  texte text not null check (char_length(texte) between 1 and 4000),
  publie boolean not null default true,
  modifie_par uuid references public.equipe_profils (id) on delete set null
);
alter table public.assistant_fiches enable row level security;
revoke all on public.assistant_fiches from anon, authenticated;
grant select, insert, update on public.assistant_fiches to service_role;

-- conversation d'un visiteur : identifiant opaque signé côté serveur (jamais l'uuid seul), langue, voie (assistant ou
-- agent), coordonnées seulement si le visiteur les donne pour être recontacté (accord daté). vu_le : dernière lecture
-- du visiteur (une réponse d'agent part par e-mail quand il n'est plus là). Supprimée après la durée de conservation.
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  vu_le timestamptz not null default now(),
  langue text not null check (langue in ('FR', 'EN', 'ES', 'DE', 'PT', 'HT', 'GCF')),
  mode text not null default 'assistant' check (mode in ('assistant', 'agent')),
  ip_hash text not null check (char_length(ip_hash) <= 128),
  passage_le timestamptz,
  hors_ligne boolean not null default false,
  resume text check (char_length(resume) <= 2000),
  agent_id uuid references public.equipe_profils (id) on delete set null,
  contact_nom text check (char_length(contact_nom) <= 120),
  contact_email text check (char_length(contact_email) <= 254),
  contact_whatsapp text check (char_length(contact_whatsapp) <= 32),
  contact_accord_le timestamptz,
  demande_id uuid references public.demandes (id) on delete set null,
  check (mode = 'assistant' or passage_le is not null),
  check ((contact_email is null and contact_whatsapp is null) or contact_accord_le is not null)
);
create index if not exists conversations_ip on public.conversations (ip_hash, cree_le);
create index if not exists conversations_cree on public.conversations (cree_le);
create index if not exists conversations_passage on public.conversations (passage_le desc) where passage_le is not null;
alter table public.conversations enable row level security;
revoke all on public.conversations from anon, authenticated;
grant select, insert, update, delete on public.conversations to service_role;

-- messages d'une conversation. ip_hash : visiteur seulement (limites par connexion). sans_reponse : question que
-- l'assistant n'a pas su traiter d'après le contenu publié ; fiche_id : la fiche que l'admin en a tirée.
-- envoye_le : réponse d'agent partie aussi par e-mail.
create table if not exists public.conversation_messages (
  id bigint generated always as identity primary key,
  cree_le timestamptz not null default now(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  auteur text not null check (auteur in ('visiteur', 'assistant', 'agent')),
  agent_id uuid references public.equipe_profils (id) on delete set null,
  texte text not null check (char_length(texte) between 1 and 4000),
  actions jsonb not null default '[]'::jsonb check (jsonb_typeof(actions) = 'array' and jsonb_array_length(actions) <= 5),
  ip_hash text check (char_length(ip_hash) <= 128),
  sans_reponse boolean not null default false,
  fiche_id uuid references public.assistant_fiches (id) on delete set null,
  envoye_le timestamptz,
  check (auteur <> 'visiteur' or ip_hash is not null)
);
create index if not exists conversation_messages_conv on public.conversation_messages (conversation_id, id);
create index if not exists conversation_messages_ip on public.conversation_messages (ip_hash, cree_le) where auteur = 'visiteur';
create index if not exists conversation_messages_sans on public.conversation_messages (cree_le desc) where sans_reponse;
alter table public.conversation_messages enable row level security;
revoke all on public.conversation_messages from anon, authenticated;
grant select, insert, update on public.conversation_messages to service_role;

-- réglages de l'assistant (une seule ligne) : assistant public allumé ou non, modèle Groq, plafond de jetons par réponse,
-- budget de jetons du jour (assistant public et aide à la rédaction ensemble)
create table if not exists public.assistant_reglages (
  id boolean primary key default true check (id),
  modifie_le timestamptz not null default now(),
  modifie_par uuid references public.equipe_profils (id) on delete set null,
  public_actif boolean not null default true,
  modele text not null default 'openai/gpt-oss-120b' check (modele ~ '^[a-z0-9][a-z0-9._/-]{1,79}$'),
  plafond_reponse integer not null default 700 check (plafond_reponse between 100 and 4000),
  budget_jour integer not null default 200000 check (budget_jour between 1000 and 5000000)
);
insert into public.assistant_reglages (id) values (true) on conflict (id) do nothing;
alter table public.assistant_reglages enable row level security;
revoke all on public.assistant_reglages from anon, authenticated;
grant select, update on public.assistant_reglages to service_role;

-- jetons consommés par appel au fournisseur (budget du jour) : conversation (assistant public) ou membre (rédaction)
create table if not exists public.assistant_consommation (
  id bigint generated always as identity primary key,
  cree_le timestamptz not null default now(),
  source text not null check (source in ('public', 'redaction')),
  jetons integer not null check (jetons between 0 and 200000),
  conversation_id uuid references public.conversations (id) on delete cascade,
  profil_id uuid references public.equipe_profils (id) on delete set null
);
create index if not exists assistant_consommation_cree on public.assistant_consommation (cree_le);
create index if not exists assistant_consommation_profil on public.assistant_consommation (profil_id, cree_le) where profil_id is not null;
alter table public.assistant_consommation enable row level security;
revoke all on public.assistant_consommation from anon, authenticated;
grant select, insert on public.assistant_consommation to service_role;

-- événements de mesure, agrégés par jour (heure de Ouidah), sans aucun identifiant de visiteur ni de conversation
create table if not exists public.assistant_evenements (
  id bigint generated always as identity primary key,
  jour date not null default ((now() at time zone 'Africa/Porto-Novo')::date),
  evenement text not null check (evenement in ('assistant_ouvert', 'question_posee', 'passage_agent', 'devis_demarre'))
);
create index if not exists assistant_evenements_jour on public.assistant_evenements (jour, evenement);
alter table public.assistant_evenements enable row level security;
revoke all on public.assistant_evenements from anon, authenticated;
grant select, insert on public.assistant_evenements to service_role;
