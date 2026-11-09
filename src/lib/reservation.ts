import PAYS from "@/content/pays.json";
import type { Evenement } from "@/content/types";
import { EMAIL, LIMITES } from "@/lib/demande";
import { iso, prochaine } from "@/lib/jours";
import { PASSERELLES, type NomPasserelle } from "@/lib/serveur/paiement/types";

// Réservation d'un événement depuis la section Agenda. Le navigateur choisit l'événement, la formule, le nombre de places
// et la passerelle ; il n'envoie jamais de prix : le serveur le lit dans le contenu (`tarif`).
export const QUANTITE_MAX = 10;
const LANGUES = new Set(["FR", "EN", "ES", "DE", "PT", "HT", "GCF"]);
const CODES_PAYS = new Set<string>(PAYS);

export type DemandeReservation = {
  evenement: string;
  formule: number;
  quantite: number;
  nom: string;
  email: string;
  telephone: string | null;
  pays: string | null;
  langue: string;
  passerelle: NomPasserelle;
  consentement: boolean;
  piege: boolean; // champ caché rempli : robot
  duree: number; // ms passées sur le panneau
};

const texte = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const entier = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : null);

/** Demande lisible et complète, sinon null. Tout champ inattendu (dont un éventuel montant) est ignoré. */
export function lireDemandeReservation(x: unknown): DemandeReservation | null {
  if (!x || typeof x !== "object") return null;
  const d = x as Record<string, unknown>;
  const formule = entier(d.formule), quantite = entier(d.quantite), duree = entier(d.duree);
  const evenement = texte(d.evenement, 60), nom = texte(d.nom, LIMITES.nom), email = texte(d.email, LIMITES.email);
  const telephone = texte(d.telephone, LIMITES.whatsapp) || null;
  const pays = typeof d.pays === "string" && CODES_PAYS.has(d.pays) ? d.pays : null;
  const langue = typeof d.langue === "string" && LANGUES.has(d.langue) ? d.langue : null;
  const passerelle = PASSERELLES.find((p) => p === d.passerelle) ?? null;
  if (!/^[a-z0-9-]{1,60}$/.test(evenement) || formule === null || formule < 0 || formule > 20) return null;
  if (quantite === null || quantite < 1 || quantite > QUANTITE_MAX || duree === null || !langue || !passerelle) return null;
  if (!nom || !EMAIL.test(email) || d.consentement !== true) return null;
  return { evenement, formule, quantite, nom, email, telephone, pays, langue, passerelle, consentement: true, piege: Boolean(d.site), duree };
}

/** Billets envoyés avec un voyage (dossier unique) : événements et formules connus du contenu, un par événement. */
export function lireBilletsEnvoyes(x: unknown, evenements: Evenement[]): { evenement: string; formule: number; quantite: number }[] {
  if (!Array.isArray(x)) return [];
  const vus = new Set<string>();
  return x.slice(0, 5).flatMap((v) => {
    const b = (v ?? {}) as Record<string, unknown>;
    const e = evenements.find((ev) => ev.slug === b.evenement);
    const formule = entier(b.formule), quantite = entier(b.quantite);
    const n = e?.offre.type === "billet" ? e.offre.categories.length : 1;
    if (!e || vus.has(e.slug) || formule === null || formule < 0 || formule >= n || quantite === null || quantite < 1 || quantite > QUANTITE_MAX) return [];
    vus.add(e.slug);
    return [{ evenement: e.slug, formule, quantite }];
  });
}

export type Tarif = { formuleNom: string; prix: number; capacite: number | null; occurrence: string; fin: string };

/** Prix unitaire (FCFA) et édition à venir, lus dans le contenu. null : inconnu, ou prix « sur demande » (→ devis). */
export function tarif(evenements: Evenement[], slug: string, formule: number, aujourdhui: number): Tarif | null {
  const e = evenements.find((x) => x.slug === slug);
  if (!e) return null;
  const o = e.offre;
  const choix = o.type === "billet" ? o.categories[formule] : formule === 0 ? { nom: o.nom, prix: o.prix } : undefined;
  if (!choix || choix.prix === null || !Number.isInteger(choix.prix) || choix.prix <= 0) return null;
  const capacite = o.type === "billet" ? (o.jauge ?? o.places) : o.places;
  const [debut, fin] = prochaine(e.quand, aujourdhui);
  return { formuleNom: choix.nom, prix: choix.prix, capacite, occurrence: iso(debut), fin: iso(fin) };
}
