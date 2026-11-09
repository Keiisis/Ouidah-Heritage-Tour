import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranCommandes } from "@/components/espace/terrain/EcranCommandes";

// Commandes boutique à préparer et à remettre (lot terrain L5) : dossier fixe, sorti du [section] prérendu. La session est
// lue sous <Suspense> ; sans elle, retour à l'entrée /agents. Jamais indexé.
export const metadata: Metadata = { title: `${section("agents", "commandes")?.nom} · ${T.meta.suffixe.agents}`, robots: { index: false, follow: false } };

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={null}>
      <EcranCommandes recherche={searchParams} />
    </Suspense>
  );
}
