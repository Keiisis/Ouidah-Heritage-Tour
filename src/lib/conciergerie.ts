import { conciergerie as CONCIERGERIE } from "@/content/fr";
import type { QuestionConciergerie } from "@/content/types";

// Réponses de la conciergerie (section 9), gardées sur l'appareil. Lues par la section et par le dossier de voyage
// (/devis) ; l'événement prévient le dossier, déjà affiché, de relire (autre onglet : « storage »).
export type Reponses = Record<string, string[]>;
export const CLE_CONCIERGERIE = "oht-conciergerie";

export const passe = (q: QuestionConciergerie, v: string[]) => v.some((l) => q.options.find((o) => o.label === l)?.passe);

/** Réponses connues du contenu seulement (une option retirée dans l'admin disparaît). */
export function lireConciergerie(brut: string | null, Q = CONCIERGERIE): { reponses: Reponses; rang: number } {
  const reponses: Reponses = {};
  let rang = 0;
  try {
    const m = JSON.parse(brut ?? "null") as { reponses?: Record<string, unknown>; rang?: unknown } | null;
    for (const q of Q) {
      const v = m?.reponses?.[q.id];
      const ok = Array.isArray(v) ? v.filter((l): l is string => typeof l === "string" && q.options.some((o) => o.label === l)) : [];
      if (ok.length) reponses[q.id] = ok;
    }
    rang = Math.min(Q.length - 1, Math.max(0, Number(m?.rang) || 0));
  } catch {
    /* rien d'enregistré ou contenu illisible */
  }
  return { reponses, rang };
}

export function ecrireConciergerie(reponses: Reponses, rang: number) {
  try {
    localStorage.setItem(CLE_CONCIERGERIE, JSON.stringify({ reponses, rang }));
  } catch {
    /* navigation privée : réponses non gardées */
  }
  window.dispatchEvent(new Event(CLE_CONCIERGERIE));
}

/** Services demandés : réglés et pas « Pas besoin » / « J'ai déjà réservé ». */
export const servicesDemandes = (r: Reponses, Q = CONCIERGERIE) => Q.filter((q) => r[q.id]?.length && !passe(q, r[q.id]));
