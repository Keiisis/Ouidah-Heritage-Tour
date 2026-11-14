import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { titreLienInvalide } from "@/components/suivi/LienInvalide";

// Cible du proxy pour un lien client faux ou incomplet (/suivi/<jeton>, /payer/<jeton>). Jamais indexée. Prérendue en PPR,
// la page servait 200 malgré le statut 404 de la réécriture : notFound() avant tout <Suspense> fige le 404 dès le prérendu
// (doc Next 16, notFound « before streaming starts »). L'écran lui-même est rendu par not-found.tsx du même segment ; le titre
// reste ici, car le rendu PPR lit les métadonnées de la page et non celles de not-found.tsx (constaté au build du 14/11).
export async function generateMetadata(): Promise<Metadata> {
  return { title: await titreLienInvalide(), robots: { index: false, follow: false } };
}

export default function Page() {
  notFound();
}