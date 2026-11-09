-- 05/11/2026 : mode économie (consommation Vercel, demande de Kevin). Une seule source de vérité, reglages_site :
--   mode_eco 'auto' (défaut) : allumé quand les vues du mois (audience_jours, heure de Ouidah) dépassent 70 % de
--            plafond_vues_mois ; plafond null = jamais allumé en auto ;
--   'marche' : toujours allumé ; 'arret' : jamais.
-- Allumé : interrogations de l'espace et de l'assistant 3 fois plus espacées, Vercel Analytics coupé, mesure maison gardée.
-- Migration additive : deux colonnes et une fonction de lecture (service_role seulement).
alter table public.reglages_site add column if not exists mode_eco text not null default 'auto' check (mode_eco in ('auto', 'marche', 'arret'));
alter table public.reglages_site add column if not exists plafond_vues_mois integer check (plafond_vues_mois is null or plafond_vues_mois > 0);

-- vues du mois en cours à l'heure de Ouidah, sans rapatrier les lignes
create or replace function public.vues_du_mois()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(vues), 0)::bigint from public.audience_jours
  where jour >= date_trunc('month', now() at time zone 'Africa/Porto-Novo')::date;
$$;
revoke all on function public.vues_du_mois() from public, anon, authenticated;
grant execute on function public.vues_du_mois() to service_role;
