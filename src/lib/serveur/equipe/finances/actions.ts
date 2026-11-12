"use server";

import { createHash } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { langueDoc } from "@/lib/suivi";
import { base } from "../../base";
import { courrielConfigure, envoyerAvis, envoyerCourriel } from "../../courriel";
import { avisReservationAttente } from "../../courriels/avis";
import { passerellesActives } from "../../paiement";
import { journaliser } from "../journal";
import { modeLocal } from "../mode";
import { exigerDroit } from "../securite/droits";
import { exigerRole, type Session } from "../session";
import { lireContenu } from "@/lib/contenu";
import { lireModele } from "../../courriels/commun";
import { messageLien } from "../../courriels/lien";
import { origine, partir, voie } from "../messages/envoi";
import { courrielFacture } from "./documents";
import { pdfFinancier } from "./pdf";
import { apresEtat } from "./effets";
import { objetsPayables } from "./objets";
import { devisPayables, type DevisPayable, factureAccessible, jetonLien, lire, lireReglages, moisClos, secretLiens, voitTout } from "./lectures";
import { aujourdhuiOuidah, champsDe, etatLien, JUSTIFICATIF_MAX, lireAvoir, lireCoordonnees, lireDepense, lireLien, lireMotif, lirePaiement, lirePrix, moisCourant, moisValide, TRANSITIONS_PAIEMENT, typeJustificatif, UUID } from "./regles";
import { peutPasser } from "../../machines";
import { TRANSITIONS_RESERVATION } from "../../paiement/types";

// Écritures du lot « finances » (L7). Actions serveur (contrôle d'origine de Next) joignables par une requête forgée :
// CHAQUE appel relit la session et le rôle, relit ses entrées avec les règles partagées (regles.ts), puis relit l'objet
// visé avec le filtre de l'agent (lectures.ts) ; ce qui n'est pas à lui est « introuvable » et rien n'est écrit. Les
// montants d'une facture et d'un lien viennent du devis, recalculés par le serveur et la base : aucun montant ni acompte
// n'est lu du navigateur. Confirmer, rejeter, corriger, émettre un avoir, clore un mois, la grille et les coordonnées :
// admin seulement. Chaque écriture va au journal (objet touché, jamais un montant, une référence ni une coordonnée).

export type RefusFin =
  | "refuse" | "admin" | "champs" | "panne" | "introuvable" | "etat" | "doublon" | "justificatif" | "justificatifVirement" | "mois_clos"
  | "soi" | "montant" | "devis" | "passerelles" | "secret" | "smtp" | "envoi" | "annulee" | "termine" | "deja" | "attente";
export type RetourFin = { ok: true; numero?: string; montant?: number; etat?: string; ecart?: number; envoi?: "envoye" | "echec" } | { erreur: RefusFin; champs?: string[] };

const maintenant = () => new Date().toISOString();

async function ecrire<R = unknown>(chemin: string, method: "POST" | "PATCH", corps: unknown): Promise<{ lignes: R[] } | { status: number } | null> {
  try {
    const r = await base(chemin, { method, corps, prefer: "return=representation" });
    if (!r.ok) return { status: r.status };
    return { lignes: (await r.json()) as R[] };
  } catch {
    return null;
  }
}
async function rpc<R>(fonction: string, corps: Record<string, unknown>): Promise<R | null | "panne"> {
  try {
    const r = await base(`rpc/${fonction}`, { method: "POST", corps });
    if (!r.ok) return "panne";
    return (await r.json()) as R | null;
  } catch {
    return "panne";
  }
}
const lignes = <R>(x: { lignes: R[] } | { status: number } | null): R[] | null => (x && "lignes" in x ? x.lignes : null);

/** Session admin, ou le refus à renvoyer (personne : « refuse » ; agent : « admin »). */
async function admin(): Promise<Session | { erreur: RefusFin }> {
  const s = await exigerRole("agents");
  if (!s) return { erreur: "refuse" };
  if (!voitTout(s)) {
    await journaliser("finances.refus", s.profilId, null, { motif: "role" });
    return { erreur: "admin" };
  }
  return s;
}

/** Justificatif déposé dans le stockage privé de la base : type lu dans les octets, 900 Ko au plus. */
async function deposer(f: File, par: string): Promise<string | "invalide" | null> {
  if (f.size < 1 || f.size > JUSTIFICATIF_MAX) return "invalide";
  const octets = new Uint8Array(await f.arrayBuffer());
  const type = typeJustificatif(octets);
  if (!type) return "invalide";
  const r = lignes<{ id: string }>(await ecrire("finances_justificatifs?select=id", "POST", { type_mime: type, taille: octets.length, sha256: createHash("sha256").update(octets).digest("hex"), contenu: `\\x${Buffer.from(octets).toString("hex")}`, depose_par: par }));
  return r?.[0]?.id ?? null;
}
const fichier = (brut: unknown) => {
  const f = champsDe(brut).justificatif;
  return typeof File !== "undefined" && f instanceof File && f.size > 0 ? f : null;
};

// ---------- factures et avoirs ----------

export async function emettreFacture(devisId: unknown): Promise<RetourFin> {
  const s = await exigerRole("agents");
  if (!s) return { erreur: "refuse" };
  if (typeof devisId !== "string" || !UUID.test(devisId)) return { erreur: "champs" };
  const d = await devisPayables(s, devisId);
  if (!d) return { erreur: "panne" };
  if (!d[0]) return { erreur: "introuvable" };
  const r = await rpc<{ id: string; numero: string; nouvelle: boolean }>("emettre_facture", { p_devis: d[0].id, p_par: s.profilId });
  if (r === "panne") return { erreur: "panne" };
  if (!r) return { erreur: "devis" };
  if (r.nouvelle) await journaliser("facture.emission", s.profilId, null, { facture: r.id, dossier: d[0].demande, devis: d[0].id });
  refresh();
  return { ok: true, numero: r.numero };
}

export async function emettreAvoir(factureId: unknown, brut: unknown): Promise<RetourFin> {
  const s = await admin();
  if ("erreur" in s) return s;
  const lu = lireAvoir(brut);
  if (!lu.ok) return { erreur: "champs", champs: lu.champs };
  const f = await factureAccessible(s, factureId);
  if (f === "panne") return { erreur: "panne" };
  if (!f) return { erreur: "introuvable" };
  const r = await rpc<{ erreur?: string; id?: string; numero?: string; statut?: string; ecart?: number }>("emettre_avoir", { p_facture: f.id, p_montant: lu.v.montant, p_motif: lu.v.motif, p_par: s.profilId });
  if (r === "panne" || !r) return { erreur: "panne" };
  if (r.erreur) return { erreur: r.erreur === "montant" ? "montant" : r.erreur === "annulee" ? "annulee" : "introuvable", ...(r.erreur === "montant" ? { champs: ["montant"] } : {}) };
  await apresEtat(f.devis, f.demande, r.statut ?? null);
  await journaliser("avoir.emission", s.profilId, null, { facture: f.id, dossier: f.demande, numero: r.numero });
  refresh();
  return { ok: true, numero: r.numero, etat: r.statut, ecart: r.ecart };
}

/** E-mail de facture au client, dans sa langue (SMTP d'OHT ; en local, la boîte de test EQUIPE_BOITE). */
export async function envoyerFacture(factureId: unknown): Promise<RetourFin> {
  const s = await exigerRole("agents");
  if (!s) return { erreur: "refuse" };
  const f = await factureAccessible(s, factureId);
  if (f === "panne") return { erreur: "panne" };
  if (!f) return { erreur: "introuvable" };
  if (!f.client.email) return { erreur: "champs" };
  const boite = modeLocal(process.env, (await headers()).get("host"), process.cwd()).boite;
  if (!boite && !courrielConfigure()) return { erreur: "smtp" };
  const r = await lireReglages();
  const m = await courrielFacture(f, r);
  const document = await pdfFinancier(f).catch(() => null);
  if (!document) return { erreur: "panne" };
  const pieces = [{ nom: `${document.numero}.pdf`, contenu: document.pdf, type: "application/pdf" }];
  let parti = false;
  if (boite) {
    parti = await appendFile(boite, `${JSON.stringify({ a: f.client.email, sujet: m.sujet, facture: f.numero, langue: m.langue, pieces: pieces.map((p) => ({ nom: p.nom, type: p.type, taille: p.contenu.length })), le: maintenant() })}\n`, "utf8").then(() => true, () => false);
  } else {
    parti = await envoyerCourriel({ a: f.client.email, sujet: m.sujet, html: m.html, texte: m.texte, cle: `facture-${f.id}-${Date.now()}`, pieces, modele: "facture" });
  }
  if (!parti) return { erreur: "envoi" };
  await base(`factures?id=eq.${f.id}`, { method: "PATCH", corps: { envoyee_le: maintenant(), modifie_le: maintenant() }, prefer: "return=minimal" }).catch(() => null);
  await journaliser("facture.envoi", s.profilId, null, { facture: f.id, dossier: f.demande, langue: m.langue });
  refresh();
  return { ok: true, numero: f.numero };
}

// ---------- liens de paiement ----------

/** Lien de paiement d'un devis envoyé : montant = total du devis (serveur), langue du client, passerelles actives. Tout
 * montant, total ou acompte envoyé par le navigateur est ignoré : seuls le devis et la durée sont lus. */
export async function creerLien(brut: unknown): Promise<RetourFin> {
  const s = await exigerDroit("liens"); // droit « Liens de paiement » (lot « securite ») ; un admin les a tous
  if (!s) return { erreur: "refuse" };
  const lu = lireLien(brut);
  if (!lu.ok) return { erreur: "champs", champs: lu.champs };
  const d = await devisPayables(s, lu.v.devis);
  if (!d) return { erreur: "panne" };
  if (!d[0]) return { erreur: "introuvable" };
  if (!secretLiens()) return { erreur: "secret" };
  const passerelles = await passerellesActives();
  if (!passerelles.length) {
    await journaliser("finances.refus", s.profilId, null, { devis: d[0].id, motif: "passerelles" });
    return { erreur: "passerelles" };
  }
  const t = Date.now();
  // un seul lien vivant par devis : le précédent (non payé) est annulé
  if (!lignes(await ecrire(`liens_paiement?devis_id=eq.${d[0].id}&paye_le=is.null&annule_le=is.null&select=id`, "PATCH", { annule_le: new Date(t).toISOString(), modifie_le: new Date(t).toISOString() }))) return { erreur: "panne" };
  const cree = lignes<{ id: string }>(await ecrire("liens_paiement?select=id", "POST", {
    devis_id: d[0].id,
    facture_id: d[0].facture?.id ?? null,
    demande_id: d[0].demande,
    montant: d[0].montant,
    langue: langueDoc(d[0].langue),
    passerelles,
    expire_le: new Date(t + lu.v.jours * 86_400_000).toISOString(),
    cree_par: s.profilId,
  }));
  if (!cree?.[0]) return { erreur: "panne" };
  await journaliser("lien.creation", s.profilId, null, { lien: cree[0].id, dossier: d[0].demande, devis: d[0].id });
  // case « Envoyer le lien au client par e-mail » (cochée par défaut) : le lien est créé quoi qu'il arrive à l'envoi
  const envoyer = [true, "on", "true"].includes(champsDe(brut).envoyer as string | boolean);
  const envoi = envoyer ? await envoyerLien(cree[0].id, d[0], s.profilId) : undefined;
  refresh();
  return { ok: true, montant: d[0].montant, ...(envoi ? { envoi } : {}) };
}

/** Lien neuf envoyé au client dans la langue du lien (SMTP d'OHT ; en local, la boîte EQUIPE_BOITE). État dérivé des
 * dates : envoye_le n'est posé qu'après l'envoi, et seulement sur un lien encore « créé » (ni ouvert, payé, annulé ni
 * expiré). */
async function envoyerLien(id: string, d: DevisPayable, par: string): Promise<"envoye" | "echec"> {
  const [v, site] = await Promise.all([voie(), origine()]);
  const jeton = jetonLien(id);
  const l = (await lire<{ montant: number; langue: string; expire_le: string; envoye_le: string | null; ouvert_le: string | null; paye_le: string | null; annule_le: string | null }>(`liens_paiement?select=montant,langue,expire_le,envoye_le,ouvert_le,paye_le,annule_le&id=eq.${id}&limit=1`))?.[0];
  if (!v || !site || !jeton || !d.email || !l || etatLien(l, Date.now()) !== "cree") return "echec";
  const L = langueDoc(l.langue);
  const [modele, textesSuivi] = await Promise.all([lireModele("auto-lien", L), lireContenu("suivi.suivi")]);
  const m = messageLien({ nom: d.client, langue: L, jeton, montant: l.montant, expire: l.expire_le, numero: d.numero, reference: `DEM-${d.demande.slice(0, 6).toUpperCase()}` }, site, modele, textesSuivi);
  const parti = await partir({ a: d.email, sujet: m.sujet, html: m.html, texte: m.texte, repondreA: process.env.EMAIL_OHT || null, cle: `lien-${id}-envoi`, modele: "auto-lien" }, v.boite).catch(() => false);
  if (!parti) return "echec";
  const t = maintenant();
  await ecrire(`liens_paiement?id=eq.${id}&envoye_le=is.null&ouvert_le=is.null&paye_le=is.null&annule_le=is.null&select=id`, "PATCH", { envoye_le: t, modifie_le: t });
  await journaliser("lien.envoi", par, null, { lien: id, dossier: d.demande, langue: L });
  return "envoye";
}

export async function annulerLien(id: unknown): Promise<RetourFin> {
  const s = await exigerDroit("liens");
  if (!s) return { erreur: "refuse" };
  if (typeof id !== "string" || !UUID.test(id)) return { erreur: "champs" };
  const l = await lire<{ id: string }>(`liens_paiement?select=id,demande:demandes!inner(agent_id)&id=eq.${id}${voitTout(s) ? "" : `&demande.agent_id=eq.${s.profilId}`}&limit=1`);
  if (!l) return { erreur: "panne" };
  if (!l[0]) return { erreur: "introuvable" };
  const t = maintenant();
  const r = lignes(await ecrire(`liens_paiement?id=eq.${id}&paye_le=is.null&annule_le=is.null&select=id`, "PATCH", { annule_le: t, modifie_le: t }));
  if (!r) return { erreur: "panne" };
  if (!r.length) return { erreur: "etat" };
  await journaliser("lien.annulation", s.profilId, null, { lien: id });
  refresh();
  return { ok: true };
}

// ---------- paiements manuels ----------

/** Motif LIKE échappé (\, %, _) : la référence est comparée telle quelle, sans tenir compte de la casse. */
const exact = (v: string) => encodeURIComponent(v.replace(/[\\%_]/g, (c) => `\\${c}`));

/** Paiement reçu en agence (agent ou admin) : il reste « à confirmer » et n'entre dans aucun encaissé avant un admin. */
export async function saisirPaiement(brut: unknown): Promise<RetourFin> {
  const s = await exigerRole("agents");
  if (!s) return { erreur: "refuse" };
  const lu = lirePaiement(brut, aujourdhuiOuidah(Date.now()));
  if (!lu.ok) return { erreur: "champs", champs: lu.champs };
  const f = fichier(brut);
  if (lu.v.mode === "virement" && !f) {
    await journaliser("finances.refus", s.profilId, null, { devis: lu.v.devis ?? undefined, motif: "justificatif", mode: lu.v.mode });
    return { erreur: "justificatifVirement", champs: ["justificatif"] };
  }
  const source = lu.v.commande ? "commande" : lu.v.reservation ? "reservation" : "devis";
  const d = await objetsPayables(s, source, (lu.v.commande ?? lu.v.reservation ?? lu.v.devis)!);
  if (!d) return { erreur: "panne" };
  if (!d[0]) return { erreur: "introuvable", champs: ["devis"] };
  const clos = await moisClos(lu.v.recuLe);
  if (clos === null) return { erreur: "panne" };
  if (clos) return { erreur: "mois_clos", champs: ["jour"] };
  if (lu.v.reference) {
    const deja = await lire<{ id: string }>(`paiements_manuels?select=id&mode=eq.${lu.v.mode}&etat=neq.rejete&reference=ilike.${exact(lu.v.reference)}&limit=1`);
    if (!deja) return { erreur: "panne" };
    if (deja.length) {
      await journaliser("finances.refus", s.profilId, null, { devis: d[0].id, motif: "doublon", mode: lu.v.mode });
      return { erreur: "doublon", champs: ["reference"] };
    }
  }
  let justificatif: string | null = null;
  if (f) {
    const j = await deposer(f, s.profilId);
    if (j === "invalide") return { erreur: "justificatif", champs: ["justificatif"] };
    if (!j) return { erreur: "panne" };
    justificatif = j;
  }
  const r = await ecrire<{ id: string }>("paiements_manuels?select=id", "POST", {
    mode: lu.v.mode,
    montant: lu.v.montant,
    devise: lu.v.devise,
    recu_le: lu.v.recuLe,
    reference: lu.v.reference,
    payeur: lu.v.payeur,
    justificatif_id: justificatif,
    devis_id: source === "devis" ? d[0].id : null,
    commande_id: source === "commande" ? d[0].id : null,
    reservation_id: source === "reservation" ? d[0].id : null,
    facture_id: d[0].facture?.id ?? null,
    saisi_par: s.profilId,
  });
  if (r && "status" in r && r.status === 409) {
    // index unique (mode, référence) : une saisie concurrente est passée entre la vérification et l'écriture
    await journaliser("finances.refus", s.profilId, null, { devis: d[0].id, motif: "doublon", mode: lu.v.mode });
    return { erreur: "doublon", champs: ["reference"] };
  }
  const cree = lignes(r)?.[0];
  if (!cree) return { erreur: "panne" };
  await journaliser("paiement.saisie", s.profilId, null, { paiement: cree.id, dossier: d[0].demande ?? undefined, [source]: d[0].id, mode: lu.v.mode });
  refresh();
  return { ok: true };
}

type Confirme = { erreur?: string; statut?: string | null; ecart?: number | null; facture_id?: string; devis_id?: string };

/** Confirmation par un admin qui n'a pas saisi le paiement : la facture passe à « payée » (ou « à régulariser » s'il y a
 * un écart avec le total), le reçu R- est émis, le dossier passe à « Payée ». */
export async function confirmerPaiement(id: unknown): Promise<RetourFin> {
  const s = await admin();
  if ("erreur" in s) return s;
  if (typeof id !== "string" || !UUID.test(id)) return { erreur: "champs" };
  const r = await rpc<Confirme>("confirmer_paiement_manuel", { p_id: id, p_par: s.profilId });
  if (r === "panne" || !r) return { erreur: "panne" };
  if (r.erreur) {
    const e = (["introuvable", "etat", "soi", "mois_clos", "devis"] as const).find((x) => x === r.erreur) ?? "panne";
    if (e === "soi" || e === "mois_clos") await journaliser("finances.refus", s.profilId, null, { paiement: id, motif: e });
    return { erreur: e };
  }
  const [dem] = r.devis_id ? ((await lire<{ demande_id: string }>(`devis?select=demande_id&id=eq.${r.devis_id}&limit=1`)) ?? []) : [];
  if (r.devis_id && dem) await apresEtat(r.devis_id, dem.demande_id, r.statut ?? null);
  await journaliser("paiement.confirmation", s.profilId, null, { paiement: id, facture: r.facture_id, ...(r.statut ? { etape: r.statut } : {}) });
  refresh();
  return { ok: true, etat: r.statut ?? undefined, ecart: r.ecart ?? undefined };
}

export async function rejeterPaiement(id: unknown, motif: unknown): Promise<RetourFin> {
  const s = await admin();
  if ("erreur" in s) return s;
  if (typeof id !== "string" || !UUID.test(id)) return { erreur: "champs" };
  const m = lireMotif(typeof motif === "string" ? motif : champsDe(motif).motif);
  if (!m) return { erreur: "champs", champs: ["motif"] };
  if (!peutPasser(TRANSITIONS_PAIEMENT, "a_confirmer", "rejete")) return { erreur: "etat" };
  const t = maintenant();
  const r = lignes(await ecrire(`paiements_manuels?id=eq.${id}&etat=eq.a_confirmer&select=id`, "PATCH", { etat: "rejete", motif: m, confirme_par: s.profilId, confirme_le: t, modifie_le: t }));
  if (!r) return { erreur: "panne" };
  if (!r.length) return { erreur: "etat" };
  await journaliser("paiement.rejet", s.profilId, null, { paiement: id });
  refresh();
  return { ok: true };
}

/** Réservation repassée de « payée » à « en attente » par une écriture inverse (TRANSITIONS_RESERVATION) : avis à
 * l'équipe (billets annulés, client à prévenir). Son échec ne change rien à l'écriture inverse, déjà faite. */
async function avisReservationRetiree(id: string, motif: string, inverse: string) {
  const [res, site] = await Promise.all([
    lire<{ statut: string; nom: string; email: string; langue: string; evenement: string; occurrence: string; formule_nom: string; quantite: number }>(`reservations?select=statut,nom,email,langue,evenement,occurrence,formule_nom,quantite&id=eq.${id}&limit=1`),
    origine(),
  ]);
  const x = res?.[0];
  if (!x || x.statut !== "attente" || !peutPasser(TRANSITIONS_RESERVATION, "paye", "attente") || !site) return;
  const [doc] = (await lire<{ numero: string }>(`documents?select=numero&source=eq.reservation&source_id=eq.${id}&type=eq.T&limit=1`)) ?? [];
  const a = avisReservationAttente({ reference: doc?.numero ?? `${x.evenement} · ${x.occurrence}`, nom: x.nom, email: x.email, langue: x.langue, evenement: x.evenement, occurrence: x.occurrence, formule: x.formule_nom, quantite: x.quantite, motif }, site);
  await envoyerAvis({ sujet: a.sujet, html: a.html, texte: a.texte, repondreA: x.email || null, cle: `reservation-${id}-attente-${inverse}`, modele: "avis-reservation" }).catch(() => false);
}

/** Un paiement confirmé ne se modifie plus : l'erreur se corrige par une écriture inverse, inscrite au journal. */
export async function inverserPaiement(id: unknown, motif: unknown): Promise<RetourFin> {
  const s = await admin();
  if ("erreur" in s) return s;
  if (typeof id !== "string" || !UUID.test(id)) return { erreur: "champs" };
  const m = lireMotif(typeof motif === "string" ? motif : champsDe(motif).motif);
  if (!m) return { erreur: "champs", champs: ["motif"] };
  // réservation réglée en agence : son état avant l'écriture inverse (paye → attente annule les billets, avis à l'équipe)
  const [avant] = (await lire<{ reservation_id: string | null; reservation: { statut: string } | null }>(`paiements_manuels?select=reservation_id,reservation:reservations(statut)&id=eq.${id}&limit=1`)) ?? [];
  const r = await rpc<{ erreur?: string; id?: string; statut?: string }>("inverser_paiement_manuel", { p_id: id, p_par: s.profilId, p_motif: m });
  if (r === "panne" || !r) return { erreur: "panne" };
  if (r.erreur) return { erreur: r.erreur === "mois_clos" ? "mois_clos" : r.erreur === "etat" ? "etat" : "introuvable" };
  const [p] = (await lire<{ devis_id: string | null; devis: { demande_id: string } | null }>(`paiements_manuels?select=devis_id,devis:devis!paiements_manuels_devis_id_fkey(demande_id)&id=eq.${id}&limit=1`)) ?? [];
  if (p?.devis_id && p.devis && r.statut) await apresEtat(p.devis_id, p.devis.demande_id, r.statut);
  if (avant?.reservation_id && avant.reservation?.statut === "paye") await avisReservationRetiree(avant.reservation_id, m, r.id ?? id);
  await journaliser("paiement.inverse", s.profilId, null, { paiement: id, cible: r.id });
  refresh();
  return { ok: true, etat: r.statut };
}

// ---------- dépenses et clôture ----------

export async function ajouterDepense(brut: unknown): Promise<RetourFin> {
  const s = await admin();
  if ("erreur" in s) return s;
  const lu = lireDepense(brut, aujourdhuiOuidah(Date.now()));
  if (!lu.ok) return { erreur: "champs", champs: lu.champs };
  const f = fichier(brut);
  if (!f) return { erreur: "justificatif", champs: ["justificatif"] };
  const clos = await moisClos(lu.v.jour);
  if (clos === null) return { erreur: "panne" };
  if (clos) return { erreur: "mois_clos", champs: ["jour"] };
  const j = await deposer(f, s.profilId);
  if (j === "invalide") return { erreur: "justificatif", champs: ["justificatif"] };
  if (!j) return { erreur: "panne" };
  const r = lignes<{ id: string }>(await ecrire("depenses?select=id", "POST", { jour: lu.v.jour, libelle: lu.v.libelle, montant: lu.v.montant, mode: lu.v.mode, justificatif_id: j, saisi_par: s.profilId }));
  if (!r?.[0]) return { erreur: "panne" };
  await journaliser("depense.ajout", s.profilId, null, { cible: r[0].id, mois: lu.v.jour.slice(0, 7) });
  refresh();
  return { ok: true };
}

/** Clôt un mois terminé, sans paiement en attente reçu ce mois-ci : ses chiffres sont figés et plus rien ne s'y ajoute. */
export async function cloreMois(mois: unknown): Promise<RetourFin> {
  const s = await admin();
  if ("erreur" in s) return s;
  if (!moisValide(mois)) return { erreur: "champs" };
  if (mois >= moisCourant(Date.now())) return { erreur: "termine" };
  const r = await rpc<{ ok?: boolean; erreur?: string }>("clore_mois_finances", { p_mois: `${mois}-01`, p_par: s.profilId });
  if (!r || r === "panne") return { erreur: "panne" };
  if (r.erreur) return { erreur: (["deja", "attente", "termine", "admin"] as const).find((e) => e === r.erreur) ?? "panne" };
  if (!r.ok) return { erreur: "panne" };
  await journaliser("mois.cloture", s.profilId, null, { mois });
  refresh();
  return { ok: true };
}

// ---------- grille tarifaire et coordonnées ----------

export async function enregistrerPrix(brut: unknown): Promise<RetourFin> {
  const s = await admin();
  if ("erreur" in s) return s;
  const lu = lirePrix(brut);
  if (!lu.ok) return { erreur: "champs", champs: lu.champs };
  const { id, ...v } = lu.v;
  const corps = { ...v, modifie_le: maintenant(), modifie_par: s.profilId };
  const r = lignes<{ id: string }>(id ? await ecrire(`grille_tarifaire?id=eq.${id}&select=id`, "PATCH", corps) : await ecrire("grille_tarifaire?select=id", "POST", corps));
  if (!r) return { erreur: "panne" };
  if (!r[0]) return { erreur: "introuvable" };
  await journaliser(id ? "grille.modification" : "grille.ajout", s.profilId, null, { cible: r[0].id });
  refresh();
  return { ok: true };
}

export async function basculerPrix(id: unknown, active: unknown): Promise<RetourFin> {
  const s = await admin();
  if ("erreur" in s) return s;
  if (typeof id !== "string" || !UUID.test(id) || typeof active !== "boolean") return { erreur: "champs" };
  const r = lignes(await ecrire(`grille_tarifaire?id=eq.${id}&select=id`, "PATCH", { active, modifie_le: maintenant(), modifie_par: s.profilId }));
  if (!r) return { erreur: "panne" };
  if (!r.length) return { erreur: "introuvable" };
  await journaliser("grille.modification", s.profilId, null, { cible: id });
  refresh();
  return { ok: true };
}

export async function enregistrerCoordonnees(brut: unknown): Promise<RetourFin> {
  const s = await admin();
  if ("erreur" in s) return s;
  const lu = lireCoordonnees(brut);
  if (!lu.ok) return { erreur: "champs", champs: lu.champs };
  const r = lignes(await ecrire("reglages_paiement?id=eq.true&select=id", "PATCH", { ...lu.v, modifie_le: maintenant(), modifie_par: s.profilId }));
  if (!r) return { erreur: "panne" };
  await journaliser("reglages.paiement", s.profilId, null, {});
  refresh();
  return { ok: true };
}

/** Réouverture explicite et tracée ; l'ancien instantané demeure au journal comptable. */
export async function rouvrirMois(mois: unknown, brut: unknown): Promise<RetourFin> {
  const s = await admin();
  if ("erreur" in s) return s;
  const motif = lireMotif(champsDe(brut).motif);
  if (!moisValide(mois) || !motif) return { erreur: "champs" };
  const r = await rpc<{ ok?: boolean; erreur?: string }>("rouvrir_mois_finances", { p_mois: `${mois}-01`, p_par: s.profilId, p_motif: motif });
  if (!r || r === "panne" || !r.ok) return { erreur: r && r !== "panne" && r.erreur === "etat" ? "etat" : "panne" };
  await journaliser("mois.reouverture", s.profilId, null, { mois });
  refresh();
  return { ok: true };
}
