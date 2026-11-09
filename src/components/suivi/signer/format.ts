// Mise en forme de l'écran de signature, commune au serveur et au navigateur : gabarits {x}, dates longues et heure de
// Ouidah (UTC+1 toute l'année ; mois écrits à la main pour HT et GCF, qu'Intl ne connaît pas), nombres, montant en
// lettres (français, orthographe traditionnelle, comme la maquette E).
const FUSEAU = "Africa/Porto-Novo";
export type Langage = { locale: string | null; mois?: readonly string[] };

export const remplir = (g: string, v: Record<string, string | number>) => g.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));

const instant = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
const parts = (d: Date, o: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: FUSEAU, hourCycle: "h23", ...o }).formatToParts(d).map((x) => [x.type, x.value]));
const jma = (d: Date) => {
  const p = parts(d, { day: "numeric", month: "numeric", year: "numeric" });
  return { j: p.day, m: Number(p.month) - 1, a: p.year };
};

export function jourLong(iso: string, L: Langage) {
  const d = instant(iso);
  if (!L.locale && L.mois) {
    const { j, m, a } = jma(d);
    return `${j} ${L.mois[m]} ${a}`;
  }
  return new Intl.DateTimeFormat(L.locale ?? "fr-FR", { timeZone: FUSEAU, day: "numeric", month: "long", year: "numeric" }).format(d);
}

/** Période d'un séjour, sans répéter le mois ni l'année communs (« 12–19 mars 2027 »). */
export function periode(debut: string, fin: string, L: Langage) {
  const a = instant(debut), b = instant(fin);
  if (!L.locale && L.mois) {
    const x = jma(a), y = jma(b);
    return x.m === y.m && x.a === y.a ? `${x.j} – ${y.j} ${L.mois[y.m]} ${y.a}` : `${jourLong(debut, L)} – ${jourLong(fin, L)}`;
  }
  return new Intl.DateTimeFormat(L.locale ?? "fr-FR", { timeZone: FUSEAU, day: "numeric", month: "long", year: "numeric" }).formatRange(a, b);
}

export function heure(iso: string, gabarit: string) {
  const p = parts(new Date(iso), { hour: "2-digit", minute: "2-digit" });
  return remplir(gabarit, { h: p.hour, m: p.minute });
}

export const nombre = (n: number, L: Langage) => new Intl.NumberFormat(L.locale ?? "fr-FR", { maximumFractionDigits: 0 }).format(n);

const U = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"];
const D: Record<number, string> = { 2: "vingt", 3: "trente", 4: "quarante", 5: "cinquante", 6: "soixante" };
const s100 = (n: number): string => {
  if (n < 17) return U[n];
  if (n < 20) return "dix-" + U[n - 10];
  const d = Math.floor(n / 10), u = n % 10;
  if (d === 7) return "soixante" + (u === 1 ? " et " : "-") + s100(10 + u);
  if (d === 9) return "quatre-vingt-" + s100(10 + u);
  if (d === 8) return u ? "quatre-vingt-" + U[u] : "quatre-vingts";
  return D[d] + (u === 0 ? "" : u === 1 ? " et un" : "-" + U[u]);
};
const s1000 = (n: number) => {
  const c = Math.floor(n / 100), r = n % 100;
  let s = c === 0 ? "" : c === 1 ? "cent" : U[c] + " cent" + (r ? "" : "s");
  if (r) s += (s ? " " : "") + s100(r);
  return s;
};
/** « trois cent quarante-cinq mille francs CFA » */
export function enLettres(n: number) {
  if (!n) return "zéro franc CFA";
  const m = Math.floor(n / 1e6), k = Math.floor(n / 1e3) % 1e3, r = n % 1e3, p: string[] = [];
  if (m) p.push(m === 1 ? "un million" : s1000(m) + " millions");
  if (k) p.push(k === 1 ? "mille" : s1000(k).replace(/(cent|vingt)s$/, "$1") + " mille");
  if (r) p.push(s1000(r));
  return p.join(" ") + (m && !k && !r ? " de" : "") + (n === 1 ? " franc CFA" : " francs CFA");
}
