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

export type Message = { a: string; sujet: string; html: string; texte: string; cle: string };

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

// ---------- jeton de désinscription de la lettre : <uuid de l'abonné>-<HMAC tronqué>, avec EQUIPE_SEL ----------
const FORME = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([0-9a-f]{32})$/;
const signer = (id: string) => hmac(`lettre|desinscription|${id}`).slice(0, 32);

export const jetonLettre = (abonneId: string) => (selConfigure() ? `${abonneId}-${signer(abonneId)}` : null);

export function lireJetonLettre(jeton: unknown): string | null {
  const m = typeof jeton === "string" ? FORME.exec(jeton) : null;
  if (!m || !selConfigure()) return null;
  return egaux(signer(m[1]), m[2]) ? m[1] : null;
}
