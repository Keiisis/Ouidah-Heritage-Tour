import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranContenu } from "@/components/espace/contenu/EcranContenu";

// Contenu du site (agents avec le droit « site ») : sections en onglets (?section=), rubrique (?cle=), lues sous
// <Suspense> avec la session ; sans le droit, l'état « sans droit » ; sans session, retour à l'entrée /agents. Jamais indexé.
export const metadata: Metadata = { title: `${section("agents", "contenu")?.nom} · ${T.meta.suffixe.agents}`, robots: { index: false, follow: false } };

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={null}>
      <EcranContenu role="agents" recherche={searchParams} />
    </Suspense>
  );
}
