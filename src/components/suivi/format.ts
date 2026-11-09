import { DEVIS } from "@/content/fr";
import type { TexteSuivi, VueSuivi } from "@/content/suivi";
import type { Dossier, StatutSuivi } from "@/lib/suivi";

// Mise en forme du dossier dans la langue de la commande : dates et montants par Intl (mois écrits à la main pour HT et
// GCF), nom « Prénom N. », lignes du ticket selon l'objet. Heure du Bénin pour les horodatages : même rendu partout.
const FUSEAU = "Africa/Porto-Novo";
const instant = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);

export function date(T: TexteSuivi, iso: string) {
  const d = instant(iso);
  if (T.mois) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: FUSEAU, day: "numeric", month: "numeric", year: "numeric" }).formatToParts(d).map((x) => [x.type, x.value]));
    return `${p.day} ${T.mois[Number(p.month) - 1]} ${p.year}`;
  }
  return new Intl.DateTimeFormat(T.locale ?? "fr-FR", { timeZone: FUSEAU, day: "numeric", month: T.formatMois ?? "short", year: "numeric" }).format(d);
}

const periode = (T: TexteSuivi, debut: string, fin: string) => (debut === fin ? date(T, debut) : `${date(T, debut)} – ${date(T, fin)}`);

export function montant(T: TexteSuivi, valeur: number | null, devise: "XOF" | "EUR") {
  if (valeur === null) return T.ticket.dansDevis;
  const locale = T.locale ?? "fr-FR";
  return devise === "EUR" ? new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(valeur) : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(valeur)} FCFA`;
}

/** « Prénom N. » : premier mot et initiale du dernier. */
export function nomCourt(nom: string) {
  const m = nom.trim().split(/\s+/).filter(Boolean);
  return m.length < 2 ? (m[0] ?? "") : `${m[0]} ${m[m.length - 1].charAt(0).toUpperCase()}.`;
}

export function vueDe(d: Dossier): VueSuivi {
  if (d.cas === "paiement") return d.statut === "rembourse" ? "rembourse" : "paiement";
  if (d.cas === "pret") return d.statut === "paye" ? "regle" : "pret";
  return d.cas;
}

export type Ligne = [string, string];
export type Action = { libelle: string; href: string; primaire: boolean; document: boolean };
/** Tout ce que le ticket affiche, déjà traduit et formaté (passe tel quel au composant client de l'animation). */
export type VueTicket = {
  doc: string;
  lignes: Ligne[];
  total: Ligne;
  paye: Ligne | null;
  statut: { cle: StatutSuivi; texte: string };
  tampon: boolean;
  qr: { chemin: string; texte: string; numero: string | null; label: string };
  merci: string;
  titre: string;
  sous: string;
  actions: Action[];
  pays: string;
};

// lignes propres à l'objet de la commande : événement, voyage, boutique
function lignesObjet(d: Dossier, T: TexteSuivi): Ligne[] {
  const o = d.objet, t = T.ticket;
  if (o.type === "evenement") return [[t.evenement, o.titre], [t.dates, periode(T, o.debut, o.fin)], [t.formule, o.formule], [t.places, String(o.places)]];
  if (o.type === "voyage") {
    const l: Ligne[] = [o.circuit ? [t.circuit, o.circuit] : [t.projet, T.projet[o.intention]]];
    if (o.arrivee) l.push([t.periode, periode(T, o.arrivee, o.depart ?? o.arrivee)]);
    if (o.adultes + o.enfants > 0) l.push([t.voyageurs, String(o.adultes + o.enfants)]);
    return l;
  }
  // frais de livraison (compris dans le total) : ligne « Livraison » seulement s'il y en a
  return [...o.articles.map((a): Ligne => [t.article, `${a.nom} × ${a.quantite}`]), [t.reception, T.remise[o.remise]], ...(o.livraison ? [[T.remise.livraison, montant(T, o.livraison, "XOF")] as Ligne] : [])];
}

export function vueTicket(d: Dossier, T: TexteSuivi): VueTicket {
  const vue = vueDe(d), t = T.ticket, pays = T.titre[1];
  const doc = d.document;
  const qrTexte = doc ? T.qr[doc.type] : d.cas === "attente" ? T.qr.attente : d.cas === "boutique" ? T.qr.boutique : T.qr.suivi;
  const actions: Action[] = doc ? [{ libelle: T.actions[doc.type], href: doc.url, primaire: true, document: true }] : [];
  actions.push({ libelle: T.actions.agent, href: DEVIS.question, primaire: !doc, document: false });
  return {
    doc: T.doc[d.cas],
    lignes: [[t.no, d.ticket.numero], [t.date, date(T, d.ticket.date)], [d.objet.type === "boutique" ? t.client : t.voyageur, nomCourt(d.client.nom)], ...lignesObjet(d, T)],
    total: [d.montant.valeur === null ? t.montant : d.statut === "paye" ? t.totalRegle : t.total, montant(T, d.montant.valeur, d.montant.devise)],
    paye: d.paiement ? [t.payeAvec, d.paiement.passerelle] : null,
    statut: { cle: d.statut, texte: T.statut[d.statut] },
    tampon: d.statut === "paye",
    qr: { chemin: doc ? doc.url : `/suivi/${d.jeton}`, texte: qrTexte, numero: doc ? `${T.numero[doc.type]} ${doc.numero}` : null, label: T.qr.code },
    merci: T.merci[vue].replace("{pays}", pays),
    titre: T.titres[vue],
    sous: T.sous[vue],
    actions,
    pays,
  };
}

/** Récapitulatif sous le ticket : référence, numéros, objet, montant, paiement, statut. */
export function recap(d: Dossier, T: TexteSuivi): Ligne[] {
  const t = T.ticket;
  const l: Ligne[] = [[T.recap.reference, d.reference], [t.no, d.ticket.numero], [t.date, date(T, d.ticket.date)], [d.objet.type === "boutique" ? t.client : t.voyageur, nomCourt(d.client.nom)], ...lignesObjet(d, T)];
  l.push([d.montant.valeur === null ? t.montant : t.total, montant(T, d.montant.valeur, d.montant.devise)]);
  if (d.paiement) {
    l.push([t.payeAvec, d.paiement.passerelle], [T.recap.payeLe, date(T, d.paiement.le)]);
    if (d.paiement.transaction) l.push([T.recap.transaction, d.paiement.transaction]);
  }
  l.push([T.recap.statut, T.statut[d.statut]]);
  return l;
}
