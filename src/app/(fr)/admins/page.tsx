import type { Metadata } from "next";
import { Suspense } from "react";
import { equipe as T } from "@/content/equipe";
import { Entree } from "@/components/equipe/Entree";

// Entrée des administrateurs (maquette G « Le porte-badge », accent soleil). Jamais indexée, aucun lien depuis le site.
// La session est lue sous <Suspense> (cookies() au moment de la requête, jamais dans le rendu statique) ; un agent connecté
// y retrouve la connexion.
export const metadata: Metadata = { title: T.meta.admins, robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Entree role="admins" />
    </Suspense>
  );
}
