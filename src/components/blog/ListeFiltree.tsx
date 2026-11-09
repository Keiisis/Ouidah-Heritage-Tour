"use client";

import { useEffect, useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { texteBlog, type copiesBlog, type LangueBlogSite } from "@/content/blog-site";
import type { ArticlePublic } from "@/lib/serveur/blog/public";
import { Liste } from "./Liste";

// Vue filtrée de /blog (?categorie=, ?page=), lue dans le navigateur : la page reste statique (servie par le CDN) et rend
// d'abord la liste par défaut (VueParDefaut). Avec un filtre, ListeFiltree rend la liste filtrée et retire la vue par
// défaut du document avant l'affichage (effet de mise en page). Mêmes règles que l'ancienne lecture serveur
// (lectures.ts › lirePublies) : catégorie exacte, `parPage` articles par page, page hors bornes → liste vide ; pages
// filtrées ou suivantes non indexées, titre de la catégorie sauf titre fixé dans l'admin (site.seo). L'ancienne adresse
// /blog?langue=EN est redirigée par next.config.ts.
type Props = {
  racine: LangueBlogSite;
  copies: typeof copiesBlog;
  mois: readonly string[] | undefined;
  articles: ArticlePublic[]; // tous les articles publiés de la langue, du plus récent au plus ancien
  categories: { nom: string; nombre: number }[];
  langues: LangueBlogSite[];
  parPage: number;
  titreFixe: boolean;
};

// vue filtrée affichée ? (partagé avec VueParDefaut)
let filtree = false;
const EVENEMENT = "oht-blog-filtre";
const suivre = (cb: () => void) => {
  window.addEventListener(EVENEMENT, cb);
  return () => window.removeEventListener(EVENEMENT, cb);
};
const signaler = (v: boolean) => {
  filtree = v;
  window.dispatchEvent(new Event(EVENEMENT));
};

/** Liste par défaut rendue par le serveur, retirée tant qu'une vue filtrée est affichée. */
export function VueParDefaut({ children }: { children: ReactNode }) {
  const cachee = useSyncExternalStore(suivre, () => filtree, () => false);
  return cachee ? null : children;
}

export function ListeFiltree({ racine, copies, mois, articles, categories, langues, parPage, titreFixe }: Props) {
  const q = useSearchParams();
  const categorie = q.get("categorie")?.replace(/\s+/g, " ").trim() || null;
  const brut = q.get("page");
  const n = brut && /^\d{1,4}$/.test(brut) ? Number(brut) : 1;
  const page = n >= 1 && n <= 1000 ? n : 1;
  const actif = Boolean(categorie) || page > 1;
  const T = texteBlog(copies, racine);
  const titre = categorie && !titreFixe ? T.meta.titreCategorie(categorie) : null;

  useLayoutEffect(() => {
    signaler(actif);
    return () => signaler(false);
  }, [actif]);
  useEffect(() => {
    if (!titre) return;
    const avant = document.title;
    document.title = titre;
    return () => {
      document.title = avant;
    };
  }, [titre]);

  if (!actif) return null;
  const choisis = categorie ? articles.filter((a) => a.categorie === categorie) : articles;
  const resultat = { articles: choisis.slice((page - 1) * parPage, page * parPage), page, pages: Math.ceil(choisis.length / parPage), total: choisis.length };
  return (
    <>
      <meta name="robots" content="noindex, follow" />
      <Liste T={T} mois={mois} langue={racine} categorie={categorie} resultat={resultat} categories={categories} langues={langues} />
    </>
  );
}
