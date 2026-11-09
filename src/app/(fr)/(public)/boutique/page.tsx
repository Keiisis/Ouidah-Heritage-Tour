import { metadonneesPage } from "@/lib/serveur/seo";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lireContenuPage as lireContenu } from "@/lib/serveur/contenu-page";
import { boutiqueOuverte } from "@/lib/boutique";
import { Boutique } from "@/components/boutique/Boutique";

// Page /boutique (maquette I). Catalogue vide : page introuvable (404), jamais une vitrine vide.
async function metadataContenu(): Promise<Metadata> {
  const T = await lireContenu("boutique.boutique");
  return { title: T.meta.titre, description: T.meta.description };
}

export default async function Page() {
  if (!(await boutiqueOuverte())) notFound();
  return <Boutique />;
}

export async function generateMetadata(...args: Parameters<typeof metadataContenu>): Promise<Metadata> {
  return metadonneesPage("/boutique", await metadataContenu(...args));
}
