// Contenus de la page d'accueil, typés comme les futures tables Supabase (le back-office les remplacera).
import type { NomObjet } from "@/components/ui/Objet3D";
// boutique : lien affiché seulement quand la boutique a au moins un article visible (boutiqueOuverte, lu en base)
export type Lien = { label: string; href: string; sous?: Lien[]; boutique?: true; blog?: true };
export type Media = { src: string; alt: string };

export type Lieu = {
  n: string;
  slug: string;
  name: string;
  kicker: string;
  text: string;
  href: string | null; // null tant que le lieu n'a pas de fiche (rien de plus que l'accueil)
  coords: [number, number]; // [latitude, longitude] relevées sur OpenStreetMap (Nominatim)
  image: Media;
  next: string | null; // distance à pied jusqu'au lieu suivant, calculée sur les rues OpenStreetMap
};

// Section 7 : une raison de venir. lieux = slugs du catalogue (ou "r:" + slug du relevé) ajoutés à « Votre chemin » quand on l'entoure ;
// credit = attribution exigée par la licence de la photo, affichée seulement sur /credits.
export type Raison = { slug: string; title: string; short: string; category: string; text: string; image: Media; credit: string | null; href: string | null; lieux: string[] };

// Lieu du catalogue (ajouté depuis l'admin) : un circuit est une liste de lieux, le visiteur peut aussi composer la sienne.
export type Destination = {
  slug: string;
  name: string;
  subtitle: string | null;
  theme: string;
  text: string | null;
  coords: [number, number]; // [latitude, longitude] relevées sur OpenStreetMap (Nominatim)
  image: Media | null; // null tant qu'OHT n'a pas fourni de photo
  href: string | null; // null tant que le lieu n'a pas de fiche
};

// Lieu du relevé (hôtels, restaurants, services, sites…) : valeurs de départ OpenStreetMap + recherche web,
// à valider par OHT puis gérées depuis l'admin. `destination` : fiche « à voir » déjà présente pour ce même lieu.
export type LieuReleve = {
  slug: string;
  nom: string;
  categorie: string;
  sous_type: string | null;
  coords: [number, number]; // [latitude, longitude]
  adresse: string | null;
  telephone: string | null;
  site: string | null;
  horaires: string | null;
  cuisine: string | null;
  description: string | null;
  remarque: string | null;
  verification: "osm" | "web" | "osm+web";
  hors_commune: boolean;
  sources: string[];
  destination: string | null;
};

// Filtre de la carte : regroupe une ou plusieurs catégories du relevé sous un libellé et une couleur.
export type FiltreLieux = { key: string; label: string; ids: string[]; color: string; group: string; on: boolean };

export type Circuit = {
  slug: string;
  title: string;
  place: string;
  tag: string;
  duration: string | null;
  price: number | null;
  priceVisible: boolean;
  image: Media;
  draft: boolean; // brouillon : liste réelle à fournir par OHT
  stops: string[]; // slugs des lieux, dans l'ordre de la visite
  trace: [number, number][] | null; // tracé à pied [longitude, latitude] s'il a été calculé, sinon les étapes sont reliées
};

// Grand rendez-vous de Ouidah (créé dans l'admin). Les dates sont une règle annuelle : la prochaine occurrence est calculée.
// Organisé par OHT : on vend des places (billets) ; organisé par d'autres : on vend le séjour autour de la date.
// « editions » : dates annoncées par l'organisateur, saisies édition par édition dans l'admin (AAAA-MM-JJ), quand elles changent chaque année.
export type QuandEvenement = { type: "annuel"; mois: number; jour: number; jours: number } | { type: "paques"; debut: number; fin: number } | { type: "editions"; dates: [string, string][] }; // paques : décalages en jours autour du dimanche de Pâques
// logement : la formule comprend l'hébergement (le talon ne le propose alors pas en accompagnement)
export type FormuleBillet = { nom: string; detail: string; prix: number | null; logement?: boolean };
export type OffreEvenement =
  | { type: "sejour"; nom: string; inclus: string; nuits: number | null; prix: number | null; places: number | null }
  | { type: "billet"; categories: FormuleBillet[]; places: number | null; jauge: number | null };
export type Evenement = {
  slug: string;
  title: string;
  short: string;
  theme: string;
  place: string;
  text: string;
  image: Media | null;
  quand: QuandEvenement;
  organisateur: { type: "oht" } | { type: "externe"; nom: string };
  offre: OffreEvenement;
};

// Section 9 « Conciergerie » : une question par service. « releve » = « categorie/sous_type » de lieux-ouidah.json, compté côté serveur.
// phrase : la demande telle que /devis la récapitule (« Vous souhaitez la navette aller-retour… »)
export type OptionConciergerie = { label: string; detail: string | null; releve: string | null; passe?: boolean; phrase?: string };
export type QuestionConciergerie = { id: string; court: string; nom: string; question: string; moment: string; lead: string | null; leadReleve: string | null; multi?: boolean; objet: NomObjet; photo: Media; cadre?: string; credit: string | null; options: OptionConciergerie[] };
// Section « Préparer votre voyage » : un thème = un onglet. `vue` : carte du Bénin entier ou resserrée sur la côte ; `source` pour l'admin seulement.
export type ThemePreparer = { id: string; court: string; objet: NomObjet; vue: "benin" | "cote"; fiche?: "heure"; titre: string; cle: { valeur: string; texte: string }; mot?: boolean; points: string[]; source: string };
export type Temoignage = { name: string; country: string; quote: string; photo?: Media };
