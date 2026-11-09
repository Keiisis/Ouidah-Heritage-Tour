// Données de la fiche lieu, assemblées côté serveur : fr.ts (destinations, FICHES_LIEU remplis depuis l'admin, circuits),
// histoire.ts (récit et images) et le relevé (lieux-ouidah.json : fiche relevée et voisins). Rien n'est écrit ici ; les seules
// valeurs calculées sont les distances (lib/geo, à vol d'oiseau) et le temps de marche (4,5 km/h).
// Jamais lus : la remarque interne du relevé, ses sources, son niveau de vérification.
import { adresseCircuit, adresseLieu } from "@/content/fr";
import type { ChapitreHistoire, MediaHistoire, PieceHistoire } from "@/content/histoire";
import { ficheLieu as DEFAUT } from "@/content/fiche-lieu";
import { lireContenuPage as lireContenu } from "@/lib/serveur/contenu-page";
import type { LieuReleve, Media } from "@/content/types";
import type { NomObjet } from "@/components/ui/Objet3D";
import { distance, minutesAPied } from "@/lib/geo";

type Point = [number, number]; // [latitude, longitude]

export type Vue = { src: string; alt: string; legende: string };
export type Ligne = { cle: keyof typeof DEFAUT.lignes; objet: NomObjet; texte: string | null; href?: string; externe?: boolean; lien?: { href: string; label: string } };
export type Voisin = { slug: string; nom: string; coords: Point; m: number; temps: string; href: string | null };
export type Groupe = { nom: string; voisins: Voisin[] };
export type CircuitIci = { slug: string; titre: string; tag: string; href: string; image: Media | null; etapes: string[]; rang: number };
export type Scene = { mode: "curseur" | "diptyque"; hier: Vue; auj: Vue; marque: string } | { mode: "carte" } | { mode: "photo"; vue: Vue };
export type Carte = { centre: Point; anneaux: number[]; portee: number; tous: Point[]; trace: Point[]; marques: Voisin[] };

// ── outils de texte ──
const plat = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’‘]/g, "'").toLowerCase();
const fichier = (src: string | null | undefined) => (src ?? "").split("/").pop()?.replace(/\.\w+$/, "") ?? "";
const sansParenthese = (s: string) => s.replace(/\s*\(.*\)\s*$/, "");
const noms = (...n: (string | null | undefined)[]) => [...new Set(n.filter((x): x is string => !!x).flatMap((x) => [x, sansParenthese(x)]).map(plat))];
const VIDES = new Set("de du des la le les et en au aux sur sous un une ouidah histoire".split(" "));
const mots = (t: string) => plat(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !VIDES.has(w)).map((w) => w.replace(/[sx]$/, ""));

// « Vers 1930 » si la légende dit « vers » ; l'année de la prise de vue si elle est donnée ; sinon la première année citée
export function marqueHier(legende: string, T = DEFAUT) {
  const vue = legende.match(/(?:photographi\S* en|photo de)\s+(1[5-9]\d\d|20[0-4]\d)/i);
  if (vue) return vue[1];
  const vers = legende.match(/\bvers\s+(1[5-9]\d\d|20[0-4]\d)\b/i);
  if (vers) return T.vers(vers[1]);
  return legende.match(/\b(1[5-9]\d\d|20[0-4]\d)\b/)?.[1] ?? T.hier;
}

// une pièce de la page Histoire montre un lieu si son image est la photo du lieu, ou si sa légende le nomme
const montre = (p: PieceHistoire, ns: string[], photo: string | null) =>
  [p.hier, p.auj].some((v) => v && ((photo && fichier(v.src) === photo) || ns.some((n) => plat(v.legende).includes(n))));

// ── familles de voisins (catégories du relevé) ──
const FAMILLES: { id: keyof typeof DEFAUT.familles; cats: string[] }[] = [
  { id: "voir", cats: ["a-voir"] },
  { id: "table", cats: ["restauration"] },
  { id: "dormir", cats: ["hebergement"] },
  { id: "culte", cats: ["culte"] },
  { id: "nature", cats: ["nature", "plage"] },
  { id: "marche", cats: ["marche", "artisanat"] },
];
// anneaux 100 m, 500 m, 1 km ; série plus large si moins de 8 voisins tiennent dans le dernier anneau
const SERIES = [[100, 500, 1000], [250, 1000, 2000], [1000, 2500, 5000], [2500, 10000, 20000]];

const telephone = (t: string) => {
  const brut = t.replace(/[^\d+]/g, ""), pre = brut.startsWith("+229") ? "+229 " : "", reste = pre ? brut.slice(4) : brut;
  return { href: `tel:${brut}`, texte: pre + reste.replace(/(\d{2})(?=\d)/g, "$1 ") };
};
// sous-titre de la destination qui dit où est le lieu (« Face à la basilique ») : il va dans « S'y rendre »
const LIEU_DIT = /^(face|en face|pr[èe]s|sur |le long|au |aux |à |d[ée]part|derri|devant|entre|dans)/i;

export async function donneesLieu(slug: string) {
  const [FICHES_LIEU, destinations, tours, releve, histoireChapitres, T] = await Promise.all([
    lireContenu("fr.FICHES_LIEU"), lireContenu("fr.destinations"), lireContenu("fr.tours"),
    lireContenu("lieux-ouidah"), lireContenu("histoire.histoireChapitres"), lireContenu("fiche-lieu.ficheLieu"),
  ]);
  const RELEVE = releve.lieux as LieuReleve[];
  const photoDe = (id: string): Media | null => destinations.find((d) => d.slug === id)?.image ?? FICHES_LIEU[id]?.photo ?? null;
  const fiche = FICHES_LIEU[slug];
  const D = destinations.find((d) => d.slug === slug);
  if (!fiche || !D) return null;
  const R = RELEVE.find((l) => l.destination === slug) ?? null;
  const centre: Point = R?.coords ?? D.coords;
  const photo = photoDe(slug);
  const nom = D.name;

  // pièce de la page Histoire qui montre ce lieu (paire hier / aujourd'hui d'abord, puis sa propre photo)
  const nosNoms = noms(R?.nom, D.name), notrePhoto = photo ? fichier(photo.src) : null;
  let trouve: { c: ChapitreHistoire; p: PieceHistoire; i: number; score: number } | null = null;
  for (const c of histoireChapitres)
    for (const [i, p] of c.pieces.entries()) {
      if (!montre(p, nosNoms, notrePhoto)) continue;
      const score = (p.hier && p.auj ? 2 : 0) + ([p.hier, p.auj].some((v) => v && fichier(v.src) === notrePhoto) ? 1 : 0);
      if (!trouve || score > trouve.score) trouve = { c, p, i, score };
    }
  const L = trouve;

  // récit : seulement les paragraphes qui parlent du lieu. Ordre : choix de l'admin (FICHES_LIEU.recit) ; étape de « La Route » ;
  // paragraphes du chapitre lié qui contiennent un mot du lieu (son nom, les noms propres de sa description) ; un chapitre qui
  // cite son nom complet.
  const nosMots = new Set([...mots(R?.nom ?? ""), ...mots(D.name), ...(R?.description ?? "").split(/[\s,.;:()«»'’]+/).slice(1).filter((w) => /^[A-ZÀ-Ý][a-zà-ÿ-]{3,}$/.test(w)).flatMap(mots)]);
  let chap: ChapitreHistoire | null = null, recit: string[] = [];
  const admin = fiche.recit ? histoireChapitres.find((c) => c.id === fiche.recit?.chapitre) : undefined;
  if (admin && fiche.recit) {
    chap = admin;
    recit = fiche.recit.paragraphes.map((i) => admin.temps.flat()[i]).filter(Boolean);
  } else if (L?.c.etapes) {
    chap = L.c;
    recit = L.c.temps[L.i] ?? [];
  } else if (L) {
    chap = L.c;
    recit = L.c.temps.flat().filter((t) => mots(t).some((w) => nosMots.has(w)));
  } else
    for (const c of histoireChapitres) {
      const ps = c.temps.flat().filter((t) => nosNoms.some((n) => n.length >= 8 && plat(t).includes(n)));
      if (ps.length) {
        chap = c;
        recit = ps;
        break;
      }
    }
  if (!recit.length) chap = null;
  const partiel = chap ? recit.length < chap.temps.flat().length : false;

  // images : la paire de la pièce liée ; les autres pièces du chapitre qui ne montrent aucun autre lieu du site
  const autres = destinations.filter((d) => d.slug !== slug).map((d) => [noms(d.name), fichier(photoDe(d.slug)?.src)] as const);
  const vue = (m: MediaHistoire, alt?: string): Vue => ({ src: m.src, alt: alt ?? m.legende, legende: m.legende });
  const hier = L?.p.hier ? vue(L.p.hier) : null;
  // aujourd'hui : la pièce de la page Histoire ; si c'est la photo du lieu, son fichier du site (plus grand)
  const aujPiece = L?.p.auj ? { ...vue(L.p.auj, photo && fichier(L.p.auj.src) === notrePhoto ? photo.alt : undefined), ...(photo && fichier(L.p.auj.src) === notrePhoto ? { src: photo.src } : {}) } : null;
  const auj = aujPiece ?? (photo ? { src: photo.src, alt: photo.alt, legende: photo.alt } : null);
  const paire = hier && auj && fichier(hier.src) !== fichier(auj.src) ? { hier, auj } : null;
  // gravure d'archive gardée si elle illustre un paragraphe du récit (répartition de la page Histoire : « temps » de la pièce,
  // sinon dans l'ordre) et ne montre aucun autre lieu du site
  const blocs = new Set(chap ? chap.temps.flatMap((b, i) => (b.some((t) => recit.includes(t)) ? [i] : [])) : []);
  const blocDe = (c: ChapitreHistoire, j: number) => c.pieces[j]?.temps ?? Math.min(c.temps.length - 1, Math.floor((j * c.temps.length) / Math.max(1, c.pieces.length)));
  const archives = !L || L.c.etapes || chap?.id !== L.c.id ? [] : L.c.pieces.filter((p, j) => p !== L.p && blocs.has(blocDe(L.c, j)) && !autres.some(([n, ph]) => montre(p, n, ph || null))).flatMap((p) => [p.hier, p.auj]).filter((m): m is MediaHistoire => !!m);
  // voisins : toutes les adresses du relevé, à vol d'oiseau
  const voisins = RELEVE.filter((l) => l !== R && l.coords)
    .map((l) => {
      const m = distance(centre, l.coords), href = l.destination && l.destination !== slug ? adresseLieu(l.destination, FICHES_LIEU) : null;
      const nomSite = l.destination ? destinations.find((x) => x.slug === l.destination)?.name : undefined; // nom de la fiche du site
      return { l, v: { slug: l.slug, nom: nomSite ?? l.nom, coords: l.coords, m, temps: T.marche(minutesAPied(m), m), href } as Voisin };
    })
    .sort((a, b) => a.v.m - b.v.m);
  // blocs « autour » : 3 voisins au plus par famille, à moins de 2 km, 4 familles au plus ; aucun (lieu hors de la ville,
  // comme Ganvié) : pas de section « Autour » ni de carte, les adresses relevées sont trop loin pour servir
  const autour: Groupe[] = FAMILLES.map((f) => ({ nom: T.familles[f.id], voisins: voisins.filter((x) => f.cats.includes(x.l.categorie) && x.v.m <= 2000).slice(0, 3).map((x) => x.v) }))
    .filter((g) => g.voisins.length)
    .slice(0, 4);
  const anneaux = SERIES.find((s) => voisins.filter((x) => x.v.m <= s[2]).length >= 8) ?? SERIES[SERIES.length - 1];
  const carte: Carte = {
    centre,
    anneaux,
    portee: anneaux[2],
    tous: voisins.filter((x) => x.v.m <= anneaux[2] * 1.8).map((x) => x.v.coords),
    trace: (tours.find((t) => t.trace)?.trace ?? []).map(([lon, lat]) => [lat, lon] as Point),
    marques: autour.flatMap((g) => g.voisins),
  };
  // scène : la paire hier / aujourd'hui ; sinon (secours) la carte à anneaux centrée sur le lieu ; sans voisins proches, la photo seule
  const scene: Scene | null = paire
    ? { mode: fiche.memeCadrage ? "curseur" : "diptyque", ...paire, marque: marqueHier(paire.hier.legende, T) }
    : autour.length
      ? { mode: "carte" }
      : photo
        ? { mode: "photo", vue: { src: photo.src, alt: photo.alt, legende: photo.alt } }
        : null;

  // fiche pratique : champs de l'admin et de la fiche relevée ; une ligne vide n'est pas rendue
  const lieuDit = D.subtitle && LIEU_DIT.test(D.subtitle) ? D.subtitle : null;
  const [lat, lon] = centre;
  const tel = R?.telephone ? telephone(R.telephone) : null;
  const lignes: Ligne[] = [
    { cle: "aller", objet: "destination", texte: [lieuDit, R?.adresse].filter(Boolean).join(", ") || null, lien: { href: T.carteOsm(lat, lon), label: T.yAller } },
    { cle: "horaires", objet: "horaire", texte: fiche.horaires?.trim() || null },
    { cle: "tarif", objet: "billet", texte: fiche.tarif?.trim() || null },
    { cle: "usages", objet: "temps-fort", texte: fiche.usages?.trim() || null },
    { cle: "telephone", objet: "telephone", texte: tel?.texte ?? null, href: tel?.href },
    { cle: "site", objet: "globe", texte: R?.site ? R.site.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : null, href: R?.site ?? undefined, externe: true },
  ];

  // circuits qui passent ici ; si leur photo est celle de la page, la photo d'une autre étape la remplace
  const nomDe = (s: string) => destinations.find((d) => d.slug === s)?.name ?? s;
  const dejaVues = new Set([photo, auj].filter((x) => !!x).map((x) => fichier(x?.src)));
  const circuits: CircuitIci[] = tours
    .filter((c) => c.stops.includes(slug))
    .map((c) => {
      let image: Media | null = c.image;
      if (dejaVues.has(fichier(image.src))) image = c.stops.filter((s) => s !== slug).map(photoDe).find((x): x is Media => !!x && !dejaVues.has(fichier(x.src))) ?? null;
      return { slug: c.slug, titre: c.title, tag: c.tag, href: adresseCircuit(c.slug, tours), image, etapes: c.stops.map(nomDe), rang: c.stops.indexOf(slug) };
    });

  return {
    slug,
    nom,
    sousTitre: [R?.sous_type, D.subtitle && !lieuDit ? D.subtitle : null].filter(Boolean).join(" · ") || null,
    description: R?.description ?? D.text,
    photo,
    scene,
    chapitre: chap ? { id: chap.id, titre: chap.titre, repere: partiel ? null : chap.repere, partiel } : null,
    recit,
    archives,
    lignes: lignes.filter((l) => l.texte || l.lien),
    circuits,
    autour,
    carte,
  };
}

export type DonneesLieu = NonNullable<Awaited<ReturnType<typeof donneesLieu>>>;
