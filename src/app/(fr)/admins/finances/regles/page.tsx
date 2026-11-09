import { Suspense } from "react";
import type { Metadata } from "next";
import { fiscalite as F } from "@/content/espace-fiscalite";
import { EcranReglesFinancieres } from "@/components/espace/finances/EcranReglesFinancieres";

export const metadata: Metadata = { title: F.titre, robots: { index: false, follow: false } };
export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={null}><EcranReglesFinancieres recherche={searchParams} /></Suspense>;
}
