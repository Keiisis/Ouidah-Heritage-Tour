import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranManuels } from "@/components/espace/finances/EcranManuels";

// Paiements manuels des admins (lot L7) : dossier fixe, sorti du [section] prérendu. La session est lue sous <Suspense> ; sans elle (ou avec le
// mauvais rôle), retour à l'entrée /admins. Jamais indexé.
export const metadata: Metadata = { title: `${section("admins", "manuels")?.nom} · ${T.meta.suffixe.admins}`, robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EcranManuels />
    </Suspense>
  );
}
