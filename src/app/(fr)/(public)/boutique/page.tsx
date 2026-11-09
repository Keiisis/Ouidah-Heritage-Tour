import { metadonneesPage } from "@/lib/serveur/seo";
import type { Metadata } from "next";
import { lireContenuPage as lireContenu } from "@/lib/serveur/contenu-page";
import { Boutique } from "@/components/boutique/Boutique";

// Page /boutique (maquette I). Toujours en ligne (Kevin, 09/11) : catalogue vide = message ; un article publié depuis
// l'admin y apparaît aussitôt (updateTag("boutique") des actions de l'équipe).
async function metadataContenu(): Promise<Metadata> {
  const T = await lireContenu("boutique.boutique");
  return { title: T.meta.titre, description: T.meta.description };
}

export default async function Page() {
  return <Boutique />;
}

export async function generateMetadata(...args: Parameters<typeof metadataContenu>): Promise<Metadata> {
  return metadonneesPage("/boutique", await metadataContenu(...args));
}
