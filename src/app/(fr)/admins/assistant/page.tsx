import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranAssistant } from "@/components/espace/reglages/EcranAssistant";

// assistant (lot « reglages ») : dossier fixe, sorti du [section] prérendu. La session est lue sous <Suspense> ; sans elle (ou
// avec le mauvais rôle), retour à l'entrée /admins. Jamais indexé.
export const metadata: Metadata = { title: `${section("admins", "assistant")?.nom} · ${T.meta.suffixe.admins}`, robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EcranAssistant />
    </Suspense>
  );
}
