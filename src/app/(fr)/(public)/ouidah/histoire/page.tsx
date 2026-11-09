import { metadonneesPage } from "@/lib/serveur/seo";
import type { Metadata } from "next";
import { lireContenuPage as lireContenu } from "@/lib/serveur/contenu-page";
import { Histoire } from "@/components/histoire/Histoire";

// L'histoire de Ouidah : récit au défilement sur la carte du royaume de Whidah (1747) et le plan de la ville (1926).
async function metadataContenu(): Promise<Metadata> {
  const T = await lireContenu("histoire.histoirePage");
  return { title: T.metaTitre, description: T.metaDescription };
}

export default function Page() {
  return <Histoire />;
}

export async function generateMetadata(...args: Parameters<typeof metadataContenu>): Promise<Metadata> {
  return metadonneesPage("/ouidah/histoire", await metadataContenu(...args));
}
