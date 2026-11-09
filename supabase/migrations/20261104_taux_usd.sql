-- 04/11/2026 : dollar (USD) en devise d'AFFICHAGE seulement (demande de Kevin, relayée par la session du site). Rien n'est
-- encaissé ni compté en dollars : comptes, devis et liens de paiement restent en FCFA. Le dollar n'a pas de parité fixe
-- avec le franc CFA : le taux est saisi par un admin (écran Devises) avec sa date ; null = USD masqué sur le site.
-- Migration additive.
alter table public.reglages_site add column if not exists taux_usd numeric(10, 3) check (taux_usd is null or (taux_usd >= 100 and taux_usd <= 5000));
alter table public.reglages_site add column if not exists taux_usd_le timestamptz;
alter table public.reglages_site drop constraint if exists reglages_site_taux_usd_date;
alter table public.reglages_site add constraint reglages_site_taux_usd_date check ((taux_usd is null) = (taux_usd_le is null));
