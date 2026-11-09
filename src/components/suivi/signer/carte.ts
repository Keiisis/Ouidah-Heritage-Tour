import type { DonneesCarte, LonLat } from "./sejour";

// Dessin de la carte du séjour (maquette E, e-commun.js), dans le navigateur, à la taille réelle du cadre : nord en haut,
// projection simple lon/lat → x/y (cosinus de la latitude de Ouidah), le rivage en bas sur la latitude de la Porte du
// Non-Retour, l'océan en aplat dessous. Échelle : la plus grande qui fait tenir les étapes entre le cartouche et le bord
// droit, du nord jusqu'au rivage. Étapes trop proches réunies en une pastille (« 04·05 »). Noms posés là où ils ne
// touchent ni une pastille, ni un autre nom, ni le cartouche (mesures réelles des textes, polices chargées).
const NS = "http://www.w3.org/2000/svg";
const COS = Math.cos((6.342 * Math.PI) / 180);
const M_PAR_DEG = 110574; // mètres par degré de latitude vers 6° N
const ECHELLES = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];

export type TextesCarte = { ocean: string; lagune: string; parcours: string | null; locale: string };
export type OptionsCarte = { W: number; H: number; mer: number; haut: number; xEst: number; xOuest: number; police: number; marge: number; deuxRangs: boolean; reserve: Boite[] };
type Boite = [number, number, number, number];

const el = <K extends keyof SVGElementTagNameMap>(nom: K, attrs: Record<string, string | number>, parent?: Element) => {
  const n = document.createElementNS(NS, nom);
  for (const k in attrs) n.setAttribute(k, String(attrs[k]));
  parent?.appendChild(n);
  return n;
};
const f = (v: number) => v.toFixed(1);
const n2 = (i: number) => String(i).padStart(2, "0");
const touche = (a: Boite, b: Boite) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

export function dessinerCarte(svg: SVGSVGElement, D: DonneesCarte, T: TextesCarte, o: OptionsCarte) {
  const r = 11;
  const pts: LonLat[] = [...D.ligne, ...D.etapes.map((e): LonLat => [e.lon, e.lat]), ...(D.etapes.length ? [] : D.cadre)];
  const latS = Math.min(D.rivage, ...pts.map((p) => p[1]));
  const latN = Math.max(latS + 0.012, ...pts.map((p) => p[1]));
  const lonE = Math.max(...pts.map((p) => p[0])), lonW = Math.min(...pts.map((p) => p[0]));
  const yRivage = o.H - o.mer;
  const kH = (yRivage - o.haut) / (latN - latS);
  const kW = lonE > lonW ? (o.xEst - o.xOuest) / ((lonE - lonW) * COS) : Infinity;
  const k = Math.max(1, Math.min(kH, kW));
  const P = ([lon, lat]: LonLat): [number, number] => [o.xEst - (lonE - lon) * COS * k, yRivage - (lat - latS) * k];
  svg.setAttribute("viewBox", `0 0 ${o.W} ${o.H}`);
  svg.textContent = "";

  const fond = el("g", { fill: "#dde1ea" }, svg);
  el("rect", { x: 0, y: f(yRivage), width: o.W, height: f(o.mer), fill: "#122460" }, svg);
  const yOc = o.deuxRangs ? yRivage + 26 : yRivage + o.mer / 2 + 5;
  el("text", { x: o.marge, y: f(yOc), fill: "#f7f1e8", "font-size": 15, "letter-spacing": ".08em", class: "sg-c-serif" }, svg).textContent = T.ocean;

  if (D.lagune) {
    const [x, y] = P(D.lagune);
    if (x > 30 && x < o.W - 30 && y > 14 && y < yRivage - 8) el("text", { x: f(x), y: f(y + 4), "text-anchor": "middle", fill: "#5a6379", "font-size": 12.5, class: "sg-c-serif sg-c-lieu" }, svg).textContent = T.lagune;
  }

  // tracé : liseré navy de 1,5 px de chaque côté (9 px) sous le Soleil de 6 px, dessiné à l'ouverture
  if (D.ligne.length > 1) {
    const d = D.ligne.map((p, i) => (i ? "L" : "M") + P(p).map(f).join(" ")).join("");
    const trait = { d, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round", pathLength: 1 };
    el("path", { ...trait, stroke: "#0f162d", "stroke-width": 9, class: "sg-trace" }, svg);
    el("path", { ...trait, stroke: "#fdbf28", "stroke-width": 6, class: "sg-trace" }, svg);
  }

  // pastilles : étapes à moins d'une pastille l'une de l'autre réunies (« 04·05 »)
  const groupes: { x: number; y: number; m: number[] }[] = [];
  D.etapes.forEach((e, i) => {
    const [x, y] = P([e.lon, e.lat]);
    const g = groupes.find((q) => Math.hypot(q.x - x, q.y - y) < 2 * r + 4);
    if (g) g.m.push(i);
    else groupes.push({ x, y, m: [i] });
  });
  const pris: Boite[] = [...o.reserve], ronds: Boite[] = [];
  const et = el("g", {}, svg);
  const pastilles = groupes.map((g) => {
    const texte = g.m.map((i) => n2(i + 1)).join("·");
    const demi = g.m.length > 1 ? r + (texte.length - 2) * 3.2 : r;
    const p = el("g", { class: "sg-etape" }, et);
    el("rect", { x: f(g.x - demi - 2), y: f(g.y - r - 2), width: f(2 * demi + 4), height: 2 * r + 4, rx: r + 2, fill: "#fff" }, p);
    el("rect", { x: f(g.x - demi), y: f(g.y - r), width: f(2 * demi), height: 2 * r, rx: r, fill: "#122460" }, p);
    el("text", { x: f(g.x), y: f(g.y + 3.8), "text-anchor": "middle", fill: "#fff", "font-size": 10.5, "font-weight": 700, class: "sg-c-sans" }, p).textContent = texte;
    const soi: Boite = [g.x - demi - 4, g.y - r - 4, g.x + demi + 4, g.y + r + 4];
    ronds.push(soi);
    return { ...g, demi, p, soi };
  });

  pris.push(...ronds);
  // noms : à droite, à gauche, décalés, au-dessus, au-dessous ; sur deux lignes si rien ne tient sur une. À défaut, la
  // première place qui ne couvre aucune pastille (un nom peut alors en toucher un autre). Le nom est posé à distance de sa
  // propre pastille par construction : elle n'est pas un obstacle (sinon un arrondi d'un demi-pixel le rejette).
  // La boîte porte déjà 3 px d'air : elle peut aller jusqu'au bord du cadre.
  const dedans = (b: Boite) => b[0] >= 0 && b[2] <= o.W && b[1] >= 2 && b[3] <= yRivage;
  for (const g of pastilles) {
    const noms = g.m.map((i) => D.etapes[i].nom);
    const formes = noms.length > 1 ? [noms] : [noms, coupe(noms[0])].filter((x): x is string[] => !!x);
    const obstacle = (b: Boite) => pris.some((q) => q !== g.soi && touche(q, b));
    let pose = false;
    let premier: SVGTextElement | null = null;
    for (const lignes of formes) {
      const centre = 5 - ((lignes.length - 1) * 1.15 * o.police) / 2;
      const hauteur = lignes.length * 1.15 * o.police;
      const essais: ["d" | "g" | "m", number][] = [["d", centre], ["g", centre], ["d", centre - 18], ["g", centre - 18], ["d", centre + 20], ["g", centre + 20], ["m", -r - 8 - hauteur + o.police], ["m", r + 6 + o.police]];
      for (const [cote, dy] of essais) {
        const x = cote === "g" ? g.x - g.demi - 8 : cote === "d" ? g.x + g.demi + 8 : g.x;
        const t = texte(g.p, lignes, x, g.y + dy, cote, o.police);
        const b = t.getBBox(), boite: Boite = [b.x - 3, b.y - 2, b.x + b.width + 3, b.y + b.height + 2];
        if (dedans(boite) && !obstacle(boite)) {
          pris.push(boite);
          premier?.remove();
          pose = true;
          break;
        }
        if (!premier && dedans(boite) && !ronds.some((q) => q !== g.soi && touche(q, boite))) premier = t;
        else t.remove();
      }
      if (pose) break;
    }
    if (!pose && premier) {
      const b = premier.getBBox();
      pris.push([b.x, b.y, b.x + b.width, b.y + b.height]);
    }
  }

  // légende dans l'océan : nord, échelle, longueur du parcours à pied (quand il existe)
  const lg = el("g", { fill: "#f7f1e8", "font-size": 10.5, "font-weight": 600, class: "sg-c-sans" }, svg);
  const yL = o.deuxRangs ? yRivage + 50 : yRivage + o.mer / 2 + 4;
  let x = o.W - o.marge;
  if (T.parcours) {
    const t1 = el("text", { x, y: f(yL), "text-anchor": "end" }, lg);
    t1.textContent = T.parcours;
    x -= t1.getComputedTextLength() + 16;
  }
  const mParPx = M_PAR_DEG / k;
  const m = [...ECHELLES].reverse().find((e) => e / mParPx <= 110) ?? ECHELLES[0];
  const t2 = el("text", { x: f(x), y: f(yL), "text-anchor": "end" }, lg);
  t2.textContent = m < 1000 ? `${m} m` : `${new Intl.NumberFormat(T.locale).format(m / 1000)} km`;
  x -= t2.getComputedTextLength() + 6;
  const px = m / mParPx;
  el("path", { d: `M${f(x - px)} ${f(yL - 7)}V${f(yL - 2)}H${f(x)}V${f(yL - 7)}`, fill: "none", stroke: "#f7f1e8", "stroke-width": 1.2 }, lg);
  x -= px + 16;
  el("path", { d: `M${f(x - 4)} ${f(yL - 2)}L${f(x)} ${f(yL - 12)}L${f(x + 4)} ${f(yL - 2)}Z` }, lg);
  el("text", { x: f(x - 8), y: f(yL), "text-anchor": "end" }, lg).textContent = "N";

  // repères de latitude, minutes entières, au bord droit, là où rien n'est posé
  const libre = (b: Boite) => !pris.some((q) => touche(q, b));
  const rep = el("g", { fill: "#5a6379", "font-size": 10.5, "font-weight": 600, class: "sg-c-sans" }, svg);
  for (let mn = Math.ceil(latS * 60); mn <= Math.floor(latN * 60); mn++) {
    const y = yRivage - (mn / 60 - latS) * k;
    if (y < 14 || y > yRivage - 14 || !libre([o.W - 60, y - 12, o.W, y + 4])) continue;
    el("path", { d: `M${o.W - 8} ${f(y)}H${o.W}`, stroke: "#a9b1c2", "stroke-width": 1 }, rep);
    el("text", { x: o.W - 12, y: f(y + 4), "text-anchor": "end" }, rep).textContent = `${Math.floor(mn / 60)}°${String(mn % 60).padStart(2, "0")}′ N`;
  }

  // les autres lieux relevés : tout petits points très clairs, jamais sous un nom ni dans le cartouche
  for (const q of D.fond) {
    const [x0, y0] = P(q);
    if (x0 < 6 || x0 > o.W - 6 || y0 < 6 || y0 > yRivage - 8 || !libre([x0 - 2, y0 - 2, x0 + 2, y0 + 2])) continue;
    el("circle", { cx: f(x0), cy: f(y0), r: 1.6 }, fond);
  }
}

// nom en deux lignes, coupé à l'espace la plus proche du milieu
function coupe(nom: string): string[] | null {
  const esp = [...nom.matchAll(/ /g)].map((x) => x.index ?? 0);
  if (!esp.length) return null;
  const i = esp.reduce((a, b) => (Math.abs(b - nom.length / 2) < Math.abs(a - nom.length / 2) ? b : a));
  return [nom.slice(0, i), nom.slice(i + 1)];
}

function texte(parent: Element, lignes: string[], x: number, y: number, cote: "d" | "g" | "m", police: number) {
  const t = el("text", { x: f(x), y: f(y), "text-anchor": cote === "g" ? "end" : cote === "m" ? "middle" : "start", fill: "#0f162d", "font-size": police, "font-weight": 500, class: "sg-c-serif sg-c-lieu" }, parent);
  lignes.forEach((l, j) => {
    el("tspan", { x: f(x), dy: j ? "1.15em" : "0" }, t).textContent = l;
  });
  return t;
}
