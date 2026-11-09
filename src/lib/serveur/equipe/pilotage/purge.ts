import "server-only";
import { purgerConversations } from "../../assistant/conversations";
import { base } from "../../base";
import { lireTaches } from "./taches";

/** Même politique que la boîte de réception ; aucune durée ajoutée aux autres données. */
export async function traiterPurge() {
  const reglages = await lireTaches();
  if (!reglages) return { erreur: "panne" as const };
  if (!reglages.purge_actif) return { ok: true as const, active: false, nombre: 0 };
  const nombre = await purgerConversations();
  try {
    const r = await base("equipe_journal", { method: "POST", corps: { action: "donnees.purge", profil_id: null, details: nombre === null ? { motif: "panne" } : { nombre } }, prefer: "return=minimal" });
    if (!r.ok || nombre === null) return { erreur: "panne" as const };
  } catch { return { erreur: "panne" as const }; }
  return { ok: true as const, active: true, nombre };
}
