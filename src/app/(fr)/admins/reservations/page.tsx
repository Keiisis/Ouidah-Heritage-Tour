import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranReservations } from "@/components/espace/terrain/EcranReservations";

// Réservations et billets des admins (lot terrain L5) : dossier fixe, sorti du [section] prérendu. La session est lue sous
// <Suspense> ; un agent, ou personne, est renvoyé à l'entrée /admins. Jamais indexé.
export const metadata: Metadata = { title: `${section("admins", "reservations")?.nom} · ${T.meta.suffixe.admins}`, robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EcranReservations />
    </Suspense>
  );
}
