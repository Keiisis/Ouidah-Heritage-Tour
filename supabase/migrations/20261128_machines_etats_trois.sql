-- Machines à états, vague 3 (parcours publics), 16/11/2026. Migration idempotente : aucune donnée lue ni modifiée.
-- Une seule colonne d'état en base dans ce périmètre ; sa table « de → vers » recopie EXACTEMENT la constante TypeScript
-- (test machines-etats-3) :
--   conversations.mode   TRANSITIONS_MODE_CONVERSATION   src/lib/serveur/assistant/regles.ts
-- Seul écrivain : passerAgent (src/lib/serveur/assistant/conversations.ts), assistant → agent ; aucun retour.
-- Sans déclencheur, par choix : billet /devis, lien de reprise, panneau de l'assistant (état React, tables dans
-- src/lib/machines-ecrans.ts) ; demandes.statut déjà gardé (vague 1) ; consentement (localStorage) et ouverture (script
-- de tête) n'ont pas d'état en base.
drop trigger if exists etats_transitions on public.conversations;
create trigger etats_transitions before update of mode on public.conversations for each row
  execute function public.etats_transitions('mode', '{"assistant":["agent"],"agent":[]}');
