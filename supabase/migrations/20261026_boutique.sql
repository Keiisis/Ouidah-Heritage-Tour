-- Boutique : catalogue (catégories, matières, articles) édité depuis l'admin, commandes envoyées par le site, photos
-- dans le compartiment Storage public « boutique ». Accès serveur seulement : RLS active, aucune politique, aucun droit
-- pour anon / authenticated ; le serveur lit et écrit avec la clé secrète (rôle service_role). Migration additive.

create table if not exists public.boutique_categories (
  slug text primary key check (slug ~ '^[a-z0-9-]{1,60}$'),
  nom text not null check (char_length(nom) between 1 and 80),
  couleur text not null check (couleur in ('laterite', 'ocean', 'sun', 'ochre')),
  photo jsonb check (photo is null or jsonb_typeof(photo) = 'object'), -- { chemin, alt, largeur, hauteur }
  ordre integer not null default 0,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
alter table public.boutique_categories enable row level security;
revoke all on public.boutique_categories from anon, authenticated;
grant select, insert, update on public.boutique_categories to service_role;

create table if not exists public.boutique_matieres (
  slug text primary key check (slug ~ '^[a-z0-9-]{1,60}$'),
  nom text not null check (char_length(nom) between 1 and 80),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
alter table public.boutique_matieres enable row level security;
revoke all on public.boutique_matieres from anon, authenticated;
grant select, insert, update on public.boutique_matieres to service_role;

-- prix_eur, artisan, dimensions, description, entretien : null tant que l'admin ne les a pas saisis (rien d'inventé).
-- piece_unique : « unique » est un mot réservé de SQL. publie : un article n'est visible qu'une fois publié.
create table if not exists public.boutique_produits (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,80}$'),
  nom text not null check (char_length(nom) between 1 and 160),
  categorie text not null references public.boutique_categories (slug) on update cascade,
  matiere text not null references public.boutique_matieres (slug) on update cascade,
  lieu text check (char_length(lieu) <= 120),
  prix_eur numeric(10, 2) check (prix_eur is null or prix_eur >= 0),
  artisan text check (char_length(artisan) <= 160),
  dimensions text check (char_length(dimensions) <= 160),
  description text check (char_length(description) <= 4000),
  entretien text check (char_length(entretien) <= 2000),
  coloris jsonb not null default '[]'::jsonb check (jsonb_typeof(coloris) = 'array'), -- [{ nom, hex }]
  piece_unique boolean not null default false,
  options jsonb check (options is null or jsonb_typeof(options) = 'object'), -- { tailles, surMesure, broderie: { max } }
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array'), -- [{ chemin, alt, largeur, hauteur }]
  ordre integer not null default 0,
  publie boolean not null default false,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
create index if not exists boutique_produits_publie_ordre on public.boutique_produits (publie, ordre);
alter table public.boutique_produits enable row level security;
revoke all on public.boutique_produits from anon, authenticated;
grant select, insert, update on public.boutique_produits to service_role;

-- Commande : instantané des noms et prix lus en base au moment de l'envoi (jamais ceux du navigateur).
-- total_eur : null dès qu'un prix manque. empreinte_ip : SHA-256 salé, jamais l'adresse en clair.
create table if not exists public.boutique_commandes (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^OHT-B-[A-Z0-9]{6}$'),
  statut text not null default 'a_confirmer',
  lignes jsonb not null check (jsonb_typeof(lignes) = 'array' and jsonb_array_length(lignes) between 1 and 30),
  contact jsonb not null check (jsonb_typeof(contact) = 'object'),
  remise jsonb not null check (jsonb_typeof(remise) = 'object'),
  message text check (char_length(message) <= 1000),
  devise text not null check (devise in ('EUR', 'FCFA')),
  total_eur numeric(12, 2) check (total_eur is null or total_eur >= 0),
  empreinte_ip text not null,
  cree_le timestamptz not null default now()
);
create index if not exists boutique_commandes_ip_cree on public.boutique_commandes (empreinte_ip, cree_le);
alter table public.boutique_commandes enable row level security;
revoke all on public.boutique_commandes from anon, authenticated;
grant select, insert, update on public.boutique_commandes to service_role;

-- Photos : compartiment public en lecture (URL /storage/v1/object/public/boutique/...). Aucune politique sur
-- storage.objects pour ce compartiment : seule la clé secrète peut y téléverser. Images seulement, 10 Mo au plus.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('boutique', 'boutique', true, 10485760, array['image/webp', 'image/jpeg', 'image/png', 'image/avif'])
on conflict (id) do nothing;
