import { Suspense } from "react";
import { LienInvalide } from "@/components/suivi/LienInvalide";

// Écran du lien client faux ou incomplet, rendu par le notFound() de la page : la langue du navigateur est lue à la requête.
export default function NotFound() {
  return (
    <Suspense fallback={<div aria-hidden="true" className="h-20 bg-abyss" />}>
      <LienInvalide />
    </Suspense>
  );
}