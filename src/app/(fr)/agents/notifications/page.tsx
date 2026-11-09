import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranNotifications } from "@/components/espace/messages/EcranNotifications";

// Lot L6 (messages) : dossier fixe, sorti du [section] prérendu. La session est lue sous <Suspense> ; sans elle (ou sans
// le rôle), retour à l'entrée /agents. Jamais indexé.
export const metadata: Metadata = { title: `${section("agents", "notifications")?.nom} · ${T.meta.suffixe.agents}`, robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EcranNotifications />
    </Suspense>
  );
}
