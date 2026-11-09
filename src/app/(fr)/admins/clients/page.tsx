import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranClients } from "@/components/espace/EcranClients";

// Clients (lot L4) : dossier fixe, sorti du [section] prérendu. La session est lue sous <Suspense> ; sans elle, retour à
// l'entrée /admins. Jamais indexé.
export const metadata: Metadata = { title: `${section("admins", "clients")?.nom} · ${T.meta.suffixe.admins}`, robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EcranClients role="admins" />
    </Suspense>
  );
}
