import { Suspense, type ReactNode } from "react";
import { Coque } from "@/components/espace/Enveloppe";

// Espace agents : [data-espace-equipe] masque l'habillage du site public (ChromeSite). La coque (navigation, pied, palette)
// est rendue ici, sous <Suspense> (session lue à la requête) : elle reste en place d'une section à l'autre.
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div data-espace-equipe>
      <Suspense fallback={null}>
        <Coque role="agents">{children}</Coque>
      </Suspense>
    </div>
  );
}
