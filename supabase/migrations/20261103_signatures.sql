-- Signature en ligne d'un devis par le client (03/11/2026, maquette E « signer » validée) : /suivi/<jeton>/signer.
-- Une signature par devis (unique) : tracée (image PNG de 200 Ko au plus) ou tapée (120 signes au plus). L'empreinte
-- SHA-256 du devis émis (numéro, lignes, montant, devise, validité, client, date de publication) est gardée avec la
-- signature : elle prouve ce qui a été signé. Adresse IP en empreinte salée seulement. Accès serveur seulement : RLS
-- active, aucune politique, aucun droit pour anon / authenticated ; le serveur lit et ajoute, jamais ne modifie ni
-- n'efface (la suppression du devis emporte sa signature). Migration additive (CREATE TABLE seulement).

create table if not exists public.devis_signatures (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  devis_id uuid not null unique references public.devis (id) on delete cascade,
  nom text not null check (char_length(btrim(nom)) between 1 and 120),
  mode text not null check (mode in ('trace', 'tape')),
  trace_png bytea check (trace_png is null or octet_length(trace_png) <= 204800),
  texte text check (texte is null or char_length(btrim(texte)) between 1 and 120),
  empreinte text not null check (empreinte ~ '^[0-9a-f]{64}$'),
  ip_hash text,
  langue text not null check (langue in ('FR', 'EN', 'ES', 'DE', 'PT', 'HT', 'GCF')),
  check ((mode = 'trace' and trace_png is not null) or (mode = 'tape' and texte is not null))
);
create index if not exists devis_signatures_ip on public.devis_signatures (ip_hash, cree_le);
alter table public.devis_signatures enable row level security;
revoke all on public.devis_signatures from anon, authenticated, service_role;
grant select, insert on public.devis_signatures to service_role;
