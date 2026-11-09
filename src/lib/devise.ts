"use client";

import { useSyncExternalStore } from "react";
import { nav as NAV } from "@/content/fr";
import { useContenu } from "@/components/ui/ContenuSite";

// Devise d'affichage choisie par le visiteur, partagée entre l'en-tête, le pied de page et la boutique, gardée sur
// l'appareil (même onglet : événement ; autre onglet : « storage »).
// Le dollar n'a pas de parité fixe : son taux (FCFA pour 1 $) est saisi par un admin et lu une fois par visite sur
// /api/taux ; sans taux, USD n'est pas proposé et un choix USD gardé revient à la devise par défaut.
export const CLE_DEVISE = "oht-devise";
const CLE = CLE_DEVISE;
const CLE_TAUX = "oht-taux";

let usd: number | null = null;
let demande: Promise<void> | null = null;
const suivreTaux = (cb: () => void) => {
  demande ??= fetch("/api/taux")
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { usd?: unknown } | null) => {
      usd = typeof j?.usd === "number" && j.usd > 0 ? j.usd : null;
      window.dispatchEvent(new Event(CLE_TAUX));
    })
    .catch(() => {});
  window.addEventListener(CLE_TAUX, cb);
  return () => window.removeEventListener(CLE_TAUX, cb);
};
/** FCFA pour 1 $, null tant qu'aucun taux n'est saisi (ou pendant sa lecture). */
export const useTauxUsd = () => useSyncExternalStore(suivreTaux, () => usd, () => null);

const lire = () => {
  try {
    return localStorage.getItem(CLE);
  } catch {
    return null;
  }
};
const suivre = (cb: () => void) => {
  window.addEventListener(CLE, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CLE, cb);
    window.removeEventListener("storage", cb);
  };
};

/** [devise affichée, choisir, devises proposées, taux USD]. */
export function useDevise() {
  const nav = useContenu("fr.nav", NAV);
  const garde = useSyncExternalStore(suivre, lire, () => null);
  const taux = useTauxUsd();
  const devises = taux ? nav.currencies : nav.currencies.filter((c) => c.code !== "USD");
  const devise = garde && devises.some((c) => c.code === garde) ? garde : (devises[0]?.code ?? "FCFA");
  const choisir = (code: string) => {
    try {
      localStorage.setItem(CLE, code);
    } catch {
      /* navigation privée : choix non gardé */
    }
    window.dispatchEvent(new Event(CLE));
  };
  return [devise, choisir, devises, taux] as const;
}
