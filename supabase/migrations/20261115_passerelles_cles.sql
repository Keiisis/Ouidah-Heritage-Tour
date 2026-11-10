-- 15/11/2026 : clés des passerelles de paiement et jeton e-MECeF saisis par un admin (écrans /admins/passerelles et
-- /admins/emcf) au lieu des seules variables Vercel. Chaque valeur est chiffrée par le serveur (AES-256-GCM, clé dérivée
-- d'EQUIPE_SEL par HKDF-SHA256) avant d'arriver ici : la base ne voit ni la clé de chiffrement ni une valeur en clair.
-- Une ligne absente : le serveur reprend la variable d'environnement du même nom. Aucune politique RLS et aucun droit
-- pour anon / authenticated : seul le serveur (clé secrète, rôle service_role) lit et écrit.
create table if not exists public.passerelles_cles (
  passerelle text not null check (passerelle in ('kkiapay', 'fedapay', 'stripe', 'flutterwave', 'paystack', 'emcf')),
  champ text not null check (champ ~ '^[A-Z][A-Z_]{2,40}$'),
  valeur_chiffree text not null check (char_length(valeur_chiffree) between 1 and 8192),
  iv text not null check (char_length(iv) between 1 and 64),
  tag text not null check (char_length(tag) between 1 and 64),
  modifie_le timestamptz not null default now(),
  modifie_par uuid references public.equipe_profils(id) on delete set null,
  primary key (passerelle, champ)
);
alter table public.passerelles_cles enable row level security;
revoke all on public.passerelles_cles from public, anon, authenticated;
grant select, insert, update, delete on public.passerelles_cles to service_role;
