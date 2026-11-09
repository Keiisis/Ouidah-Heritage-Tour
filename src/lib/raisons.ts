import { tenReasons } from "@/content/fr";

// Raisons entourées (section 7), gardées sur l'appareil, lues aussi par le dossier de voyage (/devis).
export const CLE_RAISONS = "oht-raisons";

export function lireRaisons(brut: string | null, raisons = tenReasons): string[] {
  try {
    const m = JSON.parse(brut ?? "null") as unknown;
    return Array.isArray(m) ? m.filter((s): s is string => typeof s === "string" && raisons.some((r) => r.slug === s)) : [];
  } catch {
    return [];
  }
}

export function ecrireRaisons(slugs: string[]) {
  try {
    localStorage.setItem(CLE_RAISONS, JSON.stringify(slugs));
  } catch {
    /* navigation privée : non gardé */
  }
  window.dispatchEvent(new Event(CLE_RAISONS));
}
