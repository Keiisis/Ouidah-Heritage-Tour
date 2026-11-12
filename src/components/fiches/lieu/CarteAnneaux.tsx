import type { CSSProperties } from "react";
import { getImageProps } from "next/image";
import { lireContenuPage as lireContenu } from "@/lib/serveur/contenu-page";
import { minutesAPied } from "@/lib/geo";
import type { DonneesLieu } from "./donnees";

// Carte à anneaux, dessinée côté serveur en SVG depuis les vraies coordonnées (projection locale en mètres est / nord) :
// le lieu au centre, des anneaux de distance réelle, les voisins des blocs « Autour » en soleil avec leur nom, les autres
// adresses du relevé en points pâles, le tracé de la Route des Esclaves en pointillé. Aucune tuile en ligne.
// Un format par largeur d'écran (la CSS montre le bon) : la taille des noms reste lisible sans calcul dans le navigateur.
const FORMATS = {
  large: { W: 1600, H: 900, rMax: 400, police: 20, max: 8 },
  moyen: { W: 1200, H: 900, rMax: 400, police: 26, max: 6 },
  etroit: { W: 900, H: 1000, rMax: 410, police: 30, max: 4 },
  carre: { W: 1000, H: 1000, rMax: 440, police: 28, max: 8 },
} as const;
export type FormatCarte = keyof typeof FORMATS;

const R = 6371000,
  RAD = Math.PI / 180;
const n1 = (n: number) => Math.round(n * 10) / 10;
const court = (nom: string, n: number) => {
  const s = nom.replace(/\s*\(.*\)\s*$/, ""); // la parenthèse part avant la coupe
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

export async function CarteAnneaux({ d, format, avecPhoto, onde, className }: { d: DonneesLieu; format: FormatCarte; avecPhoto: boolean; onde: boolean; className: string }) {
  const T = await lireContenu("fiche-lieu.ficheLieu");
  const { W, H, rMax, police, max } = FORMATS[format];
  const { centre, anneaux, portee, tous, trace, marques } = d.carte;
  const cx = W / 2,
    cy = H / 2,
    k = rMax / portee,
    cosLat = Math.cos(centre[0] * RAD);
  const xy = ([lat, lon]: [number, number]) => [cx + (lon - centre[1]) * RAD * R * cosLat * k, cy - (lat - centre[0]) * RAD * R * k] as const;
  const dedans = ([x, y]: readonly [number, number]) => x > -8 && x < W + 8 && y > -8 && y < H + 8;
  const photo = avecPhoto ? d.photo : null;
  const rC = photo ? Math.round(police * 3.4) : Math.round(police * 0.7);
  const policeAnneau = Math.round(police * 0.8);
  const visibles = anneaux.filter((m) => m * k > rC + 16); // un anneau caché sous le disque du lieu n'est pas dessiné

  // noms des voisins sans chevauchement : à droite du point, sinon à gauche ; zones prises = disque du lieu, noms des anneaux
  const boites: number[][] = [
    [cx - rC - 8, cy - rC - 8, cx + rC + 8, cy + rC + 8],
    ...visibles.map((m) => [cx - policeAnneau * 7, cy + m * k + 4, cx + policeAnneau * 7, cy + m * k + policeAnneau * 1.6]),
  ];
  const libre = (b: number[]) => b[0] > 4 && b[2] < W - 4 && b[1] > 4 && b[3] < H - 4 && !boites.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
  const points = marques.map((v) => ({ v, p: xy(v.coords) })).filter(({ p }) => dedans(p));
  // nom coupé à 26 signes : le nom entier reste en infobulle (title SVG, lu aussi par les lecteurs d'écran)
  const noms: { x: number; y: number; ancre: "start" | "end"; nom: string; entier: string }[] = [];
  for (const { v, p } of points) {
    if (noms.length >= max) break;
    const nom = court(v.nom, 26),
      w = nom.length * police * 0.56,
      h = police * 0.6,
      ecart = police * 0.6;
    for (const cote of [1, -1]) {
      const x0 = cote > 0 ? p[0] + ecart : p[0] - ecart - w,
        b = [x0, p[1] - h, x0 + w, p[1] + h];
      if (!libre(b)) continue;
      boites.push(b);
      noms.push({ x: cote > 0 ? p[0] + ecart : p[0] - ecart, y: p[1], ancre: cote > 0 ? "start" : "end", nom, entier: v.nom });
      break;
    }
  }
  const id = `fl-${format}-${d.slug}`;
  const image = photo ? getImageProps({ src: photo.src, alt: "", width: 256, height: 256 }).props.src : null;

  return (
    <svg className={`fl-carte ${onde ? "fl-onde" : ""} ${className}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={T.carteAria(d.nom, marques.length)}>
      {tous
        .map(xy)
        .filter(dedans)
        .map(([x, y], i) => (
          <circle key={i} className="fl-tous" cx={n1(x)} cy={n1(y)} r={n1(police * 0.15)} />
        ))}
      {trace.length ? <polyline className="fl-route" points={trace.map((c) => xy(c).map(n1).join(",")).join(" ")} /> : null}
      {visibles.map((m, i) => (
        <g key={m} className="fl-anneau" style={{ "--i": i } as CSSProperties}>
          <circle cx={cx} cy={cy} r={n1(m * k)} />
          <text x={cx} y={n1(cy + m * k + policeAnneau * 1.2)} fontSize={policeAnneau}>
            {[T.metres(m), m <= 5000 ? T.marcheCourt(minutesAPied(m)) : ""].filter(Boolean).join(" · ")}
          </text>
        </g>
      ))}
      <g className="fl-points">
        {points.map(({ v, p }) => (
          <circle key={v.slug} cx={n1(p[0])} cy={n1(p[1])} r={n1(police * 0.35)} />
        ))}
      </g>
      {photo && image ? (
        <g className="fl-centre">
          <clipPath id={`${id}-rond`}>
            <circle cx={cx} cy={cy} r={rC} />
          </clipPath>
          <image href={image} x={cx - rC} y={cy - rC} width={rC * 2} height={rC * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${id}-rond)`} />
          <circle className="fl-centre-bord" cx={cx} cy={cy} r={rC} />
        </g>
      ) : (
        <circle className="fl-centre fl-centre-plein" cx={cx} cy={cy} r={rC} />
      )}
      <g className="fl-noms" fontSize={police}>
        {noms.map((n) => (
          <text key={`${n.x}-${n.y}`} x={n1(n.x)} y={n1(n.y)} textAnchor={n.ancre}>
            {n.nom.endsWith("…") ? <title>{n.entier}</title> : null}
            {n.nom}
          </text>
        ))}
      </g>
      <text className="fl-nord" x={W - police * 2} y={police * 2} fontSize={police * 0.8} textAnchor="middle">
        {T.nord}
      </text>
      <path className="fl-nord" d={`M${W - police * 2} ${police * 2.4} l${-police * 0.35} ${police * 0.8} h${police * 0.7} z`} />
    </svg>
  );
}
