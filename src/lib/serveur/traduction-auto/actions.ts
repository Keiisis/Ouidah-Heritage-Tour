"use server";
import { refresh } from "next/cache";
import { base } from "../base";
import { exigerRole } from "../equipe/session";
import { planifierTraductions } from "./planifier";
import { REGISTRE } from "@/lib/contenu-registre";
import { estContenuAuto } from "./moteur";
import { rpcTache } from "../equipe/pilotage/taches";

export async function reglerTraductions(form: FormData): Promise<boolean> {
  if (!await exigerRole("admins")) return false;
  const modele = form.get("modele"), glossaire = form.get("glossaire"), budget = Number(form.get("budget"));
  if (typeof modele !== "string" || !/^[A-Za-z0-9][A-Za-z0-9/._:-]{1,119}$/.test(modele)
    || typeof glossaire !== "string" || glossaire.length > 8000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(glossaire)
    || !Number.isSafeInteger(budget) || budget < 1000 || budget > 10_000_000) return false;
  try {
    const r = await base("traduction_auto_reglages?id=eq.true&select=id", { method: "PATCH", corps: { actif: form.get("actif") === "on", modele, budget_jour: budget, glossaire }, prefer: "return=representation" });
    if (!r.ok || !(await r.json() as unknown[]).length) return false;
    // Le trigger SQL remet atomiquement les documents en file si les consignes changent.
    planifierTraductions(); refresh(); return true;
  } catch { return false; }
}

export async function reprendreTraductions(): Promise<boolean> {
  if (!await exigerRole("admins")) return false;
  const r = await rpcTache("traduction_auto_initialiser", { p_cles: Object.keys(REGISTRE).filter(estContenuAuto), p_forcer: true });
  if (!r) return false;
  planifierTraductions(); refresh(); return true;
}
