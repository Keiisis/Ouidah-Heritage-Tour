import { lireContenu } from "@/lib/contenu";
import type { Evenement } from "@/content/types";
import { jourOuidah } from "@/lib/jours";
import { tarif, type Tarif } from "@/lib/reservation";
import { base } from "../base";
import { cleAcces } from "./billet";
import { lireReservation } from "./finaliser";
import { passerelle, passerellesActives } from ".";
import type { Lancement, NomPasserelle } from "./types";

// Réservation d'un événement payé en ligne, créée par l'envoi du voyage (/api/devis), depuis le talon de l'Agenda ou le
// billet de /devis. Le serveur calcule le montant à partir du contenu (prix FCFA × places), vérifie la jauge et la
// passerelle (activée par l'admin ET configurée), enregistre la réservation « en attente », puis prépare le paiement.
export type Payable = { evenement: string; formule: number; quantite: number };
export type Client = { nom: string; email: string; telephone: string | null; pays: string | null; langue: string };
export type Refus = { ok: false; erreur: "sur_demande" | "passerelle" | "complet" | "base" | "passerelle_injoignable"; status: number; restantes?: number };
export type Pret = { ok: true; tarif: Tarif };

/** Vérifie tout ce qui peut refuser une réservation, avant d'écrire quoi que ce soit. */
export async function verifierPayable(b: Payable, nom: NomPasserelle, evenements?: Evenement[]): Promise<Pret | Refus> {
  const t = tarif(evenements ?? await lireContenu("fr.evenements"), b.evenement, b.formule, jourOuidah(Date.now()));
  if (!t) return { ok: false, erreur: "sur_demande", status: 409 };
  if (!(await passerellesActives()).includes(nom)) return { ok: false, erreur: "passerelle", status: 400 };
  if (t.capacite !== null) {
    const r = await base(`reservations?select=quantite&evenement=eq.${b.evenement}&occurrence=eq.${t.occurrence}&statut=eq.paye`).catch(() => null);
    if (!r?.ok) return { ok: false, erreur: "base", status: 502 };
    const vendues = ((await r.json()) as { quantite: number }[]).reduce((s, x) => s + x.quantite, 0);
    if (vendues + b.quantite > t.capacite) return { ok: false, erreur: "complet", status: 409, restantes: Math.max(0, t.capacite - vendues) };
  }
  return { ok: true, tarif: t };
}

export type Creee = { ok: true; id: string; cle: string; montant: number; devise: "XOF"; lancement: Lancement };

/** Enregistre la réservation « en attente » et prépare le paiement chez la passerelle. */
export async function creerReservation(x: { b: Payable; t: Tarif; nom: NomPasserelle; client: Client; ip: string; demandeId: string | null; origine: string }): Promise<Creee | Refus> {
  const ligne = {
    evenement: x.b.evenement,
    occurrence: x.t.occurrence,
    formule: x.b.formule,
    formule_nom: x.t.formuleNom,
    quantite: x.b.quantite,
    prix_unitaire: x.t.prix,
    montant: x.t.prix * x.b.quantite,
    passerelle: x.nom,
    nom: x.client.nom,
    email: x.client.email,
    telephone: x.client.telephone,
    pays: x.client.pays,
    langue: x.client.langue,
    consentement_le: new Date().toISOString(),
    ip_hash: x.ip,
    demande_id: x.demandeId,
  };
  const r = await base("reservations?select=id", { method: "POST", corps: ligne, prefer: "return=representation" }).catch(() => null);
  const id = r?.ok ? ((await r.json()) as { id: string }[])[0]?.id : null;
  const resa = id ? await lireReservation(`id=eq.${id}`) : null;
  if (!resa) return { ok: false, erreur: "base", status: 502 };
  const cle = cleAcces(resa.id);
  const retour = `${x.origine}/?reservation=${resa.id}&cle=${cle}`; // la section Agenda se replace d'elle-même
  const lance = await passerelle(x.nom).lancer(resa, retour).catch(() => null);
  if (!lance) return { ok: false, erreur: "passerelle_injoignable", status: 502 }; // reste « en attente », sans effet
  if (lance.transaction) {
    const note = await base(`reservations?id=eq.${resa.id}&statut=eq.attente&transaction_id=is.null`, { method: "PATCH", corps: { transaction_id: lance.transaction, modifie_le: new Date().toISOString() } }).catch(() => null);
    if (!note?.ok) return { ok: false, erreur: "base", status: 502 };
  }
  return { ok: true, id: resa.id, cle, montant: resa.montant, devise: resa.devise, lancement: lance.lancement };
}
