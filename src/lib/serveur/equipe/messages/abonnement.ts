"use server";

import { headers } from "next/headers";
import { lireContenu } from "@/lib/contenu";
import { estLangue } from "@/lib/langue";
import { base } from "../../base";
import { empreinteIp } from "../../garde";
import { lireJetonGestion, lireJetonLettre, origine } from "./envoi";
import { envoyerGestion } from "./gestion";

// Page « Votre abonnement à la lettre de Ouidah » (/lettre/abonnement/<jeton>) : sans session, le jeton de gestion signé
// (HMAC avec EQUIPE_SEL, 30 jours) désigne l'abonné. Rien ne change à l'affichage, seulement à ces actions. Chaque
// écriture vise l'état attendu (actif ou désinscrit) : si l'abonnement a changé entre-temps, rien n'est écrit (« etat »).
// La réinscription date un nouvel accord (consentement_le). L'adresse, la date d'inscription et l'empreinte ne changent
// jamais ici.

export type RetourAbonnement = "fait" | "etat" | "expire" | "incomplet" | "accord" | "erreur";

const maintenant = () => new Date().toISOString();

/** Langue et thèmes choisis, vérifiés contre les thèmes publiés ; null si incomplets. */
async function lireChoix(choix: unknown): Promise<{ langue: string; sujets: string[] } | null> {
  const o = choix && typeof choix === "object" ? (choix as Record<string, unknown>) : {};
  const newsletter = await lireContenu("fr.newsletter");
  const brut = Array.isArray(o.sujets) ? o.sujets : [];
  const sujets = [...new Set(brut.filter((s): s is string => typeof s === "string" && newsletter.sujets.some((x) => x.id === s)))];
  if (!estLangue(o.langue) || !sujets.length || sujets.length !== brut.length) return null;
  return { langue: o.langue, sujets };
}

/** PATCH conditionnel sur un abonné : « fait » si la ligne visée a changé, « etat » si elle n'était plus dans l'état attendu. */
async function ecrire(id: string, filtre: string, corps: Record<string, unknown>): Promise<RetourAbonnement> {
  try {
    const r = await base(`abonnes_lettre?id=eq.${id}&${filtre}&select=id`, { method: "PATCH", corps, prefer: "return=representation" });
    if (!r.ok) return "erreur";
    return ((await r.json()) as unknown[]).length ? "fait" : "etat";
  } catch {
    return "erreur";
  }
}

function abonne(jeton: unknown): { id: string } | "expire" | "erreur" {
  const j = lireJetonGestion(jeton);
  return !j ? "erreur" : j.expire ? "expire" : { id: j.id };
}

/** Abonné actif : nouvelle langue et nouveaux thèmes. */
export async function changerAbonnement(jeton: unknown, choix: unknown): Promise<RetourAbonnement> {
  const a = abonne(jeton);
  if (typeof a === "string") return a;
  const c = await lireChoix(choix);
  if (!c) return "incomplet";
  return ecrire(a.id, "desinscrit_le=is.null", { langue: c.langue, sujets: c.sujets, modifie_le: maintenant() });
}

/** Abonné actif : désinscription datée (il reste en base, il ne reçoit plus rien). */
export async function quitterLettre(jeton: unknown): Promise<RetourAbonnement> {
  const a = abonne(jeton);
  if (typeof a === "string") return a;
  const t = maintenant();
  return ecrire(a.id, "desinscrit_le=is.null", { desinscrit_le: t, modifie_le: t });
}

/** Abonné désinscrit : réinscription avec un nouvel accord daté, la langue et les thèmes choisis à nouveau. */
export async function reinscrire(jeton: unknown, choix: unknown, accord: unknown): Promise<RetourAbonnement> {
  const a = abonne(jeton);
  if (typeof a === "string") return a;
  if (accord !== true) return "accord";
  const c = await lireChoix(choix);
  if (!c) return "incomplet";
  const t = maintenant();
  return ecrire(a.id, "desinscrit_le=not.is.null", { desinscrit_le: null, consentement_le: t, langue: c.langue, sujets: c.sujets, modifie_le: t });
}

/** Depuis la page de désinscription (jeton permanent) : le lien de gestion part vers l'adresse de l'abonné elle-même,
 * jamais à l'écran. Mêmes bornes que le formulaire public (une fois par 24 h, 5 par heure et par connexion). */
export async function demanderLienGestion(jeton: unknown): Promise<"envoye" | "deja" | "erreur"> {
  const id = lireJetonLettre(jeton);
  if (!id) return "erreur";
  try {
    const [h, o] = await Promise.all([headers(), origine()]);
    return o ? await envoyerGestion({ id }, empreinteIp({ headers: h }), o) : "erreur";
  } catch {
    return "erreur";
  }
}
