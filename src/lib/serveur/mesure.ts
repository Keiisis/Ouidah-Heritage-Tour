import "server-only";
import { iso, jourOuidah } from "@/lib/jours";
import { base, compter } from "./base";
import type { Source } from "./mesure-regles";

// Mesure d'audience maison, côté serveur (clé secrète) : une vue de plus par compter_vue() (migration
// 20261104_audience.sql, jour posé par la base à l'heure de Ouidah), et les agrégats des écrans Statistiques et En direct.
// Règles pures (chemins, sources, langues, robots, limite) : mesure-regles.ts. Une lecture qui échoue rend null
// (« données indisponibles »), jamais un chiffre inventé.

/** Compte une vue déjà normalisée ; false si la base ne répond pas (jamais d'erreur levée). */
export async function compterVue(chemin: string, langue: string, source: Source): Promise<boolean> {
  try {
    return (await base("rpc/compter_vue", { method: "POST", corps: { p_chemin: chemin, p_langue: langue, p_source: source } })).ok;
  } catch {
    return false;
  }
}

type Ligne = { jour: string; chemin: string; langue: string; source: Source; vues: number };
export type Audience = {
  total: number;
  /** chaque jour de la période, du plus ancien à aujourd'hui, zéros compris */
  jours: [string, number][];
  pages: [string, number][];
  langues: [string, number][];
  sources: [Source, number][];
  /** questions posées à l'assistant sur la période (assistant_evenements) */
  questions: number;
  /** aucune vue mesurée depuis la mise en place (base vide) */
  jamais: boolean;
};

const PAGE = 1000; // plafond de lignes par réponse de l'API (réglage par défaut de Supabase)
const PAGES_MAX = 100;
const tri = <K>(lignes: Ligne[], cle: (l: Ligne) => K): [K, number][] =>
  [...lignes.reduce((m, l) => m.set(cle(l), (m.get(cle(l)) ?? 0) + l.vues), new Map<K, number>())].sort((a, b) => b[1] - a[1]);

/** Les `periode` derniers jours à l'heure de Ouidah (aujourd'hui compris), à l'heure de la requête `ms`. */
export async function lireAudience(periode: number, ms: number): Promise<Audience | null> {
  const debut = jourOuidah(ms) - periode + 1;
  const lignes: Ligne[] = [];
  try {
    for (let i = 0; i < PAGES_MAX; i++) {
      const r = await base(`audience_jours?select=jour,chemin,langue,source,vues&jour=gte.${iso(debut)}&order=jour,chemin,langue,source&limit=${PAGE}&offset=${i * PAGE}`);
      if (!r.ok) return null;
      const lot = (await r.json()) as Ligne[];
      lignes.push(...lot);
      if (lot.length < PAGE) break;
    }
    const questions = await compter("assistant_evenements", `evenement=eq.question_posee&jour=gte.${iso(debut)}`);
    if (questions === null) return null;
    const total = lignes.reduce((t, l) => t + l.vues, 0);
    let jamais = false;
    if (!total) {
      const r = await base("audience_jours?select=jour&vues=gt.0&limit=1");
      if (!r.ok) return null;
      jamais = ((await r.json()) as unknown[]).length === 0;
    }
    const parJour = new Map(tri(lignes, (l) => l.jour));
    return {
      total,
      jours: Array.from({ length: periode }, (_, i): [string, number] => [iso(debut + i), parJour.get(iso(debut + i)) ?? 0]),
      pages: tri(lignes, (l) => l.chemin).slice(0, 10),
      langues: tri(lignes, (l) => l.langue),
      sources: tri(lignes, (l) => l.source),
      questions,
      jamais,
    };
  } catch {
    return null;
  }
}
