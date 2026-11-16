-- Sous-titre de l'ouverture (Kevin, 16/11/2026) : la phrase saisie dans l'admin avait été coupée à 130 caractères, la limite
-- calculée sur l'ancien texte. Le texte complet devient aussi le défaut du code (src/content/fr.ts). Ne remplace que la
-- version coupée ; le trigger traduction_auto_contenu relance les traductions.
update public.contenu_site
set valeur = jsonb_set(valeur, '{sub}', to_jsonb($t$Marchez sur les pas de l'histoire le long de la Route des Esclaves, de la place Chacha jusqu'à la Porte du Non-Retour, face à l'immensité de l'Atlantique. Une expérience hors du temps pour vibrer au rythme de l'âme du Vodun et de la mémoire.$t$::text))
where cle = 'fr.hero' and valeur ->> 'sub' = $t$Marchez sur les pas de l'histoire le long de la Route des Esclaves, de la Place CHACHA jusqu'à la Porte du Non-Retour, face à l'im$t$;
