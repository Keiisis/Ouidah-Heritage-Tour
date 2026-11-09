import { metadonneesPage } from "@/lib/serveur/seo";
import type { Metadata } from "next";
import { PageLegale, pageLegale } from "@/components/legal/PageLegale";

async function metadataContenu(): Promise<Metadata> {
  const P = await pageLegale("/mentions-legales");
  return { title: P.metaTitre, description: P.metaDescription };
}

export default function Page() {
  return <PageLegale chemin="/mentions-legales" />;
}

export async function generateMetadata(...args: Parameters<typeof metadataContenu>): Promise<Metadata> {
  return metadonneesPage("/mentions-legales", await metadataContenu(...args));
}
