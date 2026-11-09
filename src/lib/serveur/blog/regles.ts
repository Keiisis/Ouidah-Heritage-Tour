// Règles pures du blog, partagées par les actions serveur, l'éditeur de l'espace (aperçu en direct, compteurs) et les
// tests (tests-oht/blog-regles.test.mjs) : nettoyage des textes, slug, markdown restreint rendu en arbre de blocs, temps
// de lecture, relecture des champs d'un article, transitions d'état, lecture d'une proposition de traduction. Aucun
// import à l'exécution hors partage.ts (ni « server-only » ni module Node) : le navigateur et Node le lisent tels quels.
// Markdown restreint : titres ## et ###, paragraphes, **gras**, *italique* ou _italique_, listes « - » et « 1. »,
// citations « > », liens [texte](/chemin) ou [texte](https://…), images ![alt](adresse du compartiment site-medias)
// seules sur leur ligne. Rien d'autre : le HTML brut est retiré, un lien ou une image hors de ces règles est refusé à
// l'enregistrement (ecartsCorps) et, s'il arrive quand même au rendu, n'en sort que son texte. L'arbre ne contient que des
// chaînes : le rendu React les échappe ; aucun HTML n'est jamais injecté.

import { LANGUES, type Langue } from "../equipe/partage";

export const LANGUES_BLOG = LANGUES;
export type LangueBlog = Langue;
export const ETATS = ["brouillon", "relecture", "publie", "retire"] as const;
export type EtatBlog = (typeof ETATS)[number];
export const LIMITES_BLOG = { slug: 80, titre: 120, chapo: 300, corps: 40_000, src: 500, alt: 300, categorie: 40, motsCles: 10, motCle: 40, seoTitre: 70, seoDescription: 160 } as const;
/** Mots lus par minute pour le temps de lecture. */
export const MOTS_MINUTE = 200;
export const REL_EXTERNE = "noopener nofollow" as const;

export const estLangueBlog = (v: unknown): v is LangueBlog => typeof v === "string" && (LANGUES_BLOG as readonly string[]).includes(v);
export const estEtat = (v: unknown): v is EtatBlog => typeof v === "string" && (ETATS as readonly string[]).includes(v);

// ---------- nettoyage ----------

// caractères de contrôle (sauf tabulation et saut de ligne) et marques de direction (texte qui s'affiche à l'envers)
const CONTROLES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‎‏‪-‮⁦-⁩]/g;
const UN_CONTROLE = new RegExp(CONTROLES.source); // sans « g » : test() sans état
const BALISE =/<!--[\s\S]*?-->|<\/?[A-Za-z][^<>]*>|<![^<>]*>|<\?[^<>]*>/g;

/** Retire tout HTML brut (balises, commentaires, déclarations), jusqu'à ce qu'il n'en reste aucun (« <scr<script>ipt> »). */
export function sansHtml(t: string): string {
  let avant = "";
  let s = t;
  while (s !== avant) {
    avant = s;
    s = s.replace(BALISE, "");
  }
  return s;
}

/** Texte d'une ligne (titre, chapô, alt, SEO, catégorie) : sans HTML ni contrôle, espaces resserrés ; null si ce n'est pas une chaîne. */
export function texteCourt(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return sansHtml(v.replace(CONTROLES, "")).replace(/\s+/g, " ").trim();
}

/** Corps markdown nettoyé : fins de ligne unifiées, sans HTML ni contrôle, trois lignes vides au plus réduites à une. */
export function nettoyerCorps(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = sansHtml(v.replace(/\r\n?/g, "\n").replace(CONTROLES, ""));
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------- slug ----------

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const slugValide = (v: unknown): v is string => typeof v === "string" && v.length <= LIMITES_BLOG.slug && SLUG.test(v);

/** Slug tiré d'un titre : minuscules sans accents, tirets, 80 caractères au plus (coupé à un tiret si possible). */
export function slugifier(t: string): string {
  let s = t
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (s.length > LIMITES_BLOG.slug) {
    s = s.slice(0, LIMITES_BLOG.slug);
    const tiret = s.lastIndexOf("-");
    if (tiret >= 40) s = s.slice(0, tiret);
    s = s.replace(/-+$/, "");
  }
  return s;
}

// ---------- markdown restreint ----------

export type EnLigne =
  | { t: "texte"; v: string }
  | { t: "gras"; e: EnLigne[] }
  | { t: "italique"; e: EnLigne[] }
  | { t: "lien"; href: string; externe: boolean; rel?: typeof REL_EXTERNE; e: EnLigne[] };
export type Bloc =
  | { t: "h2" | "h3" | "p"; e: EnLigne[] }
  | { t: "ul" | "ol"; items: EnLigne[][] }
  | { t: "citation"; paragraphes: EnLigne[][] }
  | { t: "image"; src: string; alt: string };
export type MotifCorps = "lien" | "image" | "alt";
export type EcartCorps = { ligne: number; motif: MotifCorps };
export type OptionsRendu = { medias?: readonly string[] };

const INTERNE = /^\/(?!\/)[A-Za-z0-9\-._~%!$&'()*+,;=:@/?#]*$/;

/** Lien permis : chemin interne (« /circuits »), ou adresse https sans identifiants. null sinon (javascript:, data:, //…). */
export function lienSur(href: string): { href: string; externe: boolean } | null {
  if (INTERNE.test(href)) return { href, externe: false };
  if (!/^https:\/\//i.test(href) || /[\s\\<>"]/.test(href)) return null;
  try {
    const u = new URL(href);
    if (u.protocol !== "https:" || u.username || u.password || !u.hostname.includes(".")) return null;
    return { href: u.href, externe: true };
  } catch {
    return null;
  }
}

/** Image permise : adresse https d'un des compartiments du site (`medias`), sans « .. ». */
export function imageSure(src: string, medias: readonly string[]): boolean {
  return src.length <= LIMITES_BLOG.src && /^https:\/\/[^\s"'<>\\]+$/.test(src) && !src.includes("..") && medias.some((m) => m.startsWith("https://") && src.startsWith(m) && src.length > m.length);
}
/** Texte alternatif permis : non vide, une ligne, 300 caractères au plus, sans HTML ni contrôle. */
export const altSur = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= LIMITES_BLOG.alt && !UN_CONTROLE.test(v) && !/[\r\n]/.test(v) && sansHtml(v) === v;

const ECHAPPES = /^\\([\\*_[\]()#>!`-])/;
// adresse sans espace, une paire de parenthèses permise : [x](javascript:alert(1)) est lu comme un lien, puis refusé
const LIEN = /^\[([^\]\n]{1,300})\]\(((?:[^()\s]|\([^()\s]*\)){1,500})\)/;
const GRAS = /^\*\*(?=\S)([\s\S]*?\S)\*\*/;
const ITALIQUE_ETOILE = /^\*(?=[^\s*])([^*\n]*?[^\s*])\*/;
const ITALIQUE_TIRET = /^_(?=[^\s_])([^_\n]*?[^\s_])_(?![\p{L}\p{N}])/u;

function pousser(e: EnLigne[], v: string) {
  const d = e.at(-1);
  if (d && d.t === "texte") d.v += v;
  else if (v) e.push({ t: "texte", v });
}

/** Texte d'une ligne en éléments : gras, italique, liens (jamais un lien dans un lien), le reste en texte. */
function enLigne(t: string, ecarts: EcartCorps[] | null, ligne: number, dansLien = false): EnLigne[] {
  const e: EnLigne[] = [];
  let i = 0;
  while (i < t.length) {
    const reste = t.slice(i);
    const avant = i > 0 ? t[i - 1] : "";
    let m: RegExpExecArray | null;
    if ((m = ECHAPPES.exec(reste))) {
      pousser(e, m[1]);
      i += 2;
    } else if (!dansLien && (m = LIEN.exec(reste))) {
      const l = lienSur(m[2]);
      const dedans = enLigne(m[1], ecarts, ligne, true);
      if (l) e.push({ t: "lien", href: l.href, externe: l.externe, ...(l.externe ? { rel: REL_EXTERNE } : {}), e: dedans });
      else {
        ecarts?.push({ ligne, motif: "lien" });
        for (const x of dedans) {
          if (x.t === "texte") pousser(e, x.v);
          else e.push(x);
        }
      }
      i += m[0].length;
    } else if ((m = GRAS.exec(reste))) {
      e.push({ t: "gras", e: enLigne(m[1], ecarts, ligne, dansLien) });
      i += m[0].length;
    } else if ((m = ITALIQUE_ETOILE.exec(reste))) {
      e.push({ t: "italique", e: enLigne(m[1], ecarts, ligne, dansLien) });
      i += m[0].length;
    } else if (!/[\p{L}\p{N}]/u.test(avant) && (m = ITALIQUE_TIRET.exec(reste))) {
      e.push({ t: "italique", e: enLigne(m[1], ecarts, ligne, dansLien) });
      i += m[0].length;
    } else {
      pousser(e, t[i]);
      i++;
    }
  }
  return e;
}

const TITRE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const PUCE = /^[-*+]\s+(.*)$/;
const NUMERO = /^\d{1,3}[.)]\s+(.*)$/;
const CITATION = /^>\s?(.*)$/;
const IMAGE = /^!\[([^\]\n]*)\]\(((?:[^()\s]|\([^()\s]*\)){1,500})\)$/;
const debutBloc = (t: string) => TITRE.test(t) || PUCE.test(t) || NUMERO.test(t) || CITATION.test(t) || IMAGE.test(t);

function analyser(corps: string, o: OptionsRendu, ecarts: EcartCorps[] | null): Bloc[] {
  const medias = o.medias ?? [];
  const lignes = (nettoyerCorps(corps) ?? "").split("\n");
  const blocs: Bloc[] = [];
  let i = 0;
  while (i < lignes.length) {
    const t = lignes[i].trim();
    const n = i + 1;
    let m: RegExpExecArray | null;
    if (!t) {
      i++;
    } else if ((m = TITRE.exec(t))) {
      // le titre de la page est le h1 : « # » et « ## » donnent un h2, « ### » et plus un h3
      blocs.push({ t: m[1].length <= 2 ? "h2" : "h3", e: enLigne(m[2], ecarts, n) });
      i++;
    } else if ((m = IMAGE.exec(t))) {
      const alt = m[1].trim();
      if (!imageSure(m[2], medias)) ecarts?.push({ ligne: n, motif: "image" });
      else if (!altSur(alt)) ecarts?.push({ ligne: n, motif: "alt" });
      else blocs.push({ t: "image", src: m[2], alt });
      i++;
    } else if (CITATION.test(t)) {
      const paragraphes: EnLigne[][] = [];
      let courant: string[] = [];
      const clore = (fin: number) => {
        if (courant.length) paragraphes.push(enLigne(courant.join(" "), ecarts, fin));
        courant = [];
      };
      while (i < lignes.length && (m = CITATION.exec(lignes[i].trim()))) {
        if (m[1].trim()) courant.push(m[1].trim());
        else clore(i + 1);
        i++;
      }
      clore(i);
      if (paragraphes.length) blocs.push({ t: "citation", paragraphes });
    } else if (PUCE.test(t) || NUMERO.test(t)) {
      const motif = PUCE.test(t) ? PUCE : NUMERO;
      const items: EnLigne[][] = [];
      while (i < lignes.length && (m = motif.exec(lignes[i].trim()))) {
        if (m[1].trim()) items.push(enLigne(m[1].trim(), ecarts, i + 1));
        i++;
      }
      blocs.push({ t: motif === PUCE ? "ul" : "ol", items });
    } else {
      const morceaux: string[] = [];
      while (i < lignes.length && lignes[i].trim() && (morceaux.length === 0 || !debutBloc(lignes[i].trim()))) {
        morceaux.push(lignes[i].trim());
        i++;
      }
      blocs.push({ t: "p", e: enLigne(morceaux.join(" "), ecarts, n) });
    }
  }
  return blocs;
}

/** Corps markdown en arbre de blocs sûrs (aucun HTML) : ce que l'aperçu de l'éditeur et la page publique affichent. */
export const rendreMarkdown = (corps: string, o: OptionsRendu = {}): Bloc[] => analyser(corps, o, null);

/** Liens et images refusés du corps, avec leur ligne (1 = première ligne du corps nettoyé). */
export function ecartsCorps(corps: string, o: OptionsRendu = {}): EcartCorps[] {
  const ecarts: EcartCorps[] = [];
  analyser(corps, o, ecarts);
  return ecarts;
}

const texteDe = (e: EnLigne[]): string => e.map((x) => (x.t === "texte" ? x.v : texteDe(x.e))).join("");
/** Texte brut d'un arbre (sans les alt des images). */
export function texteBrut(blocs: Bloc[]): string {
  return blocs
    .map((b) => ("e" in b ? texteDe(b.e) : "items" in b ? b.items.map(texteDe).join("\n") : "paragraphes" in b ? b.paragraphes.map(texteDe).join("\n") : ""))
    .join("\n");
}

/** Nombre de mots d'un texte (lettres et chiffres, mots composés comptés une fois). */
export const compterMots = (t: string) => (t.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).length;

/** Temps de lecture en minutes (au moins 1, 600 au plus), d'après le texte rendu du corps. */
export function tempsLecture(corps: string): number {
  return Math.min(600, Math.max(1, Math.ceil(compterMots(texteBrut(rendreMarkdown(corps))) / MOTS_MINUTE)));
}

// ---------- champs d'un article ----------

export type Couverture = { src: string; alt: string };
export type ChampsArticle = { titre: string; slug: string; chapo: string; corps: string; couverture: Couverture | null; categorie: string | null; motsCles: string[]; seoTitre: string | null; seoDescription: string | null };
export type ChampBlog = "titre" | "slug" | "chapo" | "corps" | "couverture" | "alt" | "categorie" | "motsCles" | "seoTitre" | "seoDescription";

/** Champs envoyés relus et nettoyés (mêmes limites que la base, migration 20261105_blog.sql), ou les champs refusés et
 * les écarts du corps. `medias` : préfixes des adresses d'images permises (compartiment site-medias). */
export function lireChamps(brut: unknown, o: OptionsRendu = {}): { ok: true; v: ChampsArticle } | { ok: false; champs: ChampBlog[]; ecarts: EcartCorps[] } {
  const x = (brut && typeof brut === "object" && !Array.isArray(brut) ? brut : {}) as Record<string, unknown>;
  const medias = o.medias ?? [];
  const champs: ChampBlog[] = [];
  const titre = texteCourt(x.titre) ?? "";
  if (!titre || titre.length > LIMITES_BLOG.titre) champs.push("titre");
  const slug = typeof x.slug === "string" ? x.slug.trim() : "";
  if (!slugValide(slug)) champs.push("slug");
  const chapo = texteCourt(x.chapo ?? "");
  if (chapo === null || chapo.length > LIMITES_BLOG.chapo) champs.push("chapo");
  const corps = nettoyerCorps(x.corps ?? "");
  const ecarts = corps === null ? [] : ecartsCorps(corps, { medias });
  if (corps === null || corps.length > LIMITES_BLOG.corps || ecarts.length) champs.push("corps");
  let couverture: Couverture | null = null;
  if (x.couverture !== null && x.couverture !== undefined) {
    const c = (typeof x.couverture === "object" && !Array.isArray(x.couverture) ? x.couverture : {}) as Record<string, unknown>;
    const src = typeof c.src === "string" ? c.src.trim() : "";
    const alt = texteCourt(c.alt) ?? "";
    if (!imageSure(src, medias)) champs.push("couverture");
    else if (!alt || alt.length > LIMITES_BLOG.alt) champs.push("alt");
    else couverture = { src, alt };
  }
  const categorie = texteCourt(x.categorie ?? "");
  if (categorie === null || categorie.length > LIMITES_BLOG.categorie) champs.push("categorie");
  const vus = new Set<string>();
  const motsCles: string[] = [];
  if (x.motsCles !== undefined && !Array.isArray(x.motsCles)) champs.push("motsCles");
  for (const m of Array.isArray(x.motsCles) ? x.motsCles : []) {
    const t = texteCourt(m);
    if (t === null || t.length > LIMITES_BLOG.motCle) {
      if (!champs.includes("motsCles")) champs.push("motsCles");
      continue;
    }
    if (t && !vus.has(t.toLocaleLowerCase("fr"))) {
      vus.add(t.toLocaleLowerCase("fr"));
      motsCles.push(t);
    }
  }
  if (motsCles.length > LIMITES_BLOG.motsCles && !champs.includes("motsCles")) champs.push("motsCles");
  const seoTitre = texteCourt(x.seoTitre ?? "");
  if (seoTitre === null || seoTitre.length > LIMITES_BLOG.seoTitre) champs.push("seoTitre");
  const seoDescription = texteCourt(x.seoDescription ?? "");
  if (seoDescription === null || seoDescription.length > LIMITES_BLOG.seoDescription) champs.push("seoDescription");
  if (champs.length) return { ok: false, champs, ecarts };
  return { ok: true, v: { titre, slug, chapo: chapo ?? "", corps: corps ?? "", couverture, categorie: categorie || null, motsCles, seoTitre: seoTitre || null, seoDescription: seoDescription || null } };
}

/** Champs encore vides qui empêchent la publication (un brouillon peut les laisser vides). */
export function manquePourPublier(v: Pick<ChampsArticle, "titre" | "chapo" | "corps">): ChampBlog[] {
  return (["titre", "chapo", "corps"] as const).filter((k) => !v[k].trim());
}

// ---------- états ----------

export type ActionEtat = "relecture" | "brouillon" | "publier" | "retirer";
export const ETAT_APRES: Record<ActionEtat, EtatBlog> = { relecture: "relecture", brouillon: "brouillon", publier: "publie", retirer: "retire" };
type Qui = { role: "agent" | "admin"; auteur: boolean };

/** Un membre peut-il modifier le texte de cet article ? Admin : toujours. Agent : son article, tant qu'il n'est pas publié. */
export const peutEcrire = (q: Qui, etat: EtatBlog) => q.role === "admin" || (q.auteur && (etat === "brouillon" || etat === "relecture"));

/** Changement d'état permis. Agent (son article) : brouillon → relecture et retour. Admin : publier (brouillon, relecture,
 * retiré), retirer (publié), remettre en brouillon (relecture, retiré), envoyer en relecture (brouillon). */
export function transitionPermise(q: Qui, etat: EtatBlog, action: ActionEtat): boolean {
  if (q.role === "agent") return q.auteur && ((action === "relecture" && etat === "brouillon") || (action === "brouillon" && etat === "relecture"));
  switch (action) {
    case "relecture":
      return etat === "brouillon";
    case "brouillon":
      return etat === "relecture" || etat === "retire";
    case "publier":
      return etat !== "publie";
    case "retirer":
      return etat === "publie";
  }
}

// ---------- aide à la traduction ----------

/** Réponse « TITRE: … / CHAPO: … / --- / corps » de l'aide à la traduction, nettoyée et coupée aux limites ; null sinon. */
export function lireTraduction(t: string): { titre: string; chapo: string; corps: string } | null {
  const m = /^\s*TITRE\s*:\s*(.+?)\s*\n\s*CHAPO\s*:\s*(.*?)\s*\n-{3,}\s*\n([\s\S]*)$/i.exec(t.replace(/\r\n?/g, "\n").trim());
  if (!m) return null;
  const titre = (texteCourt(m[1]) ?? "").slice(0, LIMITES_BLOG.titre);
  const chapo = (texteCourt(m[2]) ?? "").slice(0, LIMITES_BLOG.chapo);
  const corps = (nettoyerCorps(m[3]) ?? "").slice(0, LIMITES_BLOG.corps);
  return titre ? { titre, chapo, corps } : null;
}
