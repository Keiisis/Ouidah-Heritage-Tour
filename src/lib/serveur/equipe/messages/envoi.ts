import "server-only";
import { appendFile } from "node:fs/promises";
import { headers } from "next/headers";
import { base } from "../../base";
import { courrielConfigure, envoyerCourriel } from "../../courriel";
import { modeLocal } from "../mode";
import { egaux, hmac, selConfigure } from "../outils";

// Voie d'envoi du lot « messages » : le SMTP d'OHT par le module commun (envoyerCourriel, lecture seule), ou, en local
// seulement (mode.ts : jamais sur Vercel ni hors localhost), la boîte du test EQUIPE_BOITE, fichier .jsonl hors du dépôt
// où l'e-mail est écrit au lieu de partir. Sans aucune des deux : null, et rien n'est enregistré comme envoyé.

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;

export async function voie(): Promise<{ boite: string | null } | null> {
  const local = modeLocal(process.env, (await headers()).get("host"), process.cwd());
  if (local.boite) return { boite: local.boite };
  return courrielConfigure() ? { boite: null } : null;
}

// modele : clé du journal des envois (courriel.ts) ; repondreA : adresse de réponse
export type Message = { a: string; sujet: string; html: string; texte: string; cle: string; modele?: string; repondreA?: string | null };

export async function partir(m: Message, boite: string | null): Promise<boolean> {
  if (boite) {
    try {
      await appendFile(boite, `${JSON.stringify({ type: "courriel", a: m.a, sujet: m.sujet, texte: m.texte, cle: m.cle, le: new Date().toISOString() })}\n`, "utf8");
      return true;
    } catch {
      return false;
    }
  }
  return envoyerCourriel(m);
}

/** Origine absolue des liens des e-mails : SITE_URL, sinon l'hôte local (poste de développement) ; null ailleurs. */
export async function origine(): Promise<string | null> {
  const conf = process.env.SITE_URL?.trim().replace(/\/$/, "");
  if (conf && /^https?:\/\/[^/\s]+$/.test(conf)) return conf;
  const h = (await headers()).get("host");
  return h && LOCAL.test(h) && !process.env.VERCEL ? `http://${h}` : null;
}

/** Adresse du compte connecté (destinataire des envois de test), lue en base. */
export async function emailDe(profilId: string): Promise<string | null> {
  try {
    const r = await base(`equipe_profils?select=email&id=eq.${profilId}&etat=eq.actif&limit=1`);
    return r.ok ? (((await r.json()) as { email: string }[])[0]?.email ?? null) : null;
  } catch {
    return null;
  }
}

/** Langues cochées dans la fiche du compte (signature des e-mails : « Parle français et anglais ») ; [] si illisibles. */
export async function languesDe(profilId: string): Promise<string[]> {
  try {
    const r = await base(`equipe_profils?select=langues&id=eq.${profilId}&limit=1`);
    const l = r.ok ? ((await r.json()) as { langues: unknown }[])[0]?.langues : null;
    return Array.isArray(l) ? l.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// ---------- jeton de désinscription de la lettre : <uuid de l'abonné>-<HMAC tronqué>, avec EQUIPE_SEL ----------
const FORME = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([0-9a-f]{32})$/;
const signer = (id: string) => hmac(`lettre|desinscription|${id}`).slice(0, 32);

export const jetonLettre = (abonneId: string) => (selConfigure() ? `${abonneId}-${signer(abonneId)}` : null);

export function lireJetonLettre(jeton: unknown): string | null {
  const m = typeof jeton === "string" ? FORME.exec(jeton) : null;
  if (!m || !selConfigure()) return null;
  return egaux(signer(m[1]), m[2]) ? m[1] : null;
}

// ---------- jeton de gestion de l'abonnement : <uuid>-<échéance en secondes, base 36>-<HMAC tronqué>, avec EQUIPE_SEL ----------
// Il change les thèmes et la langue, désinscrit, et donne un nouvel accord daté (réinscription) : il expire, à la
// différence du lien de désinscription, que les messageries suivent d'elles-mêmes (List-Unsubscribe) et qui ne fait que
// désinscrire. Signature distincte (« gestion ») : aucun des deux jetons ne vaut pour l'autre.
export const JOURS_GESTION = 30;
const FORME_GESTION = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([0-9a-z]{1,9})-([0-9a-f]{32})$/;
const signerGestion = (id: string, fin: string) => hmac(`lettre|gestion|${id}|${fin}`).slice(0, 32);

export function jetonGestion(abonneId: string, maintenant = Date.now()) {
  if (!selConfigure()) return null;
  const fin = Math.floor(maintenant / 1000 + JOURS_GESTION * 86_400).toString(36);
  return `${abonneId}-${fin}-${signerGestion(abonneId, fin)}`;
}

/** L'abonné d'un lien de gestion, et si son échéance est passée ; null pour un jeton faux ou modifié. */
export function lireJetonGestion(jeton: unknown, maintenant = Date.now()): { id: string; expire: boolean } | null {
  const m = typeof jeton === "string" ? FORME_GESTION.exec(jeton) : null;
  if (!m || !selConfigure() || !egaux(signerGestion(m[1], m[2]), m[3])) return null;
  return { id: m[1], expire: parseInt(m[2], 36) * 1000 <= maintenant };
}
