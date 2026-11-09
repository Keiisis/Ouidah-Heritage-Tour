import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranBoutique, type RechercheBoutique } from "@/components/espace/boutique/EcranBoutique";

// Articles de la boutique (agents avec le droit « boutique ») : même éditeur que les admins, sans la grille de livraison ;
// sans le droit, l'état « sans droit » ; sans session, retour à l'entrée /agents. Jamais indexé.
export const metadata: Metadata = { title: `${section("agents", "boutique")?.nom} · ${T.meta.suffixe.agents}`, robots: { index: false, follow: false } };

export default function Page({ searchParams }: { searchParams: Promise<RechercheBoutique> }) {
  return (
    <Suspense fallback={null}>
      <EcranBoutique role="agents" recherche={searchParams} />
    </Suspense>
  );
}
