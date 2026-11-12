import { contact, copies } from "@/content/courriels";
import { devisPage } from "@/content/fr";
import { avisEquipe } from "@/content/espace-finances";
import { debut, prenomDe } from "./commun";
import { boutons, courriel, mot, notes, pied, titre, type Lien, type Note } from "./gabarit";

// Avis internes à l'équipe (adresse EMAIL_OHT), en français, au format de l'avis de demande (messages.ts avisOht) :
// emblème, phrase titre, donnée, bouton « Écrire à … », détails en deux colonnes, mot du client, pied « avis interne ».
// Aucune photo. Toutes les valeurs viennent de la démarche enregistrée.

/** Ligne de détail, omise quand la valeur est vide. */
export const ligne = (libelle: string, valeur: string | string[] | null | undefined | false): Note | null => (valeur && valeur.length ? { libelle, valeur } : null);

/** Commande payée après son échéance alors que sa pièce était repartie : boutique_recalculer_commande la laisse annulée,
 * l'argent reçu « à régulariser » (le paiement passe, Kevin 11/11). L'équipe doit contacter le client. */
export const stockInsuffisant = (c: { statut: string; expiree: boolean; paiement_etat: string }) => c.statut === "annulee" && c.expiree && c.paiement_etat === "a_regulariser";

/** Lien fermé au moment de son paiement : annulé avant (annule_le) ou expiré (expire_le passé) ; null s'il était ouvert. */
export function lienFerme(l: { paye_le: string | null; annule_le: string | null; expire_le: string }): "annule" | "expire" | null {
  const paye = l.paye_le ? Date.parse(l.paye_le) : Number.NaN;
  if (!Number.isFinite(paye)) return null;
  if (l.annule_le && Date.parse(l.annule_le) <= paye) return "annule";
  return Date.parse(l.expire_le) <= paye ? "expire" : null;
}

/** Nom français d'une langue du site (« Anglais ») pour l'équipe. */
export const nomLangue = (l: string) => (devisPage.langues as Record<string, string>)[l] ?? l;

export function avis(o: { sujet: string; apercu: string; titre: string; donnee?: string | null; bouton?: Lien | null; lignes: (Note | null)[]; mot?: { texte: string; auteur: string | null } | null; raison: string }, origine: string) {
  return courriel({ langue: "FR", sujet: o.sujet, apercu: o.apercu }, [
    ...debut(origine, null, "FR"),
    titre({ phrase: { avant: o.titre, apres: "." }, donnee: o.donnee ?? null }, "FR", origine),
    boutons({ principal: o.bouton ?? null }, " : ", "0px 24px 8px"),
    notes(o.lignes.filter((x): x is Note => x !== null), [], "FR", " : ", "32px 24px 16px"),
    mot(o.mot?.texte ?? "", o.mot?.auteur ?? null, "FR", "8px 24px 32px"),
    pied({ adresse: copies.FR.signature, email: contact, raison: o.raison }, "FR", " : "),
  ]);
}

/** Réservation réglée en agence qui repasse en attente (écriture inverse du règlement, TRANSITIONS_RESERVATION
 * paye → attente, gardée par décision de Kevin du 11/11) : ses billets ne valent plus à l'entrée (un billet = une
 * réservation payée). Avis à l'équipe seulement, pour qu'elle prévienne le client : aucun e-mail automatique au client. */
export function avisReservationAttente(r: { reference: string; nom: string; email: string; langue: string; evenement: string; occurrence: string; formule: string; quantite: number; motif: string }, origine: string) {
  const A = avisEquipe.reservation, L = A.lignes;
  return avis(
    {
      sujet: A.sujet(r.reference),
      apercu: A.apercu(r.nom, r.quantite),
      titre: A.titre(r.nom),
      donnee: r.reference,
      bouton: r.email ? { libelle: A.ecrire(prenomDe(r.nom)), href: `mailto:${r.email}` } : null,
      lignes: [
        ligne(L.suite, A.suite),
        ligne(L.billets, A.billets(r.quantite)),
        ligne(L.evenement, `${r.evenement} · ${r.formule}`),
        ligne(L.date, r.occurrence),
        ligne(L.motif, r.motif),
        ligne(L.client, r.nom),
        ligne(L.email, r.email),
        ligne(L.langue, nomLangue(r.langue)),
      ],
      raison: A.raison,
    },
    origine,
  );
}
