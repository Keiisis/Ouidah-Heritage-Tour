// Règles du lot « terrain » (L5), partagées par l'écran (file hors ligne, saisie) et par les actions serveur, qui seules
// décident : tout ce qui arrive du navigateur est relu ici. Aucun secret, aucun accès à la base : le navigateur peut
// embarquer ce fichier. La signature d'un billet n'est vérifiée que par le serveur (paiement/billet.ts).

import { UUID } from "../dossiers-regles";
import type { Transitions } from "../../machines";

/** Code lu dans le QR d'un billet (billets() de paiement/billet.ts) : OHT1:<réservation>:<rang>:<signature>. */
const CODE = /^OHT1:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(\d{1,2}):([A-Za-z0-9_-]{22})$/;
/** Numéro imprimé sous le QR : OHT-<8 premiers caractères de la réservation>-<rang>. */
const NUMERO = /^OHT-([0-9A-F]{8})-(\d{1,2})$/;
const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const APPAREIL = /^[A-Za-z0-9_-]{8,64}$/;
export const RANG_MAX = 10;

export type BilletLu =
  | { type: "code"; code: string; reservation: string; rang: number }
  | { type: "numero"; numero: string; prefixe: string; rang: number };

/** Ce que l'agent a scanné ou saisi : un code signé, ou le numéro imprimé (espaces retirés, en majuscules). */
export function lireBillet(v: unknown): BilletLu | null {
  if (typeof v !== "string" || v.length > 120) return null;
  const brut = v.trim();
  const c = CODE.exec(brut);
  if (c) {
    const rang = Number(c[2]);
    return rang >= 1 && rang <= RANG_MAX ? { type: "code", code: brut, reservation: c[1], rang } : null;
  }
  const n = NUMERO.exec(brut.replace(/\s+/g, "").toUpperCase());
  if (n) {
    const rang = Number(n[2]);
    return rang >= 1 && rang <= RANG_MAX ? { type: "numero", numero: `OHT-${n[1]}-${rang}`, prefixe: n[1].toLowerCase(), rang } : null;
  }
  return null;
}

/** Numéro d'un billet d'après sa réservation et son rang (même forme que billets() de paiement/billet.ts). */
export const numeroBillet = (reservation: string, rang: number) => `OHT-${reservation.slice(0, 8).toUpperCase()}-${rang}`;

/** Une entrée de la file du téléphone, telle qu'elle part au serveur. */
export type EntreeFile = {
  cle: string; // tirée par le téléphone au scan : la même entrée renvoyée deux fois reste une seule entrée
  code: string;
  evenement: string;
  occurrence: string; // AAAA-MM-JJ, premier jour de l'édition contrôlée
  entre_le: number; // ms, heure du scan sur le téléphone
  appareil: string;
  mode: "camera" | "saisie";
  hors_ligne: boolean;
};

const MIN = 60_000;
/** Heure du contrôle : celle du téléphone si elle est plausible (48 h en arrière, 5 min en avant), sinon maintenant. */
export const borner = (t: unknown, maintenant: number) => (typeof t === "number" && Number.isFinite(t) && t <= maintenant + 5 * MIN && t >= maintenant - 48 * 60 * MIN ? Math.floor(t) : maintenant);

export function lireEntree(brut: unknown, maintenant: number): { ok: true; v: EntreeFile; billet: BilletLu } | { ok: false } {
  const o = brut && typeof brut === "object" && !Array.isArray(brut) ? (brut as Record<string, unknown>) : {};
  const billet = lireBillet(o.code);
  if (!billet || typeof o.cle !== "string" || !UUID.test(o.cle)) return { ok: false };
  if (typeof o.evenement !== "string" || !/^[a-z0-9-]{1,60}$/.test(o.evenement) || typeof o.occurrence !== "string" || !JOUR.test(o.occurrence)) return { ok: false };
  if (typeof o.appareil !== "string" || !APPAREIL.test(o.appareil) || (o.mode !== "camera" && o.mode !== "saisie")) return { ok: false };
  return {
    ok: true,
    billet,
    v: { cle: o.cle, code: billet.type === "code" ? billet.code : billet.numero, evenement: o.evenement, occurrence: o.occurrence, entre_le: borner(o.entre_le, maintenant), appareil: o.appareil, mode: o.mode, hors_ligne: o.hors_ligne === true },
  };
}

// refus définitifs (l'entrée quitte la file) et refus d'attente (elle reste sur le téléphone et repartira)
export type RefusEntree = "falsifie" | "inconnu" | "non_paye" | "autreDate" | "champs" | "edition" | "secret";
export type RetourEntree =
  // entrees : nombre d'entrées de l'édition relu après l'écriture (null si la base ne l'a pas rendu)
  | { ok: true; numero: string; nom: string; formule: string; entre_le: number; entrees: number | null; rejoue: boolean }
  | { erreur: "deja"; numero: string; nom: string; entre_le: number; entrees: number | null }
  | { erreur: "autre"; evenement: string }
  | { erreur: RefusEntree }
  | { erreur: "refuse" | "panne" };
/** Vrai si l'entrée doit rester dans la file (session tombée, base muette) : elle repartira. */
export const aRejouer = (r: RetourEntree) => "erreur" in r && (r.erreur === "refuse" || r.erreur === "panne");

// ---------- commandes boutique ----------

export const ETATS_COMMANDE = ["a_confirmer", "a_preparer", "prete", "remise", "annulee"] as const;
export type EtatCommande = (typeof ETATS_COMMANDE)[number];
/** boutique_commandes.statut (machine à états, recopiée par 20261120_machines_etats.sql). Équipe : avancer_commande_boutique
 * (pas suivant ou annulation) ; base : boutique_expirer_commandes (paiement immédiat échu → annulee) et
 * boutique_recalculer_commande (commande échue puis payée en retard, stock disponible → a_preparer). */
export const TRANSITIONS_COMMANDE: Transitions<EtatCommande> = {
  a_confirmer: ["a_preparer", "annulee"],
  a_preparer: ["prete", "annulee"],
  prete: ["remise", "annulee"],
  remise: [],
  annulee: ["a_preparer"],
};
/** Action « avancer » de l'équipe depuis chaque état (jamais à rebours) et la colonne datée qu'elle remplit ; l'écran et
 * l'action serveur la confrontent à TRANSITIONS_COMMANDE. */
export const SUIVANT: Partial<Record<EtatCommande, { vers: EtatCommande; colonne: "prepare_le" | "prete_le" | "remise_le" }>> = {
  a_confirmer: { vers: "a_preparer", colonne: "prepare_le" },
  a_preparer: { vers: "prete", colonne: "prete_le" },
  prete: { vers: "remise", colonne: "remise_le" },
};
export type RetourCommande = { ok: true } | { erreur: "refuse" | "etat" | "champs" | "panne" | "stock" | "paiement" | "prix" };
