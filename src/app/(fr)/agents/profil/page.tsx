import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranProfil } from "@/components/espace/reglages/EcranProfil";

// profil (lot « reglages ») : dossier fixe, sorti du [section] prérendu. La session est lue sous <Suspense> ; sans elle (ou
// avec le mauvais rôle), retour à l'entrée /agents. Jamais indexé.
export const metadata: Metadata = { title: `${section("agents", "profil")?.nom} · ${T.meta.suffixe.agents}`, robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EcranProfil />
    </Suspense>
  );
}
