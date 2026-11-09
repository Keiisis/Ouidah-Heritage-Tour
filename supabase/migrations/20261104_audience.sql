-- Mesure d'audience maison (04/11/2026, décision de Kevin du 03/11) : pages vues comptées par jour, sans cookie, en
-- complément de Vercel Web Analytics. Seuls les visiteurs qui ont accepté la catégorie « mesure » du bandeau sont comptés
-- (le navigateur n'envoie rien sans cet accord, src/components/mesure/Mesure.tsx).
-- Une ligne par (jour à l'heure de Ouidah, chemin public normalisé, langue de la page, catégorie de provenance) et son
-- compte. Aucun identifiant, aucune adresse IP (même en empreinte), aucune heure précise, aucun user-agent, aucun référent
-- complet : seulement la catégorie de provenance (src/lib/serveur/mesure-regles.ts).
-- Migration additive : CREATE TABLE et une fonction seulement. RLS active, aucune politique ; anon / authenticated n'ont
-- aucun droit. service_role lit seulement ; l'écriture passe par compter_vue(), exécutable par service_role seulement.

create table if not exists public.audience_jours (
  jour date not null default ((now() at time zone 'Africa/Porto-Novo')::date),
  chemin text not null check (chemin = 'autre' or chemin ~ '^/[a-z0-9/-]{0,159}$'),
  langue text not null check (langue in ('FR', 'EN', 'ES', 'DE', 'PT', 'HT', 'GCF')),
  source text not null check (source in ('direct', 'recherche', 'social', 'site', 'autre')),
  vues integer not null default 0 check (vues >= 0),
  primary key (jour, chemin, langue, source)
);
alter table public.audience_jours enable row level security;
revoke all on public.audience_jours from public, anon, authenticated, service_role;
grant select on public.audience_jours to service_role;

-- une vue de plus : le jour est posé par la base (heure de Ouidah), jamais par le navigateur ni par le serveur du site
create or replace function public.compter_vue(p_chemin text, p_langue text, p_source text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audience_jours as a (chemin, langue, source, vues)
  values (p_chemin, p_langue, p_source, 1)
  on conflict (jour, chemin, langue, source) do update set vues = a.vues + 1;
$$;
revoke all on function public.compter_vue(text, text, text) from public, anon, authenticated;
grant execute on function public.compter_vue(text, text, text) to service_role;
