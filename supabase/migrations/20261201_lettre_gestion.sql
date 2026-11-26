-- Gestion de l'abonnement à la lettre de Ouidah par lien signé (26/11/2026). Depuis le lot 2 de sécurité (24/11), le
-- formulaire public n'écrit rien pour une adresse déjà connue ; il fait partir à la place UN e-mail « Votre abonnement à
-- la lettre de Ouidah » qui porte le lien de gestion. Chaque envoi est noté ici AVANT de partir, et deux déclencheurs le
-- bornent sous verrou (des requêtes simultanées ne passent pas ensemble) :
--   limiter_formulaire  au plus 5 envois par heure et par empreinte de connexion (limiter_formulaires_publics, 20261129) ;
--   une_par_jour        au plus un envoi par abonné en 24 heures glissantes (exception « deja »).
-- L'abonnement lui-même (abonnes_lettre) n'est jamais touché. Seul le dernier envoi d'un abonné est gardé ; ses lignes
-- partent avec lui (cascade, effacement des données). Idempotente.

create table if not exists public.lettre_gestion_envois (
  id bigint generated always as identity primary key,
  cree_le timestamptz not null default now(),
  abonne_id uuid not null references public.abonnes_lettre (id) on delete cascade,
  ip_hash text not null check (char_length(ip_hash) <= 128)
);
create index if not exists lettre_gestion_abonne on public.lettre_gestion_envois (abonne_id, cree_le);
create index if not exists lettre_gestion_ip on public.lettre_gestion_envois (ip_hash, cree_le);
alter table public.lettre_gestion_envois enable row level security;
revoke all on public.lettre_gestion_envois from public, anon, authenticated;
grant select, insert, delete on public.lettre_gestion_envois to service_role;

create or replace function public.lettre_gestion_une_par_jour() returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('lettre-gestion:'||new.abonne_id::text,0));
  new.cree_le := now(); -- l'heure de la base, jamais une date envoyée
  if exists (select 1 from public.lettre_gestion_envois where abonne_id=new.abonne_id and cree_le>now()-interval '24 hours') then
    raise exception 'deja';
  end if;
  delete from public.lettre_gestion_envois where abonne_id=new.abonne_id; -- envoi de plus de 24 h : plus d'usage
  return new;
end; $$;
revoke all on function public.lettre_gestion_une_par_jour() from public, anon, authenticated;

drop trigger if exists limiter_formulaire on public.lettre_gestion_envois;
create trigger limiter_formulaire before insert on public.lettre_gestion_envois for each row execute function public.limiter_formulaires_publics('ip_hash');
drop trigger if exists une_par_jour on public.lettre_gestion_envois;
create trigger une_par_jour before insert on public.lettre_gestion_envois for each row execute function public.lettre_gestion_une_par_jour();
