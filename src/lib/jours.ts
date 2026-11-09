// Calcul des dates en « jours » (numéro de jour depuis le 1er janvier 1970, en UTC) : aucune dérive de fuseau.
// Ouidah est à UTC+1 toute l'année (pas d'heure d'été).
import type { QuandEvenement } from "@/content/types";

export const JOUR = 864e5;
const DECALAGE_OUIDAH = 36e5;

export const jourDe = (y: number, mois0: number, jour: number) => Math.floor(Date.UTC(y, mois0, jour) / JOUR);
export const dateDuJour = (n: number) => new Date(n * JOUR);
export const iso = (n: number) => dateDuJour(n).toISOString().slice(0, 10);
export const jourOuidah = (ms: number) => Math.floor((ms + DECALAGE_OUIDAH) / JOUR);
export const minuitOuidah = (n: number) => n * JOUR - DECALAGE_OUIDAH;

// Dimanche de Pâques (algorithme de Meeus)
export function paques(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
  return jourDe(y, mois - 1, jour);
}

/** Premier et dernier jour de l'occurrence d'une année donnée. */
const jourIso = (s: string) => {
  const [y, m, j] = s.split("-").map(Number);
  return jourDe(y, m - 1, j);
};

export function occurrence(q: QuandEvenement, y: number): [number, number] {
  if (q.type === "editions") {
    // l'édition de l'année demandée, sinon la suivante annoncée, sinon la dernière connue
    const e = q.dates.map(([a, b]) => [jourIso(a), jourIso(b)] as [number, number]);
    const an = (n: number) => dateDuJour(n).getUTCFullYear();
    return e.find(([a]) => an(a) === y) ?? e.find(([a]) => an(a) > y) ?? e[e.length - 1];
  }
  if (q.type === "paques") {
    const p = paques(y);
    return [p + q.debut, p + q.fin];
  }
  const a = jourDe(y, q.mois - 1, q.jour);
  return [a, a + Math.max(1, q.jours) - 1];
}

/** Prochaine occurrence qui n'est pas encore terminée au jour `aujourdhui`. */
export function prochaine(q: QuandEvenement, aujourdhui: number): [number, number] {
  if (q.type === "editions") {
    const editions = q.dates.map(([a, b]) => [jourIso(a), jourIso(b)] as [number, number]).sort(([a], [b]) => a - b);
    return editions.find(([, fin]) => fin >= aujourdhui) ?? editions[editions.length - 1];
  }
  const y = dateDuJour(aujourdhui).getUTCFullYear();
  const cette = occurrence(q, y);
  return cette[1] >= aujourdhui ? cette : occurrence(q, y + 1);
}
