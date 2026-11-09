"use client";

import { useSyncExternalStore } from "react";

// Préférence « mouvement réduit » lue sans écart d'hydratation (le serveur rend toujours la version animée).
const REQUETE = "(prefers-reduced-motion: reduce)";
const suivre = (cb: () => void) => {
  const mq = window.matchMedia(REQUETE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

export function useMouvementReduit() {
  return useSyncExternalStore(suivre, () => window.matchMedia(REQUETE).matches, () => false);
}

// Largeur d'écran (même principe) : vrai à partir de 1024 px.
const LARGE = "(min-width: 1024px)";
const suivreLarge = (cb: () => void) => {
  const mq = window.matchMedia(LARGE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

export function useEcranLarge() {
  return useSyncExternalStore(suivreLarge, () => window.matchMedia(LARGE).matches, () => false);
}
