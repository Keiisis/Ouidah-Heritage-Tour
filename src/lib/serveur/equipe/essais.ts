import "server-only";
import { base, compter } from "../base";
import { iso } from "./outils";

// Essais de l'équipe : verrou et rythme des codes, comptés en base (equipe_essais), par e-mail (HMAC) et par IP (empreinte
// salée). L'essai est noté AVANT d'être traité (échec par défaut, puis « réussi » si tout passe) : des envois simultanés
// ne passent pas sous le verrou. Même traitement que l'adresse corresponde à un compte ou non.
// Chaque seuil a son propre comptage filtré : des lignes qui ne comptent pas (codes envoyés en rafale) ne peuvent plus
// pousser hors d'une fenêtre tronquée celles qui comptent (audit sécurité du 25/11).
// - verrou : 5 échecs par e-mail ou par IP en 15 min → 429, même avec le bon mot de passe ;
// - codes : un seul par e-mail en 60 s (« trop_tot »), 5 par e-mail ou 10 par IP en 15 min.
export type TypeEssai = "connexion" | "code" | "verifier" | "nouveau";
const FENETRE = 15 * 60_000;

/** null si la base ne répond pas (on refuse alors : rien ne passe sans comptage). */
export async function noterEssai(type: TypeEssai, emailH: string, ipH: string): Promise<{ id: number; etat: "libre" | "verrou" | "trop_tot" } | null> {
  try {
    const r = await base("equipe_essais?select=id", { method: "POST", corps: { type, email_hash: emailH, ip_hash: ipH, reussi: type === "code" }, prefer: "return=representation" });
    const id = r.ok ? ((await r.json()) as { id: number }[])[0]?.id : undefined;
    if (!id) return null;
    const t = Date.now();
    const depuis = (ms: number) => `cree_le=gte.${encodeURIComponent(iso(t - ms))}&id=neq.${id}`;
    const nb = (filtres: string, ms = FENETRE) => compter("equipe_essais", `${depuis(ms)}&${filtres}`);
    const [echecsEmail, echecsIp] = await Promise.all([nb(`email_hash=eq.${emailH}&reussi=is.false`), nb(`ip_hash=eq.${ipH}&reussi=is.false`)]);
    if (echecsEmail === null || echecsIp === null) return null;
    if (echecsEmail >= 5 || echecsIp >= 5) return { id, etat: "verrou" };
    if (type === "code") {
      const [recent, codesEmail, codesIp] = await Promise.all([nb(`type=eq.code&email_hash=eq.${emailH}`, 60_000), nb(`type=eq.code&email_hash=eq.${emailH}`), nb(`type=eq.code&ip_hash=eq.${ipH}`)]);
      if (recent === null || codesEmail === null || codesIp === null) return null;
      if (recent > 0) return { id, etat: "trop_tot" };
      if (codesEmail >= 5 || codesIp >= 10) return { id, etat: "verrou" };
    }
    return { id, etat: "libre" };
  } catch {
    return null;
  }
}

export async function essaiReussi(id: number) {
  try {
    await base(`equipe_essais?id=eq.${id}`, { method: "PATCH", corps: { reussi: true }, prefer: "return=minimal" });
  } catch {
    // l'essai reste compté comme un échec : plus strict, jamais plus permissif
  }
}
