-- Lot « reglages » de l'espace de l'équipe (vague 2, 03/11/2026) : mentions des documents, maintenance du site public,
-- réglages généraux (taux de l'euro, e-MECeF, assistant d'écriture). Migration additive : CREATE TABLE et INSERT d'une
-- ligne unique seulement, rien n'est supprimé ni réécrit. Accès serveur seulement : RLS active, aucune politique, aucun
-- droit pour anon / authenticated ; le serveur lit et écrit avec la clé secrète (rôle service_role). Aucune clé ni aucun
-- mot de passe dans ces tables : les clés restent dans les variables d'environnement du serveur.
-- Les passerelles (activation, ordre) restent dans passerelles_paiement (20261027_reservations.sql), les coordonnées
-- bancaires dans reglages_paiement (20261103_finances.sql).

-- Mentions des devis, factures et reçus : une seule ligne (id = true). Lue par le rendu PDF des documents (session
-- documents). pied et mentions : textes par langue { "FR": "…", "EN": "…" }, clés limitées aux 7 langues du site, une
-- langue absente reprend « FR ». Images de la signature et du cachet de la Direction générale : octets bruts, type lu dans
-- les octets par le serveur, 300 Ko au plus chacune.
create table if not exists public.reglages_documents (
  id boolean primary key default true check (id),
  raison_sociale text check (char_length(raison_sociale) between 1 and 120),
  forme text check (char_length(forme) between 1 and 80),
  adresse text check (char_length(adresse) between 1 and 200),
  ifu text check (ifu ~ '^[0-9]{13}$'),
  rccm text check (char_length(rccm) between 1 and 120),
  telephone text check (char_length(telephone) between 1 and 80),
  email text check (char_length(email) between 3 and 254),
  pied jsonb not null default '{}'::jsonb check (jsonb_typeof(pied) = 'object' and (pied - array['FR', 'EN', 'ES', 'DE', 'PT', 'HT', 'GCF']) = '{}'::jsonb and pg_column_size(pied) <= 8000),
  mentions jsonb not null default '{}'::jsonb check (jsonb_typeof(mentions) = 'object' and (mentions - array['FR', 'EN', 'ES', 'DE', 'PT', 'HT', 'GCF']) = '{}'::jsonb and pg_column_size(mentions) <= 12000),
  signataire text check (char_length(signataire) between 1 and 80),
  fonction text check (char_length(fonction) between 1 and 80),
  signature bytea check (octet_length(signature) between 1 and 300000),
  signature_type text check (signature_type in ('image/png', 'image/jpeg', 'image/webp')),
  cachet bytea check (octet_length(cachet) between 1 and 300000),
  cachet_type text check (cachet_type in ('image/png', 'image/jpeg', 'image/webp')),
  modifie_le timestamptz not null default now(),
  modifie_par uuid references public.equipe_profils (id) on delete set null,
  check ((signature is null) = (signature_type is null)),
  check ((cachet is null) = (cachet_type is null))
);
insert into public.reglages_documents (id) values (true) on conflict (id) do nothing;
alter table public.reglages_documents enable row level security;
revoke all on public.reglages_documents from anon, authenticated;
grant select, update on public.reglages_documents to service_role;

-- Maintenance du site public : une seule ligne. message : texte aux visiteurs par langue (clés limitées aux 7 langues),
-- le français obligatoire pour activer. Lu par le proxy du site public une fois branché (session documents, proxy.ts).
create table if not exists public.reglages_maintenance (
  id boolean primary key default true check (id),
  actif boolean not null default false,
  message jsonb not null default '{}'::jsonb check (jsonb_typeof(message) = 'object' and (message - array['FR', 'EN', 'ES', 'DE', 'PT', 'HT', 'GCF']) = '{}'::jsonb and pg_column_size(message) <= 8000),
  modifie_le timestamptz not null default now(),
  modifie_par uuid references public.equipe_profils (id) on delete set null,
  check (not actif or char_length(coalesce(message ->> 'FR', '')) between 1 and 500)
);
insert into public.reglages_maintenance (id) values (true) on conflict (id) do nothing;
alter table public.reglages_maintenance enable row level security;
revoke all on public.reglages_maintenance from anon, authenticated;
grant select, update on public.reglages_maintenance to service_role;

-- Réglages généraux : une seule ligne.
-- taux_eur : parité fixe du franc CFA (1 € = 655,957 FCFA, BCEAO), lue par le serveur ; la contrainte la fige tant que le
--   code du site la répète ailleurs (une valeur différente ici fausserait les montants).
-- emcf_actif : normalisation e-MECeF de la DGI, désactivée ; la contrainte se lève par une migration après l'accord du
--   comptable. emcf_nim : numéro de la machine (non secret) ; le jeton de l'API reste dans la variable EMCF_JETON.
-- assistant_actif : assistant d'écriture ; le serveur refuse de l'allumer sans clé de fournisseur (ANTHROPIC_API_KEY).
create table if not exists public.reglages_site (
  id boolean primary key default true check (id),
  taux_eur numeric(10, 3) not null default 655.957 check (taux_eur = 655.957),
  emcf_actif boolean not null default false check (not emcf_actif),
  emcf_nim text check (emcf_nim ~ '^[A-Z0-9-]{4,40}$'),
  assistant_actif boolean not null default false,
  modifie_le timestamptz not null default now(),
  modifie_par uuid references public.equipe_profils (id) on delete set null
);
insert into public.reglages_site (id) values (true) on conflict (id) do nothing;
alter table public.reglages_site enable row level security;
revoke all on public.reglages_site from anon, authenticated;
grant select, update on public.reglages_site to service_role;
