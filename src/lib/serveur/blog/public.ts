import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { type ArticlePublieDetail, lireCategories, lirePublie, lirePublies, lireTraductions, type PagePubliee } from "./lectures";
import type { LangueBlog } from "./regles";

// Lecture du blog pour le site public, sans session : articles publiés seulement, mis en cache avec l'étiquette « blog »
// (doc Next 16 « use cache » et « cacheTag », node_modules/next/dist/docs/01-app/03-api-reference) ; chaque écriture qui
// touche un article publié l'expire par updateTag("blog") (actions.ts). Base muette : un résultat vide gardé quelques
// minutes, puis nouvel essai. Les paramètres viennent de l'adresse : relus par lectures.ts (langue, slug, catégorie,
// identifiant), une valeur hors règle rend un résultat vide. Jamais l'e-mail de l'auteur : son prénom et son nom.

export const TAG_BLOG = "blog";
export type { ArticlePublic, ArticlePublieDetail, PagePubliee } from "./lectures";
export { PAR_PAGE } from "./lectures";
export type { Bloc, EnLigne, LangueBlog } from "./regles";

/** Articles publiés d'une langue, du plus récent au plus ancien, PAR_PAGE par page (page 1 par défaut), catégorie facultative. */
export async function articlesPublies(langue: LangueBlog, o: { page?: number; categorie?: string } = {}): Promise<PagePubliee> {
  "use cache";
  cacheTag(TAG_BLOG);
  const r = await lirePublies(langue, o);
  if (r) cacheLife("hours");
  else cacheLife("minutes");
  return r ?? { articles: [], page: o.page ?? 1, pages: 0, total: 0 };
}

/** Article publié d'une langue par son slug, corps rendu en blocs sûrs (regles.ts, rendreMarkdown) ; null s'il n'existe pas. */
export async function articlePublie(langue: LangueBlog, slug: string): Promise<ArticlePublieDetail | null> {
  "use cache";
  cacheTag(TAG_BLOG);
  const r = await lirePublie(langue, slug);
  if (r === null) cacheLife("minutes");
  else cacheLife("hours");
  return r === null || r === "absent" ? null : r;
}

/** Catégories des articles publiés d'une langue et leur nombre d'articles. */
export async function categories(langue: LangueBlog): Promise<{ nom: string; nombre: number }[]> {
  "use cache";
  cacheTag(TAG_BLOG);
  const r = await lireCategories(langue);
  if (r) cacheLife("hours");
  else cacheLife("minutes");
  return r ?? [];
}

/** Langues où cet article est publié (lui compris) et le slug de chaque version, pour les liens entre langues. */
export async function traductions(id: string): Promise<{ langue: LangueBlog; slug: string }[]> {
  "use cache";
  cacheTag(TAG_BLOG);
  const r = await lireTraductions(id);
  if (r) cacheLife("hours");
  else cacheLife("minutes");
  return r ?? [];
}
