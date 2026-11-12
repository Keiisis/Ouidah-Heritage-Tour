import type { Metadata } from "next";
import { Suspense } from "react";
import { LienInvalide, titreLienInvalide } from "@/components/suivi/LienInvalide";

// Cible du proxy pour un lien client faux ou incomplet (/suivi/<jeton>, /payer/<jeton>), servie avec le statut 404. Langue :
// celle du navigateur (aucun dossier). Jamais indexée.
export async function generateMetadata(): Promise<Metadata> {
  return { title: await titreLienInvalide(), robots: { index: false, follow: false } };
}

export default function Page() {
  return (
    <Suspense fallback={<div aria-hidden="true" className="h-20 bg-abyss" />}>
      <LienInvalide />
    </Suspense>
  );
}
