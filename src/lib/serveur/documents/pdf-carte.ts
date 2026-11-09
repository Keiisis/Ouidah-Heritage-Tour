import { LineCapStyle, LineJoinStyle, lineTo, moveTo, popGraphicsState, pushGraphicsState, rgb, setCharacterSpacing, setLineCap, setLineJoin, setLineWidth, setStrokingColor, stroke, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { destinations, tours } from "@/content/fr";
import releve from "@/content/lieux-ouidah.json";
import route from "@/content/ouidah-route.json";

// Carte de Ouidah du modèle E « La carte du séjour » (maquettes/e, e-commun.js), en vecteurs pdf-lib : aplats, filets,
// tracés et texte, ni dégradé ni flou. Projection simple lon/lat, nord en haut. Le dépôt n'a aucune géométrie de côte :
// le rivage est une ligne horizontale à la latitude de la Porte du Non-Retour (fr.ts, elle est sur la plage) et l'océan
// est l'aplat sous cette ligne. Coordonnées réelles seulement : étapes = `destinations` de fr.ts (OpenStreetMap), tracé
// à pied = `trace` du circuit ou trajet de la ville (ouidah-route.json, OSM), points de fond et lagune = relevé lieux-ouidah.json. Positions en points depuis le
// coin supérieur gauche de la page (y vers le bas).

export type Point = [number, number]; // [longitude, latitude]
export type Etape = { slug: string; nom: string; lon: number; lat: number };
export type Repere = { etape: Etape; nom: string; sous: string | null };
export type PlanCarte = { etapes: Etape[]; trace: Point[] | null; relie: boolean; reperes: Repere[] };
export type Boite = [number, number, number, number]; // x0, y0, x1, y1

export const OCEAN = rgbHex("#122460");
export const ABYSSE = rgbHex("#0f162d");
export const SOLEIL = rgbHex("#fdbf28");
export const SABLE = rgbHex("#f7f1e8");
export const GRIS = rgbHex("#5a6379");
export const FILET = rgbHex("#dde1ea");
export const POINTILLE = rgbHex("#a9b1c2");
export const BLANC = rgb(1, 1, 1);
export function rgbHex(hex: string): RGB {
  return rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
}

const COS = Math.cos((6.342 * Math.PI) / 180); // longitude → distance vers 6° N
const M_PAR_DEG = 110574; // mètres par degré de latitude vers 6° N
const DEFAUTS = { destinations, tours, releve };
export type ContenuCarte = typeof DEFAUTS;
const etape = (slug: string, destinations = DEFAUTS.destinations): Etape | null => {
  const d = destinations.find((x) => x.slug === slug);
  return d ? { slug, nom: d.name.replace(/'/g, "’"), lat: d.coords[0], lon: d.coords[1] } : null; // apostrophe typographique
};
const PORTE = etape("porte-du-non-retour") as Etape; // rivage
const MUSEE = etape("musee-histoire") as Etape; // centre de Ouidah
type LieuReleve = { slug: string; coords: number[] | null };

// Nom comparé sans casse, accents ni apostrophes typographiques : « Arbre de l’Oubli » = « arbre de l'oubli »
const neutre = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").replace(/[’ʼ`]/g, "'").replace(/\s+/g, " ").toLowerCase();
// étape dans le cadre de la carte (Ouidah et sa plage) : Ganvié ou la route des Pêches, trop loin, n'y figurent pas
const proche = (e: Etape, porte: Etape) => Math.abs(e.lon - porte.lon) < 0.03 && e.lat > porte.lat - 0.005 && e.lat < porte.lat + 0.06;
const ROUTE = route.geometry.coordinates as Point[]; // trajet à pied de la ville, du Musée à la Porte (calculé sur les rues)
const PRES = 0.0006; // ~65 m : une étape est sur un tracé si un de ses points est à moins de cette distance
function indice(trace: Point[], e: Etape): number | null {
  let i0 = -1;
  let d0 = Infinity;
  trace.forEach(([lon, lat], i) => {
    const d = ((lon - e.lon) * COS) ** 2 + (lat - e.lat) ** 2;
    if (d < d0) [i0, d0] = [i, d];
  });
  return d0 <= PRES ** 2 ? i0 : null;
}

/**
 * Plan de la carte d'un voyage : étapes du circuit choisi puis lieux nommés en toutes lettres dans les lignes du devis.
 * Tracé à pied : celui du circuit (fr.ts), sinon le trajet de la ville (ouidah-route.json), s'il passe par toutes les
 * étapes ; il est coupé de la première à la dernière et les étapes sont numérotées dans l'ordre de la marche. Sinon les
 * étapes sont reliées dans l'ordre de la visite. Renvoi de chaque ligne à ses étapes (« 02 à 06 » pour le circuit
 * entier, « 01 » pour un lieu). Aucun lieu : plan vide (carte sans tracé, repères Porte et Musée).
 */
export function planVoyage(circuit: string | null, libelles: string[], contenu: ContenuCarte = DEFAUTS): { plan: PlanCarte; refs: ([number, number] | null)[] } {
  const { destinations, tours } = contenu;
  const porte = etape("porte-du-non-retour", destinations) ?? PORTE;
  const tour = circuit ? tours.find((t) => t.title === circuit) : undefined;
  const choisis = (tour?.stops ?? []).map((slug) => etape(slug, destinations)).filter((e): e is Etape => e !== null && proche(e, porte));
  const textes = libelles.map(neutre);
  for (const d of destinations) {
    const e = etape(d.slug, destinations);
    if (e && proche(e, porte) && !choisis.some((x) => x.slug === d.slug) && textes.some((t) => t.includes(neutre(d.name)))) choisis.push(e);
  }
  let etapes = choisis;
  let trace: Point[] | null = null;
  for (const t of [tour?.trace ?? null, ROUTE]) {
    if (!t || choisis.length < 2) continue;
    const idx = choisis.map((e) => indice(t, e));
    if (idx.some((i) => i === null)) continue;
    const ordre = choisis.map((e, k) => ({ e, i: idx[k] ?? 0 })).sort((a, b) => a.i - b.i);
    trace = t.slice(ordre[0].i, ordre[ordre.length - 1].i + 1);
    etapes = ordre.map((x) => x.e);
    break;
  }
  const rang = (slug: string) => etapes.findIndex((e) => e.slug === slug) + 1;
  const titre = tour ? neutre(tour.title) : null;
  const duCircuit = (tour?.stops ?? []).map(rang).filter((n) => n > 0);
  const refs = textes.map((t): [number, number] | null => {
    if (titre && duCircuit.length && t.includes(titre)) return [Math.min(...duCircuit), Math.max(...duCircuit)];
    const n = etapes.flatMap((e, i) => (t.includes(neutre(e.nom)) ? [i + 1] : []));
    return n.length ? [Math.min(...n), Math.max(...n)] : null;
  });
  return { plan: { etapes, trace, relie: !trace && etapes.length > 1, reperes: [] }, refs };
}
/** Repères sans numéro de la carte « sans lieu » : la Porte sur le rivage et le centre de Ouidah (Musée d'histoire). */
export const reperesOuidah = (centre: string, destinations = DEFAUTS.destinations): Repere[] => {
  const musee = etape("musee-histoire", destinations) ?? MUSEE;
  const porte = etape("porte-du-non-retour", destinations) ?? PORTE;
  return [{ etape: musee, nom: centre, sous: musee.nom }, { etape: porte, nom: porte.nom, sous: null }];
};

// longueur réelle du trajet (haversine)
function longueur(pts: Point[]): number {
  let s = 0;
  const r = Math.PI / 180;
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const h = Math.sin(((b[1] - a[1]) * r) / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(((b[0] - a[0]) * r) / 2) ** 2;
    s += 2 * 6371008 * Math.asin(Math.sqrt(h));
  }
  return s;
}

export type Pinceau = {
  page: PDFPage;
  hauteur: number; // hauteur de la page (repère PDF : y vers le haut)
  ecrire: (t: string, x: number, base: number, police: PDFFont, taille: number, couleur: RGB, ancre?: "g" | "d" | "c") => number;
  largeur: (t: string, police: PDFFont, taille: number) => number;
  serif: PDFFont;
  gras: PDFFont;
};
export type OptionsCarte = {
  contenu?: ContenuCarte;
  largeur: number; // largeur de la page
  rivage: number; // ordonnée du rivage (haut de l'océan)
  mer: number; // hauteur de l'aplat Océan
  zone: { ouest: number; est: number; nord: number }; // cadre des étapes (le rivage le ferme au sud)
  plan: PlanCarte;
  points: boolean; // false : carte seule (billets d'un événement sans coordonnée)
  obstacles: Boite[]; // cartouche, photo : ni nom, ni point de fond, ni repère dessous
  marge: number; // retrait des textes de l'océan
  textes: { ocean: string; lagune: string; mention: string | null; parcours: (km: string) => string };
  intl: string;
};

const croise = (a: Boite, b: Boite) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

/** Dessine la carte (bande d'en-tête) ; renvoie les boîtes occupées par les noms et les pastilles. */
export function dessinerCarte(p: Pinceau, o: OptionsCarte): Boite[] {
  const contenu = o.contenu ?? DEFAUTS;
  const porte = etape("porte-du-non-retour", contenu.destinations) ?? PORTE;
  const musee = etape("musee-histoire", contenu.destinations) ?? MUSEE;
  const lieux = (contenu.releve.lieux as LieuReleve[]).filter((l) => Array.isArray(l.coords) && l.coords.length === 2);
  const lagune = lieux.find((l) => l.slug === "lagune-de-ouidah")?.coords ?? null;
  const { page, hauteur: H } = p;
  const W = o.largeur;
  const yR = o.rivage;
  const { etapes, trace, relie, reperes } = o.plan;
  const pts: Point[] = [...etapes.map((e): Point => [e.lon, e.lat]), ...(trace ?? []), ...reperes.map((r): Point => [r.etape.lon, r.etape.lat])];
  const cadre: Point[] = pts.length ? pts : [[musee.lon, musee.lat], [porte.lon, porte.lat]];
  const latN = Math.max(...cadre.map((c) => c[1]), porte.lat + 0.02); // au moins ~2 km de terre au-dessus du rivage
  const lonE = Math.max(...cadre.map((c) => c[0]));
  const lonO = Math.min(...cadre.map((c) => c[0]));
  const k = Math.min((yR - o.zone.nord) / (latN - porte.lat), lonE > lonO ? (o.zone.est - o.zone.ouest) / ((lonE - lonO) * COS) : Infinity);
  const P = ([lon, lat]: Point): Point => [o.zone.est - (lonE - lon) * COS * k, yR - (lat - porte.lat) * k];
  const occupe: Boite[] = [...o.obstacles];
  const libre = (b: Boite) => !occupe.some((x) => croise(x, b));
  const dedans = (b: Boite) => b[0] >= 4 && b[2] <= W - 4 && b[1] >= 4 && b[3] <= yR - 3;

  // pastilles numérotées (navy, liseré blanc), puis leurs noms : à droite, sinon à gauche, en glissant verticalement
  const r = 9;
  const tNom = 10.5;
  const vrais = o.points ? etapes.map((e) => P([e.lon, e.lat])) : [];
  // deux étapes voisines (Arbre du Retour et Zoungbodji, à 60 m) : la seconde pastille s'écarte, reliée à son point
  const numeros: Point[] = [];
  for (const [x, y] of vrais) {
    const gene = ([a, b]: Point) => numeros.some(([u, v]) => Math.hypot(u - a, v - b) < 2 * r + 3);
    const d = 2 * r + 8;
    // la Porte reste posée sur le rivage : seule une pastille déplacée doit rester dans la terre
    const choix = ([[x, y], [x - d, y], [x + d, y], [x, y - d], [x, y + d], [x - d, y - d], [x + d, y + d]] as Point[]).find((q, i) => !gene(q) && q[0] > r + 4 && q[0] < W - r - 4 && (i === 0 || q[1] < yR - r));
    numeros.push(choix ?? [x, y]);
  }
  for (const [x, y] of numeros) occupe.push([x - r - 2, y - r - 2, x + r + 2, y + r + 2]);
  const noms: { t: string; x: number; y: number }[] = [];
  const poser = (w: number, x: number, y: number, ecart: number, h: number, sous: number) => {
    const essais = [0, -11, 11, -20, 20, -30, 30].flatMap((dy) => [x + ecart, x - ecart - w].map((gx) => ({ gx, base: y + tNom * 0.35 + dy })));
    essais.push({ gx: x - w / 2, base: y - ecart - 2 }, { gx: x - w / 2, base: y + ecart + tNom * 0.8 }); // au-dessus, au-dessous
    const boite = (e: { gx: number; base: number }): Boite => [e.gx - 2, e.base - tNom * 0.78 - 1, e.gx + w + 2, e.base + h - tNom * 0.78 + sous];
    // aucune place libre (carte réduite, étapes serrées) : le nom n'est pas posé, la pastille et le tableau le portent
    const choix = essais.find((e) => dedans(boite(e)) && libre(boite(e))) ?? null;
    if (choix) occupe.push(boite(choix));
    return choix;
  };
  numeros.forEach(([x, y], i) => {
    const c = poser(p.largeur(etapes[i].nom, p.serif, tNom), x, y, r + 5, tNom * 1.05, 0);
    if (c) noms.push({ t: etapes[i].nom, x: c.gx, y: c.base });
  });
  const reps = (o.points ? reperes : []).map((rp) => {
    const [x, y] = P([rp.etape.lon, rp.etape.lat]);
    occupe.push([x - 7, y - 7, x + 7, y + 7]);
    const w = Math.max(p.largeur(rp.nom, p.serif, tNom), rp.sous ? p.largeur(rp.sous, p.gras, 9) : 0);
    return { rp, x, y, c: poser(w, x, y, 11, tNom * 1.05, rp.sous ? 12 : 0) };
  });

  // fond : autres lieux relevés en tout petits points très clairs, repères de latitude au bord droit, lagune
  for (const l of lieux) {
    const [x, y] = P([l.coords?.[1] ?? 0, l.coords?.[0] ?? 0]);
    if (x < 5 || x > W - 5 || y < 5 || y > yR - 6 || !libre([x - 2, y - 2, x + 2, y + 2])) continue;
    page.drawCircle({ x, y: H - y, size: 1.2, color: FILET });
  }
  for (let m = Math.ceil(porte.lat * 60); m <= Math.floor(latN * 60); m++) {
    const y = yR - (m / 60 - porte.lat) * k;
    const b: Boite = [W - 50, y - 9, W, y + 4];
    if (y < 12 || y > yR - 12 || !libre(b)) continue;
    occupe.push(b);
    page.drawLine({ start: { x: W - 6, y: H - y }, end: { x: W, y: H - y }, thickness: 0.75, color: POINTILLE });
    p.ecrire(`${Math.floor(m / 60)}°${String(m % 60).padStart(2, "0")}’ N`, W - 9, y + 3.2, p.gras, 9, GRIS, "d");
  }
  if (lagune) {
    const [x, y] = P([lagune[1], lagune[0]]);
    const w = p.largeur(o.textes.lagune, p.serif, 9.5);
    const b: Boite = [x - w / 2 - 2, y - 7, x + w / 2 + 2, y + 4];
    if (dedans(b) && libre(b)) p.ecrire(o.textes.lagune, x, y + 3, p.serif, 9.5, GRIS, "c");
  }

  // l'océan : aplat pleine largeur sous le rivage, son nom à gauche, la légende à droite
  page.drawRectangle({ x: 0, y: H - yR - o.mer, width: W, height: o.mer, color: OCEAN });
  const yL = yR + o.mer / 2 + 3.4;
  page.pushOperators(pushGraphicsState(), setCharacterSpacing(0.9));
  p.ecrire(o.textes.ocean, o.marge, yL + 0.6, p.serif, 11.25, SABLE);
  page.pushOperators(popGraphicsState());
  const km = trace && o.points ? (longueur(trace) / 1000).toLocaleString(o.intl, { maximumFractionDigits: 1 }) : null;
  let x = W - o.marge;
  const mention = km ? o.textes.parcours(km) : o.textes.mention;
  if (mention) x -= p.ecrire(mention, x, yL, p.gras, 9, SABLE, "d") + 12;
  const mParPt = M_PAR_DEG / k;
  const echelle = [50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000].filter((m) => m / mParPt <= 48).pop() ?? 50;
  const lEch = echelle / mParPt;
  x -= p.ecrire(echelle < 1000 ? `${echelle} m` : `${echelle / 1000} km`, x, yL, p.gras, 9, SABLE, "d") + 4.5;
  page.drawSvgPath(`M${x - lEch} ${yL - 5.5}V${yL - 1.5}H${x}V${yL - 5.5}`, { x: 0, y: H, borderColor: SABLE, borderWidth: 0.9 });
  x -= lEch + 12;
  page.drawSvgPath(`M${x - 3} ${yL - 1.5}L${x} ${yL - 9}L${x + 3} ${yL - 1.5}Z`, { x: 0, y: H, color: SABLE });
  p.ecrire("N", x - 6, yL, p.gras, 9, SABLE, "d");

  // tracé : liseré navy sous le Soleil, bouts et angles arrondis (lisible en noir et blanc)
  const ligne = (chemin: Point[], epaisseur: number, couleur: RGB) => {
    const q = chemin.map(P);
    page.pushOperators(pushGraphicsState(), setLineWidth(epaisseur), setLineCap(LineCapStyle.Round), setLineJoin(LineJoinStyle.Round), setStrokingColor(couleur), moveTo(q[0][0], H - q[0][1]), ...q.slice(1).map(([a, b]) => lineTo(a, H - b)), stroke(), popGraphicsState());
  };
  const chemin = o.points ? (trace ?? (relie ? etapes.map((e): Point => [e.lon, e.lat]) : null)) : null;
  if (chemin && chemin.length > 1) {
    ligne(chemin, 6.75, ABYSSE);
    ligne(chemin, 4.5, SOLEIL);
  }
  // filets des pastilles écartées vers leur vrai point, sous toutes les pastilles
  numeros.forEach(([cx, cy], i) => {
    const [vx, vy] = vrais[i];
    if (vx === cx && vy === cy) return;
    page.drawLine({ start: { x: vx, y: H - vy }, end: { x: cx, y: H - cy }, thickness: 0.9, color: ABYSSE });
    page.drawCircle({ x: vx, y: H - vy, size: 2.2, color: ABYSSE });
  });
  numeros.forEach(([cx, cy], i) => {
    page.drawCircle({ x: cx, y: H - cy, size: r + 1.5, color: BLANC });
    page.drawCircle({ x: cx, y: H - cy, size: r, color: OCEAN });
    p.ecrire(String(i + 1).padStart(2, "0"), cx, cy + 3.2, p.gras, 9, BLANC, "c");
  });
  for (const n of noms) p.ecrire(n.t, n.x, n.y, p.serif, tNom, ABYSSE);
  for (const { rp, x: rx, y: ry, c } of reps) {
    page.drawCircle({ x: rx, y: H - ry, size: 6, color: BLANC });
    page.drawCircle({ x: rx, y: H - ry, size: 4.1, color: OCEAN });
    if (!c) continue;
    p.ecrire(rp.nom, c.gx, c.base, p.serif, tNom, ABYSSE);
    if (rp.sous) p.ecrire(rp.sous, c.gx, c.base + 12, p.gras, 9, GRIS);
  }
  return occupe;
}
