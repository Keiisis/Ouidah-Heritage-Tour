import type { Picto as Nom } from "@/content/espace";
import type { TypeMoment } from "@/lib/serveur/equipe/dossiers-regles";

// Pictos au trait de l'espace (tracés de la maquette E), sans pack d'icônes. Décoratifs : le texte voisin dit l'action.
const TRACES: Record<Nom, string> = {
  recherche: "M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14zM20 20l-4-4",
  soleil: "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  lune: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  plateau: "M3 13l3-8h12l3 8v6H3zM3 13h5l1 2h6l1-2h5",
  personnes: "M9 11a4 4 0 1 0 0-8a4 4 0 1 0 0 8zM2 21c0-4 3-6 7-6s7 2 7 6M16 3.5a4 4 0 0 1 0 7.5M18 15c2.5.5 4 2.5 4 6",
  personne: "M12 11a4 4 0 1 0 0-8a4 4 0 1 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6",
  billet: "M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM14 7v2M14 11v2M14 15v2",
  sac: "M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2",
  bulle: "M4 5h16v11H9l-5 4z",
  calendrier: "M4 6h16v15H4zM4 10h16M8 3v5M16 3v5",
  carte: "M9 4L3 6v14l6-2l6 2l6-2V4l-6 2zM9 4v14M15 6v14",
  crayon: "M4 20h4L19 9l-4-4L4 16zM13 7l4 4",
  reglages: "M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4",
  maison: "M4 11l8-7l8 7v9H4zM10 20v-5h4v5",
  plus: "M12 5v14M5 12h14",
  fermer: "M6 6l12 12M18 6L6 18",
  chevron: "M9 6l6 6l-6 6",
  coche: "M5 12l4 4L19 6",
  lien: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  cloche: "M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4",
  voiture: "M3 16v-4l2-5h14l2 5v4zM5 16v2h3v-2M16 16v2h3v-2M7 12h2M15 12h2",
  repere: "M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11zM12 8a2 2 0 1 0 0 4a2 2 0 1 0 0-4z",
  drapeau: "M5 21V4M5 4h12l-2 4l2 4H5",
  sortie: "M14 4h6v16h-6M10 8l-4 4l4 4M6 12h10",
  courrier: "M3 6h18v12H3zM3 6l9 7l9-7",
  caisse: "M4 7h16v12H4zM4 11h16M8 15h3",
  dossier: "M3 6h7l2 2h9v11H3z",
  document: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5",
  livre: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M9 7h6",
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2",
  courbe: "M4 20V4M4 20h16M7 15l4-5l3 3l5-6",
  image: "M4 5h16v14H4zM4 16l5-5l4 4l3-3l4 4M15 9h.01",
  cle: "M8 15a4 4 0 1 0 0-8a4 4 0 1 0 0 8zM11 11h10M17 11v4M20 11v3",
  bouclier: "M12 3l8 3v6c0 5-3.5 8-8 9c-4.5-1-8-4-8-9V6z",
  menu: "M4 7h16M4 12h16M4 17h16",
  pause: "M9 5v14M15 5v14",
};

/** Picto de chaque type de moment d'un dossier (lot L4). */
export const PICTO_MOMENT: Record<TypeMoment, Nom> = { visite: "repere", depart: "voiture", rdv: "personnes", appel: "bulle", retrait: "sac" };

export function Picto({ nom, className = "ic" }: { nom: Nom; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={TRACES[nom]} />
    </svg>
  );
}
