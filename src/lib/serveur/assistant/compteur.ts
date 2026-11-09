import "server-only";
import { base } from "../base";

// Mesure d'audience de l'assistant : une ligne par événement dans assistant_evenements (jour à l'heure de Ouidah posé par
// la base), SANS aucun identifiant de visiteur, de conversation, d'IP ni d'heure précise. Seulement avec l'accord
// « mesure » du visiteur, transmis par le widget : en-tête x-oht-mesure (questions, passages à un agent, routes
// api/assistant) ou envoi à api/mesure (ouverture, devis démarré).
export const EVENEMENTS = ["assistant_ouvert", "question_posee", "passage_agent", "devis_demarre"] as const;
export type Evenement = (typeof EVENEMENTS)[number];

/** Compte un événement ; false si l'événement est inconnu ou si la base ne répond pas (jamais d'erreur levée). */
export async function compter(evenement: Evenement): Promise<boolean> {
  if (!EVENEMENTS.includes(evenement)) return false;
  try {
    return (await base("assistant_evenements", { method: "POST", corps: { evenement }, prefer: "return=minimal" })).ok;
  } catch {
    return false;
  }
}
