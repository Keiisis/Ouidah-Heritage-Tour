import "server-only";
import { base } from "../base";
import type { CalculFactureEmcf, DemandeFactureEmcf, EnvironnementEmcf, SecuriteEmcf } from "./client";

export type EtatEmcf = "preparee" | "envoi" | "attente" | "confirmation" | "confirmee" | "annulation" | "annulee" | "incertaine" | "rejetee";
export type ErreurOperationEmcf = "configuration" | "saisie" | "transport" | "http" | "reponse" | "dgi" | "total" | "base" | "incoherence";
export type OperationEmcf = {
  id: string; facture_id: string; avoir_id: string | null; environnement: EnvironnementEmcf;
  ifu: string; requete: DemandeFactureEmcf; identite: Record<string, unknown>;
  uid: string | null; calcul: CalculFactureEmcf | null; securite: SecuriteEmcf | null;
  etat: EtatEmcf; erreur: ErreurOperationEmcf | null;
  cree_par: string; cree_le: string; modifie_le: string;
};
export type ResultatOperationEmcf = {
  etat: EtatEmcf; uid?: string | null; calcul?: CalculFactureEmcf | null;
  securite?: SecuriteEmcf | null; erreur?: ErreurOperationEmcf | null;
};
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const ETATS: EtatEmcf[] = ["preparee", "envoi", "attente", "confirmation", "confirmee", "annulation", "annulee", "incertaine", "rejetee"];
function operation(v: unknown): v is OperationEmcf {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Partial<OperationEmcf>;
  return typeof o.id === "string" && UUID.test(o.id) && typeof o.facture_id === "string" && UUID.test(o.facture_id)
    && (o.avoir_id === null || typeof o.avoir_id === "string" && UUID.test(o.avoir_id))
    && (o.environnement === "test" || o.environnement === "production") && ETATS.includes(o.etat as EtatEmcf)
    && Boolean(o.requete && typeof o.requete === "object" && o.identite && typeof o.identite === "object");
}
async function rpc(nom: string, corps: Record<string, unknown>): Promise<OperationEmcf | null> {
  try {
    const r = await base(`rpc/${nom}`, { method: "POST", corps });
    if (!r.ok) throw new Error("emcf_ecriture_indisponible");
    const v: unknown = await r.json();
    if (v === null) return null;
    if (!operation(v)) throw new Error("emcf_ecriture_indisponible");
    return v;
  } catch { throw new Error("emcf_ecriture_indisponible"); }
}
async function lire(chemin: string): Promise<OperationEmcf[]> {
  try {
    const r = await base(chemin);
    if (!r.ok) throw new Error("emcf_lecture_indisponible");
    const v: unknown = await r.json();
    if (!Array.isArray(v) || !v.every(operation)) throw new Error("emcf_lecture_indisponible");
    return v;
  } catch { throw new Error("emcf_lecture_indisponible"); }
}
export async function lireOperation(id: string): Promise<OperationEmcf | null> {
  if (!UUID.test(id)) return null;
  const o = (await lire(`emcf_operations?select=*&id=eq.${id}&limit=1`))[0];
  if (!o) return null;
  if (o.id !== id) throw new Error("emcf_lecture_indisponible");
  return o;
}
export async function lireOperationDocument(factureId: string, avoirId: string | null, environnement: EnvironnementEmcf): Promise<OperationEmcf | null> {
  if (!UUID.test(factureId) || avoirId !== null && !UUID.test(avoirId) || !["test", "production"].includes(environnement)) return null;
  const o = (await lire(`emcf_operations?select=*&facture_id=eq.${factureId}&avoir_id=${avoirId ? `eq.${avoirId}` : "is.null"}&environnement=eq.${environnement}&limit=1`))[0];
  if (!o) return null;
  if (o.facture_id !== factureId || o.avoir_id !== avoirId || o.environnement !== environnement) throw new Error("emcf_lecture_indisponible");
  return o;
}
/** La base rend l'opération existante sur doublon sans remplacer ses données figées. */
export async function creerOperation(v: {
  factureId: string; avoirId?: string | null; environnement: EnvironnementEmcf; ifu: string;
  requete: DemandeFactureEmcf; identite: Record<string, unknown>; creePar: string;
}): Promise<OperationEmcf | null> {
  if (!UUID.test(v.factureId) || !UUID.test(v.creePar) || v.avoirId != null && !UUID.test(v.avoirId)) return null;
  return rpc("emcf_operation_creer", { p_facture: v.factureId, p_avoir: v.avoirId ?? null, p_environnement: v.environnement,
    p_ifu: v.ifu, p_requete: v.requete, p_identite: v.identite, p_par: v.creePar });
}
/** Compare-and-set atomique ; null signifie qu'aucun appel DGI ne doit être entrepris. */
export async function prendreOperation(id: string, de: EtatEmcf, vers: EtatEmcf): Promise<OperationEmcf | null> {
  if (!UUID.test(id)) return null;
  return rpc("emcf_operation_prendre", { p_id: id, p_de: de, p_vers: vers });
}
export async function enregistrerResultat(id: string, etatEnCours: EtatEmcf, resultat: ResultatOperationEmcf): Promise<OperationEmcf | null> {
  if (!UUID.test(id)) return null;
  return rpc("emcf_operation_resultat", { p_id: id, p_en_cours: etatEnCours, p_resultat: resultat });
}
export async function listerOperations(limite = 50, cible?: unknown): Promise<OperationEmcf[] | null> {
  if (!Number.isInteger(limite) || limite < 1 || limite > 100) return null;
  const operations = await lire(`emcf_operations?select=*&order=cree_le.desc,id.desc&limit=${limite}`);
  if (typeof cible === "string" && UUID.test(cible) && !operations.some((o) => o.id === cible)) {
    const visee = await lireOperation(cible);
    if (visee) operations.unshift(visee);
  }
  return operations;
}
/** Les données du bac à sable DGI ne certifient jamais un document client. */
export async function lireConfirmee(factureId: string, avoirId?: string): Promise<OperationEmcf | null> {
  if (!UUID.test(factureId) || avoirId !== undefined && !UUID.test(avoirId)) return null;
  const lignes = await lire(`emcf_operations?select=*&facture_id=eq.${factureId}&avoir_id=${avoirId ? `eq.${avoirId}` : "is.null"}&environnement=eq.production&etat=eq.confirmee&limit=1`);
  if (!lignes) throw new Error("emcf_lecture_indisponible");
  const o = lignes[0];
  if (!o) return null;
  if (o.environnement !== "production" || o.etat !== "confirmee" || o.facture_id !== factureId
    || o.avoir_id !== (avoirId ?? null) || !o.uid || !o.calcul || !o.securite) throw new Error("emcf_lecture_indisponible");
  return o;
}
