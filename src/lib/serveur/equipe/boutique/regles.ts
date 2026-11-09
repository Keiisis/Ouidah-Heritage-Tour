// Règles du catalogue partagées avec les formulaires et les tests, sans accès à la base.
import type { Coloris, CouleurMarque, OptionsProduit } from "@/lib/boutique-types";
import { validerTraductionsCatalogue, type TraductionsCatalogue } from "@/lib/boutique-traductions";

export type PhotoAdmin = { src: string; alt: string; largeur: number; hauteur: number };
export type ProduitSaisi = {
  slug: string; nom: string; categorie: string; matiere: string; lieu: string | null; prix_xof: number | null;
  artisan: string | null; dimensions: string | null; description: string | null; entretien: string | null;
  coloris: Coloris[]; piece_unique: boolean; options: OptionsProduit | null; photos: PhotoAdmin[]; ordre: number; stock: number | null; traductions: TraductionsCatalogue;
  delai_fabrication_jours: number | null; // jours (1 à 365) ; null : « délai précisé par l'équipe »
};
/** Zone de la grille de livraison (boutique_livraison_zones) ; frais null = livraison non payable en ligne. */
export type ZoneSaisie = { code: string; libelle: string; pays: string[]; ville: string | null; frais_xof: number | null; delai_jours: number | null; actif: boolean; ordre: number };
export type ZoneAdmin = ZoneSaisie & { reste_du_monde: boolean; modifie_le: string };
export type CategorieSaisie = { slug: string; nom: string; couleur: CouleurMarque; photo: PhotoAdmin | null; ordre: number; traductions: TraductionsCatalogue };
export type MatiereSaisie = { slug: string; nom: string; traductions: TraductionsCatalogue };
export type ProduitAdmin = ProduitSaisi & { id: string; publie: boolean; modifie_le: string; stock_reserve: number };
export type CategorieAdmin = CategorieSaisie & { modifie_le: string };
export type MatiereAdmin = MatiereSaisie & { modifie_le: string };
export type CatalogueAdmin = { produits: ProduitAdmin[]; categories: CategorieAdmin[]; matieres: MatiereAdmin[] };
export type ErreurBoutique = "acces" | "champs" | "conflit" | "existe" | "reference" | "stock" | "panne";
export type RetourBoutique = { ok: true; id: string; version: string } | { erreur: ErreurBoutique; champs?: string[] };
type Validation<T> = { ok: true; valeur: T } | { erreur: "champs"; champs: string[] };

export const COULEURS = ["laterite", "ocean", "sun", "ochre"] as const;
const MAX_ENTIER = 2_147_483_647;
const CONTROLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
export const objet = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
export const idValide = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const slugValide = (v: unknown, max = 60): v is string => typeof v === "string" && v.length <= max && /^[a-z0-9-]+$/.test(v);
export const versionValide = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const texte = (v: unknown, max: number, min = 0): v is string => typeof v === "string" && v.trim().length >= min && v.trim().length <= max && !CONTROLE.test(v);
const entier = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_ENTIER;

/** Les photos viennent des deux buckets publics d'OHT. Les anciens chemins sont conservés en lecture. */
export function sourcePhoto(v: unknown, origine: string): string | null {
  const p = objet(v);
  if (!p || !origine) return null;
  try {
    const racine = new URL(origine);
    let src: string;
    if (typeof p.src === "string") src = p.src;
    else if (typeof p.chemin === "string" && p.chemin && !p.chemin.split("/").some((part) => !part || part === "." || part === ".." || /[%\\?#]/.test(part))) {
      src = `${racine.origin}/storage/v1/object/public/boutique/${p.chemin.split("/").map(encodeURIComponent).join("/")}`;
    } else return null;
    const url = new URL(src);
    if (url.origin !== racine.origin || url.username || url.password || url.search || url.hash || /[\\\s]/.test(src)) return null;
    if (!/^\/storage\/v1\/object\/public\/(?:boutique|site-medias)\/.+\.(?:jpe?g|png|webp|avif)$/i.test(url.pathname)) return null;
    const chemin = decodeURIComponent(url.pathname);
    if (chemin.split("/").some((part) => part === "." || part === "..") || /[\\\u0000]/.test(chemin)) return null;
    return url.href;
  } catch { return null; }
}

export function photoAdmin(v: unknown, origine: string): PhotoAdmin | null {
  const p = objet(v), src = sourcePhoto(v, origine);
  if (!p || !src || !texte(p.alt, 300, 1) || !entier(p.largeur) || p.largeur === 0 || !entier(p.hauteur) || p.hauteur === 0) return null;
  return { src, alt: p.alt.trim(), largeur: p.largeur, hauteur: p.hauteur };
}

export function validerProduit(brut: unknown, origine: string): Validation<ProduitSaisi> {
  const b = objet(brut);
  if (!b) return { erreur: "champs", champs: ["produit"] };
  const champs: string[] = [];
  if (!slugValide(b.slug, 80)) champs.push("slug");
  if (!texte(b.nom, 160, 1)) champs.push("nom");
  for (const cle of ["categorie", "matiere"] as const) if (!slugValide(b[cle])) champs.push(cle);
  const facultatifs = { lieu: 120, artisan: 160, dimensions: 160, description: 4000, entretien: 2000 };
  const textes: Record<string, string | null> = {};
  for (const [cle, max] of Object.entries(facultatifs)) {
    const v = b[cle];
    if (v !== null && !texte(v, max)) champs.push(cle);
    textes[cle] = typeof v === "string" ? v.trim() || null : null;
  }
  if (b.prix_xof !== null && !entier(b.prix_xof)) champs.push("prix_xof");
  if (!entier(b.ordre)) champs.push("ordre");
  const delai = b.delai_fabrication_jours ?? null;
  if (delai !== null && (!entier(delai) || delai < 1 || delai > 365)) champs.push("delai_fabrication_jours");
  if (typeof b.piece_unique !== "boolean") champs.push("piece_unique");
  const stock = b.piece_unique === true && b.stock === null ? 1 : b.stock;
  if ((stock !== null && !entier(stock)) || (b.piece_unique === true && typeof stock === "number" && stock > 1)) champs.push("stock");
  const photos: PhotoAdmin[] = [];
  if (!Array.isArray(b.photos) || b.photos.length > 30) champs.push("photos");
  else b.photos.forEach((p, i) => {
    const image = photoAdmin(p, origine);
    if (image) photos.push(image); else champs.push(`photos.${i}`);
  });
  const coloris: Coloris[] = [];
  if (!Array.isArray(b.coloris) || b.coloris.length > 100) champs.push("coloris");
  else b.coloris.forEach((v, i) => {
    const c = objet(v);
    if (!c || !texte(c.nom, 40, 1) || typeof c.hex !== "string" || !/^#[0-9a-f]{6}$/i.test(c.hex) || coloris.some((a) => a.nom.toLocaleLowerCase("fr") === String(c.nom).trim().toLocaleLowerCase("fr"))) champs.push(`coloris.${i}`);
    else coloris.push({ nom: c.nom.trim(), hex: c.hex });
  });
  let options: OptionsProduit | null = null;
  if (b.options !== null) {
    const o = objet(b.options);
    if (!o) champs.push("options");
    else {
      const tailles = o.tailles;
      const broderie = o.broderie === null ? null : objet(o.broderie);
      if (tailles !== null && (!Array.isArray(tailles) || tailles.length > 100 || tailles.some((v) => !texte(v, 40, 1)) || new Set(tailles.map((v) => String(v).trim())).size !== tailles.length)) champs.push("tailles");
      if (typeof o.surMesure !== "boolean") champs.push("sur_mesure");
      if (o.broderie !== null && (!broderie || !entier(broderie.max) || broderie.max < 1 || broderie.max > 200)) champs.push("broderie");
      if (Array.isArray(tailles) && tailles.length || o.surMesure === true || broderie) options = { tailles: Array.isArray(tailles) && tailles.length ? tailles.map((v) => String(v).trim()) : null, surMesure: o.surMesure === true, broderie: broderie ? { max: Number(broderie.max) } : null };
    }
  }
  const traductions = validerTraductionsCatalogue(b.traductions, "produits", photos.map((p) => p.src));
  if (!traductions) champs.push("traductions");
  if (champs.length || !traductions) return { erreur: "champs", champs };
  return { ok: true, valeur: { slug: String(b.slug), nom: String(b.nom).trim(), categorie: String(b.categorie), matiere: String(b.matiere), lieu: textes.lieu, artisan: textes.artisan, dimensions: textes.dimensions, description: textes.description, entretien: textes.entretien, prix_xof: b.prix_xof as number | null, ordre: Number(b.ordre), stock: stock as number | null, piece_unique: b.piece_unique === true, photos, coloris, options, traductions, delai_fabrication_jours: delai as number | null } };
}

/** Zone de livraison saisie : code existant (la grille se crée par migration), frais entiers ≥ 0 ou vide (non payable
 * en ligne), pays ISO 3166-1 en majuscules. Le reste du monde n'a ni pays ni ville. */
export function validerZone(brut: unknown, resteDuMonde: boolean): Validation<ZoneSaisie> {
  const b = objet(brut), champs: string[] = [];
  if (!b) return { erreur: "champs", champs: ["zone"] };
  if (!slugValide(b.code, 40)) champs.push("code");
  if (!texte(b.libelle, 80, 1)) champs.push("libelle");
  const pays = Array.isArray(b.pays) ? [...new Set(b.pays.map((p) => String(p).trim().toUpperCase()))] : null;
  if (!pays || pays.length > 260 || pays.some((p) => !/^[A-Z]{2}$/.test(p)) || (resteDuMonde ? pays.length > 0 : pays.length === 0)) champs.push("pays");
  const ville = b.ville === null || b.ville === "" ? null : b.ville;
  if (ville !== null && (!texte(ville, 80, 1) || resteDuMonde || pays?.length !== 1)) champs.push("ville");
  if (b.frais_xof !== null && (!entier(b.frais_xof) || b.frais_xof > 100_000_000)) champs.push("frais_xof");
  if (b.delai_jours !== null && (!entier(b.delai_jours) || b.delai_jours < 1 || b.delai_jours > 365)) champs.push("delai_jours");
  if (typeof b.actif !== "boolean") champs.push("actif");
  if (!entier(b.ordre)) champs.push("ordre");
  if (champs.length) return { erreur: "champs", champs };
  return { ok: true, valeur: { code: String(b.code), libelle: String(b.libelle).trim(), pays: pays ?? [], ville: typeof ville === "string" ? ville.trim() : null, frais_xof: b.frais_xof as number | null, delai_jours: b.delai_jours as number | null, actif: b.actif as boolean, ordre: b.ordre as number } };
}

export function validerCategorie(brut: unknown, origine: string): Validation<CategorieSaisie> {
  const b = objet(brut);
  if (!b) return { erreur: "champs", champs: ["categorie"] };
  const champs: string[] = [];
  if (!slugValide(b.slug)) champs.push("slug");
  if (!texte(b.nom, 80, 1)) champs.push("nom");
  if (!(COULEURS as readonly unknown[]).includes(b.couleur)) champs.push("couleur");
  if (!entier(b.ordre)) champs.push("ordre");
  const photo = b.photo === null ? null : photoAdmin(b.photo, origine);
  if (b.photo !== null && !photo) champs.push("photo");
  const traductions = validerTraductionsCatalogue(b.traductions, "categories", photo ? [photo.src] : []);
  if (!traductions) champs.push("traductions");
  return champs.length || !traductions ? { erreur: "champs", champs } : { ok: true, valeur: { slug: String(b.slug), nom: String(b.nom).trim(), couleur: b.couleur as CouleurMarque, ordre: Number(b.ordre), photo, traductions } };
}

export function validerMatiere(brut: unknown): Validation<MatiereSaisie> {
  const b = objet(brut), champs: string[] = [];
  if (!b) return { erreur: "champs", champs: ["matiere"] };
  if (!slugValide(b.slug)) champs.push("slug");
  if (!texte(b.nom, 80, 1)) champs.push("nom");
  const traductions = validerTraductionsCatalogue(b.traductions, "matieres");
  if (!traductions) champs.push("traductions");
  return champs.length || !traductions ? { erreur: "champs", champs } : { ok: true, valeur: { slug: String(b.slug), nom: String(b.nom).trim(), traductions } };
}
