import { CATEGORIES_WIKI, type CategorieWiki, CONSERVATION_JOURS, JOURS_PISTES, PERIODES_PERFS, PRIORITES, type Priorite, TYPES_DOCUMENT, type TypeDocument } from "@/content/espace-pilotage";
import { iso, jourOuidah } from "@/lib/jours";
import { plusieursLignes, uneLigne, UUID } from "../dossiers-regles";

// Règles du lot « pilotage », partagées par les écrans et par les actions serveur (actions.ts), qui seules décident : tout
// ce qui arrive du navigateur est relu ici. Aucun secret, aucun accès à la base : le navigateur peut embarquer ce fichier.

export { UUID };
export const MIMES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type Mime = (typeof MIMES)[number];
export const TAILLE_MAX = 10 * 1024 * 1024; // 10 Mo, la même limite que le compartiment equipe-documents
export const COMPARTIMENT = "equipe-documents";
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const dans = <T extends string>(liste: readonly T[], v: unknown): v is T => typeof v === "string" && (liste as readonly string[]).includes(v);
export const estMime = (v: unknown): v is Mime => dans(MIMES, v);
export const estTypeDocument = (v: unknown): v is TypeDocument => dans(TYPES_DOCUMENT, v);

/** Champs d'un envoi : FormData (formulaire) ou objet (appel direct) ; tout le reste donne un objet vide. */
export function champsDe(brut: unknown): Record<string, unknown> {
  if (typeof FormData !== "undefined" && brut instanceof FormData) {
    const o: Record<string, unknown> = {};
    for (const [k, v] of brut.entries()) if (!(k in o)) o[k] = v;
    return o;
  }
  return brut && typeof brut === "object" && !Array.isArray(brut) ? (brut as Record<string, unknown>) : {};
}

// ---------- wiki ----------

export type PageSaisie = { titre: string; categorie: CategorieWiki; corps: string };
export function lirePage(brut: unknown): { ok: true; v: PageSaisie } | { ok: false; champs: string[] } {
  const c = champsDe(brut);
  const titre = uneLigne(c.titre), corps = plusieursLignes(c.corps);
  const champs: string[] = [];
  if (titre.length < 3 || titre.length > 140) champs.push("titre");
  if (!dans(CATEGORIES_WIKI, c.categorie)) champs.push("categorie");
  if (corps.length < 1 || corps.length > 20000) champs.push("corps");
  return champs.length ? { ok: false, champs } : { ok: true, v: { titre, categorie: c.categorie as CategorieWiki, corps } };
}
export function lireMotif(v: unknown): string | null {
  const m = uneLigne(v);
  return m.length >= 3 && m.length <= 280 ? m : null;
}
/** Paragraphes d'une page : texte simple, une ligne vide les sépare (jamais de HTML). */
export const paragraphes = (corps: string) => corps.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

// ---------- pistes ----------

export const joursPistes = (v: unknown) => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return (JOURS_PISTES as readonly number[]).includes(n) ? n : JOURS_PISTES[0];
};
export const periodePerfs = (v: unknown) => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return (PERIODES_PERFS as readonly number[]).includes(n) ? n : PERIODES_PERFS[0];
};
function dateValide(v: string) {
  const d = DATE.exec(v);
  if (!d) return false;
  const t = new Date(Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3])));
  return t.getUTCFullYear() === Number(d[1]) && t.getUTCMonth() === Number(d[2]) - 1 && t.getUTCDate() === Number(d[3]);
}
/** Priorité et rappel d'une piste : rappel vide (aucun) ou une date d'aujourd'hui à un an, à Ouidah. */
export function lireSuivi(brut: unknown, ms: number): { ok: true; v: { priorite: Priorite; rappel: string | null } } | { ok: false; champs: string[] } {
  const c = champsDe(brut);
  const champs: string[] = [];
  if (!dans(PRIORITES, c.priorite)) champs.push("priorite");
  const r = typeof c.rappel === "string" ? c.rappel.trim() : "";
  const aujourdhui = iso(jourOuidah(ms)), max = iso(jourOuidah(ms) + 366);
  if (r && (!dateValide(r) || r < aujourdhui || r > max)) champs.push("rappel");
  return champs.length ? { ok: false, champs } : { ok: true, v: { priorite: c.priorite as Priorite, rappel: r || null } };
}

// ---------- documents ----------

/** Nom de fichier affiché : une ligne, sans séparateur de chemin, 120 caractères au plus. */
export const nomFichier = (v: unknown) => uneLigne(v).replace(/[\\/]/g, "_").slice(0, 120) || "document";

/** Les premiers octets correspondent-ils au type annoncé ? (PDF, JPEG, PNG, WebP) */
export function signatureValide(o: Uint8Array, mime: Mime) {
  const a = (...b: number[]) => b.every((x, i) => o[i] === x);
  switch (mime) {
    case "application/pdf":
      return a(0x25, 0x50, 0x44, 0x46, 0x2d); // %PDF-
    case "image/jpeg":
      return a(0xff, 0xd8, 0xff);
    case "image/png":
      return a(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "image/webp":
      return a(0x52, 0x49, 0x46, 0x46) && o[8] === 0x57 && o[9] === 0x45 && o[10] === 0x42 && o[11] === 0x50; // RIFF....WEBP
  }
}

/** Dernier jour de conservation : CONSERVATION_JOURS après la fin du séjour (jour « epoch »), ou après le dépôt. */
export const conservation = (depart: number | null, ms: number) => iso(Math.max(jourOuidah(ms), depart ?? 0) + CONSERVATION_JOURS);

// ---------- semaine du rapport (lundi → lundi, à Ouidah) ----------

/** Jour « epoch » du lundi de la semaine écoulée (celle qui précède la semaine en cours). */
export function lundiEcoule(ms: number) {
  const j = jourOuidah(ms);
  const lundi = j - ((j + 3) % 7); // 1er janvier 1970 = jeudi : (j + 3) % 7 vaut 0 le lundi
  return lundi - 7;
}
