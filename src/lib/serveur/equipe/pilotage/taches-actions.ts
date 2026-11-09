"use server";
import { refresh } from "next/cache";
import { base } from "../../base";
import { exigerRole } from "../session";

export async function reglerTache(nom: unknown, actif: unknown): Promise<boolean> {
  if (!await exigerRole("admins") || (nom !== "rapport_actif" && nom !== "imap_actif" && nom !== "purge_actif") || typeof actif !== "boolean") return false;
  try {
    const r = await base("reglages_transversaux?id=eq.true", { method: "PATCH", corps: { [nom]: actif }, prefer: "return=representation" });
    if (!r.ok || !(await r.json()).length) return false;
    refresh();
    return true;
  } catch { return false; }
}
