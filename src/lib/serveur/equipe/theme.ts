"use server";

import { base } from "../base";
import { lireSession } from "./session";

// Thème clair ou sombre de l'espace, gardé dans le profil (equipe_profils.theme) : le serveur le pose au rendu suivant,
// sans éclair de l'autre thème. Action serveur (contrôle d'origine de Next) qui relit la session elle-même : le
// navigateur ne choisit que la valeur, jamais le compte.
export async function enregistrerTheme(theme: unknown): Promise<boolean> {
  if (theme !== "clair" && theme !== "sombre") return false;
  const s = await lireSession();
  if (!s) return false;
  try {
    return (await base(`equipe_profils?id=eq.${encodeURIComponent(s.profilId)}`, { method: "PATCH", corps: { theme }, prefer: "return=minimal" })).ok;
  } catch {
    return false;
  }
}
