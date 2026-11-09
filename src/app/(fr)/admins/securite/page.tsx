import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranSecurite } from "@/components/espace/securite/EcranSecurite";

// Pare-feu et sessions (lot « securite ») : dossier fixe, sorti du [section] prérendu. La session est lue sous <Suspense> ;
// les filtres du journal (?auteur=…&action=…&du=…&au=…) ne sont lus qu'après elle. Un agent, ou personne, est renvoyé à
// l'entrée /admins. Jamais indexé.
export const metadata: Metadata = { title: `${section("admins", "securite")?.nom} · ${T.meta.suffixe.admins}`, robots: { index: false, follow: false } };

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={null}>
      <EcranSecurite recherche={searchParams} />
    </Suspense>
  );
}
