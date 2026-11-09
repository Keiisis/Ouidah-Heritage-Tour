import type { MetadataRoute } from "next";
import { lireContenu } from "@/lib/contenu";
import { lireCatalogue } from "@/lib/boutique";
import { LANGUES } from "@/lib/langue";
import { adresseLangue, sansLangue } from "@/lib/adresses-langues";
import { alternances, origineSite } from "@/lib/serveur/seo";
import { articlesPublies, traductions } from "@/lib/serveur/blog/public";
import { adresseArticle } from "@/content/blog-site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [circuits, lieux, catalogue, equipe, seo] = await Promise.all([
    lireContenu("fr.tours"), lireContenu("fr.FICHES_LIEU"), lireCatalogue(), lireContenu("fr.equipe"), lireContenu("site.seo"),
  ]);
  const origine = origineSite();
  const chemins = ["/", "/devis", "/ouidah/histoire", "/mentions-legales", "/conditions-generales-de-vente", "/politique-de-confidentialite", "/rendez-vous", "/partenaires",
    ...(equipe.some(m => m.portrait) ? ["/a-propos"] : []),
    ...circuits.filter(c => !c.draft && c.duration !== null).map(c => `/circuits/${c.slug}`),
    ...Object.keys(lieux).map(slug => `/ouidah/lieux/${slug}`),
    ...(catalogue.produits.length ? ["/boutique", ...catalogue.produits.map(p => `/boutique/${p.slug}`)] : []),
  ].filter(chemin => seo.pages.find(p => p.chemin === chemin)?.indexer !== false);
  const sortie: MetadataRoute.Sitemap = chemins.flatMap(chemin => LANGUES.map(langue => ({ url: `${origine}${adresseLangue(chemin, langue)}`, alternates: { languages: alternances(chemin) } })));
  for (const langue of LANGUES) {
    let page = await articlesPublies(langue);
    if (page.total) sortie.push({ url: `${origine}${adresseLangue("/blog", langue)}` });
    for (let n = 1; n <= page.pages; n++) {
      if (n > 1) page = await articlesPublies(langue, { page: n });
      for (const a of page.articles) {
        const variantes = await traductions(a.id);
        sortie.push({ url: `${origine}${adresseArticle(a.langue, a.slug)}`, alternates: { languages: Object.fromEntries(variantes.map(v => [v.langue.toLowerCase(), `${origine}${adresseArticle(v.langue, v.slug)}`])) } });
      }
    }
  }
  // Le réglage s'applique aussi au blog et à ses traductions ajoutées après les pages générales.
  const indexable = (url: string) => seo.pages.find(p => p.chemin === sansLangue(new URL(url).pathname))?.indexer !== false;
  return sortie.filter(p => indexable(p.url)).map(p => ({
    ...p,
    ...(p.alternates?.languages ? { alternates: { languages: Object.fromEntries(Object.entries(p.alternates.languages).filter(([, url]) => typeof url === "string" && indexable(url))) } } : {}),
  }));
}
