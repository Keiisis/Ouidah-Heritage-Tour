// Fiche circuit (/circuits/<slug>), piste A « Le tracé » retenue par Kevin le 30/10/2026 : tous les libellés de la page.
// Les faits (titre, étapes, tracé, récits, photos) viennent de fr.ts (tours, destinations), histoire.ts et du relevé ;
// la longueur et la marche sont calculées depuis le tracé. Rien d'inventé : une donnée vide n'est pas affichée.
import { DEVIS, toursIntro } from "./fr";

const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const uneDecimale = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const ficheCircuit = {
  metaTitre: (titre: string) => `${titre} — Ouidah Heritage Tour`,
  // circuit d'un seul lieu : le texte du lieu complète la description
  metaDescription: (titre: string, etapes: string, trajet: string | null, longueur: string | null, texte: string | null) =>
    `${titre} : ${[etapes, trajet, longueur].filter(Boolean).join(", ")}.${texte ? ` ${texte}` : ""}`,
  // libellés du site (section des circuits de l'accueil)
  duree: toursIntro.durationPending,
  prix: (prix: number | null, visible: boolean, intro = toursIntro) => (prix != null && visible ? intro.from(prix) : intro.onRequest),
  conditions: (duree: string, prix: string) => `${duree} · ${prix}`,
  reserver: { label: "Réserver ce circuit", href: (slug: string) => `${DEVIS.voyage}?circuit=${slug}` },
  personnaliser: { label: "Le personnaliser", href: (slug: string) => `${DEVIS.voyage}?circuit=${slug}&demande=question` },
  // longueur : tracé à pied quand il existe, sinon les étapes reliées à vol d'oiseau
  longueur: (km: number, aPied: boolean) => `environ ${nombre.format(km)} km${aPied ? "" : " entre les étapes, à vol d’oiseau"}`,
  marche: (minutes: number) => `marche seule : environ ${minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}` : `${minutes} min`}`,
  etapes: (n: number) => `${n} étape${n > 1 ? "s" : ""}`,
  trajet: (depart: string, arrivee: string) => `${depart} → ${arrivee}`,
  resume: (morceaux: string[]) => morceaux.join(" · "),
  depuisJusqua: (depart: string, arrivee: string) => `${depart} → ${arrivee}`,
  theme: (tag: string, lieu: string) => `${tag} · ${lieu}`,
  // repère sous le nom d'une étape
  depart: "départ",
  arrivee: "arrivée",
  aKm: (km: number) => `à ${uneDecimale.format(km)} km du départ`,
  enChemin: (avant: string, apres: string) => `en chemin, entre ${avant} et ${apres}`,
  borne: (morceaux: string[]) => morceaux.join(" · "),
  voirLieu: "Voir la fiche du lieu",
  chapitre: { texte: (titre: string) => `Lire le chapitre « ${titre} »`, href: (id: string) => `/ouidah/histoire#${id}` },
  etapesAria: "Les étapes du circuit",
  carte: {
    aria: "Carte du parcours",
    image: (titre: string, longueur: string | null, noms: string[]) => `Tracé du circuit ${titre}${longueur ? `, ${longueur}` : ""} : ${noms.join(", ")}`,
    nord: "N",
    // échelle : la plus longue de ces distances qui tient dans la place
    paliers: [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20].map((km) => ({ km, texte: km < 1 ? `${km * 1000} m` : `${km} km` })),
  },
};
