import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranDonnees } from "@/components/espace/securite/EcranDonnees";

// Protection des données (lot « securite ») : registre, demandes des personnes, incidents, consentements. Dossier fixe, sorti du [section] prérendu ; la session est lue sous <Suspense>. Un agent, ou personne, est
// renvoyé à l'entrée /admins. Jamais indexé.
export const metadata: Metadata = { title: `${section("admins", "donnees")?.nom} · ${T.meta.suffixe.admins}`, robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EcranDonnees />
    </Suspense>
  );
}
