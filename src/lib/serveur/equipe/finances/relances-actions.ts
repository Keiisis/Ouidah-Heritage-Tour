"use server";

import { refresh } from "next/cache";
import { exigerRole } from "../session";
import { UUID } from "./regles";
import { traiterRelances, type RetourRelance } from "./relances";

export async function relancerFactures(factures: unknown, confirmation: unknown): Promise<RetourRelance> {
  const s = await exigerRole("admins");
  if (!s) return { erreur: "acces" };
  if (confirmation !== true || !Array.isArray(factures) || !factures.length || factures.length > 50 || factures.some((id) => typeof id !== "string" || !UUID.test(id))) return { erreur: "confirmation" };
  const r = await traiterRelances(s.profilId, factures);
  refresh();
  return r;
}
