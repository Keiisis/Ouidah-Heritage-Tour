-- Nouveaux types de notifications de l'équipe (03/11/2026) :
--   devis_signe       : le client a signé son devis en ligne (session « documents », /suivi/<jeton>/signer)
--   conversation_agent : un visiteur demande à parler à un agent depuis l'assistant du site
-- La contrainte est remplacée par une liste élargie : aucune ligne n'est touchée et les anciens types restent valides.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('dossier_attribue', 'devis_ouvert', 'paiement_recu', 'message_recu', 'devis_signe', 'conversation_agent'));
