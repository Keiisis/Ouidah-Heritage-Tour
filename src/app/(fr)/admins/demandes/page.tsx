import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranDemandes } from "@/components/espace/EcranDemandes";

// Demandes (lot L4) : dossier fixe, sorti du [section] prérendu. La session est lue sous <Suspense> ; sans elle, retour à
// l'entrée /admins. Jamais indexé.
export const metadata: Metadata = { title: `${section("admins", "demandes")?.nom} · ${T.meta.suffixe.admins}`, robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EcranDemandes role="admins" />
    </Suspense>
  );
}
