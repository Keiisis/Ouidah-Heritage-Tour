import "server-only";
import { base } from "../base";
import { type Bloc, type Couverture, estEtat, estLangueBlog, type EtatBlog, type LangueBlog, LIMITES_BLOG, rendreMarkdown, slugValide, texteCourt } from "./regles";

// Lectures du blog, sans cache ni session. Écrans de l'espace (liste, article, historique) : l'appelant a déjà vérifié la
// session et le droit « site ». Site public : les articles publiés seulement, avec les champs de la page publique (jamais
// l'e-mail de l'auteur, seulement son prénom et son nom) ; public.ts les met en cache (étiquette « blog »). Chaque
// lecture rend null si la base ne répond pas.

type Qui = { prenom: string; nom: string } | null;
const AUTEUR = "auteur:equipe_profils!blog_articles_auteur_id_fkey(prenom,nom)";
const MODIFIE = "modifie:equipe_profils!blog_articles_modifie_par_fkey(prenom,nom)";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const estUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
export const nomDe = (q: Qui) => (q ? `${q.prenom} ${q.nom}`.trim() : null);
/** Préfixe des images permises dans un article (compartiment public site-medias, rempli par le stockage du contenu). */
export const mediasBlog = () => (process.env.SUPABASE_URL ? [`${process.env.SUPABASE_URL}/storage/v1/object/public/site-medias/`] : []);

async function lire<T>(chemin: string): Promise<T | null> {
  try {
    const r = await base(chemin);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

// ---------- espace de l'équipe ----------

export type ResumeArticle = { id: string; slug: string; langue: LangueBlog; titre: string; etat: EtatBlog; traduction_de: string | null; modifie_le: string; publie_le: string | null; auteur_id: string | null; auteur: string | null };
export type ArticleEquipe = ResumeArticle & {
  chapo: string;
  corps: string;
  couverture_src: string | null;
  couverture_alt: string | null;
  categorie: string | null;
  mots_cles: string[];
  seo_titre: string | null;
  seo_description: string | null;
  temps_lecture: number;
  version: number;
  cree_le: string;
  modifiePar: string | null;
};
export type VersionArticle = { id: number; version: number; etat: EtatBlog; le: string; auteur: string | null };
export type ContenuVersion = { titre: string; slug: string; chapo: string; corps: string; couverture_src: string | null; couverture_alt: string | null; categorie: string | null; mots_cles: string[]; seo_titre: string | null; seo_description: string | null };

const RESUME = `id,slug,langue,titre,etat,traduction_de,modifie_le,publie_le,auteur_id,${AUTEUR}`;

/** Articles de l'espace, les plus récemment modifiés d'abord (200 au plus), filtrés par état, langue et auteur. */
export async function listerArticles(f: { etat?: string; langue?: string; auteur?: string } = {}): Promise<ResumeArticle[] | null> {
  const filtres = [estEtat(f.etat) ? `&etat=eq.${f.etat}` : "", estLangueBlog(f.langue) ? `&langue=eq.${f.langue}` : "", estUuid(f.auteur) ? `&auteur_id=eq.${f.auteur}` : ""].join("");
  const l = await lire<(Omit<ResumeArticle, "auteur"> & { auteur: Qui })[]>(`blog_articles?select=${RESUME}${filtres}&order=modifie_le.desc&limit=200`);
  return l ? l.map((a) => ({ ...a, auteur: nomDe(a.auteur) })) : null;
}

/** Auteurs qui ont au moins un article (pour le filtre de la liste), par nom. */
export async function lireAuteurs(): Promise<{ id: string; nom: string }[] | null> {
  const l = await lire<{ auteur_id: string | null; auteur: Qui }[]>(`blog_articles?select=auteur_id,${AUTEUR}&auteur_id=not.is.null&limit=5000`);
  if (!l) return null;
  const vus = new Map<string, string>();
  for (const a of l) if (a.auteur_id && !vus.has(a.auteur_id)) vus.set(a.auteur_id, nomDe(a.auteur) ?? "");
  return [...vus].map(([id, nom]) => ({ id, nom })).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

/** Article complet pour l'éditeur ; « absent » s'il n'existe pas. */
export async function lireArticle(id: string): Promise<ArticleEquipe | "absent" | null> {
  if (!estUuid(id)) return "absent";
  const l = await lire<(Omit<ArticleEquipe, "auteur" | "modifiePar"> & { auteur: Qui; modifie: Qui })[]>(`blog_articles?select=*,${AUTEUR},${MODIFIE}&id=eq.${id}`);
  if (!l) return null;
  const [a] = l;
  if (!a) return "absent";
  const { modifie, ...reste } = a;
  return { ...reste, auteur: nomDe(a.auteur), modifiePar: nomDe(modifie) };
}

/** Les versions d'un même article d'origine (l'origine et ses traductions), toutes états confondus. */
export async function lireFamille(racine: string): Promise<{ id: string; langue: LangueBlog; etat: EtatBlog; titre: string }[] | null> {
  if (!estUuid(racine)) return [];
  return lire(`blog_articles?select=id,langue,etat,titre&or=(id.eq.${racine},traduction_de.eq.${racine})&order=langue.asc`);
}

/** Les 30 dernières versions de l'historique, de la plus récente à la plus ancienne. */
export async function lireVersions(id: string): Promise<VersionArticle[] | null> {
  if (!estUuid(id)) return [];
  const l = await lire<(Omit<VersionArticle, "auteur"> & { auteur: Qui })[]>(`blog_versions?select=id,version,etat,le,auteur:equipe_profils(prenom,nom)&article_id=eq.${id}&order=version.desc&limit=30`);
  return l ? l.map((v) => ({ ...v, auteur: nomDe(v.auteur) })) : null;
}

/** Contenu d'une version de l'historique ; « absent » si elle n'appartient pas à cet article. */
export async function lireVersion(id: string, versionId: number): Promise<ContenuVersion | "absent" | null> {
  if (!estUuid(id) || !Number.isInteger(versionId) || versionId < 1) return "absent";
  const l = await lire<{ contenu: ContenuVersion }[]>(`blog_versions?select=contenu&article_id=eq.${id}&id=eq.${versionId}`);
  if (!l) return null;
  return l[0]?.contenu ?? "absent";
}

// ---------- site public (articles publiés seulement) ----------

export const PAR_PAGE = 12;
export type ArticlePublic = {
  id: string;
  slug: string;
  langue: LangueBlog;
  titre: string;
  chapo: string;
  couverture: Couverture | null;
  categorie: string | null;
  motsCles: string[];
  publieLe: string;
  modifieLe: string;
  tempsLecture: number;
  auteur: { prenom: string; nom: string } | null;
  seo: { titre: string | null; description: string | null };
};
export type ArticlePublieDetail = ArticlePublic & { blocs: Bloc[]; traductionDe: string | null };
export type PagePubliee = { articles: ArticlePublic[]; page: number; pages: number; total: number };

type LignePublique = {
  id: string;
  slug: string;
  langue: LangueBlog;
  titre: string;
  chapo: string;
  couverture_src: string | null;
  couverture_alt: string | null;
  categorie: string | null;
  mots_cles: string[];
  publie_le: string;
  modifie_le: string;
  temps_lecture: number;
  seo_titre: string | null;
  seo_description: string | null;
  traduction_de: string | null;
  auteur: Qui;
};
const PUBLIC = `id,slug,langue,titre,chapo,couverture_src,couverture_alt,categorie,mots_cles,publie_le,modifie_le,temps_lecture,seo_titre,seo_description,traduction_de,${AUTEUR}`;

const versPublic = (l: LignePublique): ArticlePublic => ({
  id: l.id,
  slug: l.slug,
  langue: l.langue,
  titre: l.titre,
  chapo: l.chapo,
  couverture: l.couverture_src && l.couverture_alt ? { src: l.couverture_src, alt: l.couverture_alt } : null,
  categorie: l.categorie,
  motsCles: l.mots_cles ?? [],
  publieLe: l.publie_le,
  modifieLe: l.modifie_le,
  tempsLecture: l.temps_lecture,
  auteur: l.auteur ? { prenom: l.auteur.prenom, nom: l.auteur.nom } : null,
  seo: { titre: l.seo_titre, description: l.seo_description },
});

/** Page `page` (1 = la plus récente) des articles publiés d'une langue, catégorie facultative. */
export async function lirePublies(langue: string, o: { page?: number; categorie?: string } = {}): Promise<PagePubliee | null> {
  const page = Number.isInteger(o.page) && (o.page as number) >= 1 && (o.page as number) <= 1000 ? (o.page as number) : 1;
  if (!estLangueBlog(langue)) return { articles: [], page, pages: 0, total: 0 };
  const categorie = o.categorie === undefined ? "" : (texteCourt(o.categorie) ?? "");
  if (categorie.length > LIMITES_BLOG.categorie) return { articles: [], page, pages: 0, total: 0 };
  try {
    const debut = (page - 1) * PAR_PAGE;
    const r = await base(`blog_articles?select=${PUBLIC}&etat=eq.publie&langue=eq.${langue}${categorie ? `&categorie=eq.${encodeURIComponent(categorie)}` : ""}&order=publie_le.desc,id.desc`, { prefer: "count=exact", range: `${debut}-${debut + PAR_PAGE - 1}` });
    // au-delà de la dernière page, PostgREST répond 416 : une page vide, pas une panne
    if (r.status === 416) return { articles: [], page, pages: Math.ceil(Number(r.headers.get("content-range")?.split("/")[1] ?? 0) / PAR_PAGE), total: Number(r.headers.get("content-range")?.split("/")[1] ?? 0) };
    if (!r.ok) return null;
    const total = Number(r.headers.get("content-range")?.split("/")[1] ?? 0);
    const articles = ((await r.json()) as LignePublique[]).map(versPublic);
    return { articles, page, pages: Math.ceil(total / PAR_PAGE), total };
  } catch {
    return null;
  }
}

/** Article publié d'une langue par son slug, corps rendu en blocs sûrs ; « absent » s'il n'est pas publié. */
export async function lirePublie(langue: string, slug: string): Promise<ArticlePublieDetail | "absent" | null> {
  if (!estLangueBlog(langue) || !slugValide(slug)) return "absent";
  const l = await lire<(LignePublique & { corps: string })[]>(`blog_articles?select=${PUBLIC},corps&etat=eq.publie&langue=eq.${langue}&slug=eq.${slug}&limit=1`);
  if (!l) return null;
  const [a] = l;
  if (!a) return "absent";
  return { ...versPublic(a), blocs: rendreMarkdown(a.corps, { medias: mediasBlog() }), traductionDe: a.traduction_de };
}

/** Catégories des articles publiés d'une langue, avec leur nombre d'articles, les plus fournies d'abord. */
export async function lireCategories(langue: string): Promise<{ nom: string; nombre: number }[] | null> {
  if (!estLangueBlog(langue)) return [];
  const l = await lire<{ categorie: string }[]>(`blog_articles?select=categorie&etat=eq.publie&langue=eq.${langue}&categorie=not.is.null&limit=5000`);
  if (!l) return null;
  const n = new Map<string, number>();
  for (const { categorie } of l) n.set(categorie, (n.get(categorie) ?? 0) + 1);
  return [...n].map(([nom, nombre]) => ({ nom, nombre })).sort((a, b) => b.nombre - a.nombre || a.nom.localeCompare(b.nom, "fr"));
}

/** Versions publiées du même article dans les autres langues et dans la sienne (langue, slug), pour les liens hreflang. */
export async function lireTraductions(id: string): Promise<{ langue: LangueBlog; slug: string }[] | null> {
  if (!estUuid(id)) return [];
  const l = await lire<{ id: string; traduction_de: string | null }[]>(`blog_articles?select=id,traduction_de&id=eq.${id}&etat=eq.publie`);
  if (!l) return null;
  if (!l[0]) return [];
  const racine = l[0].traduction_de ?? l[0].id;
  return lire(`blog_articles?select=langue,slug&etat=eq.publie&or=(id.eq.${racine},traduction_de.eq.${racine})&order=langue.asc`);
}
