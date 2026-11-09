import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranRoles } from "@/components/espace/securite/EcranRoles";

// Rôles et droits (lot « securite ») : ce que chaque droit ouvre, droits par membre. Dossier fixe, sorti du [section] prérendu ; la session est lue sous <Suspense>. Un agent, ou personne, est
// renvoyé à l'entrée /admins. Jamais indexé.
export const metadata: Metadata = { title: `${section("admins", "roles")?.nom} · ${T.meta.suffixe.admins}`, robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EcranRoles />
    </Suspense>
  );
}
