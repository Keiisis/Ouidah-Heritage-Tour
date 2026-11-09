import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranPistes } from "@/components/espace/pilotage/EcranPistes";

// Pistes (lot pilotage) : dossier fixe, sorti du [section] prérendu. La session est lue sous <Suspense> ; les paramètres de
// l'adresse ne sont lus qu'après elle. Sans session valable, retour à l'entrée /agents. Jamais indexé.
export const metadata: Metadata = { title: `${section("agents", "pistes")?.nom} · ${T.meta.suffixe.agents}`, robots: { index: false, follow: false } };

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={null}>
      <EcranPistes recherche={searchParams} />
    </Suspense>
  );
}
