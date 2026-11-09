-- Commandes de la boutique en francs CFA (règles devises du 04/11) : total_xof, entier, fait foi ; total_eur n'est plus
-- qu'un dérivé (total_xof / 655,957, arrondi au centime). Devise d'affichage choisie : EUR, FCFA ou USD ; pour l'USD, le
-- taux utilisé (FCFA pour 1 $) et sa date sont figés avec la commande. Migration additive : les commandes passées gardent
-- leur total_eur.
alter table public.boutique_commandes add column if not exists total_xof integer check (total_xof is null or total_xof >= 0);
alter table public.boutique_commandes add column if not exists taux_usd numeric(10, 3) check (taux_usd is null or taux_usd between 100 and 5000);
alter table public.boutique_commandes add column if not exists taux_usd_le timestamptz;
alter table public.boutique_commandes drop constraint if exists boutique_commandes_devise_check;
alter table public.boutique_commandes add constraint boutique_commandes_devise_check check (devise in ('EUR', 'FCFA', 'USD'));
alter table public.boutique_commandes drop constraint if exists boutique_commandes_taux_usd_check2;
alter table public.boutique_commandes add constraint boutique_commandes_taux_usd_check2 check (devise <> 'USD' or (taux_usd is not null and taux_usd_le is not null));
