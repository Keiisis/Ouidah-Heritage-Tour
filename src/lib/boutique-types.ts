// Boutique : types partagés entre le serveur (lecture du catalogue, commande) et l'interface (catalogue, fiche, panier).
// Le catalogue vient de la base (admin) : aucun produit, prix, artisan ou photo n'est écrit dans le code.

export type CouleurMarque = "laterite" | "ocean" | "sun" | "ochre";

export type Photo = { url: string; alt: string; largeur: number; hauteur: number };

export type Categorie = { slug: string; nom: string; couleur: CouleurMarque; photo: Photo | null; ordre: number };

export type Matiere = { slug: string; nom: string };

export type Coloris = { nom: string; hex: string };

/** Article à composer avant l'ajout (« Choisir les options ») : tailles, sur mesure, broderie. */
export type OptionsProduit = {
  tailles: string[] | null;
  surMesure: boolean;
  broderie: { max: number } | null;
};

export type Produit = {
  slug: string;
  nom: string;
  categorie: string; // slug de Categorie
  matiere: string; // slug de Matiere
  lieu: string | null; // lieu de Ouidah rattaché (nom affiché)
  prixXof: number | null; // FCFA, entier, saisi par l'admin ; null tant qu'il ne l'a pas saisi : affiché « — »
  artisan: string | null; // null : « à fournir »
  dimensions: string | null;
  description: string | null;
  entretien: string | null;
  coloris: Coloris[];
  personnalisable: boolean; // vrai si options non nulles
  unique: boolean; // pièce unique : quantité 1, pas de sélecteur
  options: OptionsProduit | null;
  photos: Photo[]; // [0] = vue d'ensemble, [1] = détail (2e vue au survol)
  ordre: number;
  stockDisponible?: number | null; // stock physique moins les unités réservées ; null = non suivi (sans limite)
  delaiFabrication?: number | null; // jours, saisi par l'admin ; null : « délai précisé par l'équipe »
};

/** Zone de livraison (grille de l'admin) : la plus précise couvre l'adresse (ville, puis pays, puis reste du monde).
 * fraisXof null ou zone inactive : livraison non payable en ligne. Affichage seulement : le serveur recalcule. */
export type ZoneLivraison = { code: string; pays: string[]; ville: string | null; resteDuMonde: boolean; fraisXof: number | null; delaiJours: number | null; actif: boolean };

export type Catalogue = { produits: Produit[]; categories: Categorie[]; matieres: Matiere[]; livraison?: ZoneLivraison[]; paiementEnLigne?: boolean };

/** Zone qui couvre un pays (et une ville), même règle que boutique_zone_livraison en base. */
export function zoneLivraison(zones: ZoneLivraison[], pays: string, ville: string): ZoneLivraison | null {
  const v = ville.trim().toLowerCase();
  const rang = (z: ZoneLivraison) => (z.resteDuMonde ? 2 : z.ville ? 0 : 1);
  return zones.filter((z) => z.resteDuMonde || (z.pays.includes(pays.toUpperCase()) && (!z.ville || z.ville.trim().toLowerCase() === v))).sort((a, b) => rang(a) - rang(b))[0] ?? null;
}

// ---------- panier (appareil du visiteur) et commande ----------

export type ChoixOptions = { taille?: string; mesures?: string; broderie?: string; coloris?: string };

export type LignePanier = { slug: string; quantite: number; options: ChoixOptions };

export type Devise = "EUR" | "FCFA" | "USD";

export type DemandeCommande = {
  lignes: LignePanier[];
  contact: { prenom: string; nom: string; email: string; telephone: string; pays: string };
  remise: { mode: "retrait" | "livraison"; adresse?: string; ville?: string; pays?: string };
  message?: string;
  devise: Devise;
  site?: string; // piège à robots : doit rester vide
  debut: number; // horodatage d'ouverture du formulaire (ms), contrôle de durée côté serveur
  langue?: string; // langue du site au moment de la commande (ticket et suivi dans cette langue)
};

export type ReponseCommande =
  // payer : page de paiement du lien (paiement immédiat) ; null : paiement immédiat qui n'a pas pu s'ouvrir (à faire
  // depuis le suivi) ; absent : ancien parcours, commande à confirmer par l'équipe
  | { ok: true; reference: string; suivi?: string | null; payer?: string | null }
  | { ok: false; erreur: string; champs?: string[] };
