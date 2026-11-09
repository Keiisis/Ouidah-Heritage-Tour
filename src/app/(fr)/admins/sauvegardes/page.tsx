import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranSauvegardes } from "@/components/espace/securite/EcranSauvegardes";

// Sauvegardes (lot « securite ») : export par table, JSON ou CSV, téléchargé par la route ./export. Dossier fixe, sorti du [section] prérendu ; la session est lue sous <Suspense>. Un agent, ou personne, est
// renvoyé à l'entrée /admins. Jamais indexé.
export const metadata: Metadata = { title: `${section("admins", "sauvegardes")?.nom} · ${T.meta.suffixe.admins}`, robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EcranSauvegardes />
    </Suspense>
  );
}
