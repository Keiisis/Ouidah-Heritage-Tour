"use client";

import dynamic from "next/dynamic";

// La page introuvable est l'élément not-found du layout racine : Next le joint à chaque page et ferait précharger
// introuvable.css partout (accueil compris). Chargée à part, sa feuille ne part qu'avec la page introuvable rendue.
export const Introuvable = dynamic(() => import("./Introuvable").then((m) => m.Introuvable));
