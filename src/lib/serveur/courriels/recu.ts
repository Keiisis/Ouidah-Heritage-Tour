import { communs, copies } from "@/content/courriels";
import { copiesAuto } from "@/content/courriels-auto";
import { suivi } from "@/content/suivi";
import { lireContenu } from "@/lib/contenu";
import { base } from "../base";
import { envoyerAvis, envoyerCourriel, type PieceJointe } from "../courriel";
import { lireDossier } from "../documents/dossier";
import { jetonSuivi } from "../documents/jeton";
import { rendrePdf } from "../documents/pdf";
import { pdfRecu } from "../equipe/finances/documents";
import { factureServeur } from "../equipe/finances/lectures";
import { avisEquipe } from "@/content/espace-finances";
import { avis, lienFerme, ligne, nomLangue, stockInsuffisant } from "./avis";
import { cloture, dateLongue, debut, fcfa, langueDe, lireModele, type Modele, prenomDe, textes } from "./commun";
import { boutons, courriel, notes, paragraphes, titre } from "./gabarit";

// Paiement en ligne réussi d'un lien (devis ou commande de la boutique) : reçu au client dans sa langue (montant, moyen,
// référence, lien /suivi, reçu R- en PDF joint quand il existe) et avis à l'équipe. UN SEUL envoi de chaque, même si le
// retour du client et le webhook arrivent ensemble : chacun est d'abord pris en base (liens_paiement.courriel_recu_le,
// avis_recu_le : PATCH conditionnel, sur le modèle de devis.courriel_pret_pour), rendu si l'envoi échoue.
export type DonneesRecu = {
  langue: string;
  nom: string;
  email: string;
  montant: number; // FCFA, montant du lien payé
  payeLe: string;
  passerelle: string; // nom affiché de la passerelle
  transaction: string | null;
  reference: string; // D-… (ou DEM-…) ; OHT-B-…
  recu: string | null; // R-…
  jeton: string | null; // suivi d-… ou b-…
  commande: boolean;
  lien?: "annule" | "expire" | null; // lien fermé au moment du paiement (le paiement passe quand même, Kevin 11/11)
  stock?: boolean; // commande payée après son échéance, pièce plus disponible (stockInsuffisant)
};

export function messageRecu(d: DonneesRecu, origine: string, o: { modele?: Modele; joint?: boolean; suivi?: typeof suivi } = {}) {
  const textesSuivi = o.suivi ?? suivi;
  const L = langueDe(d.langue), c = copies[L], a = copiesAuto[L].recu, T = textesSuivi[L];
  const prenom = prenomDe(d.nom), montant = fcfa(d.montant, L, textesSuivi), lien = d.jeton ? `${origine}/suivi/${d.jeton}` : null;
  const t = textes(o.modele ?? null, { prenom: prenom || undefined, lien: lien ?? undefined, reference: d.reference }, { sujet: a.sujet(d.reference), corps: [a.corps] });
  const image = L === "FR" ? "paye" : L === "DE" ? "bezahlt" : null; // tampons dessinés ; autres langues : tampon en texte
  return courriel({ langue: L, sujet: t.sujet, apercu: a.apercu(montant, d.reference) }, [
    ...debut(origine, d.commande ? "wax" : "porte", L),
    titre({ phrase: { prenom, avant: a.phrase[0], trait: a.phrase[1], apres: "." }, donnee: dateLongue(d.payeLe, L, true, textesSuivi), montant, tampon: { alt: T.statut.paye, image } }, L, origine),
    paragraphes(t.corps, L),
    boutons({ principal: lien ? { libelle: a.bouton, href: lien } : null }, c.sep, "0px 24px 8px"),
    notes([{ libelle: T.ticket.payeAvec, valeur: d.passerelle }], [`${T.recap.reference}${c.sep}${d.reference}`, ...(d.recu ? [`${T.numero.recu} ${d.recu}${o.joint ? ` · ${a.joint}` : ""}`] : [])], L, c.sep),
    ...cloture(L, communs[L].question, a.raison),
  ]);
}

export function avisPaiement(d: DonneesRecu, origine: string) {
  const montant = fcfa(d.montant, "FR"), A = avisEquipe.paiement;
  return avis(
    {
      sujet: d.stock ? A.stockSujet(d.reference) : `Paiement reçu · ${montant} · ${d.reference}`,
      apercu: `${d.nom} · ${montant} · ${d.passerelle}`,
      titre: d.stock ? A.stockTitre(d.nom) : `Paiement reçu de ${d.nom}`,
      donnee: montant,
      bouton: { libelle: `Écrire à ${prenomDe(d.nom)}`, href: `mailto:${d.email}` },
      lignes: [
        ligne(A.stock, d.stock && A.stockTexte),
        ligne(A.lien, d.lien ? A[d.lien] : null),
        ligne("Objet", d.commande ? "Commande de la boutique" : "Devis"),
        ligne("Référence", d.reference),
        ligne("Reçu", d.recu),
        ligne("Payé avec", d.passerelle),
        ligne("Transaction", d.transaction),
        ligne("Payé le", dateLongue(d.payeLe, "FR")),
        ligne("Client", d.nom),
        ligne("E-mail", d.email),
        ligne("Langue", nomLangue(langueDe(d.langue))),
      ],
      raison: "Avis interne envoyé à l’équipe pour chaque paiement en ligne reçu sur ouidahheritagetour.bj.",
    },
    origine,
  );
}

// ---------- envoi unique ----------
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type Colonne = "courriel_recu_le" | "avis_recu_le";

/** Prise de l'envoi : seule la première requête obtient la ligne (lien payé, marque encore vide). Rend la marque posée. */
async function prendre(id: string, colonne: Colonne): Promise<string | null> {
  const t = new Date().toISOString();
  try {
    const r = await base(`liens_paiement?id=eq.${id}&paye_le=not.is.null&${colonne}=is.null&select=id`, { method: "PATCH", corps: { [colonne]: t }, prefer: "return=representation" });
    return r.ok && ((await r.json()) as unknown[]).length ? t : null;
  } catch {
    return null;
  }
}
/** Envoi raté : la marque est retirée pour qu'un appel suivant (webhook rejoué, retour du client) réessaie. */
async function rendre(id: string, colonne: Colonne, t: string) {
  await base(`liens_paiement?id=eq.${id}&${colonne}=eq.${encodeURIComponent(t)}`, { method: "PATCH", corps: { [colonne]: null }, prefer: "return=minimal" }).catch(() => null);
}

type LigneLien = {
  id: string; devis_id: string | null; demande_id: string | null; commande_id: string | null; facture_id: string | null; montant: number; langue: string;
  passerelle: string | null; transaction_id: string | null; paye_le: string | null; annule_le: string | null; expire_le: string;
  demande: { nom: string | null; email: string | null } | null;
  commande: { reference: string; statut: string; expiree: boolean; paiement_etat: string; contact: { prenom?: string; nom?: string; email?: string } | null } | null;
};

async function lireRecu(id: string, origine: string): Promise<{ d: DonneesRecu; pieces: PieceJointe[] } | null> {
  const r = await base(`liens_paiement?select=id,devis_id,demande_id,commande_id,facture_id,montant,langue,passerelle,transaction_id,paye_le,annule_le,expire_le,demande:demandes(nom,email),commande:boutique_commandes(reference,statut,expiree,paiement_etat,contact)&id=eq.${id}&limit=1`);
  const l = r.ok ? ((await r.json()) as LigneLien[])[0] : null;
  if (!l?.paye_le || !l.passerelle) return null;
  const commande = Boolean(l.commande_id);
  const source = commande ? `source=eq.commande&source_id=eq.${l.commande_id}` : `source=eq.devis&source_id=eq.${l.devis_id}`;
  const [docs, datesSection] = await Promise.all([base(`documents?select=type,numero&${source}&type=in.(D,R)`).then((x) => (x.ok ? (x.json() as Promise<{ type: string; numero: string }[]>) : [])), lireContenu("fr.datesSection")]);
  const numero = (type: string) => docs.find((x) => x.type === type)?.numero ?? null;
  const k = l.commande?.contact;
  const d: DonneesRecu = {
    langue: l.langue,
    nom: commande ? `${k?.prenom ?? ""} ${k?.nom ?? ""}`.trim() : (l.demande?.nom ?? ""),
    email: (commande ? k?.email : l.demande?.email) ?? "",
    montant: l.montant,
    payeLe: l.paye_le,
    passerelle: (datesSection.talon.passerelles as Record<string, { nom: string }>)[l.passerelle]?.nom ?? l.passerelle,
    transaction: l.transaction_id,
    reference: commande ? (l.commande?.reference ?? `CMD-${l.commande_id!.slice(0, 6).toUpperCase()}`) : (numero("D") ?? `DEM-${(l.demande_id ?? "").slice(0, 6).toUpperCase()}`),
    recu: numero("R"),
    jeton: commande ? jetonSuivi("b", l.commande_id!) : l.demande_id ? jetonSuivi("d", l.demande_id) : null,
    commande,
    lien: lienFerme(l),
    stock: Boolean(l.commande && stockInsuffisant(l.commande)),
  };
  // reçu R- déjà émis : son PDF, rendu par les modules des documents ; un échec n'empêche pas l'e-mail
  let pdf: { pdf: Uint8Array; numero: string } | null = null;
  if (d.recu) {
    try {
      if (commande && d.jeton) {
        const dossier = await lireDossier(d.jeton);
        pdf = dossier?.document?.type === "recu" ? { pdf: await rendrePdf(dossier, origine), numero: dossier.document.numero } : null;
      } else if (l.facture_id) {
        const f = await factureServeur(l.facture_id);
        pdf = f ? await pdfRecu(f, origine) : null;
      }
    } catch {
      pdf = null;
    }
  }
  return { d, pieces: pdf ? [{ nom: `${pdf.numero}.pdf`, contenu: pdf.pdf, type: "application/pdf" }] : [] };
}

/** Après un paiement en ligne réussi (webhook ou retour du client) : reçu au client et avis à l'équipe, une seule fois. */
export async function envoyerRecuLien(id: string, origine: string) {
  if (!UUID.test(id)) return { client: false, equipe: false };
  const [tc, ta] = await Promise.all([prendre(id, "courriel_recu_le"), prendre(id, "avis_recu_le")]);
  if (!tc && !ta) return { client: false, equipe: false };
  const lu = await lireRecu(id, origine).catch(() => null);
  let client = false, equipe = false;
  if (lu && tc && lu.d.email) {
    const L = langueDe(lu.d.langue);
    const [modele, textesSuivi] = await Promise.all([lireModele("auto-recu", L), lireContenu("suivi.suivi")]);
    const m = messageRecu(lu.d, origine, { modele, joint: lu.pieces.length > 0, suivi: textesSuivi });
    client = await envoyerCourriel({ a: lu.d.email, sujet: m.sujet, html: m.html, texte: m.texte, repondreA: process.env.EMAIL_OHT || null, cle: `lien-${id}-recu`, pieces: lu.pieces, modele: "auto-recu" });
  }
  if (lu && ta) {
    const a = avisPaiement(lu.d, origine);
    equipe = await envoyerAvis({ sujet: a.sujet, html: a.html, texte: a.texte, repondreA: lu.d.email || null, cle: `lien-${id}-avis`, modele: "avis-paiement" });
  }
  if (tc && !client) await rendre(id, "courriel_recu_le", tc);
  if (ta && !equipe) await rendre(id, "avis_recu_le", ta);
  return { client, equipe };
}
