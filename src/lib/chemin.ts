"use client";

// Lieux gardés pour « Votre chemin » (section 5), sur l'appareil. La section 7 y ajoute les lieux des raisons entourées ;
// l'événement prévient « Votre chemin », déjà monté plus haut dans la page, de relire la sélection.
export const CLE_CHEMIN = "oht-chemin";
export const EVENEMENT_CHEMIN = "oht-chemin";

export function modifierChemin(ajouter: string[], retirer: string[], ouvrir = false) {
  try {
    const m = JSON.parse(localStorage.getItem(CLE_CHEMIN) ?? "null") as { gardes?: unknown; index?: unknown } | null;
    const avant = Array.isArray(m?.gardes) ? m.gardes.filter((s): s is string => typeof s === "string") : [];
    const gardes = [...avant.filter((s) => !retirer.includes(s)), ...ajouter.filter((s) => !avant.includes(s))];
    localStorage.setItem(CLE_CHEMIN, JSON.stringify({ gardes, index: Number(m?.index) || 0 }));
  } catch {
    /* navigation privée : sélection non gardée */
  }
  window.dispatchEvent(new CustomEvent(EVENEMENT_CHEMIN, { detail: { ouvrir } }));
}
