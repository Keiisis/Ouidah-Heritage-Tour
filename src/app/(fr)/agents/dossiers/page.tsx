import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranDemandes } from "@/components/espace/EcranDemandes";

// Dossiers voyage de l'agent (lot L4) : ses demandes rangées par étape. Dossier fixe, sorti du [section] prérendu ; la
// session est lue sous <Suspense>. Jamais indexé.
export const metadata: Metadata = { title: `${section("agents", "dossiers")?.nom} · ${T.meta.suffixe.agents}`, robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EcranDemandes role="agents" vue="dossiers" />
    </Suspense>
  );
}
