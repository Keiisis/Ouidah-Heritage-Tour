import "server-only";
import { createHmac } from "node:crypto";
import { MODES, type Mode } from "@/content/espace";
import { type ModeManuel } from "@/content/espace-finances";
import { base } from "../../base";
import type { Session } from "../session";
import { aujourdhuiOuidah, bornesMois, enXof, etatLien, type EtatLien, totalLignes, UUID } from "./regles";
import type { Fiscalite } from "./fiscalite-regles";

// Lectures du lot « finances » (L7), par le serveur seulement avec la clé secrète. La clé contourne RLS : le cloisonnement
// tient ICI. Un agent ne lit que ce qui touche ses dossiers (demandes.agent_id posé dans la requête, jointure !inner) et
// ses propres saisies ; un admin lit tout. Aucun « use cache » : tout est lu à la requête, après la session. Une lecture
// qui échoue rend null (« données indisponibles »), jamais un chiffre inventé.

export const voitTout = (s: Session) => s.role === "admin";
const filtreDemande = (s: Session) => (voitTout(s) ? "" : `&demande.agent_id=eq.${s.profilId}`);

export async function lire<T>(chemin: string): Promise<T[] | null> {
  try {
    const r = await base(chemin);
    return r.ok ? ((await r.json()) as T[]) : null;
  } catch {
    return null;
  }
}
/** Les plafonds PostgREST ne doivent pas tronquer les comptes. Ordre stable entre pages. */
export async function lireToutes<T>(chemin: string): Promise<T[] | null> {
  const [table, query] = chemin.split("?");
  const params = new URLSearchParams(query);
  params.set("limit", "1000");
  params.set("order", params.has("order") ? `${params.get("order")},id.asc` : "id.asc");
  const lignes: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    params.set("offset", String(offset));
    const page = await lire<T>(`${table}?${params}`);
    if (!page) return null;
    lignes.push(...page);
    if (page.length < 1000) return lignes;
  }
}
/** Relation un-à-un de PostgREST : objet, tableau d'un élément ou null selon la détection ; toujours ramenée à objet ou null. */
const un = <T>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));

// ---------- jeton d'un lien de paiement ----------
// /payer/<l-uuid-signature> : signature HMAC-SHA256 (BILLET_SECRET, comme les liens de suivi) sur un contenu propre aux
// liens de paiement. Rien n'est stocké : le jeton se recalcule. Sans secret, aucun lien n'est créé.
const secret = () => {
  const s = process.env.BILLET_SECRET;
  return s && s.length >= 32 ? s : null;
};
const signer = (id: string, cle: string) => createHmac("sha256", cle).update(`lien-paiement:${id}`).digest("base64url").slice(0, 22);
export const secretLiens = () => secret() !== null;
export function jetonLien(id: string): string | null {
  const cle = secret();
  return cle ? `l-${id}-${signer(id, cle)}` : null;
}

// ---------- devis envoyés (pour une facture, un lien ou un paiement reçu) ----------

export type DevisPayable = {
  id: string;
  numero: string | null; // D-…
  demande: string;
  client: string;
  email: string;
  langue: string;
  montant: number; // total du devis, recalculé depuis les lignes
  publie: string | null;
  facture: { id: string; numero: string; statut: string } | null;
  lienVivant: boolean;
};
type BrutDevis = {
  id: string;
  montant: number | null;
  publie_le: string | null;
  lignes: { quantite: number; prix_unitaire: number }[];
  demande: { id: string; nom: string | null; email: string | null; langue: string; agent_id: string | null };
  facture: { id: string; numero: string; statut: string } | { id: string; numero: string; statut: string }[] | null;
  liens: { id: string; paye_le: string | null; annule_le: string | null; expire_le: string }[];
};

/** Devis envoyés au client (« prêt ») des dossiers accessibles, dont le total correspond bien à leurs lignes. */
export async function devisPayables(s: Session, id?: string): Promise<DevisPayable[] | null> {
  const un_ = id ? (UUID.test(id) ? `&id=eq.${id}` : null) : "";
  if (un_ === null) return [];
  const l = await lire<BrutDevis>(`devis?select=id,montant,publie_le,lignes,demande:demandes!inner(id,nom,email,langue,agent_id),facture:factures(id,numero,statut),liens:liens_paiement(id,paye_le,annule_le,expire_le)&statut=eq.pret&demande.statut=eq.envoyee${filtreDemande(s)}${un_}&order=publie_le.desc&limit=500`);
  if (!l) return null;
  const ok = l.filter((d) => d.montant !== null && d.montant > 0 && Array.isArray(d.lignes) && totalLignes(d.lignes) === d.montant);
  const numeros = await numerosDevis(ok.map((d) => d.id));
  const t = Date.now();
  return ok.map((d) => ({
    id: d.id,
    numero: numeros.get(d.id) ?? null,
    demande: d.demande.id,
    client: d.demande.nom ?? "",
    email: d.demande.email ?? "",
    langue: d.demande.langue,
    montant: d.montant as number,
    publie: d.publie_le,
    facture: un(d.facture),
    lienVivant: d.liens.some((x) => !x.paye_le && !x.annule_le && Date.parse(x.expire_le) > t),
  }));
}

/** Numéros D- déjà émis (lecture seule de la table documents, sans en émettre). */
async function numerosDevis(ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const l = await lire<{ source_id: string; numero: string }>(`documents?select=source_id,numero&type=eq.D&source=eq.devis&source_id=in.(${ids.join(",")})`);
  return new Map((l ?? []).map((x) => [x.source_id, x.numero]));
}

// ---------- liste des devis (écrans Devis) ----------

export type LigneDevisListe = { id: string; statut: string; montant: number | null; cree: string; publie: string | null; demande: string; client: string; agent: { id: string; prenom: string; nom: string } | null; numero: string | null };
type BrutListe = { id: string; statut: string; montant: number | null; cree_le: string; publie_le: string | null; demande: { id: string; nom: string | null; agent_id: string | null; agent: { id: string; prenom: string; nom: string } | null } };
export async function lireDevisListe(s: Session): Promise<LigneDevisListe[] | null> {
  const l = await lire<BrutListe>(`devis?select=id,statut,montant,cree_le,publie_le,demande:demandes!inner(id,nom,agent_id,agent:equipe_profils(id,prenom,nom))&demande.statut=eq.envoyee${filtreDemande(s)}&statut=neq.annule&order=cree_le.desc&limit=1000`);
  if (!l) return null;
  const numeros = await numerosDevis(l.filter((d) => d.statut !== "brouillon").map((d) => d.id));
  return l.map((d) => ({ id: d.id, statut: d.statut, montant: d.montant, cree: d.cree_le, publie: d.publie_le, demande: d.demande.id, client: d.demande.nom ?? "", agent: d.demande.agent, numero: numeros.get(d.id) ?? null }));
}

// ---------- factures ----------

export type PaiementFacture = { id: string; mode: ModeManuel; montant: number; devise: string; etat: string; recuLe: string; reference: string | null; inverse: boolean };
export type Facture = {
  id: string;
  numero: string;
  emise: string;
  devis: string;
  demande: string;
  client: { nom: string; email: string; langue: string; pays: string | null };
  lignes: { libelle: string; quantite: number; prix_unitaire: number }[];
  montant: number;
  fiscalite: Fiscalite | null;
  statut: string;
  envoyee: string | null;
  payee: string | null;
  avoirs: { id: string; numero: string; montant: number; motif: string; cree: string }[];
  paiements: PaiementFacture[];
  net: number; // reste dû après avoirs
  recu: number; // paiements confirmés (FCFA)
  ecart: number; // reçu − reste dû
};
type BrutFacture = {
  fiscalite?: Fiscalite | null;
  id: string; numero: string; cree_le: string; devis_id: string; demande_id: string; client: Facture["client"]; lignes: Facture["lignes"]; montant: number; statut: string; envoyee_le: string | null; payee_le: string | null;
  avoirs: { id: string; numero: string; montant: number; motif: string; cree_le: string }[];
  paiements: { id: string; mode: ModeManuel; montant: number; devise: string; etat: string; recu_le: string; reference: string | null; inverse_de: string | null }[];
  liens: { montant: number; paye_le: string | null }[];
};
const CHAMPS_FACTURE = "id,numero,cree_le,devis_id,demande_id,client,lignes,montant,fiscalite,statut,envoyee_le,payee_le,demande:demandes!inner(agent_id),avoirs(id,numero,montant,motif,cree_le),paiements:paiements_manuels!paiements_manuels_facture_id_fkey(id,mode,montant,devise,etat,recu_le,reference,inverse_de),liens:liens_paiement!liens_paiement_facture_id_fkey(montant,paye_le)";

const versFacture = (f: BrutFacture): Facture => {
  const net = f.montant - f.avoirs.reduce((t, a) => t + a.montant, 0);
  const recu = f.paiements.filter((p) => p.etat === "confirme").reduce((t, p) => t + enXof(p.montant, p.devise), 0) + f.liens.filter((x) => x.paye_le).reduce((t, x) => t + x.montant, 0);
  return {
    id: f.id, numero: f.numero, emise: f.cree_le, devis: f.devis_id, demande: f.demande_id, client: f.client, lignes: f.lignes, montant: f.montant, statut: f.statut, envoyee: f.envoyee_le, payee: f.payee_le,
    fiscalite: f.fiscalite ?? null,
    avoirs: f.avoirs.map((a) => ({ id: a.id, numero: a.numero, montant: a.montant, motif: a.motif, cree: a.cree_le })).sort((a, b) => a.cree.localeCompare(b.cree)),
    paiements: f.paiements.map((p) => ({ id: p.id, mode: p.mode, montant: p.montant, devise: p.devise, etat: p.etat, recuLe: p.recu_le, reference: p.reference, inverse: p.inverse_de !== null })),
    net, recu, ecart: recu - net,
  };
};

/** Factures des dossiers accessibles (agent : les siens ; admin : toutes), les plus récentes d'abord. */
export async function lireFactures(s: Session, cible?: unknown): Promise<Facture[] | null> {
  const l = await lire<BrutFacture>(`factures?select=${CHAMPS_FACTURE}${filtreDemande(s)}&order=cree_le.desc&limit=500`);
  if (!l) return null;
  const factures = l.map(versFacture);
  if (typeof cible === "string" && UUID.test(cible) && !factures.some(f => f.id === cible)) {
    const f = await factureAccessible(s, cible);
    if (f === "panne") return null;
    if (f) factures.unshift(f);
  }
  return factures;
}
/** Une facture si cette session y a droit, sinon null (introuvable ou hors de portée : même réponse). */
export async function factureAccessible(s: Session, id: unknown): Promise<Facture | null | "panne"> {
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const l = await lire<BrutFacture>(`factures?select=${CHAMPS_FACTURE}${filtreDemande(s)}&id=eq.${id}&limit=1`);
  if (!l) return "panne";
  return l[0] ? versFacture(l[0]) : null;
}

// ---------- liens de paiement ----------

export type Lien = { id: string; cree: string; montant: number; langue: string; expire: string; passerelles: string[]; etat: EtatLien; quand: string | null; client: string; demande: string; devis: string };
type BrutLien = { id: string; cree_le: string; montant: number; langue: string; expire_le: string; passerelles: string[]; envoye_le: string | null; ouvert_le: string | null; paye_le: string | null; annule_le: string | null; devis_id: string; demande: { id: string; nom: string | null } };
export async function lireLiens(s: Session): Promise<Lien[] | null> {
  const l = await lire<BrutLien>(`liens_paiement?select=id,cree_le,montant,langue,expire_le,passerelles,envoye_le,ouvert_le,paye_le,annule_le,devis_id,demande:demandes!inner(id,nom,agent_id)${filtreDemande(s)}&order=cree_le.desc&limit=500`);
  if (!l) return null;
  const t = Date.now();
  return l.map((x) => {
    const etat = etatLien(x, t);
    const quand = { paye: x.paye_le, annule: x.annule_le, expire: x.expire_le, ouvert: x.ouvert_le, envoye: x.envoye_le, cree: x.cree_le }[etat];
    return { id: x.id, cree: x.cree_le, montant: x.montant, langue: x.langue, expire: x.expire_le, passerelles: x.passerelles, etat, quand, client: x.demande.nom ?? "", demande: x.demande.id, devis: x.devis_id };
  });
}

// ---------- paiements manuels ----------

export type PaiementManuel = {
  id: string; cree: string; mode: ModeManuel; montant: number; devise: string; recuLe: string; reference: string | null; payeur: string | null; justificatif: string | null;
  etat: "a_confirmer" | "confirme" | "rejete"; motif: string | null; inverse: boolean; traite: string | null;
  client: string; demande: string | null; attendu: number | null; facture: { numero: string; statut: string } | null;
  saisi: { id: string; prenom: string; nom: string } | null; confirme: { prenom: string; nom: string } | null;
};
type BrutPaiement = {
  id: string; cree_le: string; mode: ModeManuel; montant: number; devise: string; recu_le: string; reference: string | null; payeur: string | null; justificatif_id: string | null;
  etat: PaiementManuel["etat"]; motif: string | null; inverse_de: string | null; confirme_le: string | null;
  facture: { numero: string; statut: string; montant: number } | null;
  devis: { montant: number | null; demande: { id: string; nom: string | null } | null } | null;
  commande: { reference: string; total_xof: number | null; contact: { prenom?: string; nom?: string } } | null;
  reservation: { nom: string; montant: number } | null;
  saisi: PaiementManuel["saisi"]; confirme: PaiementManuel["confirme"];
};
const CHAMPS_PAIEMENT = "id,cree_le,mode,montant,devise,recu_le,reference,payeur,justificatif_id,etat,motif,inverse_de,confirme_le,commande:boutique_commandes(reference,total_xof,contact),reservation:reservations(nom,montant),facture:factures!paiements_manuels_facture_id_fkey(numero,statut,montant),devis:devis!paiements_manuels_devis_id_fkey(montant,demande:demandes(id,nom)),saisi:equipe_profils!paiements_manuels_saisi_par_fkey(id,prenom,nom),confirme:equipe_profils!paiements_manuels_confirme_par_fkey(prenom,nom)";
const versPaiement = (p: BrutPaiement): PaiementManuel => ({
  id: p.id, cree: p.cree_le, mode: p.mode, montant: p.montant, devise: p.devise, recuLe: p.recu_le, reference: p.reference, payeur: p.payeur, justificatif: p.justificatif_id,
  etat: p.etat, motif: p.motif, inverse: p.inverse_de !== null, traite: p.confirme_le,
  client: p.devis?.demande?.nom ?? (p.commande ? [p.commande.contact.prenom, p.commande.contact.nom, p.commande.reference].filter(Boolean).join(" ") : p.reservation?.nom ?? ""), demande: p.devis?.demande?.id ?? null, attendu: p.facture?.montant ?? p.devis?.montant ?? p.commande?.total_xof ?? p.reservation?.montant ?? null,
  facture: p.facture ? { numero: p.facture.numero, statut: p.facture.statut } : null, saisi: p.saisi, confirme: p.confirme,
});

/** Saisies de l'agent (ses propres paiements saisis), les plus récentes d'abord. */
export async function mesPaiements(s: Session): Promise<PaiementManuel[] | null> {
  const l = await lire<BrutPaiement>(`paiements_manuels?select=${CHAMPS_PAIEMENT}&saisi_par=eq.${s.profilId}&order=cree_le.desc&limit=200`);
  return l ? l.map(versPaiement) : null;
}
/** File des paiements à confirmer (la plus ancienne d'abord) et derniers traités : admin seulement (vérifié par l'appelant). */
export async function fileManuels(): Promise<{ file: PaiementManuel[]; traites: PaiementManuel[] } | null> {
  const [file, traites] = await Promise.all([
    lire<BrutPaiement>(`paiements_manuels?select=${CHAMPS_PAIEMENT}&etat=eq.a_confirmer&order=cree_le.asc&limit=200`),
    lire<BrutPaiement>(`paiements_manuels?select=${CHAMPS_PAIEMENT}&etat=neq.a_confirmer&order=confirme_le.desc&limit=30`),
  ]);
  return file && traites ? { file: file.map(versPaiement), traites: traites.map(versPaiement) } : null;
}

// ---------- coordonnées de l'agence ----------

export type Reglages = { titulaire: string | null; banque: string | null; iban: string | null; bic: string | null; mobile: string[]; relance: number | null };
export async function lireReglages(): Promise<Reglages | null> {
  const l = await lire<{ titulaire: string | null; banque: string | null; iban: string | null; bic: string | null; mobile_money: unknown; relance_jours: number | null }>("reglages_paiement?select=titulaire,banque,iban,bic,mobile_money,relance_jours&limit=1");
  if (!l) return null;
  const r = l[0];
  if (!r) return { titulaire: null, banque: null, iban: null, bic: null, mobile: [], relance: null };
  return { titulaire: r.titulaire, banque: r.banque, iban: r.iban, bic: r.bic, mobile: Array.isArray(r.mobile_money) ? r.mobile_money.filter((x): x is string => typeof x === "string") : [], relance: r.relance_jours };
}
/** Virement proposé au client seulement si le titulaire et l'IBAN sont saisis. */
export const virementActif = (r: Reglages | null) => Boolean(r?.titulaire && r.iban);

// ---------- grille tarifaire ----------

export type Prix = { id: string; categorie: string; libelle: string; unite: string | null; prix: number; active: boolean };
export async function lireGrille(toutes: boolean): Promise<Prix[] | null> {
  return lire<Prix>(`grille_tarifaire?select=id,categorie,libelle,unite,prix,active${toutes ? "" : "&active=is.true"}&order=categorie.asc,ordre.asc,libelle.asc&limit=1000`);
}

// ---------- comptabilité d'un mois ----------

export type Ventilation = { mode: Mode; n: number; montant: number }[];
export type Depense = { id: string; jour: string; libelle: string; montant: number; mode: string; justificatif: string };
export type Cloture = { mois: string; le: string; encaisse: number; depenses: number; resultat: number; parMode: Ventilation };
export type Mois = {
  mois: string;
  parMode: Ventilation; // les 5 passerelles, puis virement, espèces, Mobile Money direct, chèque
  encaisse: number;
  encaissements: { mode: Mode; montant: number; jour: string; instant: string | null; source: "reservation" | "lien" | "manuel" }[];
  aConfirmer: { n: number; montant: number }; // toutes les saisies en attente, jamais dans l'encaissé
  aConfirmerMois: number; // saisies en attente reçues ce mois-ci (une clôture les exige à zéro)
  depenses: Depense[];
  totalDepenses: number;
  resultat: number;
  cloture: Cloture | null;
};

/** Chiffres d'un mois « AAAA-MM » : encaissé par mode (paiements confirmés), à confirmer à part, dépenses, résultat. */
export async function calculerMois(mois: string): Promise<Mois | null> {
  const b = bornesMois(mois);
  const [resas, liens, manuels, attente, depenses, clot] = await Promise.all([
    lireToutes<{ passerelle: Mode; montant: number; montant_recu: number | null; paye_le: string }>(`reservations?select=passerelle,montant,montant_recu,paye_le&statut=eq.paye&reglement_manuel=is.false&paye_le=gte.${encodeURIComponent(b.debut)}&paye_le=lt.${encodeURIComponent(b.fin)}&limit=10000`),
    lireToutes<{ passerelle: Mode; montant: number; paye_le: string }>(`liens_paiement?select=passerelle,montant,paye_le&paye_le=gte.${encodeURIComponent(b.debut)}&paye_le=lt.${encodeURIComponent(b.fin)}&limit=10000`),
    lireToutes<{ mode: Mode; montant: number; devise: string; recu_le: string }>(`paiements_manuels?select=mode,montant,devise,recu_le&etat=eq.confirme&recu_le=gte.${b.jourDebut}&recu_le=lt.${b.jourFin}&limit=10000`),
    lireToutes<{ montant: number; devise: string; recu_le: string }>("paiements_manuels?select=montant,devise,recu_le&etat=eq.a_confirmer&limit=10000"),
    lireToutes<{ id: string; jour: string; libelle: string; montant: number; mode: string; justificatif_id: string }>(`depenses?select=id,jour,libelle,montant,mode,justificatif_id&jour=gte.${b.jourDebut}&jour=lt.${b.jourFin}&order=jour.desc,cree_le.desc&limit=2000`),
    lire<{ mois: string; cree_le: string; encaisse: number; depenses: number; resultat: number; par_mode: Ventilation }>(`finances_clotures?select=mois,cree_le,encaisse,depenses,resultat,par_mode&mois=eq.${b.jourDebut}&rouverte_le=is.null&limit=1`),
  ]);
  if (!resas || !liens || !manuels || !attente || !depenses || !clot) return null;
  const encaissements: Mois["encaissements"] = [
    ...resas.map((r) => ({ mode: r.passerelle, montant: r.montant_recu ?? r.montant, jour: aujourdhuiOuidah(Date.parse(r.paye_le)), instant: r.paye_le, source: "reservation" as const })),
    ...liens.map((l) => ({ mode: l.passerelle, montant: l.montant, jour: aujourdhuiOuidah(Date.parse(l.paye_le)), instant: l.paye_le, source: "lien" as const })),
    ...manuels.map((p) => ({ mode: p.mode, montant: enXof(p.montant, p.devise), jour: p.recu_le, instant: null, source: "manuel" as const })),
  ];
  const parMode: Ventilation = MODES.map((mode) => {
    const tous = encaissements.filter((x) => x.mode === mode);
    return { mode, n: tous.length, montant: tous.reduce((t, x) => t + x.montant, 0) };
  });
  const encaisse = parMode.reduce((t, x) => t + x.montant, 0);
  const totalDepenses = depenses.reduce((t, d) => t + d.montant, 0);
  const c = clot[0];
  return {
    mois,
    parMode,
    encaisse,
    encaissements,
    aConfirmer: { n: attente.length, montant: attente.reduce((t, p) => t + enXof(p.montant, p.devise), 0) },
    aConfirmerMois: attente.filter((p) => p.recu_le >= b.jourDebut && p.recu_le < b.jourFin).length,
    depenses: depenses.map((d) => ({ id: d.id, jour: d.jour, libelle: d.libelle, montant: d.montant, mode: d.mode, justificatif: d.justificatif_id })),
    totalDepenses,
    resultat: encaisse - totalDepenses,
    cloture: c ? { mois, le: c.cree_le, encaisse: c.encaisse, depenses: c.depenses, resultat: c.resultat, parMode: c.par_mode } : null,
  };
}

/** Le mois d'une date (AAAA-MM-JJ) est-il clos ? null si la base ne répond pas. */
export async function moisClos(jour: string): Promise<boolean | null> {
  const l = await lire<{ mois: string }>(`finances_clotures?select=mois&rouverte_le=is.null&mois=eq.${jour.slice(0, 7)}-01&limit=1`);
  return l ? l.length > 0 : null;
}
