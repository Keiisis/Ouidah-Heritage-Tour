import "server-only";
import { timingSafeEqual } from "node:crypto";
import { base } from "../../base";

export function cronAutorise(request: Request) {
  const secret = process.env.CRON_SECRET;
  const a = Buffer.from(request.headers.get("authorization") ?? ""), b = Buffer.from(`Bearer ${secret ?? ""}`);
  return Boolean(secret && secret.length >= 32 && a.length === b.length && timingSafeEqual(a, b));
}
export type ReglagesTaches = { rapport_actif: boolean; imap_actif: boolean; purge_actif: boolean };
export async function lireTaches(): Promise<ReglagesTaches | null> {
  try {
    const r = await base("reglages_transversaux?select=rapport_actif,imap_actif,purge_actif&id=eq.true");
    return r.ok ? (await r.json() as ReglagesTaches[])[0] ?? null : null;
  } catch { return null; }
}
export async function rpcTache<T>(nom: string, corps: Record<string, unknown>): Promise<{ valeur: T } | null> {
  try {
    const r = await base(`rpc/${nom}`, { method: "POST", corps });
    if (!r.ok) return null;
    // Fonction void : PostgREST répond 204 sans corps.
    const texte = await r.text();
    return { valeur: (texte ? JSON.parse(texte) : null) as T };
  } catch { return null; }
}
