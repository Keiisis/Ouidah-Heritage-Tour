import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranModeles } from "@/components/espace/messages/EcranModeles";

// Lot L6 (messages) : dossier fixe, sorti du [section] prérendu. La session est lue sous <Suspense> ; sans elle (ou sans
// le rôle), retour à l'entrée /admins. Jamais indexé.
export const metadata: Metadata = { title: `${section("admins", "modeles")?.nom} · ${T.meta.suffixe.admins}`, robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EcranModeles />
    </Suspense>
  );
}
