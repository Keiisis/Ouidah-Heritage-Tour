"use server";
import { refresh } from "next/cache";
import { base } from "../../base";
import { exigerRole } from "../session";
import type { RetourFin } from "./actions";
import { lireReglesFinancieres } from "./fiscalite-regles";

export async function enregistrerReglesFinancieres(brut: unknown): Promise<RetourFin> {
  const s = await exigerRole("admins");
  if (!s) return { erreur: "refuse" };
  const v = lireReglesFinancieres(brut);
  if (!v) return { erreur: "champs" };
  const r = await base("rpc/finances_regler", { method: "POST", corps: { p_tva_active: v.tva_active, p_tva_taux: v.tva_taux, p_commission_active: v.commission_active, p_commission_taux: v.commission_taux, p_par: s.profilId } }).catch(() => null);
  if (!r?.ok || (await r.json().catch(() => false)) !== true) return { erreur: "panne" };
  refresh();
  return { ok: true };
}
