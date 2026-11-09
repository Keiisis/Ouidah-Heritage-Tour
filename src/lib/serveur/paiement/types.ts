// Contrat commun des passerelles de paiement. Une passerelle ne décide jamais seule qu'une réservation est payée : elle
// lance le paiement, relit une transaction auprès de son API et authentifie ses webhooks ; `finaliser` tranche.
export const PASSERELLES = ["kkiapay", "fedapay", "stripe", "flutterwave", "paystack"] as const;
export type NomPasserelle = (typeof PASSERELLES)[number];
export type Statut = "attente" | "paye" | "rembourse";

export type Reservation = {
  id: string;
  evenement: string;
  occurrence: string;
  formule_nom: string;
  quantite: number;
  montant: number; // FCFA (XOF), entier
  devise: "XOF";
  passerelle: NomPasserelle;
  transaction_id: string | null;
  statut: Statut;
  nom: string;
  email: string;
  telephone: string | null;
  langue: string;
  paye_le: string | null;
  courriel_envoye: boolean;
  demande_id: string | null;
  reglement_manuel?: boolean;
  mode_manuel?: string | null;
};

// Lancement côté navigateur : widget officiel de la passerelle, ou page de paiement hébergée par elle.
export type Lancement = { mode: "widget"; options: Record<string, unknown> } | { mode: "redirection"; url: string };

// Transaction relue auprès de l'API de la passerelle (jamais d'après le navigateur ni d'après le corps d'un webhook).
export type Constat = {
  transaction: string; // identifiant de la transaction chez la passerelle
  reservation: string | null; // notre identifiant tel que la passerelle l'a gardé (référence ou métadonnées)
  etat: "reussi" | "echoue" | "rembourse" | "en_cours";
  montant: number | null; // en FCFA
  devise: string | null;
};

export type Passerelle = {
  nom: NomPasserelle;
  disponible: () => boolean; // clés présentes dans l'environnement
  // transaction : identifiant créé chez la passerelle dès le lancement (s'il existe), noté sur la réservation
  lancer: (r: Reservation, retour: string) => Promise<{ lancement: Lancement; transaction: string | null } | null>;
  // relit une transaction ; sans identifiant connu, la passerelle peut chercher par notre référence (réservation)
  constater: (transaction: string | null, r?: Reservation) => Promise<Constat | null>;
  // corps brut + en-têtes : null si l'authentification échoue ; « ignorer » pour un événement authentique mais sans objet
  lireWebhook: (brut: string, entetes: Headers) => { transaction: string } | "ignorer" | null;
};
