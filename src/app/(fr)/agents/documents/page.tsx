import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranDocuments } from "@/components/espace/pilotage/EcranDocuments";

// Documents des clients (lot pilotage) : dossier fixe, sorti du [section] prérendu. La session est lue sous <Suspense> ; sans session
// valable, retour à l'entrée /agents. Jamais indexé.
export const metadata: Metadata = { title: `${section("agents", "documents")?.nom} · ${T.meta.suffixe.agents}`, robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EcranDocuments />
    </Suspense>
  );
}
