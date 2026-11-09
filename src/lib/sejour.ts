"use client";

import { useMemo, useSyncExternalStore } from "react";

// Dates du séjour choisies par le visiteur (section 6), gardées sur l'appareil et reprises par « Votre chemin » (section 5).
// Arrivée et départ en numéros de jour (voir lib/jours).
export type Sejour = { arrivee: number; depart: number };
export const CLE_SEJOUR = "oht-dates";
const CLE = CLE_SEJOUR;
const EVENEMENT = CLE_SEJOUR;

const lire = () => {
  try {
    return localStorage.getItem(CLE);
  } catch {
    return null;
  }
};
const suivre = (cb: () => void) => {
  window.addEventListener(EVENEMENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENEMENT, cb);
    window.removeEventListener("storage", cb);
  };
};

export function ecrireSejour(s: Sejour | null) {
  try {
    if (s) localStorage.setItem(CLE, JSON.stringify(s));
    else localStorage.removeItem(CLE);
  } catch {
    /* navigation privée : dates non gardées */
  }
  window.dispatchEvent(new Event(EVENEMENT));
}

export function lireSejour(brut: string | null): Sejour | null {
  if (!brut) return null;
  try {
    const s = JSON.parse(brut) as Partial<Sejour>;
    return Number.isInteger(s.arrivee) && Number.isInteger(s.depart) && s.depart! > s.arrivee! ? { arrivee: s.arrivee!, depart: s.depart! } : null;
  } catch {
    return null;
  }
}

export function useSejour(): Sejour | null {
  const brut = useSyncExternalStore(suivre, lire, () => null);
  return useMemo(() => lireSejour(brut), [brut]);
}
