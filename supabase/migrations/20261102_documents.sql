-- Documents remis au client après une commande (02/11/2026) : ticket (T-AAAA-NNNNNN), reçu de paiement (R-…), devis (D-…).
-- Numéros séquentiels par type et par année, sans trou : compteur verrouillé ligne par ligne, et verrou consultatif par
-- source pour que deux appels simultanés (retour du client et webhook) obtiennent le même numéro. Accès serveur seulement :
-- RLS active, aucune politique, aucun droit pour anon / authenticated. Migration additive.

create table if not exists public.documents_compteurs (
  type text not null check (type in ('T', 'R', 'D')),
  annee smallint not null check (annee between 2026 and 2100),
  dernier integer not null default 0 check (dernier >= 0),
  primary key (type, annee)
);
alter table public.documents_compteurs enable row level security;
revoke all on public.documents_compteurs from anon, authenticated;
grant select on public.documents_compteurs to service_role;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  type text not null check (type in ('T', 'R', 'D')),
  annee smallint not null,
  rang integer not null check (rang > 0),
  numero text generated always as (type || '-' || annee::text || '-' || lpad(rang::text, 6, '0')) stored,
  source text not null check (source in ('reservation', 'demande', 'commande', 'devis')),
  source_id uuid not null,
  unique (type, annee, rang),
  unique (type, source, source_id)
);
alter table public.documents enable row level security;
revoke all on public.documents from anon, authenticated;
grant select on public.documents to service_role;

-- Émet (ou relit) le document d'une source : idempotent, l'année est celle de Ouidah (UTC+1).
create or replace function public.emettre_document(p_type text, p_source text, p_source_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_annee smallint := extract(year from (now() at time zone 'Africa/Porto-Novo'))::smallint;
  v_rang integer;
  v_doc public.documents;
begin
  perform pg_advisory_xact_lock(hashtext(p_type || ':' || p_source || ':' || p_source_id::text));
  select * into v_doc from public.documents d where d.type = p_type and d.source = p_source and d.source_id = p_source_id;
  if not found then
    insert into public.documents_compteurs as c (type, annee, dernier) values (p_type, v_annee, 1)
      on conflict (type, annee) do update set dernier = c.dernier + 1
      returning c.dernier into v_rang;
    insert into public.documents (type, annee, rang, source, source_id) values (p_type, v_annee, v_rang, p_source, p_source_id)
      returning * into v_doc;
  end if;
  return jsonb_build_object('numero', v_doc.numero, 'cree_le', v_doc.cree_le);
end;
$$;
revoke all on function public.emettre_document(text, text, uuid) from public, anon, authenticated;
grant execute on function public.emettre_document(text, text, uuid) to service_role;

-- Devis rédigé par un agent pour une demande (tableaux de bord). Visible du client seulement une fois « prêt ».
-- lignes : [{ "libelle": text, "quantite": int, "prix_unitaire": int FCFA }] ; montant = somme, recalculée par le serveur.
create table if not exists public.devis (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  demande_id uuid not null references public.demandes (id) on delete restrict,
  statut text not null default 'brouillon' check (statut in ('brouillon', 'pret', 'paye', 'annule')),
  lignes jsonb not null default '[]'::jsonb check (jsonb_typeof(lignes) = 'array' and jsonb_array_length(lignes) <= 40),
  montant integer check (montant is null or montant >= 0),
  devise text not null default 'XOF' check (devise = 'XOF'),
  valable_jusqu_au date,
  note text check (char_length(note) <= 2000),
  publie_le timestamptz,
  check (statut = 'brouillon' or (montant is not null and jsonb_array_length(lignes) > 0 and publie_le is not null))
);
create index if not exists devis_demande on public.devis (demande_id, statut);
alter table public.devis enable row level security;
revoke all on public.devis from anon, authenticated;
grant select, insert, update on public.devis to service_role;

-- Langue du client sur la commande de la boutique (ticket et suivi dans sa langue).
alter table public.boutique_commandes add column if not exists langue text not null default 'FR'
  check (langue in ('FR', 'EN', 'ES', 'DE', 'PT', 'HT', 'GCF'));

-- 02/11/2026 (Kevin : un devis tient sur UNE page) : 20 lignes et 1 000 caractères de note au plus (content/documents.ts,
-- LIMITES_DEVIS). La longueur des libellés (90) et la page unique sont vérifiées par le serveur avant publication.
alter table public.devis drop constraint if exists devis_lignes_check;
alter table public.devis add constraint devis_lignes_max check (jsonb_typeof(lignes) = 'array' and jsonb_array_length(lignes) <= 20);
alter table public.devis drop constraint if exists devis_note_check;
alter table public.devis add constraint devis_note_max check (char_length(note) <= 1000);

-- Une commande supprimée (essais, rectification) emporte ses numéros ; le compteur revient au dernier numéro restant,
-- pour ne pas laisser de trou dans la numérotation. Les commandes réelles ne sont jamais supprimées.
create or replace function public.documents_suivre_suppression()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.documents where source = tg_argv[0] and source_id = old.id;
  update public.documents_compteurs c set dernier = coalesce((select max(rang) from public.documents d where d.type = c.type and d.annee = c.annee), 0);
  return old;
end;
$$;
revoke all on function public.documents_suivre_suppression() from public, anon, authenticated;
drop trigger if exists documents_reservation on public.reservations;
create trigger documents_reservation after delete on public.reservations for each row execute function public.documents_suivre_suppression('reservation');
drop trigger if exists documents_demande on public.demandes;
create trigger documents_demande after delete on public.demandes for each row execute function public.documents_suivre_suppression('demande');
drop trigger if exists documents_commande on public.boutique_commandes;
create trigger documents_commande after delete on public.boutique_commandes for each row execute function public.documents_suivre_suppression('commande');
drop trigger if exists documents_devis on public.devis;
create trigger documents_devis after delete on public.devis for each row execute function public.documents_suivre_suppression('devis');
