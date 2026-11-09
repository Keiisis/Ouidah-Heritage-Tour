import { metadonneesPage } from "@/lib/serveur/seo";
import type { Metadata } from "next";
import { Suspense } from "react";
import { languePage } from "@/lib/serveur/contenu-page";
import { texteBlog, LANGUES_BLOG_SITE } from "@/content/blog-site";
import { lireContenu } from "@/lib/contenu";
import { articlesPublies, categories, PAR_PAGE } from "@/lib/serveur/blog/public";
import { Liste } from "@/components/blog/Liste";
import { ListeFiltree, VueParDefaut } from "@/components/blog/ListeFiltree";
import "@/components/blog/blog.css";

// Liste du blog /blog, page statique (servie par le CDN, régénérée quand l'étiquette « blog » expire, public.ts) : la
// liste complète de la langue, première page. Les filtres de l'adresse (?categorie=, ?page=) ne sont plus lus sur le
// serveur : ListeFiltree les lit dans le navigateur, sur les articles de la langue envoyés avec la page ; ?langue= est
// redirigé par next.config.ts.
export const ensureStatic = "navigation";

export default async function Page() {
  const langue = await languePage();
  const [copies, suivi, seo, premiere, cats, parLangue] = await Promise.all([
    lireContenu("blog-site.copiesBlog"),
    lireContenu("suivi.suivi"),
    lireContenu("site.seo", langue),
    articlesPublies(langue),
    categories(langue),
    Promise.all(LANGUES_BLOG_SITE.map(async (l) => ({ l, total: (await articlesPublies(l)).total }))),
  ]);
  const suite = await Promise.all(Array.from({ length: Math.max(0, premiere.pages - 1) }, (_, i) => articlesPublies(langue, { page: i + 2 })));
  const langues = parLangue.filter((x) => x.total > 0).map((x) => x.l);
  const mois = suivi[langue].mois;
  return (
    <>
      <Suspense fallback={null}>
        <ListeFiltree
          racine={langue}
          copies={copies}
          mois={mois}
          articles={[...premiere.articles, ...suite.flatMap((r) => r.articles)]}
          categories={cats}
          langues={langues}
          parPage={PAR_PAGE}
          titreFixe={Boolean(seo.pages.find((p) => p.chemin === "/blog")?.titre)}
        />
      </Suspense>
      <VueParDefaut>
        <Liste T={texteBlog(copies, langue)} mois={mois} langue={langue} categorie={null} resultat={premiere} categories={cats} langues={langues} />
      </VueParDefaut>
    </>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const T = texteBlog(await lireContenu("blog-site.copiesBlog"), await languePage());
  return metadonneesPage("/blog", { title: T.meta.titre, description: T.meta.description });
}
