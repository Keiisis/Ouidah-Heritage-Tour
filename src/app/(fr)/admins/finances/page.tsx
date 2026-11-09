import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranCompta } from "@/components/espace/finances/EcranCompta";

// Comptabilité et factures (lot L7) : dossier fixe, sorti du [section] prérendu. La session est lue sous <Suspense> ;
// le mois (?mois=AAAA-MM) n'est lu qu'après elle. Un agent, ou personne, est renvoyé à l'entrée /admins. Jamais indexé.
export const metadata: Metadata = { title: `${section("admins", "finances")?.nom} · ${T.meta.suffixe.admins}`, robots: { index: false, follow: false } };

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={null}>
      <EcranCompta recherche={searchParams} />
    </Suspense>
  );
}
