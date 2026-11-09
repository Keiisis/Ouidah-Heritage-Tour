import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranBillets } from "@/components/espace/terrain/EcranBillets";

// Contrôle des billets (lot terrain L5) : dossier fixe, sorti du [section] prérendu. La session est lue sous <Suspense> ;
// sans elle, retour à l'entrée /agents. Jamais indexé.
export const metadata: Metadata = { title: `${section("agents", "billets")?.nom} · ${T.meta.suffixe.agents}`, robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EcranBillets />
    </Suspense>
  );
}
