import { metadonneesIntrouvable, metadonneesPage } from "@/lib/serveur/seo";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { languePage } from "@/lib/serveur/contenu-page";
import { normaliserLangue } from "@/lib/langue";
import { adresseArticle, texteBlog, lireSegment, LOCALES_BLOG } from "@/content/blog-site";
import { lireContenu } from "@/lib/contenu";
import { articlePublie, articlesPublies, traductions, type ArticlePublieDetail } from "@/lib/serveur/blog/public";
import { Article } from "@/components/blog/Article";
import { nomAuteur } from "@/components/blog/outils";

// Article /blog/<slug> (français) ou /<langue>/blog/<slug>. Les anciennes adresses sont redirigées. Mêmes règles que la fiche
// boutique : les articles récents de chaque langue sont rendus d'avance ; Cache Components exige au moins un jeu de
// paramètres, d'où une adresse témoin qui mène au 404 quand rien n'est publié. Le segment est lu avant tout <Suspense> et
// la première visite d'une adresse non listée attend la page complète (ensureStatic) : notFound() rend un vrai 404.
export const ensureStatic = "navigation";
export const instant = false;

type Props = { params: Promise<{ slug: string }> };

const ORIGINE = process.env.SITE_URL?.trim().replace(/\/$/, "") || "https://ouidahheritagetour.bj";
const absolue = (chemin: string) => `${ORIGINE}${chemin}`;

async function lire(params: Props["params"]) {
  const segment = (await params).slug;
  const ancien = lireSegment(segment);
  const langue = await languePage();
  if (ancien.slug !== segment) permanentRedirect(adresseArticle(ancien.langue, ancien.slug));
  return articlePublie(langue, segment);
}

export async function generateStaticParams({ params }: { params: Record<string, string> }) {
  const page = await articlesPublies(normaliserLangue(params.lang));
  const slugs = page.articles.map((a) => a.slug);
  return slugs.length ? slugs.map((slug) => ({ slug })) : [{ slug: "__aucun-article__" }];
}

const description = (a: ArticlePublieDetail) => a.seo.description ?? (a.chapo.length > 160 ? `${a.chapo.slice(0, 157).trimEnd()}…` : a.chapo);

async function metadataContenu({ params }: Props): Promise<Metadata | null> {
  const a = await lire(params);
  if (!a) return null;
  const T = texteBlog(await lireContenu("blog-site.copiesBlog"), a.langue);
  const langues = await traductions(a.id);
  const titre = a.seo.titre ?? T.meta.titreArticle(a.titre);
  const auteur = nomAuteur(a.auteur);
  return {
    title: titre,
    description: description(a) || T.meta.description,
    alternates: {
      canonical: absolue(adresseArticle(a.langue, a.slug)),
      ...(langues.length > 1 ? { languages: Object.fromEntries(langues.map((l) => [LOCALES_BLOG[l.langue].lang, absolue(adresseArticle(l.langue, l.slug))])) } : {}),
    },
    openGraph: {
      type: "article",
      title: a.seo.titre ?? a.titre,
      description: description(a) || undefined,
      url: absolue(adresseArticle(a.langue, a.slug)),
      siteName: "Ouidah Heritage Tour",
      locale: LOCALES_BLOG[a.langue].og,
      publishedTime: a.publieLe,
      modifiedTime: a.modifieLe,
      ...(auteur ? { authors: [auteur] } : {}),
      ...(a.categorie ? { section: a.categorie } : {}),
      ...(a.motsCles.length ? { tags: a.motsCles } : {}),
      ...(a.couverture ? { images: [{ url: a.couverture.src, alt: a.couverture.alt }] } : {}),
    },
    twitter: { card: a.couverture ? "summary_large_image" : "summary" },
  };
}

/** Données structurées BlogPosting (schema.org), sérialisées par JSON.stringify ; « < » échappé en <. */
function jsonLd(a: ArticlePublieDetail) {
  const auteur = nomAuteur(a.auteur);
  const organisation = { "@type": "Organization", name: "Ouidah Heritage Tour", url: ORIGINE, logo: { "@type": "ImageObject", url: absolue("/brand/oht-embleme.png") } };
  const donnees = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: a.titre,
    description: description(a) || undefined,
    inLanguage: LOCALES_BLOG[a.langue].lang,
    datePublished: a.publieLe,
    dateModified: a.modifieLe,
    mainEntityOfPage: { "@type": "WebPage", "@id": absolue(adresseArticle(a.langue, a.slug)) },
    url: absolue(adresseArticle(a.langue, a.slug)),
    author: auteur ? { "@type": "Person", name: auteur } : organisation,
    publisher: organisation,
    ...(a.couverture ? { image: [a.couverture.src] } : {}),
    ...(a.categorie ? { articleSection: a.categorie } : {}),
    ...(a.motsCles.length ? { keywords: a.motsCles.join(", ") } : {}),
    timeRequired: `PT${a.tempsLecture}M`,
  };
  return JSON.stringify(donnees).replace(/</g, "\\u003c");
}

export default async function Page({ params }: Props) {
  const a = await lire(params);
  if (!a) notFound();
  const [langues, memeCategorie] = await Promise.all([traductions(a.id), a.categorie ? articlesPublies(a.langue, { categorie: a.categorie }) : null]);
  const lies = (memeCategorie?.articles ?? []).filter((x) => x.id !== a.id).slice(0, 3);
  return (
    <>
      <Article a={a} langues={langues} lies={lies} />
      <script type="application/ld+json">{jsonLd(a)}</script>
    </>
  );
}

export async function generateMetadata(...args: Parameters<typeof metadataContenu>): Promise<Metadata> {
  const { slug } = await args[0].params;
  const contenu = await metadataContenu(...args);
  return contenu ? metadonneesPage("/blog/[slug]".replace("[slug]", encodeURIComponent(slug)), contenu) : metadonneesIntrouvable();
}
