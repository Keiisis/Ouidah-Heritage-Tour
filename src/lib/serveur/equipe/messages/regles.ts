import type { Transitions } from "../../machines";

// Machines à états des messages de l'équipe (recopiées par 20261120_machines_etats.sql). Aucun secret, aucun accès à la
// base : les écrans (Courrier.tsx, Lettre.tsx) embarquent ce fichier. Écrivains : actions.ts (e-mails) et lettre.ts.

export type StatutCourriel = "brouillon" | "envoye" | "echec";
/** courriels_envoyes.statut : la ligne est posée « brouillon » avant l'envoi, puis notée envoyée ou en échec. Un e-mail
 * repart toujours sur une nouvelle ligne. */
export const TRANSITIONS_COURRIEL: Transitions<StatutCourriel> = { brouillon: ["envoye", "echec"], envoye: [], echec: [] };

export type StatutNumero = "brouillon" | "en_cours" | "envoye";
/** lettre_numeros.statut : brouillon → en_cours au premier lot réel, en_cours → envoye au dernier. */
export const TRANSITIONS_NUMERO: Transitions<StatutNumero> = { brouillon: ["en_cours"], en_cours: ["envoye"], envoye: [] };

export type StatutEnvoiLettre = "envoi" | "envoye" | "echec";
/** lettre_envois.statut : l'abonné est réservé (« envoi ») avant l'e-mail, puis noté envoyé ou en échec. */
export const TRANSITIONS_ENVOI_LETTRE: Transitions<StatutEnvoiLettre> = { envoi: ["envoye", "echec"], envoye: [], echec: [] };
