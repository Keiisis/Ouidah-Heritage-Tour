import type { Metadata } from "next";
import { Suspense } from "react";
import { equipe as T } from "@/content/equipe";
import { Entree } from "@/components/equipe/Entree";

// Entrée des agents (maquette G « Le porte-badge », accent latérite). Jamais indexée, aucun lien depuis le site.
// La session est lue sous <Suspense> (cookies() au moment de la requête, jamais dans le rendu statique).
export const metadata: Metadata = { title: T.meta.agents, robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Entree role="agents" />
    </Suspense>
  );
}
