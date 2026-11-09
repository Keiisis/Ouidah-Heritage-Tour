import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranDevis } from "@/components/espace/finances/EcranDevis";

// Devis de l'agent (lot L7) : dossier fixe, sorti du [section] prérendu. La session est lue sous <Suspense> ; sans elle (ou avec le
// mauvais rôle), retour à l'entrée /agents. Jamais indexé.
export const metadata: Metadata = { title: `${section("agents", "devis")?.nom} · ${T.meta.suffixe.agents}`, robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EcranDevis role="agents" />
    </Suspense>
  );
}
