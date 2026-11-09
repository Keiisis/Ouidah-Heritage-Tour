import { metadonneesPage } from "@/lib/serveur/seo";
import type { Metadata } from "next";
import { PageLegale, pageLegale } from "@/components/legal/PageLegale";

async function metadataContenu(): Promise<Metadata> {
  const P = await pageLegale("/politique-de-confidentialite");
  return { title: P.metaTitre, description: P.metaDescription };
}

export default function Page() {
  return <PageLegale chemin="/politique-de-confidentialite" />;
}

export async function generateMetadata(...args: Parameters<typeof metadataContenu>): Promise<Metadata> {
  return metadonneesPage("/politique-de-confidentialite", await metadataContenu(...args));
}
