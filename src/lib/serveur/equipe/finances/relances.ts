import "server-only";
import { langueDoc } from "@/lib/suivi";
import { base } from "../../base";
import { destinatairesAvis } from "../../courriel";
import { lireModele } from "../../courriels/commun";
import { origine, partir, voie } from "../messages/envoi";
import { journaliser } from "../journal";
import { exigerRole } from "../session";
import { jetonLien, lireReglages } from "./lectures";
import { peutPasser } from "../../machines";
import { type EtatRelance, TRANSITIONS_RELANCE, UUID } from "./regles";
import { avisRelance, courrielRelance, type DocumentRelance } from "./relances-courriel";

export type CandidateRelance = { facture_id: string; numero: string; client: string; depuis: string };
export type TentativeRelance = { id: string; facture_id: string; cree_le: string; traite_le: string | null; etat: EtatRelance; facture: { numero: string } | null };
export type RetourRelance = { ok: true; envoyees: number; ignorees: number; incertaines: number } | { erreur: "acces" | "confirmation" | "smtp" | "origine" | "panne" };

async function rpc<T>(nom: string, corps: Record<string, unknown>): Promise<{ valeur: T } | null> {
  try {
    const r = await base(`rpc/${nom}`, { method: "POST", corps });
    return r.ok ? { valeur: await r.json() as T } : null;
  } catch { return null; }
}

/** Les deux listes sont réservées à l'admin. Le cron n'utilise que les identifiants éligibles. */
export async function lireRelances(): Promise<{ candidates: CandidateRelance[]; tentatives: TentativeRelance[] } | null> {
  if (!await exigerRole("admins")) return null;
  try {
    const [c, t] = await Promise.all([
      rpc<CandidateRelance[]>("finances_relances_candidates", { p_facture: null }),
      base("finances_relances?select=id,facture_id,cree_le,traite_le,etat,facture:factures(numero)&order=cree_le.desc,id.desc&limit=30"),
    ]);
    if (!c || !Array.isArray(c.valeur) || !t.ok) return null;
    const tentatives = await t.json() as TentativeRelance[];
    return Array.isArray(tentatives) ? { candidates: c.valeur.slice(0, 50), tentatives } : null;
  } catch { return null; }
}

function documentValide(v: DocumentRelance | null): v is DocumentRelance {
  return Boolean(v && UUID.test(v.id) && UUID.test(v.facture) && UUID.test(v.devis) && typeof v.numero === "string" && v.numero.length > 0
    && typeof v.client?.nom === "string" && typeof v.client.langue === "string" && typeof v.client.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.client.email)
    && Number.isSafeInteger(v.montant) && v.montant > 0);
}

async function lienValide(d: DocumentRelance, site: string): Promise<string | null> {
  try {
    const r = await base(`liens_paiement?select=id,montant&devis_id=eq.${d.devis}&annule_le=is.null&paye_le=is.null&expire_le=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`);
    if (!r.ok) return null;
    const l = (await r.json() as { id: string; montant: number }[])[0];
    // Un lien au montant initial ne convient plus après un avoir ou un règlement partiel.
    const jeton = l && l.montant === d.montant ? jetonLien(l.id) : null;
    return jeton ? `${site}/payer/${jeton}` : null;
  } catch { return null; }
}

/** Appelé uniquement après contrôle du rôle admin ou du secret de la route. Pas de session fabriquée pour le cron. */
export async function traiterRelances(par: string | null, factures?: string[]): Promise<RetourRelance> {
  const reglages = await lireReglages();
  if (!reglages) return { erreur: "panne" };
  if (reglages.relance === null) return { ok: true, envoyees: 0, ignorees: 0, incertaines: 0 };
  const [envoi, site] = await Promise.all([voie(), origine()]);
  if (!envoi) return { erreur: "smtp" };
  if (!site) return { erreur: "origine" };
  let liste = factures;
  if (!liste) {
    const c = await rpc<CandidateRelance[]>("finances_relances_candidates", { p_facture: null });
    if (!c || !Array.isArray(c.valeur)) return { erreur: "panne" };
    liste = c.valeur.map((c) => c.facture_id);
  }
  if (!liste || liste.length > 50 || liste.some((id) => !UUID.test(id))) return { erreur: "panne" };
  const resultat = { ok: true as const, envoyees: 0, ignorees: 0, incertaines: 0 };
  for (const id of [...new Set(liste)].slice(0, 50)) {
    const reserve = await rpc<string | null>("finances_relance_reserver", { p_facture: id, p_par: par });
    if (!reserve) return { erreur: "panne" };
    if (!reserve.valeur) { resultat.ignorees++; continue; }
    if (!UUID.test(reserve.valeur)) return { erreur: "panne" };
    const tentative = reserve.valeur;
    const terminer = async (etat: EtatRelance, motif: string | null) => (peutPasser(TRANSITIONS_RELANCE, "reservee", etat) ? rpc<boolean>("finances_relance_terminer", { p_id: tentative, p_etat: etat, p_motif: motif }) : null);
    const verifie = await rpc<DocumentRelance | null>("finances_relance_verifier", { p_id: tentative });
    if (!verifie) return { erreur: "panne" }; // réservation conservée : aucun renvoi aveugle après une panne
    if (verifie.valeur === null) { resultat.ignorees++; continue; }
    if (!documentValide(verifie.valeur) || verifie.valeur.facture !== id || verifie.valeur.id !== tentative) {
      const fin = await terminer("ignoree", "donnees");
      if (!fin?.valeur) return { erreur: "panne" };
      resultat.ignorees++;
      continue;
    }
    const d = verifie.valeur;
    let parti = false, lien: string | null = null;
    try {
      const [l, modele] = await Promise.all([lienValide(d, site), lireModele("auto-relance", langueDoc(d.client.langue))]);
      lien = l;
      const m = courrielRelance(d, site, lien, reglages, modele);
      parti = await partir({ a: d.client.email, ...m, cle: `relance-${tentative}`, modele: "auto-relance" }, envoi.boite);
    } catch { /* Le SMTP peut avoir accepté le message avant la coupure : ne pas retenter automatiquement. */ }
    const fin = await terminer(parti ? "envoyee" : "incertaine", parti ? null : "transport");
    if (!fin?.valeur) return { erreur: "panne" };
    if (parti) {
      resultat.envoyees++;
      await journaliser("facture.envoi", par, null, { facture: id, cible: tentative, mode: "relance", langue: d.client.langue });
      // copie à l'équipe (destinataires des avis, EMAIL_OHT en secours) ; son échec ne change pas l'état de la relance
      const a = avisRelance(d, site, lien);
      const liste = await destinatairesAvis();
      await Promise.all(liste.map((x, i) => partir({ a: x, sujet: a.sujet, html: a.html, texte: a.texte, repondreA: d.client.email, cle: `relance-${tentative}-avis-${i}`, modele: "avis-relance" }, envoi.boite).catch(() => false)));
    } else resultat.incertaines++;
  }
  return resultat;
}
