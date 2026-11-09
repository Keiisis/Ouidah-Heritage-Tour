import { metadonneesPage } from "@/lib/serveur/seo";
import type { Metadata } from "next";
import { lireContenuPage as lireContenu } from "@/lib/serveur/contenu-page";
import { QuiSommesNous } from "@/components/agence/QuiSommesNous";

// Qui sommes-nous : page toujours rendue ; non indexée tant qu'aucun vrai portrait n'est publié.
async function metadataContenu(): Promise<Metadata> {
  const [T, equipe] = await Promise.all([lireContenu("qui-sommes-nous.quiSommesNous"), lireContenu("fr.equipe")]);
  return {
    title: T.meta.titre,
    description: T.meta.description,
    ...(equipe.some((m) => m.portrait) ? {} : { robots: { index: false } }),
  };
}

export default function Page() {
  return <QuiSommesNous />;
}

export async function generateMetadata(...args: Parameters<typeof metadataContenu>): Promise<Metadata> {
  return metadonneesPage("/a-propos", await metadataContenu(...args));
}
