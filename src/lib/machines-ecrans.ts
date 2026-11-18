import type { Transitions } from "@/lib/serveur/machines";

// Machines à états des écrans publics (vague 3, 16/11) : état React seulement, aucune colonne en base. Chaque écriture
// d'état de ces écrans passe par avancer(table, de, vers) (src/lib/serveur/machines.ts) : une transition absente de la
// table laisse l'état tel quel. Prouvé par tests-oht/machines-etats-3.test.mjs.

/** Billet /devis (Devis.tsx) : envoi de la demande. « dechirure » = réponse 201 reçue, talon qui s'envole ; une fois là,
 * plus de retour vers « echec » (la demande est partie). Avec paiement, « paiement » = demande enregistrée (201), widget ou
 * page de la passerelle ouverts : plus de retour vers « echec » non plus ; widget fermé sans payer (ou passerelle
 * injoignable) = déchirure puis confirmation « enregistrée, paiement en attente » (Kevin, 16/11). */
export type EtatBillet = "saisie" | "envoi" | "echec" | "limite" | "paiement" | "dechirure" | "envoye";
export const TRANSITIONS_BILLET: Transitions<EtatBillet> = {
  saisie: ["envoi"],
  envoi: ["echec", "limite", "paiement", "dechirure"],
  paiement: ["dechirure"],
  echec: ["envoi"],
  limite: ["envoi"],
  dechirure: ["envoye"],
  envoye: [],
};

/** Lien de reprise sur un autre appareil (Reprise, dans Devis.tsx). « idle » sert avant et après la création du lien
 * (le lien affiché les distingue) ; « copie » seulement une fois le lien créé. */
export type EtatLienReprise = "idle" | "creation" | "erreur" | "copie";
export const TRANSITIONS_LIEN_REPRISE: Transitions<EtatLienReprise> = {
  idle: ["creation", "copie"],
  creation: ["idle", "erreur"],
  erreur: ["creation"],
  copie: [],
};

/** Panneau de l'assistant public (AssistantSite.tsx). Passage à l'équipe : un échec ramène à l'écran d'avant
 * (agent → ouvert, conversation ou langues) ; l'équipe hors ligne mène au formulaire de contact, sa réponse ramène au fil.
 * « langues » s'ouvre de partout et rend l'écran d'avant. « Nouvelle question » (Kevin, 16/11) : conversation → ouvert, la
 * conversation avec l'assistant est effacée ; le bouton n'existe pas une fois la conversation passée à l'équipe. */
export type EtatPanneau = "ouvert" | "conversation" | "agent" | "horsligne" | "langues";
export const TRANSITIONS_PANNEAU: Transitions<EtatPanneau> = {
  ouvert: ["conversation", "agent", "langues"],
  conversation: ["ouvert", "agent", "langues"],
  agent: ["ouvert", "conversation", "horsligne", "langues"],
  horsligne: ["agent", "langues"],
  langues: ["ouvert", "conversation", "agent", "horsligne"],
};
