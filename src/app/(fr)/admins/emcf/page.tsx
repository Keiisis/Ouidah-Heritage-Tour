import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranEmcf } from "@/components/espace/reglages/EcranEmcf";

// emcf (lot « reglages ») : dossier fixe, sorti du [section] prérendu. La session est lue sous <Suspense> ; sans elle (ou
// avec le mauvais rôle), retour à l'entrée /admins. Jamais indexé.
export const metadata: Metadata = { title: `${section("admins", "emcf")?.nom} · ${T.meta.suffixe.admins}`, robots: { index: false, follow: false } };

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={null}>
      <EcranEmcf recherche={searchParams} />
    </Suspense>
  );
}
