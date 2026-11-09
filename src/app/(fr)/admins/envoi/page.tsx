import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranEnvoi } from "@/components/espace/reglages/EcranEnvoi";

// envoi (lot « reglages ») : dossier fixe, sorti du [section] prérendu. La session est lue sous <Suspense> ; sans elle (ou
// avec le mauvais rôle), retour à l'entrée /admins. Jamais indexé.
export const metadata: Metadata = { title: `${section("admins", "envoi")?.nom} · ${T.meta.suffixe.admins}`, robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EcranEnvoi />
    </Suspense>
  );
}
