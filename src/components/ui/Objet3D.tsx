import Image from "next/image";

// Icônes 3D OHT (objets mats, palette indigo / latérite / porcelaine), générées pour le site, fond transparent.
// Affichage : une planche WebP par résolution (public/icones-3d/planche-<128|256|512>.webp, npm run icones:sprite) posée en
// fond d'une image transparente ; toute la page ne demande qu'une image par résolution au lieu d'une par objet. On sert au
// moins le double de la taille affichée. Les fichiers <nom>-<taille>.webp restent : des contenus en base peuvent les citer.
export const OBJETS = ["navette", "accueil", "telephone", "hebergement", "tables", "vehicule", "destination", "type-voyage", "calendrier", "horaire", "billet", "temps-fort", "globe", "garder", "soleil", "lune", "a-pied", "fete", "lagune", "photo", "sante", "prise", "passeport"] as const;
export type NomObjet = (typeof OBJETS)[number];

// Planche : objets dans l'ordre d'OBJETS, COLONNES par rangée, séparés d'une marge transparente (fraction d'une case) pour
// qu'un voisin ne déborde pas quand l'objet est réduit. Lus aussi par scripts/icones-planche.mjs : régénérer après changement.
export const COLONNES = 6;
export const GOUTTIERE = 0.25;
const RANGEES = Math.ceil(OBJETS.length / COLONNES);
const LARGEUR = COLONNES + (COLONNES - 1) * GOUTTIERE;
const HAUTEUR = RANGEES + (RANGEES - 1) * GOUTTIERE;
// GIF transparent d'un pixel : l'image ne porte que le fond, sans requête
const VIDE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const fichierPour = (taille: number) => (taille * 2 <= 128 ? 128 : taille * 2 <= 256 ? 256 : 512);

/** Case d'un objet dans la planche d'une résolution, en unités de case (une case = un objet). */
function caseObjet(nom: NomObjet, fichier: 128 | 256 | 512) {
  const i = OBJETS.indexOf(nom);
  return { src: `/icones-3d/planche-${fichier}.webp`, x: (i % COLONNES) * (1 + GOUTTIERE), y: Math.floor(i / COLONNES) * (1 + GOUTTIERE) };
}

export function Objet3D({ nom, taille, eteint = false, className = "" }: { nom: NomObjet; taille: number; eteint?: boolean; className?: string }) {
  const c = caseObjet(nom, fichierPour(taille));
  return (
    <Image
      src={VIDE}
      width={taille}
      height={taille}
      alt=""
      aria-hidden="true"
      unoptimized
      draggable={false}
      className={`oht-objet ${eteint ? "is-eteint" : ""} ${className}`}
      style={{
        backgroundImage: `url(${c.src})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${LARGEUR * 100}% ${HAUTEUR * 100}%`,
        backgroundPosition: `${(c.x / (LARGEUR - 1)) * 100}% ${RANGEES > 1 ? (c.y / (HAUTEUR - 1)) * 100 : 0}%`,
      }}
    />
  );
}

/** Objet 3D dans un dessin SVG (coordonnées du dessin) : sa case de la planche, recadrée par un <svg> imbriqué. */
export function Objet3DSvg({ nom, fichier, x, y, taille }: { nom: NomObjet; fichier: 128 | 256 | 512; x: number; y: number; taille: number }) {
  const c = caseObjet(nom, fichier);
  return (
    <svg x={x} y={y} width={taille} height={taille} viewBox={`${c.x} ${c.y} 1 1`} aria-hidden="true">
      <image href={c.src} width={LARGEUR} height={HAUTEUR} />
    </svg>
  );
}
