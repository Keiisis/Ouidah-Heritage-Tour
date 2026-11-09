import { metadonneesPage } from "@/lib/serveur/seo";
import type { Metadata } from "next";
import { PageLegale, pageLegale } from "@/components/legal/PageLegale";

async function metadataContenu(): Promise<Metadata> {
  const P = await pageLegale("/conditions-generales-de-vente");
  return { title: P.metaTitre, description: P.metaDescription };
}

export default function Page() {
  return <PageLegale chemin="/conditions-generales-de-vente" />;
}

export async function generateMetadata(...args: Parameters<typeof metadataContenu>): Promise<Metadata> {
  return metadonneesPage("/conditions-generales-de-vente", await metadataContenu(...args));
}
