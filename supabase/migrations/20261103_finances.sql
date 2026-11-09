-- Finances de l'espace équipe (lot L7, 03/11/2026) : factures (F-) et avoirs (A-) à numérotation continue, liens de
-- paiement au total du devis, paiements manuels (virement, espèces, Mobile Money direct, chèque) saisis par un agent et
-- confirmés par un admin, dépenses avec justificatif, clôtures mensuelles, grille tarifaire, coordonnées de l'agence.
-- Jamais d'acompte : le montant attendu est toujours le total, calculé par le serveur. Accès serveur seulement : RLS
-- active, aucune politique, aucun droit pour anon / authenticated ; le serveur écrit avec la clé secrète (service_role).
-- Migration additive : CREATE TABLE, index, fonctions et déclencheurs neufs ; rien de supprimé, rien de modifié ailleurs.

-- ---------- numérotation continue des factures (F-) et des avoirs (A-) ----------
-- La numérotation commune `emettre_document` (20261102_documents.sql) ne connaît que T, R et D : les factures et les
-- avoirs ont leur compteur, sur le même principe (verrou de ligne, sans trou, année de Ouidah).
create table if not exists public.finances_compteurs (
  type text not null check (type in ('F', 'A')),
  annee smallint not null check (annee between 2026 and 2100),
  dernier integer not null default 0 check (dernier >= 0),
  primary key (type, annee)
);
alter table public.finances_compteurs enable row level security;
revoke all on public.finances_compteurs from anon, authenticated;
grant select on public.finances_compteurs to service_role;

-- ---------- justificatifs (stockage privé dans la base, faute de compartiment de stockage privé) ----------
-- Avis de virement, capture Mobile Money, ticket de dépense. 900 Ko au plus (limite des actions serveur : 1 Mo).
create table if not exists public.finances_justificatifs (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  type_mime text not null check (type_mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  taille integer not null check (taille between 1 and 921600),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  contenu bytea not null,
  depose_par uuid references public.equipe_profils (id) on delete set null
);
alter table public.finances_justificatifs enable row level security;
revoke all on public.finances_justificatifs from anon, authenticated;
grant select, insert on public.finances_justificatifs to service_role;

-- ---------- factures ----------
-- Une facture par devis envoyé (prêt ou payé), émise par la fonction emettre_facture : lignes, montant et client sont
-- recopiés du devis et de la demande, jamais reçus du navigateur. Après émission, seuls l'état et les dates d'envoi et de
-- paiement changent (déclencheur factures_figees) ; une correction passe par un avoir.
create table if not exists public.factures (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  annee smallint not null check (annee between 2026 and 2100),
  rang integer not null check (rang > 0),
  numero text generated always as ('F-' || annee::text || '-' || lpad(rang::text, 6, '0')) stored,
  devis_id uuid not null unique references public.devis (id) on delete restrict,
  demande_id uuid not null references public.demandes (id) on delete restrict,
  client jsonb not null check (jsonb_typeof(client) = 'object'),
  lignes jsonb not null check (jsonb_typeof(lignes) = 'array' and jsonb_array_length(lignes) between 1 and 20),
  montant integer not null check (montant > 0),
  devise text not null default 'XOF' check (devise = 'XOF'),
  statut text not null default 'emise' check (statut in ('emise', 'payee', 'a_regulariser', 'annulee')),
  emise_par uuid references public.equipe_profils (id) on delete set null,
  envoyee_le timestamptz,
  payee_le timestamptz,
  unique (annee, rang)
);
create index if not exists factures_demande on public.factures (demande_id);
create index if not exists factures_statut on public.factures (statut, cree_le);
alter table public.factures enable row level security;
revoke all on public.factures from anon, authenticated;
grant select, update on public.factures to service_role;

create or replace function public.factures_figees()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.annee <> old.annee or new.rang <> old.rang or new.devis_id <> old.devis_id or new.demande_id <> old.demande_id
     or new.client <> old.client or new.lignes <> old.lignes or new.montant <> old.montant or new.devise <> old.devise
     or new.cree_le <> old.cree_le or new.emise_par is distinct from old.emise_par then
    raise exception 'facture_figee' using errcode = 'P0001', hint = 'Une facture émise ne se modifie plus : émettre un avoir.';
  end if;
  return new;
end;
$$;
create or replace trigger factures_figees before update on public.factures for each row execute function public.factures_figees();

-- ---------- avoirs ----------
-- Réduisent le reste dû d'une facture, jamais au-delà ; impossibles à modifier (aucun droit UPDATE).
create table if not exists public.avoirs (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  annee smallint not null check (annee between 2026 and 2100),
  rang integer not null check (rang > 0),
  numero text generated always as ('A-' || annee::text || '-' || lpad(rang::text, 6, '0')) stored,
  facture_id uuid not null references public.factures (id) on delete restrict,
  montant integer not null check (montant > 0),
  motif text not null check (char_length(motif) between 3 and 280),
  cree_par uuid references public.equipe_profils (id) on delete set null,
  unique (annee, rang)
);
create index if not exists avoirs_facture on public.avoirs (facture_id);
alter table public.avoirs enable row level security;
revoke all on public.avoirs from anon, authenticated;
grant select on public.avoirs to service_role;

-- ---------- liens de paiement ----------
-- Montant = total du devis, recopié par le serveur ; jamais d'acompte. Le lien se lit par un jeton signé (HMAC, calculé
-- par le serveur, rien de secret ici). Suivi : créé, envoyé, ouvert, payé, expiré (ou annulé).
create table if not exists public.liens_paiement (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  devis_id uuid not null references public.devis (id) on delete restrict,
  facture_id uuid references public.factures (id) on delete restrict,
  demande_id uuid not null references public.demandes (id) on delete restrict,
  montant integer not null check (montant > 0),
  devise text not null default 'XOF' check (devise = 'XOF'),
  langue text not null check (langue in ('FR', 'EN', 'ES', 'DE', 'PT', 'HT', 'GCF')),
  passerelles text[] not null check (cardinality(passerelles) between 1 and 5 and passerelles <@ array['kkiapay', 'fedapay', 'stripe', 'flutterwave', 'paystack']::text[]),
  expire_le timestamptz not null,
  envoye_le timestamptz,
  ouvert_le timestamptz,
  paye_le timestamptz,
  annule_le timestamptz,
  passerelle text check (passerelle in ('kkiapay', 'fedapay', 'stripe', 'flutterwave', 'paystack')),
  transaction_id text check (char_length(transaction_id) <= 120),
  cree_par uuid references public.equipe_profils (id) on delete set null,
  check (expire_le > cree_le),
  check (paye_le is null or (passerelle is not null and transaction_id is not null))
);
-- un seul lien vivant par devis ; une transaction ne paie qu'un seul lien
create unique index if not exists liens_paiement_vivant on public.liens_paiement (devis_id) where annule_le is null and paye_le is null;
create unique index if not exists liens_paiement_transaction on public.liens_paiement (passerelle, transaction_id) where transaction_id is not null;
create index if not exists liens_paiement_demande on public.liens_paiement (demande_id);
alter table public.liens_paiement enable row level security;
revoke all on public.liens_paiement from anon, authenticated;
grant select, insert, update on public.liens_paiement to service_role;

create or replace function public.liens_figes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.devis_id <> old.devis_id or new.demande_id <> old.demande_id or new.montant <> old.montant or new.devise <> old.devise
     or new.langue <> old.langue or new.passerelles <> old.passerelles or new.expire_le <> old.expire_le or new.cree_le <> old.cree_le
     or (old.paye_le is not null and new.paye_le is distinct from old.paye_le) then
    raise exception 'lien_fige' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create or replace trigger liens_figes before update on public.liens_paiement for each row execute function public.liens_figes();

-- ---------- paiements manuels ----------
-- Saisis par un agent (justificatif obligatoire pour un virement), confirmés ou rejetés par un admin qui n'est pas
-- l'auteur de la saisie. Confirmé ou rejeté : plus rien ne change (déclencheur paiements_figes) ; une erreur se corrige
-- par une écriture inverse (montant négatif, inverse_de). Une même référence ne passe qu'une fois par mode.
-- Montant : en FCFA (XOF) ou en centimes d'euro (EUR) ; converti au taux fixe de 655,957 pour les comptes.
create table if not exists public.paiements_manuels (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  mode text not null check (mode in ('virement', 'especes', 'mobile_money', 'cheque')),
  montant integer not null check (montant <> 0),
  devise text not null default 'XOF' check (devise in ('XOF', 'EUR')),
  recu_le date not null,
  reference text check (char_length(reference) between 3 and 80),
  payeur text check (char_length(payeur) between 2 and 120),
  justificatif_id uuid references public.finances_justificatifs (id) on delete restrict,
  facture_id uuid references public.factures (id) on delete restrict,
  devis_id uuid references public.devis (id) on delete restrict,
  reservation_id uuid references public.reservations (id) on delete restrict,
  commande_id uuid references public.boutique_commandes (id) on delete restrict,
  saisi_par uuid references public.equipe_profils (id) on delete set null,
  confirme_par uuid references public.equipe_profils (id) on delete set null,
  confirme_le timestamptz,
  etat text not null default 'a_confirmer' check (etat in ('a_confirmer', 'confirme', 'rejete')),
  motif text check (char_length(motif) between 3 and 280), -- motif du rejet ou de l'écriture inverse
  inverse_de uuid unique references public.paiements_manuels (id) on delete restrict,
  check (num_nonnulls(facture_id, devis_id, reservation_id, commande_id) >= 1),
  check ((inverse_de is null) = (montant > 0)),
  check (inverse_de is not null or mode <> 'virement' or justificatif_id is not null),
  check (etat <> 'rejete' or motif is not null),
  -- confirme_par / confirme_le : l'admin qui a traité la saisie (confirmée ou rejetée) et quand
  check (etat = 'a_confirmer' or (confirme_par is not null and confirme_le is not null))
);
create unique index if not exists paiements_manuels_reference on public.paiements_manuels (mode, lower(reference)) where reference is not null and etat <> 'rejete';
create index if not exists paiements_manuels_etat on public.paiements_manuels (etat, cree_le);
create index if not exists paiements_manuels_facture on public.paiements_manuels (facture_id) where facture_id is not null;
create index if not exists paiements_manuels_devis on public.paiements_manuels (devis_id) where devis_id is not null;
create index if not exists paiements_manuels_saisi on public.paiements_manuels (saisi_par, cree_le);
alter table public.paiements_manuels enable row level security;
revoke all on public.paiements_manuels from anon, authenticated;
grant select, insert, update on public.paiements_manuels to service_role;

create or replace function public.paiements_figes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.etat <> 'a_confirmer' then
    raise exception 'paiement_fige' using errcode = 'P0001', hint = 'Un paiement confirmé ou rejeté ne se modifie plus.';
  end if;
  if new.mode <> old.mode or new.montant <> old.montant or new.devise <> old.devise or new.recu_le <> old.recu_le
     or new.reference is distinct from old.reference or new.payeur is distinct from old.payeur
     or new.justificatif_id is distinct from old.justificatif_id or new.saisi_par is distinct from old.saisi_par
     or new.cree_le <> old.cree_le or new.inverse_de is distinct from old.inverse_de
     or new.devis_id is distinct from old.devis_id or new.reservation_id is distinct from old.reservation_id
     or new.commande_id is distinct from old.commande_id
     or (old.facture_id is not null and new.facture_id is distinct from old.facture_id) then
    raise exception 'paiement_fige' using errcode = 'P0001', hint = 'Une saisie ne se modifie pas : la rejeter et la refaire.';
  end if;
  return new;
end;
$$;
create or replace trigger paiements_figes before update on public.paiements_manuels for each row execute function public.paiements_figes();

-- ---------- dépenses ----------
create table if not exists public.depenses (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  jour date not null,
  libelle text not null check (char_length(libelle) between 1 and 120),
  montant integer not null check (montant > 0),
  devise text not null default 'XOF' check (devise = 'XOF'),
  mode text not null check (mode in ('virement', 'especes', 'mobile_money', 'cheque', 'carte')),
  justificatif_id uuid not null references public.finances_justificatifs (id) on delete restrict,
  saisi_par uuid references public.equipe_profils (id) on delete set null
);
create index if not exists depenses_jour on public.depenses (jour);
alter table public.depenses enable row level security;
revoke all on public.depenses from anon, authenticated;
grant select, insert on public.depenses to service_role;

-- ---------- clôtures mensuelles (chiffres figés) ----------
create table if not exists public.finances_clotures (
  mois date primary key check (extract(day from mois) = 1),
  cree_le timestamptz not null default now(),
  close_par uuid references public.equipe_profils (id) on delete set null,
  encaisse integer not null,
  a_confirmer integer not null,
  depenses integer not null,
  resultat integer not null,
  par_mode jsonb not null check (jsonb_typeof(par_mode) = 'array')
);
alter table public.finances_clotures enable row level security;
revoke all on public.finances_clotures from anon, authenticated;
grant select, insert on public.finances_clotures to service_role;

-- ---------- grille tarifaire ----------
create table if not exists public.grille_tarifaire (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  categorie text not null check (categorie in ('circuit', 'entree', 'conciergerie')),
  libelle text not null check (char_length(libelle) between 1 and 90),
  unite text check (char_length(unite) between 1 and 40),
  prix integer not null check (prix between 0 and 9999999),
  active boolean not null default true,
  ordre smallint not null default 0,
  modifie_par uuid references public.equipe_profils (id) on delete set null
);
create index if not exists grille_tarifaire_categorie on public.grille_tarifaire (categorie, ordre);
alter table public.grille_tarifaire enable row level security;
revoke all on public.grille_tarifaire from anon, authenticated;
grant select, insert, update on public.grille_tarifaire to service_role;

-- ---------- coordonnées de l'agence (Réglages > Paiements), une seule ligne ----------
create table if not exists public.reglages_paiement (
  id boolean primary key default true check (id),
  titulaire text check (char_length(titulaire) <= 120),
  banque text check (char_length(banque) <= 120),
  iban text check (char_length(iban) <= 42),
  bic text check (char_length(bic) <= 11),
  mobile_money jsonb not null default '[]'::jsonb check (jsonb_typeof(mobile_money) = 'array' and jsonb_array_length(mobile_money) <= 4),
  relance_jours smallint check (relance_jours between 1 and 90),
  modifie_le timestamptz not null default now(),
  modifie_par uuid references public.equipe_profils (id) on delete set null
);
insert into public.reglages_paiement (id) values (true) on conflict (id) do nothing;
alter table public.reglages_paiement enable row level security;
revoke all on public.reglages_paiement from anon, authenticated;
grant select, update on public.reglages_paiement to service_role;

-- ---------- fonctions (security definer, service_role seulement) ----------

-- Émet (ou relit) la facture d'un devis envoyé : idempotente. Total recalculé ici depuis les lignes du devis ; un devis
-- brouillon, annulé ou dont le montant ne correspond pas à ses lignes n'est pas facturé (null).
create or replace function public.emettre_facture(p_devis uuid, p_par uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_annee smallint := extract(year from (now() at time zone 'Africa/Porto-Novo'))::smallint;
  v_rang integer;
  v_f public.factures;
  v_d record;
  v_total bigint;
begin
  perform pg_advisory_xact_lock(hashtext('facture:' || p_devis::text));
  select * into v_f from public.factures f where f.devis_id = p_devis;
  if found then
    return jsonb_build_object('id', v_f.id, 'numero', v_f.numero, 'nouvelle', false);
  end if;
  select d.id, d.statut, d.lignes, d.montant, d.demande_id, m.nom, m.email, m.langue, m.pays
    into v_d
    from public.devis d join public.demandes m on m.id = d.demande_id
   where d.id = p_devis;
  if not found or v_d.statut not in ('pret', 'paye') or v_d.montant is null or jsonb_array_length(v_d.lignes) = 0 then
    return null;
  end if;
  select sum((l ->> 'quantite')::bigint * (l ->> 'prix_unitaire')::bigint) into v_total from jsonb_array_elements(v_d.lignes) l;
  if v_total is null or v_total <> v_d.montant or v_total <= 0 then
    return null;
  end if;
  insert into public.finances_compteurs as c (type, annee, dernier) values ('F', v_annee, 1)
    on conflict (type, annee) do update set dernier = c.dernier + 1
    returning c.dernier into v_rang;
  insert into public.factures (annee, rang, devis_id, demande_id, client, lignes, montant, emise_par)
    values (v_annee, v_rang, p_devis, v_d.demande_id,
            jsonb_build_object('nom', v_d.nom, 'email', v_d.email, 'langue', v_d.langue, 'pays', v_d.pays),
            v_d.lignes, v_total::integer, p_par)
    returning * into v_f;
  return jsonb_build_object('id', v_f.id, 'numero', v_f.numero, 'nouvelle', true);
end;
$$;
revoke all on function public.emettre_facture(uuid, uuid) from public, anon, authenticated;
grant execute on function public.emettre_facture(uuid, uuid) to service_role;

-- Recalcule l'état d'une facture : reste dû = total − avoirs ; reçu = paiements manuels confirmés (écritures inverses
-- comprises, euros convertis au taux fixe) + liens de paiement payés. Reçu = reste dû : payée ; rien reçu : émise (ou
-- annulée si les avoirs couvrent tout) ; tout autre écart : à régulariser.
create or replace function public.finances_recalculer(p_facture uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_f public.factures;
  v_avoirs bigint;
  v_recu bigint;
  v_net bigint;
  v_statut text;
begin
  select * into v_f from public.factures where id = p_facture for update;
  if not found then
    return null;
  end if;
  select coalesce(sum(montant), 0) into v_avoirs from public.avoirs where facture_id = p_facture;
  select coalesce(sum(case when devise = 'EUR' then round(montant * 6.55957) else montant end), 0) into v_recu
    from public.paiements_manuels where facture_id = p_facture and etat = 'confirme';
  v_recu := v_recu + coalesce((select sum(montant) from public.liens_paiement where devis_id = v_f.devis_id and paye_le is not null), 0);
  v_net := v_f.montant - v_avoirs;
  v_statut := case
    when v_recu = 0 and v_net = 0 then 'annulee'
    when v_recu = 0 then 'emise'
    when v_recu = v_net then 'payee'
    else 'a_regulariser'
  end;
  update public.factures
     set statut = v_statut,
         payee_le = case when v_statut = 'payee' then coalesce(payee_le, now()) else null end,
         modifie_le = now()
   where id = p_facture and (statut <> v_statut or (v_statut = 'payee') <> (payee_le is not null));
  return jsonb_build_object('statut', v_statut, 'net', v_net, 'recu', v_recu, 'ecart', v_recu - v_net);
end;
$$;
revoke all on function public.finances_recalculer(uuid) from public, anon, authenticated;
grant execute on function public.finances_recalculer(uuid) to service_role;

-- Émet un avoir : jamais au-delà du reste dû, numéroté A- sans trou, puis l'état de la facture est recalculé.
create or replace function public.emettre_avoir(p_facture uuid, p_montant integer, p_motif text, p_par uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_annee smallint := extract(year from (now() at time zone 'Africa/Porto-Novo'))::smallint;
  v_rang integer;
  v_f public.factures;
  v_credit bigint;
  v_a public.avoirs;
begin
  select * into v_f from public.factures where id = p_facture for update;
  if not found then
    return jsonb_build_object('erreur', 'introuvable');
  end if;
  select coalesce(sum(montant), 0) into v_credit from public.avoirs where facture_id = p_facture;
  if v_f.montant - v_credit <= 0 then
    return jsonb_build_object('erreur', 'annulee');
  end if;
  if p_montant is null or p_montant <= 0 or p_montant > v_f.montant - v_credit then
    return jsonb_build_object('erreur', 'montant');
  end if;
  insert into public.finances_compteurs as c (type, annee, dernier) values ('A', v_annee, 1)
    on conflict (type, annee) do update set dernier = c.dernier + 1
    returning c.dernier into v_rang;
  insert into public.avoirs (annee, rang, facture_id, montant, motif, cree_par)
    values (v_annee, v_rang, p_facture, p_montant, p_motif, p_par)
    returning * into v_a;
  return jsonb_build_object('id', v_a.id, 'numero', v_a.numero) || public.finances_recalculer(p_facture);
end;
$$;
revoke all on function public.emettre_avoir(uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.emettre_avoir(uuid, integer, text, uuid) to service_role;

-- Confirme un paiement saisi : un admin qui n'en est pas l'auteur, mois non clos. Sans facture, celle du devis est émise
-- d'abord. Renvoie l'état recalculé de la facture et l'écart avec le reste dû.
create or replace function public.confirmer_paiement_manuel(p_id uuid, p_par uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.paiements_manuels;
  v_fid uuid;
  v_emise jsonb;
  v_etat jsonb;
begin
  if p_par is null then
    return jsonb_build_object('erreur', 'refuse');
  end if;
  select * into v_p from public.paiements_manuels where id = p_id for update;
  if not found then
    return jsonb_build_object('erreur', 'introuvable');
  end if;
  if v_p.etat <> 'a_confirmer' then
    return jsonb_build_object('erreur', 'etat');
  end if;
  if v_p.saisi_par = p_par then
    return jsonb_build_object('erreur', 'soi');
  end if;
  if exists (select 1 from public.finances_clotures where mois = date_trunc('month', v_p.recu_le)::date) then
    return jsonb_build_object('erreur', 'mois_clos');
  end if;
  v_fid := v_p.facture_id;
  if v_fid is null and v_p.devis_id is not null then
    v_emise := public.emettre_facture(v_p.devis_id, p_par);
    if v_emise is null then
      return jsonb_build_object('erreur', 'devis');
    end if;
    v_fid := (v_emise ->> 'id')::uuid;
  end if;
  update public.paiements_manuels
     set etat = 'confirme', confirme_par = p_par, confirme_le = now(), facture_id = v_fid, modifie_le = now()
   where id = p_id;
  if v_fid is null then
    return jsonb_build_object('statut', null, 'ecart', null);
  end if;
  v_etat := public.finances_recalculer(v_fid);
  return v_etat || jsonb_build_object('facture_id', v_fid, 'devis_id', v_p.devis_id);
end;
$$;
revoke all on function public.confirmer_paiement_manuel(uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirmer_paiement_manuel(uuid, uuid) to service_role;

-- Écriture inverse d'un paiement confirmé (erreur de saisie) : même mode, montant opposé, confirmée par l'admin qui la
-- passe ; l'original reste tel quel. Une seule écriture inverse par paiement (inverse_de unique).
create or replace function public.inverser_paiement_manuel(p_id uuid, p_par uuid, p_motif text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.paiements_manuels;
  v_i public.paiements_manuels;
  v_jour date := (now() at time zone 'Africa/Porto-Novo')::date;
begin
  if p_par is null then
    return jsonb_build_object('erreur', 'refuse');
  end if;
  select * into v_p from public.paiements_manuels where id = p_id for update;
  if not found then
    return jsonb_build_object('erreur', 'introuvable');
  end if;
  if v_p.etat <> 'confirme' or v_p.inverse_de is not null or exists (select 1 from public.paiements_manuels where inverse_de = p_id) then
    return jsonb_build_object('erreur', 'etat');
  end if;
  if exists (select 1 from public.finances_clotures where mois = date_trunc('month', v_jour)::date) then
    return jsonb_build_object('erreur', 'mois_clos');
  end if;
  insert into public.paiements_manuels (mode, montant, devise, recu_le, payeur, facture_id, devis_id, reservation_id, commande_id,
                                        saisi_par, confirme_par, confirme_le, etat, motif, inverse_de)
    values (v_p.mode, -v_p.montant, v_p.devise, v_jour, v_p.payeur, v_p.facture_id, v_p.devis_id, v_p.reservation_id, v_p.commande_id,
            p_par, p_par, now(), 'confirme', p_motif, p_id)
    returning * into v_i;
  if v_p.facture_id is null then
    return jsonb_build_object('id', v_i.id);
  end if;
  return jsonb_build_object('id', v_i.id) || public.finances_recalculer(v_p.facture_id);
end;
$$;
revoke all on function public.inverser_paiement_manuel(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.inverser_paiement_manuel(uuid, uuid, text) to service_role;
