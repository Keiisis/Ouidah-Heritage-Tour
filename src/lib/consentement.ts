"use client";

import { useSyncExternalStore } from "react";

// Choix du visiteur sur les services facultatifs (bandeau « Vos choix sur ce site »). Le reste du stockage du site est
// nécessaire (dossier de voyage, devise, panier, retour de paiement) et ne dépend pas de ce choix.
// cartes : fonds de carte chargés depuis OpenFreeMap (adresse IP) ; ville : ville approximative déduite de l'adresse IP ;
// mesure : pages vues comptées sans cookie ni identifiant (compteur d'OHT et Vercel Web Analytics), seulement avec l'accord.
// Un choix v1 (avant la mesure) reste valable avec mesure = false : on ne redemande donc pas l'avis à tout le monde.
export type Choix = { v: 2; cartes: boolean; ville: boolean; mesure: boolean; le: string };
type Options = { cartes: boolean; ville: boolean; mesure: boolean };
export const MEMOIRE_CONSENTEMENT = "oht-consentement";
const CHANGE = "oht-consentement";
const OUVRIR = "oht-consentement-ouvrir";

let brut: string | null = null;
let cache: Choix | null = null;
let memoire: Choix | null = null; // stockage bloqué : le choix tient le temps de la visite
function lire(): Choix | null {
  let s: string | null;
  try {
    s = localStorage.getItem(MEMOIRE_CONSENTEMENT);
  } catch {
    return memoire;
  }
  if (s !== brut) {
    brut = s;
    try {
      const c = s ? (JSON.parse(s) as { v?: number; cartes?: unknown; ville?: unknown; mesure?: unknown; le?: string }) : null;
      const base = c && (c.v === 1 || c.v === 2) && typeof c.cartes === "boolean" && typeof c.ville === "boolean";
      cache = base ? { v: 2, cartes: c.cartes as boolean, ville: c.ville as boolean, mesure: c.v === 2 && c.mesure === true, le: c.le ?? "" } : null;
    } catch {
      cache = null;
    }
  }
  return cache;
}

/** Choix enregistré, `null` sans choix, `undefined` pendant le rendu serveur (rien n'est encore connu). */
export function useConsentement(): Choix | null | undefined {
  return useSyncExternalStore(
    (f) => {
      window.addEventListener(CHANGE, f);
      window.addEventListener("storage", f);
      return () => {
        window.removeEventListener(CHANGE, f);
        window.removeEventListener("storage", f);
      };
    },
    lire,
    () => undefined,
  );
}

/** Lecture hors React (détection de la ville). */
export const choixActuel = () => (typeof window === "undefined" ? null : lire());

export function enregistrerChoix(c: Options) {
  const choix: Choix = { v: 2, cartes: c.cartes, ville: c.ville, mesure: c.mesure, le: new Date().toISOString() };
  // ancien cookie de l'assistant (accord retiré le 04/11, plus lu par le serveur) : effacé s'il reste
  document.cookie = "oht-ia=; Path=/; Max-Age=0; SameSite=Lax";
  try {
    localStorage.setItem(MEMOIRE_CONSENTEMENT, JSON.stringify(choix));
  } catch {
    memoire = choix; // non gardé : le bandeau reviendra à la prochaine visite
  }
  window.dispatchEvent(new Event(CHANGE));
}

/** Rouvre le bandeau (lien « Cookies » du pied de page). */
export const ouvrirChoix = () => window.dispatchEvent(new Event(OUVRIR));
export function surOuverture(f: () => void) {
  window.addEventListener(OUVRIR, f);
  return () => window.removeEventListener(OUVRIR, f);
}
