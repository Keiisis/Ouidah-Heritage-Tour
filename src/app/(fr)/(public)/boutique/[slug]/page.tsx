import { metadonneesPage } from "@/lib/serveur/seo";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lireContenuPage as lireContenu, languePage } from "@/lib/serveur/contenu-page";
import { lireCatalogue, lireProduit, slugsProduits } from "@/lib/boutique";
import { Fiche } from "@/components/boutique/Fiche";

// Fiche produit /boutique/:slug. Les articles visibles sont rendus d'avance ; une adresse inconnue reçoit un vrai 404.
// Cache Components exige au moins un jeu de paramètres : sans article, une adresse témoin qui mène au 404.
// Le slug est lu avant tout <Suspense> (vrai 404) : la navigation vers une fiche peut attendre la page (doc Next 16, « instant »).
export const instant = false;

export async function generateStaticParams() {
  const slugs = await slugsProduits();
  return slugs.length ? slugs.map((slug) => ({ slug })) : [{ slug: "__aucun-article__" }];
}

async function metadataContenu({ params }: PageProps<"/boutique/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const langue = await languePage();
  const [p, c, T] = await Promise.all([lireProduit(slug, langue), lireCatalogue(langue), lireContenu("boutique.boutique")]);
  if (!p) return {};
  const nom = (l: { slug: string; nom: string }[], s: string) => l.find((x) => x.slug === s)?.nom ?? "";
  return { title: T.meta.fiche(p.nom), description: T.meta.ficheDescription(p.nom, nom(c.categories, p.categorie), nom(c.matieres, p.matiere)) };
}

export default async function Page({ params }: PageProps<"/boutique/[slug]">) {
  const { slug } = await params;
  const p = await lireProduit(slug, await languePage());
  if (!p) notFound();
  return <Fiche key={p.slug} p={p} />;
}

export async function generateMetadata(...args: Parameters<typeof metadataContenu>): Promise<Metadata> {
  const { slug } = await args[0].params;
  return metadonneesPage("/boutique/[slug]".replace("[slug]", encodeURIComponent(slug)), await metadataContenu(...args));
}
