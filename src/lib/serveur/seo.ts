import "server-only";
import type { Metadata } from "next";
import { lireContenu } from "@/lib/contenu";
import { LANGUES, type Langue } from "@/lib/langue";
import { adresseLangue } from "@/lib/adresses-langues";
import { langueInconnue, languePage } from "./contenu-page";

export function origineSite(): string {
  try {
    const u = new URL(process.env.SITE_URL || "https://ouidahheritagetour.bj");
    if (u.protocol === "https:" || (u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname))) return u.origin;
  } catch { /* Une configuration invalide revient au domaine public de l'agence. */ }
  return "https://ouidahheritagetour.bj";
}

export function alternances(chemin: string) {
  const origine = origineSite();
  return Object.fromEntries([...LANGUES.map(l => [l.toLowerCase(), `${origine}${adresseLangue(chemin, l)}`]), ["x-default", `${origine}${chemin}`]]);
}

/** Page introuvable : avec global-not-found, Next lit les métadonnées de la page qui a appelé notFound(), pas celles de
 * not-found.tsx ; chaque page sans contenu les demande donc ici (titre « Page introuvable », dans la langue de l'adresse). */
export async function metadonneesIntrouvable(langue?: Langue): Promise<Metadata> {
  const T = await lireContenu("introuvable.introuvable", langue ?? await languePage());
  return { title: T.metaTitre, description: T.metaDescription, robots: { index: false, follow: false } };
}

export async function metadonneesPage(chemin: string, contenu: Metadata = {}, langue?: Langue): Promise<Metadata> {
  if (!langue && await langueInconnue()) return metadonneesIntrouvable("FR");
  const l = langue ?? await languePage();
  const reglages = await lireContenu("site.seo", l);
  const page = reglages.pages.find(p => p.chemin === chemin);
  const titre = page?.titre || contenu.title || reglages.titre;
  const description = page?.description || contenu.description || reglages.description;
  const canonical = `${origineSite()}${adresseLangue(chemin, l)}`;
  return {
    ...contenu, title: titre, description, metadataBase: new URL(origineSite()),
    alternates: contenu.alternates ?? { canonical, languages: alternances(chemin) },
    openGraph: contenu.openGraph ?? { type: "website", url: canonical, title: typeof titre === "string" ? titre : reglages.titre, description, siteName: "Ouidah Heritage Tour", images: [{ url: reglages.image.src, alt: reglages.image.alt }] },
    ...(page?.indexer === false ? { robots: { index: false, follow: true } } : {}),
  };
}
