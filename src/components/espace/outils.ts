import { espace as T } from "@/content/espace";

// Outils purs de l'espace (serveur et navigateur) : montants, heures, course du soleil à Ouidah.

const nombre = new Intl.NumberFormat("fr-FR");
const monnaie = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
export const fcfa = (n: number) => `${nombre.format(n)} ${T.monnaie.fcfa}`;
export const euroDeFcfa = (n: number) => monnaie.format(n / T.taux);
export const euro = (n: number) => monnaie.format(n);
const deux = (n: number) => String(n).padStart(2, "0");
/** Minutes depuis minuit → « 09 h 15 ». */
export const hm = (m: number) => `${deux(Math.floor(m / 60) % 24)} h ${deux(Math.floor(m % 60))}`;

/** Minutes écoulées depuis minuit à Ouidah pour une minute « epoch » (UTC+1 toute l'année). */
export const minutesOuidah = (minute: number) => (((minute + T.ouidah.decalage) % 1440) + 1440) % 1440;

// Soleil à Ouidah (formules NOAA, celles de la maquette) : aube civile, lever, coucher, en minutes locales.
export type Soleil = { aube: number; lever: number; coucher: number };
export function soleil(minute: number): Soleil {
  const ms = minute * 60_000;
  const d = new Date(ms);
  const jour = Math.floor((ms - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5);
  const g = ((2 * Math.PI) / 365) * (jour - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const lat = (T.ouidah.lat * Math.PI) / 180;
  const midi = 720 - 4 * T.ouidah.lon - eq + T.ouidah.decalage;
  const angle = (h0: number) => (Math.acos((Math.sin((h0 * Math.PI) / 180) - Math.sin(lat) * Math.sin(dec)) / (Math.cos(lat) * Math.cos(dec))) * 180) / Math.PI;
  return { aube: midi - 4 * angle(-6), lever: midi - 4 * angle(-0.833), coucher: midi + 4 * angle(-0.833) };
}

// quatre lumières : aube (jusqu'à une heure après le lever), plein jour, fin d'après-midi (2 h 30 avant le coucher), nuit
export type Lumiere = "aube" | "jour" | "soir" | "nuit";
export const lumiere = (m: number, s: Soleil): Lumiere => (m < s.aube || m >= s.coucher ? "nuit" : m < s.lever + 60 ? "aube" : m < s.coucher - 150 ? "jour" : "soir");

/** Point de la course à la minute m : x de 0 à 1 (aube → coucher), hauteur h (1 au zénith, 0 à l'horizon, négative
 * avant le lever). */
export function surArc(m: number, s: Soleil) {
  const t = Math.max(s.aube, Math.min(s.coucher, m));
  return { x: (t - s.aube) / (s.coucher - s.aube), h: Math.sin((Math.PI * (t - s.lever)) / (s.coucher - s.lever)) };
}

// Date relative à l'heure de Ouidah, pour une minute « epoch » donnée (celle de la requête, puis l'horloge : même rendu
// côté serveur et à l'hydratation) : « à l'instant », « il y a 5 minutes », « il y a 3 heures », « hier », « il y a
// 3 jours », puis « le 28 octobre ».
const relatif = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
const leJour = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: T.ouidah.fuseau });
const jourOuidah = (ms: number) => Math.floor((ms / 60_000 + T.ouidah.decalage) / 1440);
export function ilYa(isoDate: string, minute: number) {
  const t = Date.parse(isoDate), maintenant = minute * 60_000;
  const m = Math.round((maintenant - t) / 60_000);
  if (m < 1) return T.equipe.instant;
  if (m < 60) return relatif.format(-m, "minute");
  if (m < 24 * 60) return relatif.format(-Math.floor(m / 60), "hour");
  const j = jourOuidah(maintenant) - jourOuidah(t);
  return j <= 6 ? relatif.format(-j, "day") : T.equipe.le(leJour.format(t));
}
