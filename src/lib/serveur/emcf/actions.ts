"use server";

import { refresh } from "next/cache";
import { langueDoc } from "@/lib/suivi";
import { base } from "../base";
import { exigerRole, type Session } from "../equipe/session";
import { journaliser } from "../equipe/journal";
import { factureAccessible } from "../equipe/finances/lectures";
import { UUID } from "../equipe/finances/regles";
import { ErreurEmcf, annulerFactureEmcf, configurationEmcf, confirmerFactureEmcf, lireFactureEmcf, lireGroupesTaxesEmcf, lireStatutEmcf, soumettreFactureEmcf, type GroupeTaxeEmcf, type TypePaiementEmcf } from "./client";
import { creerOperation, enregistrerResultat, lireOperation, lireOperationDocument, prendreOperation, type OperationEmcf } from "./operations";
import { demandeDepuisFacture, memeDemande } from "./regles";

export type RefusEmcf = "refuse" | "configuration" | "saisie" | "identite" | "fiscalite" | "source" | "base" | "transport" | "http" | "reponse" | "dgi" | "etat" | "total" | "incoherence" | "incertaine";
export type RetourEmcf = { ok: true; operation?: string; statut?: { ifu: string; nim: string; tokenValid: string }; groupes?: Record<string, number> } | { erreur: RefusEmcf };
const admin = async () => { const s = await exigerRole("admins"); return s?.role === "admin" ? s : null; };
const texte = (v: unknown): string | null => typeof v === "string" && v.trim() ? v.trim() : null;
const objet = (v: unknown): Record<string, unknown> => v instanceof FormData ? Object.fromEntries(v) : v && typeof v === "object" ? v as Record<string, unknown> : {};
const erreurDe = (e: unknown): RefusEmcf => e instanceof ErreurEmcf ? (e.incertain ? "incertaine" : e.code) : "base";

async function identite(langue = "FR") {
  const [r, n] = await Promise.all([
    base("reglages_documents?select=raison_sociale,forme,adresse,ifu,rccm,telephone,email,pied,mentions,signataire,fonction&id=eq.true&limit=1"),
    base("reglages_site?select=emcf_nim&id=eq.true&limit=1"),
  ]);
  if (!r.ok || !n.ok) throw new Error("base");
  const l = (await r.json())?.[0], nim = texte((await n.json())?.[0]?.emcf_nim);
  const ifu = texte(l?.ifu), raisonSociale = texte(l?.raison_sociale), adresse = texte(l?.adresse);
  if (!ifu || !/^\d{13}$/.test(ifu) || !nim || !/^[a-z\d-]{3,40}$/i.test(nim) || !raisonSociale || !adresse) return null;
  return { raisonSociale, adresse, ifu, nim, forme: texte(l.forme), rccm: texte(l.rccm), telephone: texte(l.telephone), email: texte(l.email), pied: texte(l.pied?.[langue] ?? l.pied?.FR), mentions: texte(l.mentions?.[langue] ?? l.mentions?.FR), signataire: texte(l.signataire), fonction: texte(l.fonction), signature: null, cachet: null };
}

async function compteConforme(ifu: string, nim: string) {
  const s = await lireStatutEmcf();
  return s.status && s.ifu === ifu && s.nim === nim && Date.parse(s.tokenValid) > Date.parse(s.serverDateTime) ? s : null;
}

export async function verifierConnexionEmcf(): Promise<RetourEmcf> {
  if (!await admin()) return { erreur: "refuse" };
  if (!(await configurationEmcf()).configure) return { erreur: "configuration" };
  try {
    const i = await identite(); if (!i) return { erreur: "identite" };
    const [s, groupes] = await Promise.all([compteConforme(i.ifu, i.nim), lireGroupesTaxesEmcf()]);
    return s ? { ok: true, statut: { ifu: i.ifu, nim: i.nim, tokenValid: s.tokenValid }, groupes } : { erreur: "identite" };
  } catch (e) { return { erreur: erreurDe(e) }; }
}

async function tracer(s: Session, op: OperationEmcf, etape: string) {
  await journaliser("reglages.emcf", s.profilId, null, { cible: op.id, facture: op.facture_id, mode: op.environnement, etape });
}

/** Prépare une demande DGI depuis une facture figée ; jamais un prix fourni par le navigateur. */
export async function preparerFactureEmcf(brut: unknown): Promise<RetourEmcf> {
  const s = await admin(); if (!s) return { erreur: "refuse" };
  const conf = await configurationEmcf(); if (!conf.configure) return { erreur: "configuration" };
  const v = objet(brut), factureId = texte(v.facture), avoirId = texte(v.avoir);
  if (!factureId || !UUID.test(factureId) || avoirId && !UUID.test(avoirId)) return { erreur: "saisie" };
  try {
    const existante = await lireOperationDocument(factureId, avoirId, conf.environnement);
    if (existante) { refresh(); return { ok: true, operation: existante.id }; }
    const f = await factureAccessible(s, factureId);
    if (f === "panne") return { erreur: "base" };
    if (!f) return { erreur: "source" };
    const i = await identite(f.client.langue); if (!i) return { erreur: "identite" };
    const [compte, taxes] = await Promise.all([compteConforme(i.ifu, i.nim), lireGroupesTaxesEmcf()]);
    if (!compte) return { erreur: "identite" };
    const operateur = { id: s.profilId, name: `${s.prenom} ${s.nom}`.trim() };
    const a = avoirId ? f.avoirs.find((x) => x.id === avoirId) : null;
    let requete;
    if (avoirId) {
      const parent = await lireOperationDocument(f.id, null, conf.environnement);
      if (!a || a.montant !== f.montant || f.avoirs.length !== 1 || !parent || parent.etat !== "confirmee" || !parent.securite || parent.ifu !== i.ifu || parent.identite.nim !== i.nim || parent.requete.type !== "FV" || new Set(parent.requete.items.map((l) => l.taxGroup)).size !== 1) return { erreur: "source" };
      requete = { ...parent.requete, type: "FA" as const, reference: parent.securite.codeMECeFDGI, operator: operateur };
    } else {
      requete = demandeDepuisFacture(f, v.groupe as GroupeTaxeEmcf, v.paiement as TypePaiementEmcf, taxes, i.ifu, operateur);
    }
    if (!requete || !f.fiscalite) return { erreur: "fiscalite" };
    const op = await creerOperation({ factureId, avoirId, environnement: conf.environnement, ifu: i.ifu, requete, identite: { ...i, documentNumero: a?.numero ?? f.numero, documentDate: a?.cree ?? f.emise, documentReference: a ? f.numero : `DEM-${f.demande.slice(0, 6).toUpperCase()}`, langue: langueDoc(f.client.langue), fiscalite: f.fiscalite }, creePar: s.profilId });
    if (!op) return { erreur: "base" };
    await tracer(s, op, "preparee"); refresh();
    return { ok: true, operation: op.id };
  } catch (e) { return { erreur: erreurDe(e) }; }
}

/** L'action explicite réserve la mutation en base avant l'appel. Un état réservé n'est jamais rejoué. */
export async function executerOperationEmcf(id: unknown, action: unknown): Promise<RetourEmcf> {
  const s = await admin(); if (!s) return { erreur: "refuse" };
  const conf = await configurationEmcf(); if (!conf.configure) return { erreur: "configuration" };
  if (typeof id !== "string" || !UUID.test(id) || !["envoyer", "confirmer", "annuler"].includes(String(action))) return { erreur: "saisie" };
  const commande = action as "envoyer" | "confirmer" | "annuler";
  const enCours = commande === "envoyer" ? "envoi" : commande === "confirmer" ? "confirmation" : "annulation";
  let reservee: OperationEmcf | null = null;
  try {
    const op = await lireOperation(id);
    if (!op || op.environnement !== conf.environnement) return { erreur: "etat" };
    if (commande === "annuler" && op.etat === "preparee") {
      const annulee = await prendreOperation(id, "preparee", "annulee");
      if (!annulee) return { erreur: "etat" };
      await tracer(s, annulee, "annulee"); refresh(); return { ok: true, operation: id };
    }
    if (op.etat !== (commande === "envoyer" ? "preparee" : "attente")) return { erreur: "etat" };
    if (!await compteConforme(op.ifu, String(op.identite.nim ?? ""))) return { erreur: "identite" };
    const f = await factureAccessible(s, op.facture_id);
    if (!f || f === "panne") return { erreur: "base" };
    if (commande !== "annuler" && (!f.fiscalite || (!op.avoir_id && (f.avoirs.length > 0 || f.statut === "annulee")) || (op.avoir_id && !f.avoirs.some((a) => a.id === op.avoir_id && a.montant === f.montant)))) return { erreur: "source" };
    if (commande === "confirmer") {
      if (!op.uid || op.calcul?.total !== f.montant) return { erreur: "total" };
      // Les montants de TVA du compte doivent aussi correspondre au snapshot comptable.
      if ((op.calcul.vab ?? 0) + (op.calcul.vad ?? 0) !== f.fiscalite!.tva || (op.calcul.aib ?? 0) !== 0 || (op.calcul.ts ?? 0) !== 0) return { erreur: "total" };
      if (!memeDemande(op.requete, await lireFactureEmcf(op.uid))) return { erreur: "incoherence" };
    }
    reservee = await prendreOperation(id, op.etat, enCours);
    if (!reservee) return { erreur: "etat" };
    if (commande === "envoyer") {
      const calcul = await soumettreFactureEmcf(reservee.requete);
      if (!await enregistrerResultat(id, enCours, { etat: "attente", uid: calcul.uid, calcul, erreur: calcul.total === f.montant ? null : "total" })) return { erreur: "base" };
    } else if (commande === "confirmer") {
      const securite = await confirmerFactureEmcf(reservee.uid!);
      if (securite.nim !== reservee.identite.nim) {
        await enregistrerResultat(id, enCours, { etat: "incertaine", erreur: "incoherence" });
        return { erreur: "incertaine" };
      }
      if (!await enregistrerResultat(id, enCours, { etat: "confirmee", securite, erreur: null })) return { erreur: "base" };
    } else {
      await annulerFactureEmcf(reservee.uid!);
      if (!await enregistrerResultat(id, enCours, { etat: "annulee", erreur: null })) return { erreur: "base" };
    }
    await tracer(s, reservee, commande); refresh(); return { ok: true, operation: id };
  } catch (e) {
    if (reservee) {
      const incertain = !(e instanceof ErreurEmcf) || e.incertain;
      await enregistrerResultat(id, enCours, { etat: incertain ? "incertaine" : "rejetee", erreur: e instanceof ErreurEmcf ? e.code : "base" }).catch(() => null);
    }
    refresh(); return { erreur: erreurDe(e) };
  }
}
