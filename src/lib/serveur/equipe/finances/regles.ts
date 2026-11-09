import { CATEGORIES_GRILLE, type CategorieGrille, finances as F, MODES_DEPENSE, MODES_MANUELS, type ModeDepense, type ModeManuel } from "@/content/espace-finances";
import { LIMITES_DEVIS } from "@/content/documents";
import { dateDuJour, iso, jourDe, jourOuidah, minuitOuidah } from "@/lib/jours";

// Règles du lot « finances » (L7), partagées par les écrans (compteurs, refus pendant la saisie) et par les actions
// serveur (actions.ts), qui seules décident : tout ce qui arrive du navigateur est relu ici. Aucun secret, aucun accès à
// la base : le navigateur peut embarquer ce fichier. Jamais d'acompte : aucun champ de montant n'est lu pour un lien ou
// une facture ; seul un paiement reçu (manuel) porte le montant constaté, comparé ensuite au total par le serveur.

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MONTANT_MAX = 2_147_483_647; // colonnes entières 32 bits
export const JUSTIFICATIF_MAX = 921_600; // 900 Ko (une action serveur reçoit 1 Mo au plus)
export const TYPES_JUSTIFICATIF = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type TypeJustificatif = (typeof TYPES_JUSTIFICATIF)[number];
export const DEVISES = ["XOF", "EUR"] as const;
export type Devise = (typeof DEVISES)[number];
/** Modes pour lesquels la référence est obligatoire (l'espèce peut ne pas en avoir). */
export const AVEC_REFERENCE: readonly ModeManuel[] = ["virement", "mobile_money", "cheque"];

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MOIS = /^(\d{4})-(0[1-9]|1[0-2])$/;
const dans = <T extends string>(liste: readonly T[], v: unknown): v is T => typeof v === "string" && (liste as readonly string[]).includes(v);
export const uneLigne = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "");

/** Champs d'un envoi : FormData (formulaire) ou objet (appel direct) ; tout le reste donne un objet vide. */
export function champsDe(brut: unknown): Record<string, unknown> {
  if (typeof FormData !== "undefined" && brut instanceof FormData) {
    const o: Record<string, unknown> = {};
    for (const [k, v] of brut.entries()) if (!(k in o)) o[k] = v;
    return o;
  }
  return brut && typeof brut === "object" && !Array.isArray(brut) ? (brut as Record<string, unknown>) : {};
}

/** Montant en FCFA d'une somme en XOF, ou en centimes d'euro, au taux fixe (arrondi symétrique, en entiers exacts). */
export const enXof = (montant: number, devise: string) => (devise === "EUR" ? Math.sign(montant) * Math.round((Math.abs(montant) * 655_957) / 100_000) : montant);

// ---------- dates et mois (Ouidah, UTC+1) ----------

export const aujourdhuiOuidah = (ms: number) => iso(jourOuidah(ms));
export const moisDe = (jour: string) => jour.slice(0, 7);
export const moisCourant = (ms: number) => moisDe(aujourdhuiOuidah(ms));
export const moisValide = (v: unknown): v is string => typeof v === "string" && MOIS.test(v);
/** Bornes d'un mois « AAAA-MM » : jours (AAAA-MM-01, 1er du mois suivant) et instants ISO à Ouidah. */
export function bornesMois(mois: string) {
  const [y, m] = mois.split("-").map(Number);
  const debut = jourDe(y, m - 1, 1), fin = jourDe(y, m, 1);
  return { jourDebut: iso(debut), jourFin: iso(fin), debut: new Date(minuitOuidah(debut)).toISOString(), fin: new Date(minuitOuidah(fin)).toISOString() };
}
export function decaler(mois: string, n: number) {
  const [y, m] = mois.split("-").map(Number);
  const d = dateDuJour(jourDe(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function dateValide(v: unknown): v is string {
  const d = typeof v === "string" ? DATE.exec(v) : null;
  if (!d) return false;
  const t = new Date(Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3])));
  return t.getUTCFullYear() === Number(d[1]) && t.getUTCMonth() === Number(d[2]) - 1 && t.getUTCDate() === Number(d[3]);
}
/** Date de réception ou de dépense : passée ou du jour, au plus un an en arrière. */
export const datePassee = (v: unknown, aujourdhui: string): v is string => dateValide(v) && v <= aujourdhui && v >= iso(jourOuidah(Date.parse(`${aujourdhui}T12:00:00Z`)) - 366);

// ---------- montants ----------

const ENTIER = /^\d{1,10}$/;
const DECIMAL = /^\d{1,8}([.,]\d{1,2})?$/;
/** Entier FCFA > 0 (« 150 000 » accepté), ou null. */
export function lireFcfa(v: unknown): number | null {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.replace(/[\s  ]/g, "") : "";
  if (!ENTIER.test(s)) return null;
  const n = Number(s);
  return n > 0 && n <= MONTANT_MAX ? n : null;
}
/** Montant reçu dans sa devise : FCFA entiers, ou euros (2 décimales au plus) gardés en centimes. */
export function lireMontant(v: unknown, devise: Devise): number | null {
  if (devise === "XOF") return lireFcfa(v);
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.replace(/[\s  ]/g, "") : "";
  if (!DECIMAL.test(s)) return null;
  const c = Math.round(Number(s.replace(",", ".")) * 100);
  return c > 0 && c <= MONTANT_MAX ? c : null;
}

/** Total d'un devis : la somme de ses lignes, rien d'autre (aucun acompte, aucun montant libre). */
export const totalLignes = (lignes: { quantite: number; prix_unitaire: number }[]) => lignes.reduce((t, l) => t + l.quantite * l.prix_unitaire, 0);

// ---------- saisies ----------

export type Lu<T> = { ok: true; v: T } | { ok: false; champs: string[] };

const REFERENCE = /^[\p{L}\p{N} ._/#:-]{3,80}$/u;
export type PaiementSaisi = { mode: ModeManuel; devis: string | null; commande: string | null; reservation: string | null; montant: number; devise: Devise; recuLe: string; reference: string | null; payeur: string };
/** Paiement reçu en agence. Le justificatif (fichier) est contrôlé à part ; obligatoire pour un virement. */
export function lirePaiement(brut: unknown, aujourdhui: string): Lu<PaiementSaisi> {
  const o = champsDe(brut);
  const champs: string[] = [];
  const mode = dans(MODES_MANUELS, o.mode) ? o.mode : null;
  if (!mode) champs.push("mode");
  const devis = typeof o.devis === "string" && UUID.test(o.devis) ? o.devis : null;
  const commande = typeof o.commande === "string" && UUID.test(o.commande) ? o.commande : null;
  const reservation = typeof o.reservation === "string" && UUID.test(o.reservation) ? o.reservation : null;
  if ([devis, commande, reservation].filter(Boolean).length !== 1 || ["devis", "commande", "reservation"].some((k) => o[k] && (typeof o[k] !== "string" || !UUID.test(o[k] as string)))) champs.push("devis");
  const devise: Devise | null = o.devise === undefined || o.devise === "" ? "XOF" : dans(DEVISES, o.devise) ? o.devise : null;
  if (!devise) champs.push("devise");
  const montant = devise ? lireMontant(o.montant, devise) : null;
  if (montant === null) champs.push("montant");
  if (!datePassee(o.recu_le, aujourdhui)) champs.push("jour");
  const reference = uneLigne(o.reference) || null;
  if ((mode && AVEC_REFERENCE.includes(mode) && !reference) || (reference && !REFERENCE.test(reference))) champs.push("reference");
  const payeur = uneLigne(o.payeur);
  if (payeur.length < 2 || payeur.length > 120) champs.push("payeur");
  if (champs.length || !mode || !devise || montant === null) return { ok: false, champs };
  return { ok: true, v: { mode, devis, commande, reservation, montant, devise, recuLe: o.recu_le as string, reference, payeur } };
}

export type DepenseSaisie = { jour: string; libelle: string; montant: number; mode: ModeDepense };
export function lireDepense(brut: unknown, aujourdhui: string): Lu<DepenseSaisie> {
  const o = champsDe(brut);
  const champs: string[] = [];
  if (!datePassee(o.jour, aujourdhui)) champs.push("jour");
  const libelle = uneLigne(o.libelle);
  if (!libelle || libelle.length > 120) champs.push("libelle");
  const montant = lireFcfa(o.montant);
  if (montant === null) champs.push("montant");
  if (!dans(MODES_DEPENSE, o.mode)) champs.push("mode");
  if (champs.length || montant === null) return { ok: false, champs };
  return { ok: true, v: { jour: o.jour as string, libelle, montant, mode: o.mode as ModeDepense } };
}

export function lireMotif(v: unknown): string | null {
  const m = uneLigne(v);
  return m.length >= 3 && m.length <= 280 ? m : null;
}

export function lireAvoir(brut: unknown): Lu<{ montant: number; motif: string }> {
  const o = champsDe(brut);
  const montant = lireFcfa(o.montant);
  const motif = lireMotif(o.motif);
  const champs = [...(montant === null ? ["montant"] : []), ...(motif === null ? ["motif"] : [])];
  return champs.length || montant === null || motif === null ? { ok: false, champs } : { ok: true, v: { montant, motif } };
}

/** Lien de paiement : seule la durée de validité se choisit. Tout montant ou acompte envoyé est ignoré. */
export function lireLien(brut: unknown): Lu<{ devis: string; jours: number }> {
  const o = champsDe(brut);
  const jours = Number(o.jours);
  const devis = typeof o.devis === "string" && UUID.test(o.devis) ? o.devis : null;
  const champs = [...(devis ? [] : ["devis"]), ...(F.liens.durees.includes(jours) ? [] : ["expire"])];
  return champs.length || !devis ? { ok: false, champs } : { ok: true, v: { devis, jours } };
}

export type PrixSaisi = { id: string | null; categorie: CategorieGrille; libelle: string; unite: string | null; prix: number };
export function lirePrix(brut: unknown): Lu<PrixSaisi> {
  const o = champsDe(brut);
  const champs: string[] = [];
  const id = typeof o.id === "string" && o.id ? o.id : null;
  if (id !== null && !UUID.test(id)) champs.push("id");
  if (!dans(CATEGORIES_GRILLE, o.categorie)) champs.push("categorie");
  const libelle = uneLigne(o.libelle);
  if (!libelle || libelle.length > LIMITES_DEVIS.libelle) champs.push("libelle");
  const unite = uneLigne(o.unite) || null;
  if (unite && unite.length > 40) champs.push("unite");
  const s = typeof o.prix === "number" ? String(o.prix) : typeof o.prix === "string" ? o.prix.replace(/[\s  ]/g, "") : "";
  const prix = /^\d{1,7}$/.test(s) ? Number(s) : NaN;
  if (!Number.isInteger(prix) || prix < 0 || prix > LIMITES_DEVIS.prixUnitaire) champs.push("prix");
  if (champs.length) return { ok: false, champs };
  return { ok: true, v: { id, categorie: o.categorie as CategorieGrille, libelle, unite, prix } };
}

export type Coordonnees = { titulaire: string | null; banque: string | null; iban: string | null; bic: string | null; mobile_money: string[]; relance_jours: number | null };
export function lireCoordonnees(brut: unknown): Lu<Coordonnees> {
  const o = champsDe(brut);
  const champs: string[] = [];
  const titulaire = uneLigne(o.titulaire) || null;
  if (titulaire && titulaire.length > 120) champs.push("titulaire");
  const banque = uneLigne(o.banque) || null;
  if (banque && banque.length > 120) champs.push("banque");
  const iban = uneLigne(o.iban).replace(/\s/g, "").toUpperCase() || null;
  if (iban && !/^[A-Z0-9]{10,42}$/.test(iban)) champs.push("iban");
  const bic = uneLigne(o.bic).replace(/\s/g, "").toUpperCase() || null;
  if (bic && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(bic)) champs.push("bic");
  const mobile = (typeof o.mobile === "string" ? o.mobile.split(/\r?\n/) : []).map(uneLigne).filter(Boolean);
  if (mobile.length > 4 || mobile.some((l) => l.length > 60 || !/\d{6}/.test(l.replace(/\D/g, "")))) champs.push("mobile");
  const r = uneLigne(o.relance);
  const relance = r ? Number(r) : null;
  if (relance !== null && (!Number.isInteger(relance) || relance < 1 || relance > 90)) champs.push("relance");
  if (champs.length) return { ok: false, champs };
  return { ok: true, v: { titulaire, banque, iban, bic, mobile_money: mobile, relance_jours: relance } };
}

// ---------- justificatif ----------

/** Type réel d'un fichier d'après ses premiers octets (jamais d'après son nom ni le type annoncé), ou null. */
export function typeJustificatif(o: Uint8Array): TypeJustificatif | null {
  const a = (i: number, ...v: number[]) => v.every((x, k) => o[i + k] === x);
  if (a(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf"; // %PDF-
  if (a(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (a(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (a(0, 0x52, 0x49, 0x46, 0x46) && a(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp"; // RIFF….WEBP
  return null;
}

// ---------- états ----------

export type EtatLien = "cree" | "envoye" | "ouvert" | "paye" | "expire" | "annule";
export function etatLien(l: { annule_le: string | null; paye_le: string | null; expire_le: string; ouvert_le: string | null; envoye_le: string | null }, ms: number): EtatLien {
  if (l.paye_le) return "paye";
  if (l.annule_le) return "annule";
  if (Date.parse(l.expire_le) <= ms) return "expire";
  if (l.ouvert_le) return "ouvert";
  if (l.envoye_le) return "envoye";
  return "cree";
}

// ---------- export CSV (Excel : séparateur « ; », BOM UTF-8) ----------

/** Cellule CSV : guillemets doublés ; un texte qui commence par = + - @ (formule) est neutralisé par une apostrophe. */
const cellule = (v: string | number | null) => {
  if (v === null) return "";
  if (typeof v === "number") return String(v);
  const t = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
export const csv = (lignes: (string | number | null)[][]) => `﻿${lignes.map((l) => l.map(cellule).join(";")).join("\r\n")}\r\n`;
