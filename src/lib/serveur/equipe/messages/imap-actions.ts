"use server";
import { refresh } from "next/cache";
import { base } from "../../base";
import { exigerRole } from "../session";
import { UUID } from "../pilotage/regles";
import { synchroniserImap } from "./imap";

export async function releverBoite() {
  if (!await exigerRole("admins")) return { erreur: "acces" as const };
  const r = await synchroniserImap();
  refresh();
  return r;
}
export async function rattacherCourriel(id: unknown, dossier: unknown): Promise<boolean> {
  if (!await exigerRole("admins") || typeof id !== "string" || !UUID.test(id) || typeof dossier !== "string" || !UUID.test(dossier)) return false;
  try {
    const d = await base(`demandes?select=id&id=eq.${dossier}&statut=eq.envoyee`);
    if (!d.ok || !(await d.json()).length) return false;
    const r = await base(`courriels_recus?id=eq.${id}`, { method: "PATCH", corps: { demande_id: dossier }, prefer: "return=representation" });
    if (!r.ok || !(await r.json()).length) return false;
    refresh();
    return true;
  } catch { return false; }
}
