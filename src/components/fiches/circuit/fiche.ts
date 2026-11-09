// Fiche circuit : assemble les faits d'un circuit (étapes, récits, photos) et prépare la carte SVG, côté serveur.
// Étapes : les lieux du circuit dans l'ordre ; le chapitre d'histoire qui les nomme (chapitre « route ») donne récits et
// photos ; une étape racontée qui n'est pas dans la liste (case Zomaï) est gardée « en chemin » si elle touche le tracé.
// Carte : projection locale des vraies coordonnées dans un cadre 600 × 800, noms placés d'avance pour chaque étape lue.
import { adresseLieu } from "@/content/fr";
import { lireContenuPage as lireContenu } from "@/lib/serveur/contenu-page";
import { lireContenu as lireContenuFrancais } from "@/lib/contenu";
import type { Circuit, Destination, Media } from "@/content/types";
import { distance, minutesAPied } from "@/lib/geo";

type LonLat = [number, number];
export type Photo = { src: string; alt: string; largeur: number | null; hauteur: number | null; legende: string | null; annee: string | null };
export type Etape = { type: "arret" | "chemin"; n: number | null; nom: string; borne: string | null; recit: string[]; photo: Photo | null; lienLieu: string | null };
export type Groupe = { x: number; y: number; label: string; chemin: boolean; demi: number; membres: number[] };
export type Etiquette = { j: number; texte: string; x: number; y: number };
export type Carte = {
  w: number;
  h: number;
  fond: string | null; // tracé entier, en pointillé
  segments: string[]; // le même tracé recoupé en morceaux de même longueur, allumés un à un
  lieux: string; // les lieux relevés de Ouidah, en points
  groupes: Groupe[]; // étapes à moins de 30 px (et 125 m) réunies en une pastille « 3·4 »
  groupeDe: number[];
  etiquettes: Etiquette[][]; // noms au repos (0), puis quand l'étape i est lue (i + 1)
  points: [number, number][]; // tracé projeté et sa longueur cumulée (km), pour suivre la pointe du dessin
  cumul: number[];
  km: number[]; // position de chaque étape sur le tracé
  noms: string[];
  pxParKm: number;
  paliers: { km: number; texte: string }[];
  image: string;
};
export type Fiche = {
  circuit: Circuit;
  brouillon: boolean;
  ouverture: Photo | null;
  theme: string;
  chapo: string | null;
  resume: string;
  trajet: string | null;
  conditions: string;
  marche: string | null;
  description: string;
  etapes: Etape[];
  chapitre: { href: string; texte: string } | null;
  carte: Carte;
};

const W = 600, H = 800;
const norme = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[’']/g, " ").replace(/\s+/g, " ").trim();
const memeNom = (a: string, b: string) => { const x = norme(a), y = norme(b); return x === y || x.includes(y) || y.includes(x); };
const km = (a: LonLat, b: LonLat) => distance([a[1], a[0]], [b[1], b[0]]) / 1000;
const lonLat = ([lat, lon]: [number, number]): LonLat => [lon, lat];

// légende de la page Histoire : « (photo de 2019) » devient une année affichée à part
function photoHistoire(m: { src: string; largeur: number; hauteur: number; legende: string } | null): Photo | null {
  if (!m) return null;
  const a = m.legende.match(/\s*\(photo de (\d{4})\)/);
  return { src: m.src, alt: "", largeur: m.largeur, hauteur: m.hauteur, legende: a ? m.legende.replace(a[0], "") : m.legende, annee: a?.[1] ?? null };
}
const photoMedia = (m: Media | null | undefined): Photo | null => (m ? { src: m.src, alt: m.alt, largeur: null, hauteur: null, legende: null, annee: null } : null);

// projection équirectangulaire locale (cosinus de la latitude moyenne), ajustée au cadre avec une marge
function projection(points: LonLat[], marge: number) {
  const k = Math.cos((points.reduce((s, p) => s + p[1], 0) / points.length) * (Math.PI / 180));
  const xs = points.map((p) => p[0] * k), ys = points.map((p) => -p[1]);
  let [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const MIN = 0.009; // étendue minimale d'environ 1 km : un circuit d'un seul lieu n'est pas zoomé à l'infini
  if (x1 - x0 < MIN) [x0, x1] = [(x0 + x1 - MIN) / 2, (x0 + x1 + MIN) / 2];
  if (y1 - y0 < MIN) [y0, y1] = [(y0 + y1 - MIN) / 2, (y0 + y1 + MIN) / 2];
  const s = Math.min((W - 2 * marge) / (x1 - x0), (H - 2 * marge) / (y1 - y0));
  const ox = (W - s * (x1 - x0)) / 2, oy = (H - s * (y1 - y0)) / 2;
  const f = ([lon, lat]: LonLat): [number, number] => [ox + (lon * k - x0) * s, oy + (-lat - y0) * s];
  return { f, pxParKm: (s * 180) / (Math.PI * 6371.0088) };
}

const chevauche = (a: Boite, b: Boite) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
type Boite = { x0: number; x1: number; y0: number; y1: number };
// nom posé à droite puis à gauche de sa pastille, décalé tant qu'il touche une pastille, un autre nom ou une zone réservée
// (nord, échelle) ; puis au-dessus ou au-dessous, ramené dans le cadre ; absent si rien ne convient
function etiqueter(items: { j: number; texte: string; x: number; y: number; demi: number }[], obstacles: Boite[]) {
  const pris = [...obstacles];
  return items.flatMap(({ j, texte, x, y, demi }) => {
    const l = texte.length * 15 * 0.6 + 6, essais: [number, number][] = [];
    for (const dy of [0, 22, -22, 44, -44]) for (const cote of [1, -1]) essais.push([cote > 0 ? x + demi + 8 : x - demi - 8 - l, y + dy]);
    for (const dy of [-30, 30, -52, 52]) essais.push([Math.min(W - 6 - l, Math.max(6, x - l / 2)), y + dy]);
    for (const [x0, cy] of essais) {
      const b = { x0, x1: x0 + l, y0: cy - 11, y1: cy + 11 };
      if (b.x0 >= 6 && b.x1 <= W - 6 && b.y0 >= 4 && b.y1 <= H - 4 && !pris.some((p) => chevauche(p, b))) {
        pris.push(b);
        return [{ j, texte, x: Math.round(x0 - x), y: Math.round(cy - y) }];
      }
    }
    return [];
  });
}

export const slugsCircuits = async () => (await lireContenuFrancais("fr.tours")).map((t) => t.slug);

export async function ficheDe(slug: string): Promise<Fiche | null> {
  const [tours, destinations, FICHES_LIEU, releve, histoireChapitres, T, toursIntro] = await Promise.all([
    lireContenu("fr.tours"), lireContenu("fr.destinations"), lireContenu("fr.FICHES_LIEU"),
    lireContenu("lieux-ouidah"), lireContenu("histoire.histoireChapitres"), lireContenu("fiche-circuit.ficheCircuit"),
    lireContenu("fr.toursIntro"),
  ]);
  const LIEUX = releve.lieux.map((l) => ({ nom: l.nom, coords: l.coords.length === 2 ? ([l.coords[0], l.coords[1]] as [number, number]) : null, description: l.description, destination: l.destination }));
  const C = tours.find((t) => t.slug === slug);
  if (!C) return null;
  const arrets = C.stops.map((s) => destinations.find((d) => d.slug === s)).filter((d): d is Destination => !!d);
  if (!arrets.length) return null;
  const chap = histoireChapitres.find((ch) => ch.etapes?.some((e) => arrets.some((d) => memeNom(e, d.name)))) ?? null;
  // chapô : le premier paragraphe du chapitre, quand d'autres le suivent, passe sous le titre et quitte la première étape
  const chapo = chap && chap.temps[0]?.length > 1 ? chap.temps[0][0] : null;
  const recitDe = (i: number) => (chap ? (i === 0 && chapo ? chap.temps[0].slice(1) : chap.temps[i] ?? []) : []);

  type Brute = { type: "arret" | "chemin"; nom: string; sous: string | null; pt: LonLat; recit: string[]; photos: Photo[]; slug: string | null; km: number; n: number | null };
  const etape = (d: Destination, i: number | null): Brute => {
    const piece = i != null ? chap?.pieces[i] : undefined;
    const recit = i != null ? recitDe(i) : d.text ? [d.text] : [LIEUX.find((l) => l.destination === d.slug)?.description].filter((x): x is string => !!x);
    const photos = [photoHistoire(piece?.auj ?? null), photoHistoire(piece?.hier ?? null), photoMedia(d.image), photoMedia(FICHES_LIEU[d.slug]?.photo)].filter((p): p is Photo => !!p);
    return { type: "arret", nom: d.name, sous: d.subtitle, pt: lonLat(d.coords), recit, photos, slug: d.slug, km: 0, n: null };
  };
  const seq: Brute[] = [], reste = [...arrets];
  if (chap?.etapes) chap.etapes.forEach((nom, i) => {
    const k = reste.findIndex((d) => memeNom(nom, d.name));
    if (k >= 0) {
      const pris = reste.splice(0, k + 1);
      pris.slice(0, -1).forEach((d) => seq.push(etape(d, null)));
      seq.push(etape(pris[k], i));
      return;
    }
    // étape racontée hors de la liste du circuit : gardée « en chemin » entre deux arrêts, à moins de 150 m du tracé
    const l = LIEUX.find((x) => x.coords && memeNom(nom, x.nom));
    if (!C.trace || !l?.coords || !seq.length || !reste.length) return;
    const pt = lonLat(l.coords);
    if (Math.min(...C.trace.map((q) => km(pt, q))) >= 0.15) return;
    const piece = chap.pieces[i];
    const photos = [photoHistoire(piece?.auj ?? null), photoHistoire(piece?.hier ?? null)].filter((p): p is Photo => !!p);
    seq.push({ type: "chemin", nom, sous: null, pt, recit: recitDe(i), photos, slug: null, km: 0, n: null });
  });
  reste.forEach((d) => seq.push(etape(d, null)));
  let rang = 0;
  seq.forEach((e) => { if (e.type === "arret") e.n = ++rang; });

  // ligne : le tracé à pied s'il existe, sinon les étapes reliées dans l'ordre ; longueur cumulée (haversine, lib/geo)
  const ligne: LonLat[] = C.trace ?? seq.map((e) => e.pt);
  const cumul = [0];
  for (let i = 1; i < ligne.length; i++) cumul.push(cumul[i - 1] + km(ligne[i - 1], ligne[i]));
  const L = ligne.length > 1 ? cumul[cumul.length - 1] : 0;
  // position de chaque étape sur la ligne : point le plus proche, sans revenir en arrière
  if (C.trace) {
    let min = 0;
    for (const e of seq) {
      let bi = min, bd = Infinity;
      for (let i = min; i < ligne.length; i++) { const d = km(e.pt, ligne[i]); if (d < bd) [bd, bi] = [d, i]; }
      e.km = cumul[bi];
      min = bi;
    }
  } else seq.forEach((e, i) => { e.km = cumul[i]; });

  const nArrets = seq.filter((e) => e.type === "arret").length;
  const premier = seq[0], dernier = seq[seq.length - 1], plusieurs = seq.length > 1;
  const longueur = L ? T.longueur(L, !!C.trace) : null;
  const marche = C.trace && L ? T.marche(minutesAPied(L * 1000)) : null;
  const etapesTxt = T.etapes(nArrets);
  const duree = C.duration ?? T.duree;

  // photos : l'ouverture prend la vue d'aujourd'hui du départ (jamais l'image du circuit quand le départ en a une) ;
  // chaque étape prend ensuite une photo pas encore montrée (aucune si toutes l'ont été)
  const ouverture = premier.photos[0] ?? photoMedia(C.image);
  const montrees = new Set(ouverture ? [ouverture.src] : []);
  const voisin = (i: number, pas: number) => { for (let k = i + pas; k >= 0 && k < seq.length; k += pas) if (seq[k].type === "arret") return seq[k]; return null; };
  const etapes: Etape[] = seq.map((e, i) => {
    const photo = e.photos.find((p) => !montrees.has(p.src)) ?? null;
    if (photo) montrees.add(photo.src);
    const repere = !plusieurs ? null : e === premier ? T.depart : e === dernier ? T.arrivee : C.trace ? T.aKm(e.km) : null;
    const borne = e.type === "chemin" ? T.enChemin(voisin(i, -1)?.nom ?? premier.nom, voisin(i, 1)?.nom ?? dernier.nom) : T.borne([repere, e.sous].filter((x): x is string => !!x)) || null;
    return { type: e.type, n: e.n, nom: e.nom, borne, recit: e.recit, photo, lienLieu: e.slug ? adresseLieu(e.slug, FICHES_LIEU) : null };
  });

  // ---------- carte ----------
  const { f, pxParKm } = projection([...ligne, ...seq.map((e) => e.pt)], 80);
  const trait = (pts: LonLat[]) => pts.map((p, i) => { const [x, y] = f(p); return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`; }).join("");
  const pointA = (d: number): LonLat => {
    if (ligne.length < 2) return ligne[0];
    let i = 1;
    while (i < ligne.length - 1 && cumul[i] < d) i++;
    const [a, b] = [ligne[i - 1], ligne[i]], s = cumul[i] - cumul[i - 1], t = s ? Math.min(1, Math.max(0, (d - cumul[i - 1]) / s)) : 0;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  const M = L ? 160 : 0;
  const segments = Array.from({ length: M }, (_, k) => {
    const [d0, d1] = [(L * k) / M, (L * (k + 1)) / M];
    return trait([pointA(d0), ...ligne.filter((_, i) => cumul[i] > d0 && cumul[i] < d1), pointA(d1)]);
  });
  // lieux relevés autour du tracé (la caméra du bandeau mobile peut sortir du cadre : marge d'un demi-cadre)
  const lieux = LIEUX.flatMap((l) => (l.coords ? [f(lonLat(l.coords))] : []))
    .filter(([x, y]) => x > -W / 2 && x < W * 1.5 && y > -H / 2 && y < H * 1.5)
    .map(([x, y]) => `M${x.toFixed(1)} ${y.toFixed(1)}h0`).join("");
  // pastilles : étapes à moins de 30 px ou de 125 m réunies (le bandeau mobile montre environ 1,2 km sur sa hauteur)
  const P = seq.map((e) => f(e.pt)), seuil = Math.max(30, 0.125 * pxParKm);
  const brut: { x0: number; y0: number; m: number[] }[] = [];
  P.forEach(([x, y], i) => { const g = brut.find((b) => Math.hypot(b.x0 - x, b.y0 - y) < seuil); if (g) g.m.push(i); else brut.push({ x0: x, y0: y, m: [i] }); });
  const groupes: Groupe[] = brut.map(({ m }) => {
    const nums = m.filter((i) => seq[i].n), label = nums.map((i) => seq[i].n).join("·");
    return { x: Math.round(m.reduce((s, i) => s + P[i][0], 0) / m.length), y: Math.round(m.reduce((s, i) => s + P[i][1], 0) / m.length), label, chemin: !nums.length, demi: nums.length ? Math.max(14, (label.length * 8 + 14) / 2) : 10, membres: m };
  });
  const groupeDe: number[] = [];
  groupes.forEach((g, j) => g.membres.forEach((i) => { groupeDe[i] = j; }));
  const nomsGroupe = groupes.map((g) => (g.chemin ? null : g.membres.filter((i) => seq[i].n).map((i) => seq[i].nom).join(" · ")));
  const reserve: Boite[] = [{ x0: W - 80, x1: W, y0: 0, y1: 80 }, { x0: 0, x1: 210, y0: H - 72, y1: H }, ...groupes.map((g) => ({ x0: g.x - g.demi - 4, x1: g.x + g.demi + 4, y0: g.y - 18, y1: g.y + 18 }))];
  const disposer = (actif: number) => {
    const ga = actif >= 0 ? groupeDe[actif] : -1;
    const ordre = [...(ga >= 0 ? [ga] : []), ...groupes.map((_, j) => j).filter((j) => j !== ga && nomsGroupe[j])];
    return etiqueter(ordre.map((j) => ({ j, texte: j === ga ? seq[actif].nom : nomsGroupe[j]!, x: groupes[j].x, y: groupes[j].y, demi: groupes[j].demi })), reserve);
  };
  const noms = seq.map((e) => e.nom);
  const carte: Carte = {
    w: W,
    h: H,
    fond: ligne.length > 1 ? trait(ligne) : null,
    segments,
    lieux,
    groupes,
    groupeDe,
    etiquettes: [-1, ...seq.map((_, i) => i)].map(disposer),
    points: ligne.map((p) => f(p).map((v) => Math.round(v * 10) / 10) as [number, number]),
    cumul: cumul.map((v) => Math.round(v * 10000) / 10000),
    km: seq.map((e) => e.km),
    noms,
    pxParKm,
    paliers: T.carte.paliers,
    image: T.carte.image(C.title, longueur, noms),
  };

  const trajet = plusieurs ? T.trajet(premier.nom, dernier.nom) : null;
  return {
    circuit: C,
    brouillon: C.draft || C.duration === null,
    ouverture,
    theme: T.theme(C.tag, C.place),
    chapo,
    resume: T.resume([longueur, etapesTxt].filter((x): x is string => !!x)),
    trajet: plusieurs ? T.depuisJusqua(premier.nom, dernier.nom) : null,
    conditions: T.conditions(duree, T.prix(C.price, C.priceVisible, toursIntro)),
    marche,
    description: T.metaDescription(C.title, etapesTxt, trajet, longueur, plusieurs ? null : premier.recit[0] ?? null),
    etapes,
    chapitre: chap ? { href: T.chapitre.href(chap.id), texte: T.chapitre.texte(chap.titre) } : null,
    carte,
  };
}
