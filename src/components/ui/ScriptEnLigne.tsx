"use client";

// Script en ligne lancé par le navigateur à la lecture du HTML (avant l'hydratation). Côté client, React ne l'exécute
// jamais et avertit s'il doit créer une balise <script> (changement de layout racine, page introuvable) : le type
// « text/plain » côté client en fait un bloc de données, sans avertissement ; suppressHydrationWarning couvre l'écart
// de type avec le HTML du serveur (méthode du guide Next « Preventing flash before hydration »).
export function ScriptEnLigne({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
