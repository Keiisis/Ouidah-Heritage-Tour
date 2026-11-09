import { notFound } from "next/navigation";
import DocumentSite from "@/components/ui/DocumentSite";
import { LANGUES_URL } from "@/lib/adresses-langues";
import type { Langue } from "@/lib/langue";
import { verifierMaintenance } from "@/lib/serveur/maintenance-page";
export { metadata } from "@/components/ui/DocumentSite";

export function generateStaticParams() {
  return LANGUES_URL.map((lang) => ({ lang }));
}

export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!LANGUES_URL.some((l) => l === lang)) notFound();
  await verifierMaintenance(lang.toUpperCase() as Langue);
  return <DocumentSite langue={lang.toUpperCase() as Langue}>{children}</DocumentSite>;
}
