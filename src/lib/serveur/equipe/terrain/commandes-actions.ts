"use server";

import { refresh, revalidateTag } from "next/cache";
import { base } from "../../base";
import { ouvrirLienCommande, type RefusLienCommande } from "../../paiement/lien";
import { UUID } from "../dossiers-regles";
import { journaliser } from "../journal";
import { exigerDroit } from "../securite/droits";
import { exigerRole } from "../session";
import { peutPasser } from "../../machines";
import { ETATS_COMMANDE, type EtatCommande, type RetourCommande, SUIVANT, TRANSITIONS_COMMANDE } from "./regles";

// Avancée d'une commande boutique (lot terrain L5). Action serveur joignable par une requête forgée : CHAQUE appel relit
// la session. Seul le pas suivant de l'état ACTUEL en base est permis (a_confirmer → a_preparer → prete → remise), écrit
// avec l'état attendu dans le filtre : deux agents qui cliquent en même temps n'avancent la commande qu'une fois, jamais à
// rebours. Journal : la commande et son nouvel état. refresh() renvoie la liste à jour dans la même réponse.

export async function avancerCommande(id: unknown, depuis: unknown): Promise<RetourCommande> {
  return changerCommande(id, depuis, null);
}

export async function annulerCommande(id: unknown, depuis: unknown, motif: unknown): Promise<RetourCommande> {
  if (typeof motif !== "string" || motif.trim().length < 3 || motif.trim().length > 280) return { erreur: "champs" };
  return changerCommande(id, depuis, motif.trim());
}

export async function chiffrerCommande(id: unknown): Promise<RetourCommande> {
  const s = await exigerRole("admins");
  if (!s) return { erreur: "refuse" };
  if (typeof id !== "string" || !UUID.test(id)) return { erreur: "champs" };
  try {
    const r = await base("rpc/chiffrer_commande_boutique", { method: "POST", corps: { p_id: id, p_par: s.profilId } });
    if (!r.ok) return { erreur: "panne" };
    const fait = await r.json() as { ok?: boolean; erreur?: string };
    if (!fait.ok) return { erreur: (["refuse", "etat", "champs", "prix"] as const).find((e) => e === fait.erreur) ?? "panne" };
  } catch { return { erreur: "panne" }; }
  await journaliser("commande.chiffrage", s.profilId, null, { commande: id });
  refresh();
  return { ok: true };
}

/** Lien de paiement en ligne d'une commande confirmée, à envoyer au client : le même que son bouton « Payer en ligne »
 * (montant = total_xof relu en base, lien vivant réutilisé). Droit « Liens de paiement » ; rien n'est lu du navigateur
 * hormis l'identifiant. Renvoie le chemin /payer/<jeton>, complété par l'adresse du site côté écran. */
export async function lienPaiementCommande(id: unknown): Promise<{ ok: true; chemin: string } | { erreur: "refuse" | "champs" | RefusLienCommande }> {
  const s = await exigerDroit("liens");
  if (!s) return { erreur: "refuse" };
  if (typeof id !== "string" || !UUID.test(id)) return { erreur: "champs" };
  const r = await ouvrirLienCommande(id, s.profilId);
  if (!r.ok) return { erreur: r.erreur };
  await journaliser("lien.creation", s.profilId, null, { commande: id });
  return { ok: true, chemin: `/payer/${r.jeton}` };
}

async function changerCommande(id: unknown, depuis: unknown, motif: string | null): Promise<RetourCommande> {
  const s = await exigerDroit("boutique"); // droit de l'agent (lot « securite ») ; un admin les a tous
  if (!s) return { erreur: "refuse" };
  if (typeof id !== "string" || !UUID.test(id) || !ETATS_COMMANDE.includes(depuis as EtatCommande)) return { erreur: "champs" };
  const vers = motif ? "annulee" : SUIVANT[depuis as EtatCommande]?.vers;
  if (!vers || vers === depuis || !peutPasser(TRANSITIONS_COMMANDE, depuis as EtatCommande, vers)) return { erreur: "etat" };
  try {
    const r = await base("rpc/avancer_commande_boutique", { method: "POST", corps: { p_id: id, p_depuis: depuis, p_vers: vers, p_par: s.profilId, p_motif: motif } });
    if (!r.ok) return { erreur: "panne" };
    const fait = await r.json() as { ok?: boolean; erreur?: string };
    if (!fait.ok) return { erreur: (["refuse", "etat", "champs", "stock", "paiement", "prix"] as const).find((e) => e === fait.erreur) ?? "panne" };
  } catch {
    return { erreur: "panne" };
  }
  await journaliser("commande.statut", s.profilId, null, { commande: id, etape: vers });
  revalidateTag("boutique", "max");
  refresh();
  return { ok: true };
}
