"use server";

import { base } from "../../base";
import { lireJetonLettre } from "./envoi";

// Désinscription de La lettre de Ouidah, depuis le lien personnel de chaque numéro (/lettre/desinscription/<jeton>).
// Sans session : le jeton signé (HMAC avec EQUIPE_SEL) ne désigne qu'un abonné et ne se devine pas. La page ne désinscrit
// rien à l'affichage (un lecteur de liens ne désinscrit personne) : il faut ce clic. L'abonné reste en base, daté.
export async function desinscrire(jeton: unknown): Promise<"fait" | "deja" | "erreur"> {
  const id = lireJetonLettre(jeton);
  if (!id) return "erreur";
  try {
    const t = new Date().toISOString();
    const r = await base(`abonnes_lettre?id=eq.${id}&desinscrit_le=is.null&select=id`, { method: "PATCH", corps: { desinscrit_le: t, modifie_le: t }, prefer: "return=representation" });
    if (!r.ok) return "erreur";
    return ((await r.json()) as unknown[]).length ? "fait" : "deja";
  } catch {
    return "erreur";
  }
}
