import { metadonneesPage } from "@/lib/serveur/seo";
import type { Metadata } from "next";
import { Suspense } from "react";
import { lireContenuPage as lireContenu } from "@/lib/serveur/contenu-page";
import { Coquille, Devis } from "@/components/devis/Devis";

// Créer mon voyage : formulaire unique (voyage, question, groupe — ?demande=…) en forme de billet, qui lit le dossier de
// voyage de l'accueil. La coquille (titre du billet) est dans le HTML dès la première réponse.
async function metadataContenu(): Promise<Metadata> {
  const T = await lireContenu("fr.devisPage");
  return { title: T.metaTitre, description: T.metaDescription };
}

export default function Page() {
  return (
    <div className="bt-page">
      <Suspense
        fallback={
          <div className="bt-scene">
            <Coquille />
          </div>
        }
      >
        <Devis />
      </Suspense>
    </div>
  );
}

export async function generateMetadata(...args: Parameters<typeof metadataContenu>): Promise<Metadata> {
  return metadonneesPage("/devis", await metadataContenu(...args));
}
