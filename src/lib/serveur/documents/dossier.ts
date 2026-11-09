import { lireContenu } from "@/lib/contenu";
import { taxeDocument } from "../equipe/finances/fiscalite-regles";
import { iso, occurrence } from "@/lib/jours";
import { langueDoc, STATUTS_COMMANDE, type CasTicket, type Dossier, type LigneDevis, type ObjetSuivi, type StatutSuivi } from "@/lib/suivi";
import { base } from "../base";
import { passerellesActives } from "../paiement";
import { billets } from "../paiement/billet";
import { lireReservation } from "../paiement/finaliser";
import { expirerCommandes } from "../paiement/lien";
import { emettre } from "./emettre";
import { jetonSuivi, lireJeton } from "./jeton";
import { lireSignature } from "./signature";

// Lecture d'un dossier de suivi à partir de son jeton : la commande réelle, en base, jamais une donnée du navigateur.
// Numéros émis à la première lecture si l'émission à la commande a échoué. null = pas de dossier à montrer (jeton faux,
// commande absente, réservation pas encore payée, demande restée en brouillon).
type LigneDemande = { id: string; cree_le: string; statut: string; intention: "voyage" | "groupe" | "question"; circuit: string | null; langue: string; nom: string | null; email: string | null; dossier: { sejour?: { arrivee: number; depart: number } | null } | null; reponses: { adultes?: number; enfants?: number } | null };
type LigneDevisBase = { fiscalite?: Dossier["fiscalite"]; id: string; statut: "pret" | "paye"; lignes: { libelle: string; quantite: number; prix_unitaire: number }[]; montant: number; valable_jusqu_au: string | null; note: string | null; publie_le: string };
type LigneCommande = { fiscalite?: Dossier["fiscalite"]; paiement_etat: string; paye_le: string | null; montant_recu: number; id: string; reference: string; statut: string; lignes: { nom: string; quantite: number; prix_xof?: number | null; prix_eur?: number | null; options: Record<string, string> }[]; contact: { prenom: string; nom: string; email: string }; remise: { mode: "retrait" | "livraison" }; total_xof: number | null; total_eur: number | null; langue: string; cree_le: string; frais_livraison_xof: number | null; paiement_expire_le: string | null };

const premiere = async <T>(chemin: string): Promise<T | null> => {
  const r = await base(chemin).catch(() => null);
  return r?.ok ? (((await r.json()) as T[])[0] ?? null) : null;
};
const lienDocument = (jeton: string) => `/suivi/${jeton}/document`;

// image : tracé de la signature du client (lourd), lu seulement pour le PDF, jamais envoyé aux pages
export async function lireDossier(jeton: string, o: { image?: boolean } = {}): Promise<Dossier | null> {
  const j = lireJeton(jeton);
  if (!j) return null;
  if (j.s === "r") return dossierReservation(jeton, j.id);
  if (j.s === "d") return dossierDemande(jeton, j.id, o.image === true);
  return dossierCommande(jeton, j.id);
}

async function dossierReservation(jeton: string, id: string): Promise<Dossier | null> {
  const r = await lireReservation(`id=eq.${id}`);
  if (!r || (r.statut !== "paye" && r.statut !== "rembourse")) return null;
  const [ticket, recu, evenements, datesSection, copies] = await Promise.all([emettre("T", "reservation", r.id), emettre("R", "reservation", r.id), lireContenu("fr.evenements"), lireContenu("fr.datesSection"), lireContenu("suivi.suivi")]);
  if (!ticket) return null;
  const ev = evenements.find((e) => e.slug === r.evenement);
  const [y] = r.occurrence.split("-").map(Number);
  // Une édition retirée ne doit pas faire finir un ancien billet à l'édition suivante. Faute de fin historique
  // enregistrée, on conserve le jour réservé ; on ne complète la période que pour cette même occurrence.
  let fin = r.occurrence;
  if (ev?.quand.type === "editions") fin = ev.quand.dates.find(([debut]) => debut === r.occurrence)?.[1] ?? r.occurrence;
  else if (ev) {
    const periode = occurrence(ev.quand, y);
    if (iso(periode[0]) === r.occurrence) fin = iso(periode[1]);
  }
  return {
    jeton,
    cas: "paiement",
    langue: langueDoc(r.langue),
    reference: r.demande_id ? `DEM-${r.demande_id.slice(0, 6).toUpperCase()}` : `RES-${r.id.slice(0, 6).toUpperCase()}`,
    ticket: { numero: ticket.numero, date: ticket.cree_le },
    client: { nom: r.nom, email: r.email },
    objet: { type: "evenement", titre: ev?.title ?? r.evenement, debut: r.occurrence, fin, formule: r.formule_nom, places: r.quantite, prixUnitaire: Math.round(r.montant / r.quantite) },
    statut: r.statut,
    montant: { valeur: r.montant, devise: "XOF" },
    paiement: r.paye_le ? { passerelle: r.reglement_manuel ? copies[langueDoc(r.langue)].reglementAgence : (datesSection.talon.passerelles as Record<string, { nom: string }>)[r.passerelle]?.nom ?? r.passerelle, le: r.paye_le, transaction: r.reglement_manuel ? null : r.transaction_id } : null,
    document: recu && r.statut === "paye" ? { type: "recu", numero: recu.numero, date: recu.cree_le, url: lienDocument(jeton) } : null,
    devis: null,
    billets: r.statut === "paye" ? billets(r) : [],
    lie: r.demande_id ? jetonSuivi("d", r.demande_id) : null,
  };
}

async function dossierDemande(jeton: string, id: string, image: boolean): Promise<Dossier | null> {
  const d = await premiere<LigneDemande>(`demandes?select=id,cree_le,statut,intention,circuit,langue,nom,email,dossier,reponses&id=eq.${id}&statut=eq.envoyee&limit=1`);
  if (!d || !d.nom || !d.email) return null;
  const [ticket, devis, resa, tours] = await Promise.all([
    emettre("T", "demande", d.id),
    premiere<LigneDevisBase>(`devis?select=id,statut,lignes,montant,valable_jusqu_au,note,publie_le,fiscalite&demande_id=eq.${d.id}&statut=in.(pret,paye)&order=publie_le.desc&limit=1`),
    premiere<{ id: string }>(`reservations?select=id&demande_id=eq.${d.id}&statut=eq.paye&limit=1`),
    lireContenu("fr.tours"),
  ]);
  if (!ticket) return null;
  const [numeroDevis, signature] = devis ? await Promise.all([emettre("D", "devis", devis.id), lireSignature(devis.id, image)]) : [null, null];
  const sejour = d.dossier?.sejour ?? null;
  const objet: ObjetSuivi = {
    type: "voyage",
    intention: d.intention,
    circuit: d.circuit ? (tours.find((t) => t.slug === d.circuit)?.title ?? null) : null,
    arrivee: sejour ? iso(sejour.arrivee) : null,
    depart: sejour ? iso(sejour.depart) : null,
    adultes: d.reponses?.adultes ?? 0,
    enfants: d.reponses?.enfants ?? 0,
  };
  const lignes: LigneDevis[] = devis ? devis.lignes.map((l) => ({ libelle: l.libelle, quantite: l.quantite, prixUnitaire: l.prix_unitaire })) : [];
  const cas: CasTicket = devis ? "pret" : "attente";
  return {
    jeton,
    cas,
    langue: langueDoc(d.langue),
    reference: `DEM-${d.id.slice(0, 6).toUpperCase()}`,
    ticket: { numero: ticket.numero, date: ticket.cree_le },
    client: { nom: d.nom, email: d.email },
    objet,
    statut: devis ? (devis.statut === "paye" ? "paye" : "pret") : "attente",
    montant: { valeur: devis ? devis.montant : null, devise: "XOF" },
    fiscalite: taxeDocument(devis?.fiscalite, devis?.montant ?? 0),
    paiement: null,
    document: devis && numeroDevis ? { type: "devis", numero: numeroDevis.numero, date: devis.publie_le, url: lienDocument(jeton) } : null,
    devis: devis ? { lignes, montant: devis.montant, valableJusquAu: devis.valable_jusqu_au, note: devis.note } : null,
    billets: [],
    lie: resa ? jetonSuivi("r", resa.id) : null,
    signature: signature ? { nom: signature.nom, signe_le: signature.signe_le, empreinte: signature.empreinte, image: signature.trace, texte: signature.texte } : null,
  };
}

// Commandes de la boutique : le FCFA entier fait foi depuis le 04/11 ; une commande plus ancienne n'a que ses euros,
// convertis au taux fixe (1 € = 655,957 FCFA) pour être lue de la même façon.
const enXof = (xof: number | string | null | undefined, eur: number | string | null | undefined) =>
  xof != null ? Number(xof) : eur != null ? Math.round(Number(eur) * 655.957) : null;

const enAttenteDePaiement = (c: LigneCommande) => c.statut === "a_preparer" && c.paiement_etat === "attente" && Number(c.montant_recu) === 0 && c.paiement_expire_le !== null;

async function dossierCommande(jeton: string, id: string): Promise<Dossier | null> {
  const chemin = `boutique_commandes?select=id,reference,statut,lignes,contact,remise,total_xof,total_eur,langue,cree_le,paiement_etat,paye_le,montant_recu,fiscalite,frais_livraison_xof,paiement_expire_le&id=eq.${id}&limit=1`;
  let c = await premiere<LigneCommande>(chemin);
  if (!c) return null;
  // paiement immédiat échu : stock rendu et commande annulée par la base avant affichage (libération paresseuse)
  if (enAttenteDePaiement(c) && Date.parse(c.paiement_expire_le!) <= Date.now() && (await expirerCommandes())) c = (await premiere<LigneCommande>(chemin)) ?? c;
  const ticket = await emettre("T", "commande", c.id);
  if (!ticket) return null;
  const regle = c.paiement_etat === "paye" && c.paye_le !== null;
  // réglée en ligne : la passerelle et la transaction du lien payé ; sinon règlement en agence (paiements manuels)
  const [recu, copies, enLigne, datesSection] = await Promise.all([
    regle ? emettre("R", "commande", c.id) : null,
    lireContenu("suivi.suivi"),
    regle ? premiere<{ passerelle: string; transaction_id: string; paye_le: string }>(`liens_paiement?select=passerelle,transaction_id,paye_le&commande_id=eq.${c.id}&paye_le=not.is.null&order=paye_le.asc&limit=1`) : null,
    regle ? lireContenu("fr.datesSection") : null,
  ]);
  // confirmée par l'équipe (ou à paiement immédiat avant l'échéance), prix connu, rien de reçu : le client peut payer en
  // ligne si une passerelle est active
  const echu = c.paiement_expire_le !== null && Date.parse(c.paiement_expire_le) <= Date.now() + 60_000;
  const payable = (c.statut === "a_preparer" || c.statut === "prete") && c.paiement_etat === "attente" && Number(c.montant_recu) === 0 && Number.isInteger(c.total_xof) && (c.total_xof ?? 0) > 0 && !echu;
  return {
    jeton,
    cas: "boutique",
    langue: langueDoc(c.langue),
    reference: c.reference,
    ticket: { numero: ticket.numero, date: ticket.cree_le },
    client: { nom: `${c.contact.prenom} ${c.contact.nom}`.trim(), email: c.contact.email },
    objet: { type: "boutique", articles: c.lignes.map((l) => ({ nom: l.nom, quantite: l.quantite, prixXof: enXof(l.prix_xof, l.prix_eur), options: Object.values(l.options ?? {}).filter((v) => typeof v === "string" && v) })), remise: c.remise.mode, livraison: c.frais_livraison_xof ?? null },
    // l'équipe confirme, prépare, puis remet la commande (statut posé par le serveur) ; paiement immédiat pas encore
    // reçu : « prêt à régler » (la commande n'est pas « confirmée, en préparation » avant son paiement)
    statut: enAttenteDePaiement(c) ? "pret" : (STATUTS_COMMANDE as readonly string[]).includes(c.statut) ? (c.statut as StatutSuivi) : "a_confirmer",
    montant: { valeur: enXof(c.total_xof, c.total_eur), devise: "XOF" },
    paiement: !regle ? null : enLigne && datesSection
      ? { passerelle: (datesSection.talon.passerelles as Record<string, { nom: string }>)[enLigne.passerelle]?.nom ?? enLigne.passerelle, le: c.paye_le!, transaction: enLigne.transaction_id }
      : { passerelle: copies[langueDoc(c.langue)].reglementAgence, le: c.paye_le!, transaction: null },
    document: recu ? { type: "recu", numero: recu.numero, date: recu.cree_le, url: lienDocument(jeton) } : null,
    fiscalite: taxeDocument(c.fiscalite, enXof(c.total_xof, c.total_eur) ?? 0),

    devis: null,
    billets: [],
    lie: null,
    payerEnLigne: payable && (await passerellesActives()).length > 0,
  };
}
