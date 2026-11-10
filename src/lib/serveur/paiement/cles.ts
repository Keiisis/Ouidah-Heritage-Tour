import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { base, baseConfiguree } from "../base";

// Clés des passerelles et jeton e-MECeF saisis par un admin (table passerelles_cles, migration 20261115). Chaque valeur
// est chiffrée ici (AES-256-GCM, clé dérivée d'EQUIPE_SEL par HKDF-SHA256, ligne liée par « passerelle/champ ») et
// n'est déchiffrée que par le serveur. Lecture : valeur saisie en priorité, sinon la variable d'environnement du même nom
// (les variables Vercel déjà posées continuent de servir). `cle()` est synchrone : chaque point d'entrée appelle d'abord
// `chargerCles()` (relecture au plus toutes les 60 s, tout de suite après une saisie). Sans EQUIPE_SEL (32 caractères au
// moins) ni base : rien n'est lu ni saisi, l'environnement seul compte. Aucune valeur ne sort d'ici vers le navigateur.

export const CHAMPS_CLES = {
  kkiapay: ["KKIAPAY_PUBLIC_KEY", "KKIAPAY_PRIVATE_KEY", "KKIAPAY_SECRET_KEY", "KKIAPAY_WEBHOOK_SECRET", "KKIAPAY_SANDBOX"],
  fedapay: ["FEDAPAY_SECRET_KEY", "FEDAPAY_WEBHOOK_SECRET", "FEDAPAY_SANDBOX"],
  stripe: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  flutterwave: ["FLUTTERWAVE_SECRET_KEY", "FLUTTERWAVE_SECRET_HASH"],
  paystack: ["PAYSTACK_SECRET_KEY"],
  emcf: ["EMCF_JETON", "EMCF_ENVIRONNEMENT"],
} as const;
export type Porteur = keyof typeof CHAMPS_CLES;
export type SourceCle = "admin" | "vercel" | null;

const INFO = "oht/passerelles-cles/v1";
const DUREE = 60_000;
type Ligne = { passerelle: string; champ: string; valeur_chiffree: string; iv: string; tag: string };
let memo: { t: number; v: Map<string, string> } | null = null;

const cleDe = (sel: string | undefined) => (sel && sel.length >= 32 ? Buffer.from(hkdfSync("sha256", sel, Buffer.alloc(0), INFO, 32)) : null);
const lien = (passerelle: string, champ: string) => Buffer.from(`${passerelle}/${champ}`, "utf8");

export const estPorteur = (p: unknown): p is Porteur => typeof p === "string" && Object.hasOwn(CHAMPS_CLES, p);
export const estChamp = (p: Porteur, c: unknown): c is string => typeof c === "string" && (CHAMPS_CLES[p] as readonly string[]).includes(c);
/** Saisie possible : base configurée et EQUIPE_SEL assez long pour dériver la clé de chiffrement. */
export const saisiePossible = () => baseConfiguree() && (process.env.EQUIPE_SEL?.length ?? 0) >= 32;

export function chiffrer(valeur: string, passerelle: string, champ: string, sel = process.env.EQUIPE_SEL) {
  const k = cleDe(sel);
  if (!k) return null;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv).setAAD(lien(passerelle, champ));
  const valeur_chiffree = Buffer.concat([c.update(valeur, "utf8"), c.final()]).toString("base64");
  return { valeur_chiffree, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64") };
}

/** Valeur en clair, ou null (sel absent ou changé, ligne altérée ou déplacée vers un autre champ). */
export function dechiffrer(l: Ligne, sel = process.env.EQUIPE_SEL): string | null {
  const k = cleDe(sel);
  if (!k) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", k, Buffer.from(l.iv, "base64")).setAAD(lien(l.passerelle, l.champ));
    d.setAuthTag(Buffer.from(l.tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(l.valeur_chiffree, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export const oublierCles = () => {
  memo = null;
};

/** Relit les valeurs saisies (au plus toutes les 60 s, `frais` : tout de suite). Base muette : l'état connu est gardé. */
export async function chargerCles(frais = false): Promise<void> {
  if (!frais && memo && Date.now() - memo.t < DUREE) return;
  if (!saisiePossible()) {
    memo = null;
    return;
  }
  try {
    const r = await base("passerelles_cles?select=passerelle,champ,valeur_chiffree,iv,tag");
    if (!r.ok) return;
    const v = new Map<string, string>();
    for (const l of (await r.json()) as Ligne[]) {
      const d = dechiffrer(l);
      if (d !== null) v.set(`${l.passerelle}/${l.champ}`, d);
    }
    memo = { t: Date.now(), v };
  } catch {
    // base muette : valeurs déjà connues, sinon l'environnement
  }
}

/** Valeur saisie par un admin, sinon la variable d'environnement du même nom. */
export const cle = (passerelle: Porteur, champ: string): string | undefined => memo?.v.get(`${passerelle}/${champ}`) ?? process.env[champ];

/** D'où vient la valeur (jamais la valeur elle-même). */
export const sourceCle = (passerelle: Porteur, champ: string): SourceCle =>
  memo?.v.has(`${passerelle}/${champ}`) ? "admin" : process.env[champ]?.trim() ? "vercel" : null;

/** État des champs d'une passerelle pour l'écran admin : nom du champ et source seulement. */
export const etatCles = (passerelle: Porteur) => CHAMPS_CLES[passerelle].map((champ) => ({ champ: champ as string, source: sourceCle(passerelle, champ) }));

/** Valeur saisie relue : modes (sandbox, environnement) parmi leurs choix ; clés sur une ligne, 4096 caractères au plus. */
export function lireValeur(champ: string, brut: unknown): string | null {
  if (typeof brut !== "string") return null;
  const v = brut.trim();
  if (champ.endsWith("_SANDBOX")) return v === "true" || v === "false" ? v : null;
  if (champ === "EMCF_ENVIRONNEMENT") return v === "test" || v === "production" ? v : null;
  return v.length > 0 && v.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(v) ? v : null;
}

/** Enregistre (ou remplace) une valeur chiffrée ; false si le sel manque ou si la base refuse. */
export async function ecrireCle(passerelle: Porteur, champ: string, valeur: string, par: string): Promise<boolean> {
  const c = chiffrer(valeur, passerelle, champ);
  if (!c || !baseConfiguree()) return false;
  try {
    const r = await base("passerelles_cles?on_conflict=passerelle,champ", { method: "POST", corps: { passerelle, champ, ...c, modifie_le: new Date().toISOString(), modifie_par: par }, prefer: "resolution=merge-duplicates,return=minimal" });
    return r.ok;
  } catch {
    return false;
  } finally {
    oublierCles();
  }
}

/** Efface une valeur saisie : l'environnement reprend la main. */
export async function effacerCleBase(passerelle: Porteur, champ: string): Promise<boolean> {
  if (!baseConfiguree()) return false;
  try {
    const r = await base(`passerelles_cles?passerelle=eq.${passerelle}&champ=eq.${champ}`, { method: "DELETE", prefer: "return=minimal" });
    return r.ok;
  } catch {
    return false;
  } finally {
    oublierCles();
  }
}
