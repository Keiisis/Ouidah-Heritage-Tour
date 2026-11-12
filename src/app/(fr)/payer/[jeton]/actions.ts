"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { envoyerRecuLien } from "@/lib/serveur/courriels/recu";
import { lancerPaiementLien, verifierLien, type RetourLancement } from "@/lib/serveur/paiement/lien";

// Actions de la page publique d'un lien de paiement. Joignables par une requête forgée : le jeton signé est revérifié à
// chaque appel (lien.ts), la passerelle doit être proposée par le lien ET active, le montant n'est jamais lu ici, et une
// transaction proposée par le navigateur n'est qu'un indice relu auprès de la passerelle.
const JETON = /^l-[0-9a-f-]{36}-[A-Za-z0-9_-]{22}$/;
const TRANSACTION = /^[A-Za-z0-9_.:-]{1,120}$/;

/** Adresse publique du site (SITE_URL) ; hors production seulement, celle de la requête (essais locaux). */
async function origine(): Promise<string | null> {
  const conf = process.env.SITE_URL?.trim().replace(/\/$/, "");
  if (conf && /^https?:\/\/[^/\s]+$/.test(conf)) return conf;
  if (process.env.NODE_ENV === "production") return null;
  const h = await headers();
  const hote = h.get("host");
  return hote && /^[A-Za-z0-9.:[\]-]+$/.test(hote) ? `${h.get("x-forwarded-proto") === "https" ? "https" : "http"}://${hote}` : null;
}

export async function lancer(jeton: unknown, nom: unknown): Promise<RetourLancement> {
  if (typeof jeton !== "string" || !JETON.test(jeton) || typeof nom !== "string") return { ok: false, erreur: "lien" };
  const o = await origine();
  if (!o) return { ok: false, erreur: "passerelle_injoignable" };
  return lancerPaiementLien({ jeton, nom, origine: o });
}

export async function verifier(jeton: unknown, transaction: unknown): Promise<"paye" | "attente" | null> {
  if (typeof jeton !== "string" || !JETON.test(jeton)) return null;
  const o = await origine();
  // payé : reçu et avis à l'équipe après la réponse, une seule fois même si le webhook arrive aussi (marques en base)
  return verifierLien(jeton, typeof transaction === "string" && TRANSACTION.test(transaction) ? transaction : null, (id) => { if (o) after(() => envoyerRecuLien(id, o).catch(() => null)); });
}
