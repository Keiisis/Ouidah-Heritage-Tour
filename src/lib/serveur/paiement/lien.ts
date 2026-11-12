import "server-only";
import { lireContenu } from "@/lib/contenu";
import { langueDoc } from "@/lib/suivi";
import { base } from "../base";
import { emettre } from "../documents/emettre";
import { apresEtat } from "../equipe/finances/effets";
import { jetonLien } from "../equipe/finances/lectures";
import { idDuJeton } from "../equipe/finances/public";
import { commandePayable, sourceLien } from "../equipe/finances/regles";
import { passerelle, passerellesActives } from "./index";
import { PASSERELLES, type Constat, type Lancement, type NomPasserelle, type Reservation } from "./types";

// Paiement d'un lien de paiement (lot L7, fichier neuf accepté par la session paiement), sur le modèle de finaliser.ts :
// le montant est celui du lien (total du devis, fixé à sa création), jamais une donnée du navigateur ; la passerelle lance
// le paiement avec NOTRE référence (l'identifiant du lien) ; seule une transaction relue auprès de son API, rattachée au
// lien, de la bonne devise et d'un montant au moins égal, le passe à « payé ». Idempotent (mise à jour conditionnelle).
// Ensuite : facture émise si besoin (emettre_facture), état recalculé (finances_recalculer), reçu R- (emettre).
// Commandes de la boutique (09/11) : même lien, source commande_id, montant = total_xof de la commande (frais de livraison
// compris). Le passage à « payé » recalcule la commande en base (déclencheur liens_commande_regle) : état, reçu R-, sans
// facture. Paiement immédiat (décision du 09/11) : la commande naît « à préparer », stock réservé jusqu'à
// paiement_expire_le ; son lien expire à cette même échéance (aucun paiement lancé sur un stock déjà rendu).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type CommandeLien = { reference: string; statut: string; paiement_etat: string; montant_recu: number; contact: { prenom?: string; nom?: string; email?: string; telephone?: string } | null };
type Ligne = {
  id: string; devis_id: string | null; demande_id: string | null; commande_id?: string | null; facture_id: string | null; montant: number; devise: "XOF"; langue: string; passerelles: string[];
  passerelle: NomPasserelle | null; transaction_id: string | null; expire_le: string; paye_le: string | null; annule_le: string | null;
  demande: { nom: string | null; email: string | null; whatsapp: string | null } | null;
  devis: { statut: string } | null;
  commande?: CommandeLien | null;
};
const CHAMPS = "id,devis_id,demande_id,commande_id,facture_id,montant,devise,langue,passerelles,passerelle,transaction_id,expire_le,paye_le,annule_le,demande:demandes(nom,email,whatsapp),devis:devis(statut),commande:boutique_commandes(reference,statut,paiement_etat,montant_recu,contact)";

async function lireLien(filtre: string, signalerPanne = false): Promise<Ligne | null> {
  const r = await base(`liens_paiement?select=${CHAMPS}&${filtre}&limit=1`).catch(() => null);
  const lignes: unknown = r?.ok ? await r.json().catch(() => null) : null;
  if (!Array.isArray(lignes)) {
    if (signalerPanne) throw new Error("base");
    return null;
  }
  return (lignes as Ligne[])[0] ?? null;
}
async function rpc<R>(fonction: string, corps: Record<string, unknown>): Promise<R | null> {
  const r = await base(`rpc/${fonction}`, { method: "POST", corps }).catch(() => null);
  return r?.ok ? ((await r.json().catch(() => null)) as R | null) : null;
}

/** Le lien sous la forme attendue par les connecteurs : notre référence = l'identifiant du lien, une seule ligne au
 * total, libellée « Devis D-… » dans la langue du client. */
async function commeReservation(l: Ligne, nom: NomPasserelle): Promise<Reservation> {
  if (l.commande_id) {
    const k = l.commande, suivi = await lireContenu("suivi.suivi");
    return {
      id: l.id,
      evenement: suivi[langueDoc(l.langue)].doc.boutique,
      occurrence: "",
      formule_nom: k?.reference ?? `CMD-${l.commande_id.slice(0, 6).toUpperCase()}`,
      quantite: 1,
      montant: l.montant,
      devise: "XOF",
      passerelle: nom,
      transaction_id: l.transaction_id,
      statut: l.paye_le ? "paye" : "attente",
      nom: `${k?.contact?.prenom ?? ""} ${k?.contact?.nom ?? ""}`.trim(),
      email: k?.contact?.email ?? "",
      telephone: k?.contact?.telephone || null,
      langue: l.langue,
      paye_le: l.paye_le,
      courriel_envoye: false,
      demande_id: null,
    };
  }
  const copiesDocuments = await lireContenu("documents.copiesDocuments");
  const d = await base(`documents?select=numero&type=eq.D&source=eq.devis&source_id=eq.${l.devis_id}&limit=1`).catch(() => null);
  const numero = d?.ok ? (((await d.json()) as { numero: string }[])[0]?.numero ?? null) : null;
  return {
    id: l.id,
    evenement: copiesDocuments[langueDoc(l.langue)].titre.devis,
    occurrence: "",
    formule_nom: numero ?? `DEM-${(l.demande_id ?? "").slice(0, 6).toUpperCase()}`,
    quantite: 1,
    montant: l.montant,
    devise: "XOF",
    passerelle: nom,
    transaction_id: l.transaction_id,
    statut: l.paye_le ? "paye" : "attente",
    nom: l.demande?.nom ?? "",
    email: l.demande?.email ?? "",
    telephone: l.demande?.whatsapp || null,
    langue: l.langue,
    paye_le: l.paye_le,
    courriel_envoye: false,
    demande_id: l.demande_id,
  };
}

export type RefusLancement = "lien" | "expire" | "paye" | "passerelle" | "passerelle_injoignable" | "base";
export type RetourLancement = { ok: true; lancement: Lancement; transaction: string | null } | { ok: false; erreur: RefusLancement };

/** Prépare le paiement d'un lien chez une passerelle proposée par ce lien ET active. `origine` : adresse publique du site. */
export async function lancerPaiementLien({ jeton, nom, origine }: { jeton: string; nom: string; origine: string }): Promise<RetourLancement> {
  const id = idDuJeton(jeton);
  if (!id) return { ok: false, erreur: "lien" };
  const l = await lireLien(`id=eq.${id}`);
  if (!l) return { ok: false, erreur: "lien" };
  // devis encore « prêt », ou commande confirmée sans rien de reçu : relu en base à chaque lancement (règle partagée avec /payer)
  const source = sourceLien(l);
  if (l.paye_le || source === "reglee") return { ok: false, erreur: "paye" };
  if (l.annule_le || Date.parse(l.expire_le) <= Date.now() || source !== "ouverte") return { ok: false, erreur: "expire" };
  const choisie = PASSERELLES.find((p) => p === nom);
  if (!choisie || !l.passerelles.includes(choisie) || !(await passerellesActives()).includes(choisie)) return { ok: false, erreur: "passerelle" };
  const lance = await passerelle(choisie).lancer(await commeReservation(l, choisie), `${origine}/payer/${jeton}`).catch(() => null);
  if (!lance) return { ok: false, erreur: "passerelle_injoignable" };
  // passerelle et transaction notées sur le lien (pas encore payé) : le webhook et le retour du client les retrouvent
  const note = await base(`liens_paiement?id=eq.${l.id}&paye_le=is.null`, { method: "PATCH", corps: { passerelle: choisie, transaction_id: lance.transaction, modifie_le: new Date().toISOString() }, prefer: "return=minimal" }).catch(() => null);
  if (!note?.ok) return { ok: false, erreur: "base" };
  return { ok: true, lancement: lance.lancement, transaction: lance.transaction };
}

export type IssueLien = { statut: "attente" | "paye"; refus?: "reference" | "montant" | "devise" | "non_reussi" | "transaction_deja_utilisee" | "base" };

/** Seule porte vers « payé » pour un lien : la transaction relue doit lui appartenir, réussie, en XOF, au moins au total. */
export async function finaliserLien(lienId: string, c: Constat): Promise<IssueLien> {
  if (!UUID.test(lienId)) return { statut: "attente", refus: "reference" };
  const l = await lireLien(`id=eq.${lienId}`);
  if (!l) return { statut: "attente", refus: "base" };
  const rattachee = c.reservation === l.id || (c.reservation === null && l.transaction_id !== null && l.transaction_id === c.transaction);
  if (!rattachee) return { statut: l.paye_le ? "paye" : "attente", refus: "reference" };
  if (l.paye_le) return { statut: "paye" };
  if (c.etat !== "reussi") return { statut: "attente", refus: "non_reussi" };
  if (c.devise !== l.devise) return { statut: "attente", refus: "devise" };
  if (c.montant === null || c.montant < l.montant) return { statut: "attente", refus: "montant" };
  if (l.commande_id) return payerCommande(l, c);
  if (!l.devis_id || !l.demande_id) return { statut: "attente", refus: "reference" };

  // facture du devis (émise si besoin, idempotent) avant le paiement : le lien payé y est rattaché. Sans facture, rien
  // n'est écrit (jamais d'encaissement sans facture) : « base », la passerelle renverra le webhook et l'on réessaiera.
  const f = l.facture_id ? { id: l.facture_id } : await rpc<{ id: string }>("emettre_facture", { p_devis: l.devis_id, p_par: null });
  if (!f?.id) return { statut: "attente", refus: "base" };
  const t = new Date().toISOString();
  const r = await base(`liens_paiement?id=eq.${l.id}&paye_le=is.null&select=id`, { method: "PATCH", corps: { paye_le: t, transaction_id: c.transaction, facture_id: f.id, modifie_le: t }, prefer: "return=representation" }).catch(() => null);
  if (!r) return { statut: "attente", refus: "base" };
  if (r.status === 409) return { statut: "attente", refus: "transaction_deja_utilisee" }; // index (passerelle, transaction)
  if (!r.ok) return { statut: "attente", refus: "base" };
  if (!((await r.json()) as unknown[]).length) {
    const actuel = await lireLien(`id=eq.${l.id}`); // un autre appel (webhook ou retour) est passé avant
    return { statut: actuel?.paye_le ? "paye" : "attente", ...(actuel ? {} : { refus: "base" as const }) };
  }
  // reçu R- du paiement (emettre : un seul numéro par source, un second webhook relit le même) et état de la facture
  const [e] = await Promise.all([rpc<{ statut: string }>("finances_recalculer", { p_facture: f.id }), emettre("R", "devis", l.devis_id)]);
  await apresEtat(l.devis_id, l.demande_id, e?.statut ?? null);
  return { statut: "paye" };
}

/** Lien d'une commande : pas de facture. Le PATCH conditionnel est la seule écriture ; dans sa transaction, la base
 * recalcule la commande (paiements manuels + liens payés), émet le reçu R- si le total exact est reçu, sinon la marque
 * « à régulariser » (règlement manuel arrivé pendant le paiement en ligne : l'argent reçu est compté, jamais deux fois). */
async function payerCommande(l: Ligne, c: Constat): Promise<IssueLien> {
  const t = new Date().toISOString();
  const r = await base(`liens_paiement?id=eq.${l.id}&paye_le=is.null&select=id`, { method: "PATCH", corps: { paye_le: t, transaction_id: c.transaction, modifie_le: t }, prefer: "return=representation" }).catch(() => null);
  if (!r) return { statut: "attente", refus: "base" };
  if (r.status === 409) return { statut: "attente", refus: "transaction_deja_utilisee" };
  if (!r.ok) return { statut: "attente", refus: "base" };
  if (!((await r.json().catch(() => null)) as unknown[] | null)?.length) {
    const actuel = await lireLien(`id=eq.${l.id}`);
    return { statut: actuel?.paye_le ? "paye" : "attente", ...(actuel ? {} : { refus: "base" as const }) };
  }
  return { statut: "paye" };
}

export type RefusLienCommande = "commande" | "etat" | "prix" | "regle" | "passerelle" | "secret" | "base";
const DUREE_LIEN_COMMANDE = 7 * 86_400_000;
const MARGE_IMMEDIAT = 60_000; // une réservation qui finit dans moins d'une minute n'ouvre plus de paiement

/** Rend le stock des commandes à paiement immédiat dont l'échéance est passée (annulées, lien annulé) ; nombre traité,
 * null si la base ne répond pas. Appelée avant chaque commande, par la purge planifiée et par un suivi échu. */
export async function expirerCommandes(): Promise<number | null> {
  const n = await rpc<number>("boutique_expirer_commandes", {});
  return typeof n === "number" ? n : null;
}

/** Lien de paiement d'une commande confirmée ou à paiement immédiat, pour le client (redirection après « Commander et
 * payer », bouton du suivi) comme pour l'équipe : le lien vivant s'il vaut encore une heure (une minute pour une
 * réservation immédiate, dont le lien finit à l'échéance), sinon un nouveau (l'ancien annulé). Montant = total_xof relu
 * en base ; rien du navigateur. */
export async function ouvrirLienCommande(commandeId: string, par: string | null = null): Promise<{ ok: true; jeton: string } | { ok: false; erreur: RefusLienCommande }> {
  if (!UUID.test(commandeId)) return { ok: false, erreur: "commande" };
  const rendre = (id: string) => {
    const jeton = jetonLien(id);
    return jeton ? { ok: true as const, jeton } : { ok: false as const, erreur: "secret" as const };
  };
  if (!jetonLien(commandeId)) return { ok: false, erreur: "secret" };
  type Commande = { id: string; statut: string; total_xof: number | null; paiement_etat: string; montant_recu: number; langue: string; paiement_expire_le: string | null };
  const r = await base(`boutique_commandes?select=id,statut,total_xof,paiement_etat,montant_recu,langue,paiement_expire_le&id=eq.${commandeId}&limit=1`).catch(() => null);
  const lignes: unknown = r?.ok ? await r.json().catch(() => null) : null;
  if (!Array.isArray(lignes)) return { ok: false, erreur: "base" };
  const k = (lignes as Commande[])[0];
  if (!k) return { ok: false, erreur: "commande" };
  if (k.paiement_etat === "paye") return { ok: false, erreur: "regle" };
  if (!commandePayable(k)) return { ok: false, erreur: "etat" };
  if (!Number.isInteger(k.total_xof) || (k.total_xof ?? 0) <= 0) return { ok: false, erreur: "prix" };
  // paiement immédiat : le lien vit jusqu'à l'échéance de la réservation, jamais au-delà
  const echeance = k.paiement_expire_le ? Date.parse(k.paiement_expire_le) : null;
  if (echeance !== null && echeance <= Date.now() + MARGE_IMMEDIAT) return { ok: false, erreur: "etat" };
  if (!(await passerellesActives()).length) return { ok: false, erreur: "passerelle" };

  let vivant: Ligne | null;
  try {
    vivant = await lireLien(`commande_id=eq.${k.id}&paye_le=is.null&annule_le=is.null`, true);
  } catch {
    return { ok: false, erreur: "base" };
  }
  if (vivant && vivant.montant === k.total_xof && Date.parse(vivant.expire_le) > Date.now() + (echeance === null ? 3_600_000 : MARGE_IMMEDIAT)) return rendre(vivant.id);
  const t = Date.now();
  if (vivant) {
    const a = await base(`liens_paiement?id=eq.${vivant.id}&paye_le=is.null&annule_le=is.null`, { method: "PATCH", corps: { annule_le: new Date(t).toISOString(), modifie_le: new Date(t).toISOString() }, prefer: "return=minimal" }).catch(() => null);
    if (!a?.ok) return { ok: false, erreur: "base" };
  }
  // toutes les passerelles connues : celles réellement proposées sont relues (actives + clés) à l'ouverture et au lancement
  const cree = await base("liens_paiement?select=id", { method: "POST", corps: { commande_id: k.id, montant: k.total_xof, devise: "XOF", langue: langueDoc(k.langue), passerelles: [...PASSERELLES], expire_le: new Date(echeance ?? t + DUREE_LIEN_COMMANDE).toISOString(), cree_par: par }, prefer: "return=representation" }).catch(() => null);
  if (cree?.status === 409) {
    // un autre clic a créé le lien vivant entre-temps (index unique par commande) : on rend celui-là
    const autre = await lireLien(`commande_id=eq.${k.id}&paye_le=is.null&annule_le=is.null`);
    return autre ? rendre(autre.id) : { ok: false, erreur: "base" };
  }
  const id = cree?.ok ? ((await cree.json().catch(() => null)) as { id: string }[] | null)?.[0]?.id : undefined;
  return id ? rendre(id) : { ok: false, erreur: "base" };
}

/** Webhook : le lien de la transaction constatée (notre référence, sinon la transaction notée au lancement), puis
 * finaliserLien. « base » si la base ne répond pas (la passerelle renverra le webhook), sinon null. `surPaye` : appelé
 * avec l'identifiant du lien quand il est payé (la route y programme le reçu, envoyé une seule fois). */
export async function finaliserLienWebhook(nom: NomPasserelle, c: Constat, surPaye?: (lienId: string) => void): Promise<"base" | null> {
  let l: Ligne | null;
  try {
    l = c.reservation ? (UUID.test(c.reservation) ? await lireLien(`id=eq.${c.reservation}&passerelle=eq.${nom}`, true) : null) : await lireLien(`passerelle=eq.${nom}&transaction_id=eq.${encodeURIComponent(c.transaction)}`, true);
  } catch {
    return "base";
  }
  if (!l) return null;
  const issue = await finaliserLien(l.id, c);
  if (issue.statut === "paye") surPaye?.(l.id);
  return issue.refus === "base" ? "base" : null;
}

/** Retour du client sur /payer/<jeton> : si le lien attend encore et qu'une passerelle a été lancée, la transaction est
 * relue auprès d'elle (celle notée au lancement, sinon celle rendue par le retour, jamais crue sans relecture).
 * `surPaye` : comme pour le webhook (le reçu déjà parti n'est pas renvoyé : sa marque en base l'empêche). */
export async function verifierLien(jeton: string, proposee: string | null, surPaye?: (lienId: string) => void): Promise<"paye" | "attente" | null> {
  const id = idDuJeton(jeton);
  const l = id ? await lireLien(`id=eq.${id}`) : null;
  if (!l) return null;
  if (l.paye_le) {
    surPaye?.(l.id);
    return "paye";
  }
  if (!l.passerelle) return "attente";
  const transaction = l.transaction_id ?? proposee;
  const c = await passerelle(l.passerelle).constater(transaction, await commeReservation(l, l.passerelle)).catch(() => null);
  const statut = c ? (await finaliserLien(l.id, c)).statut : "attente";
  if (statut === "paye") surPaye?.(l.id);
  return statut;
}
