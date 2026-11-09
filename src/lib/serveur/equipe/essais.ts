import "server-only";
import { base } from "../base";
import { iso } from "./outils";

// Essais de l'équipe : verrou et rythme des codes, comptés en base (equipe_essais), par e-mail (HMAC) et par IP (empreinte
// salée). L'essai est noté AVANT d'être traité (échec par défaut, puis « réussi » si tout passe) : des envois simultanés
// ne passent pas sous le verrou. Même traitement que l'adresse corresponde à un compte ou non.
// - verrou : 5 échecs par e-mail ou par IP en 15 min → 429, même avec le bon mot de passe ;
// - codes : un seul par e-mail en 60 s (« trop_tot »), 5 par e-mail ou 10 par IP en 15 min.
export type TypeEssai = "connexion" | "code" | "verifier" | "nouveau";
type Ligne = { id: number; type: TypeEssai; reussi: boolean; cree_le: string; email_hash: string; ip_hash: string };
const FENETRE = 15 * 60_000;

/** null si la base ne répond pas (on refuse alors : rien ne passe sans comptage). */
export async function noterEssai(type: TypeEssai, emailH: string, ipH: string): Promise<{ id: number; etat: "libre" | "verrou" | "trop_tot" } | null> {
  try {
    const r = await base("equipe_essais?select=id", { method: "POST", corps: { type, email_hash: emailH, ip_hash: ipH, reussi: type === "code" }, prefer: "return=representation" });
    const id = r.ok ? ((await r.json()) as { id: number }[])[0]?.id : undefined;
    if (!id) return null;
    const t = Date.now();
    const l = await base(`equipe_essais?select=id,type,reussi,cree_le,email_hash,ip_hash&cree_le=gte.${encodeURIComponent(iso(t - FENETRE))}&or=(email_hash.eq.${emailH},ip_hash.eq.${ipH})&order=id.desc&limit=500`);
    if (!l.ok) return null;
    const autres = ((await l.json()) as Ligne[]).filter((x) => x.id !== id);
    const nb = (f: (x: Ligne) => boolean) => autres.filter(f).length;
    if (nb((x) => !x.reussi && x.email_hash === emailH) >= 5 || nb((x) => !x.reussi && x.ip_hash === ipH) >= 5) return { id, etat: "verrou" };
    if (type === "code") {
      if (autres.some((x) => x.type === "code" && x.email_hash === emailH && Date.parse(x.cree_le) > t - 60_000)) return { id, etat: "trop_tot" };
      if (nb((x) => x.type === "code" && x.email_hash === emailH) >= 5 || nb((x) => x.type === "code" && x.ip_hash === ipH) >= 10) return { id, etat: "verrou" };
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
