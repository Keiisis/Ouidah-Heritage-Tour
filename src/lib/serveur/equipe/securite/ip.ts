import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { base } from "../../base";
import { empreinteIp } from "../../garde";

// Adresses IP bloquées sur les routes de l'équipe (lot « securite », table ip_bloquees). L'empreinte est celle de garde.ts
// (SHA-256 salée par EMPREINTE_SEL), la même que gardent equipe_essais et equipe_sessions : l'adresse en clair n'est
// jamais enregistrée. Le refus s'applique dans /api/equipe (connexion, codes) et dans lireSession (session.ts), donc à
// toutes les pages /agents et /admins et à toutes les actions serveur de l'espace. proxy.ts n'est pas touché.

export const EMPREINTE = /^[0-9a-f]{64}$/;

/** Empreinte d'une adresse IP, calculée exactement comme garde.ts (même fonction). */
export const empreinteDe = (ip: string) => empreinteIp(new Request("https://oht.invalid/", { headers: { "x-real-ip": ip } }));

/** Empreinte de l'adresse de la requête en cours (en-têtes posés par Vercel). */
export const empreinteRequete = cache(async () => empreinteIp(new Request("https://oht.invalid/", { headers: await headers() })));

/** Vrai si un blocage actif vise cette empreinte. Une base muette ne bloque personne : la session, elle, est alors déjà
 * refusée (même base), et un admin n'est jamais enfermé dehors par une panne de cette seule table. */
export async function ipBloquee(ipH: string): Promise<boolean> {
  if (!EMPREINTE.test(ipH)) return false;
  try {
    const r = await base(`ip_bloquees?select=id&ip_hash=eq.${ipH}&leve_le=is.null&or=(expire_le.is.null,expire_le.gt.${encodeURIComponent(new Date().toISOString())})&limit=1`);
    return r.ok && ((await r.json()) as unknown[]).length > 0;
  } catch {
    return false;
  }
}

/** La requête en cours vient-elle d'une adresse bloquée ? Mémorisé pendant un rendu (React cache). */
export const requeteBloquee = cache(async () => ipBloquee(await empreinteRequete()));
