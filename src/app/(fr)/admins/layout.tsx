import type { ReactNode } from "react";

// Espace admins : layout statique (aucune lecture de session ni d'adresse ici). [data-espace-equipe] masque l'habillage du
// site public (ChromeSite) ; la session est lue plus bas, sous <Suspense>, par chaque page.
export default function Layout({ children }: { children: ReactNode }) {
  return <div data-espace-equipe>{children}</div>;
}
