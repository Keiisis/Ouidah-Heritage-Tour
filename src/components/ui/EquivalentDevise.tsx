"use client";

import { prix } from "@/components/boutique/outils";
import { useLangue } from "@/components/ui/ContenuSite";
import { useDevise } from "@/lib/devise";

/** Équivalent, dans la devise choisie par le visiteur, d'un prix publié en FCFA (seul à faire foi) : « (≈ 68,60 €) ».
 * Rien en FCFA ni sans prix. Placé après le libellé du prix, qui garde ses traductions. */
export function EquivalentDevise({ xof }: { xof: number | null }) {
  const [devise, , , usd] = useDevise();
  const langue = useLangue();
  if (xof === null || devise === "FCFA") return null;
  return <> (≈ {prix(xof, devise, usd, langue)})</>;
}
