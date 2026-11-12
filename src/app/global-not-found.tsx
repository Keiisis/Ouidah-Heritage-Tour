import type { Metadata } from "next";
import DocumentSite from "@/components/ui/DocumentSite";
import { IntrouvableComplet } from "@/app/(fr)/not-found";
import { metadonneesIntrouvable } from "@/lib/serveur/seo";

// Titre d'onglet « Page introuvable », comme les autres 404 (aucun paramètre de langue ici : français).
export const generateMetadata = (): Promise<Metadata> => metadonneesIntrouvable("FR");

// Adresse hors de tout layout racine (aucun paramètre de langue) : même page que la 404 française, propositions comprises.
export default async function GlobalNotFound() {
  return (
    <DocumentSite langue="FR">
      <IntrouvableComplet langue="FR" />
    </DocumentSite>
  );
}
