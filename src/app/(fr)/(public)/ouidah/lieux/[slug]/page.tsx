import { metadonneesPage } from "@/lib/serveur/seo";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lireContenuPage as lireContenu } from "@/lib/serveur/contenu-page";
import { lireContenu as lireContenuFrancais } from "@/lib/contenu";
import { donneesLieu } from "@/components/fiches/lieu/donnees";
import { FicheLieu } from "@/components/fiches/lieu/FicheLieu";

// Fiche lieu /ouidah/lieux/:slug, publiée pour les lieux de FICHES_LIEU (décision du 30/10/2026), rendue d'avance.
// Attendre le rendu complet des nouvelles adresses pour renvoyer le bon statut HTTP dès leur première visite.
export const instant = false;
export const ensureStatic = "navigation";

export async function generateStaticParams() {
  const fiches = await lireContenuFrancais("fr.FICHES_LIEU");
  const slugs = Object.keys(fiches);
  return (slugs.length ? slugs : ["__vide__"]).map((slug) => ({ slug }));
}

async function metadataContenu({ params }: PageProps<"/ouidah/lieux/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const d = await donneesLieu(slug);
  const T = await lireContenu("fiche-lieu.ficheLieu");
  return d ? { title: T.metaTitre(d.nom), description: d.description ?? undefined } : {};
}

export default async function Page({ params }: PageProps<"/ouidah/lieux/[slug]">) {
  const { slug } = await params;
  const d = await donneesLieu(slug);
  if (!d) notFound();
  return <FicheLieu d={d} />;
}

export async function generateMetadata(...args: Parameters<typeof metadataContenu>): Promise<Metadata> {
  const { slug } = await args[0].params;
  return metadonneesPage("/ouidah/lieux/[slug]".replace("[slug]", encodeURIComponent(slug)), await metadataContenu(...args));
}
