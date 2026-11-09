import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranEquipe } from "@/components/espace/EcranEquipe";

// Écran Équipe des admins (lot L3) : dossier fixe, sorti du [section] prérendu. La session est lue sous <Suspense> ; un
// agent, ou personne, est renvoyé à l'entrée /admins (connexion G). Jamais indexé.
export const metadata: Metadata = { title: `${section("admins", "equipe")?.nom} · ${T.meta.suffixe.admins}`, robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EcranEquipe />
    </Suspense>
  );
}
