// Contrat commun de la page de suivi, du ticket imprimé et des documents PDF (02/11/2026). Le serveur lit la commande
// réelle (réservation payée, demande de devis, commande de la boutique) et la livre sous cette forme ; l'interface et
// les PDF ne reçoivent jamais rien d'autre. Les libellés sont traduits à l'affichage, dans la langue de la commande.

import type { VentilationTva } from "@/lib/serveur/equipe/finances/fiscalite-regles";

export const LANGUES_DOC = ["FR", "EN", "ES", "DE", "PT", "HT", "GCF"] as const;
export type LangueDoc = (typeof LANGUES_DOC)[number];
export const langueDoc = (l: string | null | undefined): LangueDoc => (LANGUES_DOC.includes(l as LangueDoc) ? (l as LangueDoc) : "FR");

/** Cas du ticket (maquette validée) : voyage payé, commande de la boutique, devis en vérification, devis prêt. */
export type CasTicket = "paiement" | "boutique" | "attente" | "pret";
export type StatutSuivi = "paye" | "rembourse" | "attente" | "pret" | "a_confirmer" | "a_preparer" | "prete" | "remise" | "annulee";
export const STATUTS_COMMANDE = ["a_confirmer", "a_preparer", "prete", "remise", "annulee"] as const; // posés par l'équipe (lot terrain)

export type ObjetSuivi =
  // billets d'un événement payés en ligne (talon de l'Agenda ou billet de /devis)
  | { type: "evenement"; titre: string; debut: string; fin: string; formule: string; places: number; prixUnitaire: number }
  // demande de voyage (devis) : circuit choisi ou voyage composé ; dates au format AAAA-MM-JJ
  | { type: "voyage"; intention: "voyage" | "groupe" | "question"; circuit: string | null; arrivee: string | null; depart: string | null; adultes: number; enfants: number }
  // commande de la boutique (prix en euros, ceux de la base au moment de l'envoi)
  // livraison : frais de livraison en FCFA, compris dans le montant (null : commande antérieure au 09/11)
  | { type: "boutique"; articles: { nom: string; quantite: number; prixXof: number | null; options: string[] }[]; remise: "retrait" | "livraison"; livraison?: number | null };

export type LigneDevis = { libelle: string; quantite: number; prixUnitaire: number };

export type DocumentPdf = { type: "recu" | "devis"; numero: string; date: string; url: string };

export type Dossier = {
  jeton: string; // lien secret de suivi (/suivi/<jeton>)
  cas: CasTicket;
  langue: LangueDoc;
  reference: string; // référence de la commande, déjà connue du client (DEM-…, RES-…, OHT-B-…)
  ticket: { numero: string; date: string }; // T-AAAA-NNNNNN, date ISO d'émission
  client: { nom: string; email: string };
  objet: ObjetSuivi;
  statut: StatutSuivi;
  // montant : null quand il est « dans le devis » ; boutique en euros, le reste en FCFA (XOF)
  montant: { valeur: number | null; devise: "XOF" | "EUR" };
  fiscalite?: VentilationTva | null; // ventilation figée, sans commission ni identité d’agent côté client
  paiement: { passerelle: string; le: string; transaction: string | null } | null;
  document: DocumentPdf | null; // reçu (paiement) ou devis (prêt) : ce que le QR du ticket ouvre
  devis: { lignes: LigneDevis[]; montant: number; valableJusquAu: string | null; note: string | null } | null;
  billets: { numero: string; code: string }[]; // billets d'entrée signés (réservation payée)
  lie: string | null; // jeton d'un dossier lié (billets et accompagnement envoyés ensemble)
  // devis signé en ligne par le client (/suivi/<jeton>/signer) ; absent hors devis
  // image : tracé du client (data URL PNG), lue seulement pour le PDF ; texte : signature tapée
  signature?: { nom: string; signe_le: string; empreinte: string; image?: string | null; texte?: string | null } | null;
  // commande de la boutique confirmée, rien de reçu, au moins une passerelle active : bouton « Payer en ligne »
  payerEnLigne?: boolean;
};
