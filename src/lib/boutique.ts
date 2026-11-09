import "server-only"; // pris en charge par le compilateur de Next (aucune dépendance) : ce module ne part jamais au navigateur
import { cacheLife, cacheTag } from "next/cache";
import type { Catalogue, Categorie, Coloris, CouleurMarque, Matiere, OptionsProduit, Photo, Produit, ZoneLivraison } from "@/lib/boutique-types";
import { base, baseConfiguree } from "@/lib/serveur/base";
import { passerellesActives } from "@/lib/serveur/paiement";
import { sourcePhoto } from "@/lib/serveur/equipe/boutique/regles";
import { traductionCatalogue } from "@/lib/boutique-traductions";
import type { Langue } from "@/lib/langue";

// Lecture de la boutique dans la base (tables boutique_*, éditées par l'admin), côté serveur seulement. Seuls les articles
// publiés sont lus, plus les brouillons quand BOUTIQUE_BROUILLONS=1 (poste de développement). Base muette : catalogue vide.
// Le catalogue est mis en cache (étiquette « boutique ») : l'admin appelle updateTag("boutique") après une modification.

type PhotoBase = { chemin?: unknown; src?: unknown; alt?: unknown; largeur?: unknown; hauteur?: unknown };
type LigneCategorie = { slug: string; nom: string; couleur: CouleurMarque; photo: PhotoBase | null; ordre: number; traductions?: unknown };
type LigneProduit = {
  slug: string; nom: string; categorie: string; matiere: string; lieu: string | null; prix_xof: number | string | null;
  artisan: string | null; dimensions: string | null; description: string | null; entretien: string | null;
  coloris: unknown; piece_unique: boolean; options: unknown; photos: unknown; ordre: number; stock: number | null; stock_reserve: number; delai_fabrication_jours?: number | null; traductions?: unknown;
};
type LigneZone = { code: string; pays: string[]; ville: string | null; reste_du_monde: boolean; frais_xof: number | null; delai_jours: number | null; actif: boolean };

const COLONNES = "slug,nom,categorie,matiere,lieu,prix_xof,artisan,dimensions,description,entretien,coloris,piece_unique,options,photos,ordre,stock,stock_reserve,delai_fabrication_jours,traductions";
const VIDE: Catalogue = { produits: [], categories: [], matieres: [] };
const visibles = () => (process.env.NODE_ENV === "development" && !process.env.VERCEL && process.env.BOUTIQUE_BROUILLONS === "1" ? "" : "&publie=is.true");
const objet = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const textes = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : []);

function photo(v: unknown): Photo | null {
  const p = objet(v) as PhotoBase | null;
  const url = sourcePhoto(v, process.env.SUPABASE_URL ?? "");
  if (!p || !url) return null;
  return { url, alt: typeof p.alt === "string" ? p.alt : "", largeur: Number(p.largeur) || 0, hauteur: Number(p.hauteur) || 0 };
}

function options(v: unknown): OptionsProduit | null {
  const o = objet(v);
  if (!o) return null;
  const tailles = textes(o.tailles);
  const max = Number(objet(o.broderie)?.max);
  return { tailles: tailles.length ? tailles : null, surMesure: o.surMesure === true, broderie: Number.isInteger(max) && max > 0 ? { max } : null };
}

function produit(l: LigneProduit, langue: Langue = "FR"): Produit {
  const opts = options(l.options);
  const photos = (Array.isArray(l.photos) ? l.photos : []).map(photo).filter((p): p is Photo => p !== null);
  const t = traductionCatalogue(l.traductions, langue, "produits", photos.map((p) => p.url));
  const coloris = (Array.isArray(l.coloris) ? l.coloris : []).flatMap((v): Coloris[] => {
    const c = objet(v);
    return typeof c?.nom === "string" && typeof c.hex === "string" ? [{ nom: c.nom, hex: c.hex }] : [];
  });
  return {
    slug: l.slug,
    nom: t.nom ?? l.nom,
    categorie: l.categorie,
    matiere: l.matiere,
    lieu: t.lieu ?? l.lieu,
    prixXof: l.prix_xof === null ? null : Number(l.prix_xof),
    artisan: l.artisan,
    dimensions: t.dimensions ?? l.dimensions,
    description: t.description ?? l.description,
    entretien: t.entretien ?? l.entretien,
    coloris,
    personnalisable: opts !== null,
    unique: l.piece_unique,
    options: opts,
    photos: photos.map((p) => ({ ...p, alt: t.photos?.find((a) => a.src === p.url)?.alt ?? p.alt })),
    ordre: l.ordre,
    stockDisponible: l.stock === null || l.stock === undefined ? null : Math.max(0, Number(l.stock) - Number(l.stock_reserve ?? 0)),
    delaiFabrication: l.delai_fabrication_jours ?? null,
  };
}

async function lire<T>(chemin: string): Promise<T | null> {
  if (!baseConfiguree()) return null;
  try {
    const r = await base(chemin);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Articles visibles dont le slug est dans la liste, lus sans cache (commande : prix du moment). null si la base ne répond pas. */
export async function lireProduitsFrais(slugs: string[]): Promise<Produit[] | null> {
  const liste = [...new Set(slugs)].filter((s) => /^[a-z0-9-]{1,80}$/.test(s));
  if (!liste.length) return [];
  const lignes = await lire<LigneProduit[]>(`boutique_produits?select=${COLONNES}&slug=in.(${liste.join(",")})${visibles()}`);
  return lignes?.map((l) => produit(l)) ?? null;
}

/** Catalogue visible : articles, et seulement les catégories et matières qui ont au moins un article visible ; grille de
 * livraison et présence d'une passerelle active (libellé « Commander et payer ») pour l'affichage du panier. */
export async function lireCatalogue(langue: Langue = "FR"): Promise<Catalogue> {
  "use cache";
  cacheTag("boutique");
  const [produits, categories, matieres, zones, passerelles] = await Promise.all([
    lire<LigneProduit[]>(`boutique_produits?select=${COLONNES}${visibles()}&order=ordre.asc,nom.asc`),
    lire<LigneCategorie[]>("boutique_categories?select=slug,nom,couleur,photo,ordre,traductions&order=ordre.asc,nom.asc"),
    lire<(Matiere & { traductions?: unknown })[]>("boutique_matieres?select=slug,nom,traductions&order=nom.asc"),
    lire<LigneZone[]>("boutique_livraison_zones?select=code,pays,ville,reste_du_monde,frais_xof,delai_jours,actif&order=ordre.asc,code.asc"),
    baseConfiguree() ? passerellesActives() : [],
  ]);
  if (!produits || !categories || !matieres) {
    cacheLife("minutes"); // base muette : catalogue vide, nouvel essai une minute plus tard
    return VIDE;
  }
  cacheLife("hours");
  const liste = produits.map((l) => produit(l, langue));
  const cats = new Set(liste.map((p) => p.categorie)), mats = new Set(liste.map((p) => p.matiere));
  return {
    produits: liste,
    categories: categories.filter((c) => cats.has(c.slug)).map((c): Categorie => {
      const p = photo(c.photo), t = traductionCatalogue(c.traductions, langue, "categories", p ? [p.url] : []);
      return { slug: c.slug, nom: t.nom ?? c.nom, couleur: c.couleur, photo: p ? { ...p, alt: t.photos?.find((a) => a.src === p.url)?.alt ?? p.alt } : null, ordre: c.ordre };
    }),
    matieres: matieres.filter((m) => mats.has(m.slug)).map((m) => ({ slug: m.slug, nom: traductionCatalogue(m.traductions, langue, "matieres").nom ?? m.nom })),
    livraison: (zones ?? []).map((z): ZoneLivraison => ({ code: z.code, pays: z.pays, ville: z.ville, resteDuMonde: z.reste_du_monde, fraisXof: z.frais_xof, delaiJours: z.delai_jours, actif: z.actif })),
    paiementEnLigne: passerelles.length > 0,
  };
}

/** Article visible, ou null (inconnu, brouillon hors développement, base muette). */
export async function lireProduit(slug: string, langue: Langue = "FR"): Promise<Produit | null> {
  return (await lireCatalogue(langue)).produits.find((p) => p.slug === slug) ?? null;
}

/** Slugs des articles visibles (generateStaticParams des fiches). */
export async function slugsProduits(): Promise<string[]> {
  return (await lireCatalogue()).produits.map((p) => p.slug);
}
