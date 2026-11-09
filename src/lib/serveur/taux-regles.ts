// Taux d'affichage uniquement : les montants de compte et d'encaissement restent des entiers XOF.
export const TAUX_EUR = 655.957;
export type SourceTaux = "bce" | "manuel";
export type TauxFige = { taux_eur: number; taux_usd: number | null; taux_usd_le: string | null; taux_usd_source: SourceTaux | null };

const JOUR = 86_400_000;
const dateValide = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;

/** Format v1 documenté : https://frankfurter.dev/v1/. Une réponse incohérente ne modifie jamais le taux enregistré. */
export function lireCoursBce(brut: unknown, maintenant = Date.now()): { taux: number; date: string } | null {
  if (!brut || typeof brut !== "object") return null;
  const x = brut as { base?: unknown; amount?: unknown; date?: unknown; rates?: { USD?: unknown } };
  if (x.base !== "EUR" || x.amount !== 1 || !dateValide(x.date) || x.date > new Date(maintenant).toISOString().slice(0, 10)) return null;
  const usd = x.rates?.USD;
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) return null;
  const taux = Math.round((TAUX_EUR / usd) * 1000) / 1000;
  return taux >= 100 && taux <= 5000 ? { taux, date: x.date } : null;
}

/** Le seuil est strict : exactement 5 % reste accepté. Calcul en millièmes pour éviter l'erreur flottante au seuil. */
export function ecartTauxExcessif(ancien: number | null, nouveau: number): boolean {
  if (ancien === null) return false;
  const a = Math.round(ancien * 1000), n = Math.round(nouveau * 1000);
  return Math.abs(n - a) * 100 > a * 5;
}

// Calendrier TARGET : week-ends, 1 janvier, vendredi saint, lundi de Pâques, 1 mai, 25 et 26 décembre.
// Source : https://www.ecb.europa.eu/ecb/contacts/working-hours/html/index.en.html
function paques(annee: number): number {
  const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return Date.UTC(annee, Math.floor(n / 31) - 1, n % 31 + 1);
}

export function joursOuvresDepuis(date: string | null, maintenant = Date.now()): number | null {
  const jour = date?.slice(0, 10);
  if (!dateValide(jour) || !Number.isFinite(maintenant)) return null;
  const debut = Date.parse(jour), fin = Math.floor(maintenant / JOUR) * JOUR;
  let n = 0;
  for (let t = debut + JOUR; t <= fin; t += JOUR) {
    const d = new Date(t), semaine = d.getUTCDay(), moisJour = d.toISOString().slice(5, 10), p = paques(d.getUTCFullYear());
    if (semaine !== 0 && semaine !== 6 && !["01-01", "05-01", "12-25", "12-26"].includes(moisJour) && t !== p - 2 * JOUR && t !== p + JOUR) n++;
  }
  return n;
}

export const tauxTropAncien = (date: string | null, maintenant = Date.now()) => (joursOuvresDepuis(date, maintenant) ?? Infinity) > 4;
