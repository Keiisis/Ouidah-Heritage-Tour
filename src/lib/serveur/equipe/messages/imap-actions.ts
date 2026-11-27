"use server";
import { refresh } from "next/cache";
import { base } from "../../base";
import { exigerRole } from "../session";
import { UUID } from "../pilotage/regles";
import { droitsEffectifs } from "../securite/droits";
import { configurationImap, INTERVALLE_AUTO_S, synchroniserImap } from "./imap";

export async function releverBoite() {
  if (!await exigerRole("admins")) return { erreur: "acces" as const };
  const r = await synchroniserImap();
  refresh();
  return r;
}

/** Relève lancée par l'écran boîte tant qu'il est visible (Reception.tsx, toutes les 3 minutes) : pour qui voit les
 * courriels reçus (admin, ou agent avec le droit « demandes »), seulement si l'admin a activé la relève automatique
 * (imap_actif), et au plus une fois par INTERVALLE_AUTO_S pour toute l'équipe : la base refuse une relève en cours ou
 * trop récente (imap_reserver), même si le navigateur insiste. `releve` : heure de la dernière relève réussie. */
export async function releverBoiteAuto(): Promise<{ ok: true; nombre: number; releve: string | null } | { erreur: "acces" | "configuration" | "panne" | "occupe"; releve: string | null }> {
  const s = await exigerRole("agents");
  if (!s || (s.role !== "admin" && !droitsEffectifs(s.droits).demandes)) return { erreur: "acces", releve: null };
  const r = await synchroniserImap(true, INTERVALLE_AUTO_S);
  if ("ok" in r && r.nombre) refresh();
  const config = configurationImap();
  let releve: string | null = null;
  try {
    const l = config ? await base(`imap_releves?select=releve_le&boite=eq.${config.boite}`) : null;
    releve = l?.ok ? (((await l.json()) as { releve_le: string | null }[])[0]?.releve_le ?? null) : null;
  } catch {
    // heure inconnue : l'écran garde la sienne
  }
  return "ok" in r ? { ok: true, nombre: r.nombre, releve } : { erreur: r.erreur, releve };
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
