import "server-only";
import { CONSERVATION_JOURS } from "@/content/espace-pilotage";
import { purgerConversations } from "../../assistant/conversations";
import { base } from "../../base";
import { lireTaches } from "./taches";

/** Lignes du journal des envois (courriels_journal) plus vieilles que CONSERVATION_JOURS ; false si la base ne répond pas. */
async function purgerJournalEnvois() {
  try {
    const avant = encodeURIComponent(new Date(Date.now() - CONSERVATION_JOURS * 86_400_000).toISOString());
    return (await base(`courriels_journal?cree_le=lt.${avant}`, { method: "DELETE", prefer: "return=minimal" })).ok;
  } catch {
    return false;
  }
}

/** Même politique que la boîte de réception ; le journal des envois (11/11) suit la même durée. */
export async function traiterPurge() {
  const reglages = await lireTaches();
  if (!reglages) return { erreur: "panne" as const };
  if (!reglages.purge_actif) return { ok: true as const, active: false, nombre: 0 };
  const [nombre, journal] = await Promise.all([purgerConversations(), purgerJournalEnvois()]);
  try {
    const r = await base("equipe_journal", { method: "POST", corps: { action: "donnees.purge", profil_id: null, details: nombre === null || !journal ? { motif: "panne" } : { nombre } }, prefer: "return=minimal" });
    if (!r.ok || nombre === null || !journal) return { erreur: "panne" as const };
  } catch { return { erreur: "panne" as const }; }
  return { ok: true as const, active: true, nombre };
}
