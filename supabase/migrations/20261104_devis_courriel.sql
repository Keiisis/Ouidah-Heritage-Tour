-- 04/11/2026 : e-mail « votre devis est prêt » envoyé une seule fois par publication, quel que soit le nombre d'instances
-- du serveur. `courriel_pret_pour` garde la date de publication (publie_le) pour laquelle l'e-mail est parti : un devis
-- republié (nouvelle publie_le) repart une fois, un second appel pour la même publication ne fait rien. Migration additive.
alter table public.devis add column if not exists courriel_pret_pour timestamptz;
