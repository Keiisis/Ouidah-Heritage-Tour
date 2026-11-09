import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranContenu } from "@/components/espace/contenu/EcranContenu";

// Contenu du site, section « legales » : dossier fixe, sorti du [section] prérendu. La session et la rubrique (?cle=) sont lues
// sous <Suspense> ; sans session admin, retour à l'entrée /admins. Jamais indexé.
export const metadata: Metadata = { title: `${section("admins", "legales")?.nom} · ${T.meta.suffixe.admins}`, robots: { index: false, follow: false } };

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={null}>
      <EcranContenu role="admins" section="legales" recherche={searchParams} />
    </Suspense>
  );
}
