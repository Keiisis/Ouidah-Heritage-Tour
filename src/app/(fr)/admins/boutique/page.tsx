import type { Metadata } from "next";
import { Suspense } from "react";
import { espace as T, section } from "@/content/espace";
import { EcranBoutique, type RechercheBoutique } from "@/components/espace/boutique/EcranBoutique";

// Catalogue administrable et commandes : session et données lues sous Suspense, à chaque requête.
export const metadata: Metadata = {
  title: `${section("admins", "boutique")?.nom} · ${T.meta.suffixe.admins}`,
  robots: { index: false, follow: false },
};

export default function Page({ searchParams }: { searchParams: Promise<RechercheBoutique> }) {
  return (
    <Suspense fallback={null}>
      <EcranBoutique recherche={searchParams} />
    </Suspense>
  );
}
