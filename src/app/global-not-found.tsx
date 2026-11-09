import type { Metadata } from "next";
import DocumentSite from "@/components/ui/DocumentSite";
import { IntrouvableComplet } from "@/app/(fr)/not-found";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Adresse hors de tout layout racine (aucun paramètre de langue) : même page que la 404 française, propositions comprises.
export default async function GlobalNotFound() {
  return (
    <DocumentSite langue="FR">
      <IntrouvableComplet langue="FR" />
    </DocumentSite>
  );
}
