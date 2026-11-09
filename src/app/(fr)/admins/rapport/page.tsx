import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranRapport } from "@/components/espace/pilotage/EcranRapport";

// Rapport hebdomadaire (lot pilotage) : dossier fixe, sorti du [section] prérendu. La session est lue sous <Suspense> ; sans session
// valable, retour à l'entrée /admins. Jamais indexé.
export const metadata: Metadata = { title: `${section("admins", "rapport")?.nom} · ${T.meta.suffixe.admins}`, robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EcranRapport />
    </Suspense>
  );
}
