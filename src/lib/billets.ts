"use client";

import { evenements as EVENEMENTS } from "@/content/fr";

// Billets d'événement choisis dans l'Agenda : une partie du dossier de voyage (« Votre voyage »), comme les dates, les
// lieux et les services. Payés au talon de l'Agenda ou sur /devis, dans le même envoi que l'accompagnement.
export type BilletChoisi = { evenement: string; formule: number; quantite: number };
export const CLE_BILLETS = "oht-billets";
export const QUANTITE_MAX = 10;

const lire = () => {
  try {
    return localStorage.getItem(CLE_BILLETS);
  } catch {
    return null;
  }
};

/** Billets connus du contenu seulement (un événement ou une formule retirés dans l'admin disparaissent). */
export function lireBillets(brut: string | null, evenements = EVENEMENTS): BilletChoisi[] {
  try {
    const l = JSON.parse(brut ?? "[]") as unknown;
    if (!Array.isArray(l)) return [];
    return l.flatMap((x) => {
      const b = x as Partial<BilletChoisi>;
      const e = evenements.find((v) => v.slug === b.evenement);
      const n = e?.offre.type === "billet" ? e.offre.categories.length : 1;
      return e && Number.isInteger(b.formule) && b.formule! >= 0 && b.formule! < n && Number.isInteger(b.quantite) && b.quantite! >= 1 && b.quantite! <= QUANTITE_MAX ? [{ evenement: e.slug, formule: b.formule!, quantite: b.quantite! }] : [];
    });
  } catch {
    return [];
  }
}

/** Un seul choix par événement : poser un billet remplace le précédent pour le même événement ; null le retire. */
export function poserBillet(evenement: string, choix: Omit<BilletChoisi, "evenement"> | null, evenements = EVENEMENTS) {
  const autres = lireBillets(lire(), evenements).filter((b) => b.evenement !== evenement);
  const liste = choix ? [...autres, { evenement, ...choix }] : autres;
  try {
    if (liste.length) localStorage.setItem(CLE_BILLETS, JSON.stringify(liste));
    else localStorage.removeItem(CLE_BILLETS);
  } catch {
    /* navigation privée : choix non gardé */
  }
  window.dispatchEvent(new Event(CLE_BILLETS));
}
