import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranPerfs } from "@/components/espace/pilotage/EcranPerfs";

// Mes performances (lot pilotage) : dossier fixe, sorti du [section] prérendu. La session est lue sous <Suspense> ; les paramètres de
// l'adresse ne sont lus qu'après elle. Sans session valable, retour à l'entrée /agents. Jamais indexé.
export const metadata: Metadata = { title: `${section("agents", "performances")?.nom} · ${T.meta.suffixe.agents}`, robots: { index: false, follow: false } };

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={null}>
      <EcranPerfs role="agents" recherche={searchParams} />
    </Suspense>
  );
}
