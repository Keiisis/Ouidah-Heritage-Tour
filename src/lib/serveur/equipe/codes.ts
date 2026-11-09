import "server-only";
import { randomInt } from "node:crypto";
import { base } from "../base";
import { egaux, empreinteCode, iso, JETON_CODE_MS, nouveauJeton, sha256 } from "./outils";

// Codes à 6 chiffres (mot de passe oublié, première connexion) : tirés par crypto.randomInt, gardés en HMAC, valables
// 10 min (fixées par la base), 5 essais. Un nouveau code annule les précédents. Chaque essai est réservé en base avant la
// comparaison (mise à jour conditionnelle sur le compteur lu) : deux essais simultanés ne comptent jamais pour un.

/** Émet un code et le renvoie (pour l'e-mail seulement : il n'est jamais stocké ni journalisé en clair). */
export async function emettreCode(profilId: string): Promise<string | null> {
  try {
    const p = encodeURIComponent(profilId);
    const annulation = await base(`equipe_codes?profil_id=eq.${p}&consomme_le=is.null`, { method: "PATCH", corps: { consomme_le: iso(Date.now()) }, prefer: "return=minimal" });
    if (!annulation.ok) return null;
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const r = await base("equipe_codes", { method: "POST", corps: { profil_id: profilId, code_hmac: empreinteCode(profilId, code) }, prefer: "return=minimal" });
    return r.ok ? code : null;
  } catch {
    return null;
  }
}

/** Jeton court (à poser en cookie httpOnly) si le code est juste, encore valable et non utilisé ; sinon « faux ». */
export async function verifierCode(profilId: string, code: string): Promise<{ jeton: string } | "faux" | "panne"> {
  try {
    const t = Date.now();
    const r = await base(`equipe_codes?select=id,code_hmac,essais&profil_id=eq.${encodeURIComponent(profilId)}&consomme_le=is.null&expire_le=gt.${encodeURIComponent(iso(t))}&order=cree_le.desc&limit=1`);
    if (!r.ok) return "panne";
    const c = ((await r.json()) as { id: string; code_hmac: string; essais: number }[])[0];
    if (!c || c.essais >= 5) return "faux";
    const reserve = await base(`equipe_codes?id=eq.${c.id}&essais=eq.${c.essais}&consomme_le=is.null&select=id`, { method: "PATCH", corps: { essais: c.essais + 1 }, prefer: "return=representation" });
    if (!reserve.ok || !((await reserve.json()) as unknown[]).length) return "faux";
    if (!egaux(empreinteCode(profilId, code), c.code_hmac)) return "faux";
    const jeton = nouveauJeton();
    const fin = await base(`equipe_codes?id=eq.${c.id}&consomme_le=is.null&select=id`, {
      method: "PATCH",
      corps: { consomme_le: iso(t), jeton_hash: sha256(jeton), jeton_expire_le: iso(t + JETON_CODE_MS) },
      prefer: "return=representation",
    });
    return fin.ok && ((await fin.json()) as unknown[]).length ? { jeton } : "faux";
  } catch {
    return "panne";
  }
}

/** Consomme le jeton court (usage unique, mise à jour conditionnelle) et renvoie le profil qu'il désigne. */
export async function consommerJeton(jeton: string): Promise<string | null> {
  try {
    const t = iso(Date.now());
    const r = await base(`equipe_codes?jeton_hash=eq.${sha256(jeton)}&jeton_utilise_le=is.null&jeton_expire_le=gt.${encodeURIComponent(t)}&select=profil_id`, {
      method: "PATCH",
      corps: { jeton_utilise_le: t },
      prefer: "return=representation",
    });
    if (!r.ok) return null;
    return ((await r.json()) as { profil_id: string }[])[0]?.profil_id ?? null;
  } catch {
    return null;
  }
}
