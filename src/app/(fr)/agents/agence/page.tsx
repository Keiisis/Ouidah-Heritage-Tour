import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranAgence } from "@/components/espace/finances/EcranManuels";

// Paiements reçus en agence (lot L7) : dossier fixe, sorti du [section] prérendu. La session est lue sous <Suspense> ; sans elle (ou avec le
// mauvais rôle), retour à l'entrée /agents. Jamais indexé.
export const metadata: Metadata = { title: `${section("agents", "agence")?.nom} · ${T.meta.suffixe.agents}`, robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EcranAgence />
    </Suspense>
  );
}
