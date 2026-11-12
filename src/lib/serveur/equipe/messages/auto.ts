import "server-only";
import { codes, copies } from "@/content/courriels";
import { copiesAuto } from "@/content/courriels-auto";
import { copiesBillets } from "@/content/courriels-billets";
import { copiesBoutique } from "@/content/courriels-boutique";
import { copiesDevis } from "@/content/courriels-devis";
import { copiesCode } from "@/content/courriels-equipe";
import { copiesLettre } from "@/content/courriels-lettre";
import { copiesFacture } from "@/content/espace-finances";
import { EXEMPLE_AUTO as E, type LangueMsg, VARIABLES } from "@/content/espace-messages";
import { newsletter } from "@/content/fr";
import { copiesRelance } from "@/content/relances";
import { JOUR } from "@/lib/jours";
import { messageAccuse } from "../../courriels/assistant";
import { messageCommande } from "../../courriels/boutique";
import { gabaritCode } from "../../courriels/code";
import type { Modele } from "../../courriels/commun";
import { messageDevisPret } from "../../courriels/devis";
import type { Courriel } from "../../courriels/gabarit";
import { messageLettre } from "../../courriels/lettre";
import { messageLien } from "../../courriels/lien";
import { messageRdv, messageRdvAnnule } from "../../courriels/rdv";
import { messageRecu } from "../../courriels/recu";
import { messageSignature } from "../../courriels/signature";
import { copieVoyageur } from "../../messages";
import { messageBillets } from "../../paiement/courriel";
import { courrielRelance } from "../finances/relances-courriel";
import type { CleAuto } from "./rendu";

// E-mails automatiques du site vus depuis l'écran Modèles : le texte par défaut de chaque clé et de chaque langue (celui
// que le module d'envoi emploie quand aucun modèle n'est enregistré), et le vrai rendu « la lettre illustrée » d'un texte,
// par les mêmes fonctions que l'envoi, avec les données d'exemple de content/espace-messages.ts (EXEMPLE_AUTO).

const MINUTES_CODE = 10; // validité du code de l'équipe, fixée par la base (equipe/courriel.ts)

// mêmes textes par défaut que les modules d'envoi (paiement/courriel, messages, courriels/*, finances/relances-courriel) ;
// la donnée propre à un envoi (référence, prénom) devient son champ variable, sinon celle de l'exemple
const DEFAUTS: Record<CleAuto, (L: LangueMsg) => { sujet: string; corps: string[] }> = {
  "auto-billets": (L) => ({ sujet: copiesBillets[L].sujet(E.evenement), corps: [copiesBillets[L].corps] }),
  "auto-demande": (L) => ({ sujet: copies[L].sujet, corps: [`${copies[L].relit} ${copies[L].devisSuivi}`] }),
  "auto-devis-pret": (L) => ({ sujet: copiesDevis[L].sujet, corps: [copiesDevis[L].corps] }),
  "auto-boutique": (L) => ({ sujet: copiesBoutique[L].sujet(VARIABLES.reference), corps: [copiesBoutique[L].corps] }),
  "auto-lettre": (L) => ({ sujet: copiesLettre[L].sujet, corps: [copiesLettre[L].intro(2)] }),
  "auto-code": (L) => ({ sujet: copiesCode[L].sujetPremiere, corps: [codes[L].corps(MINUTES_CODE), copiesCode[L].ignorer] }),
  "auto-relance": (L) => ({ sujet: copiesRelance[L].sujet(VARIABLES.reference), corps: [copiesFacture[L].bonjour(VARIABLES.prenom), copiesRelance[L].corps] }),
  "auto-rdv": (L) => ({ sujet: copiesAuto[L].rdv.sujet, corps: [copiesAuto[L].rdv.corps] }),
  "auto-rdv-annule": (L) => ({ sujet: copiesAuto[L].rdvAnnule.sujet, corps: [copiesAuto[L].rdvAnnule.corps] }),
  "auto-recu": (L) => ({ sujet: copiesAuto[L].recu.sujet(VARIABLES.reference), corps: [copiesAuto[L].recu.corps] }),
  "auto-signature": (L) => ({ sujet: copiesAuto[L].signature.sujet, corps: [copiesAuto[L].signature.corps] }),
  "auto-assistant": (L) => ({ sujet: copiesAuto[L].assistant.sujet, corps: [copiesAuto[L].assistant.corps] }),
  "auto-lien": (L) => ({ sujet: copiesAuto[L].lien.sujet(VARIABLES.reference), corps: [copiesAuto[L].lien.corps] }),
};

/** Texte par défaut d'un e-mail automatique, tel que l'éditeur le montre (paragraphes séparés par une ligne vide). */
export function defautAuto(cle: CleAuto, L: LangueMsg) {
  const d = DEFAUTS[cle](L);
  return { sujet: d.sujet, corps: d.corps.join("\n\n") };
}

const jour = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / JOUR);

/** Rendu réel d'un e-mail automatique (modèle null : texte par défaut), avec les données d'exemple ; `prenom` : celui de
 * l'admin connecté. Lève une erreur si une condition de l'envoi manque (BILLET_SECRET pour les billets). */
export function apercuAuto(cle: CleAuto, L: LangueMsg, modele: Modele, prenom: string, origine: string): Courriel {
  const lien = `${origine}/suivi/${E.jeton}`, montant = E.quantite * E.prix;
  switch (cle) {
    case "auto-billets":
      return messageBillets({ id: E.id, evenement: E.evenement, occurrence: E.sejour.arrivee, formule_nom: E.formule, quantite: E.quantite, montant, devise: "XOF", passerelle: "kkiapay", transaction_id: null, statut: "paye", nom: prenom, email: "", telephone: null, langue: L, paye_le: null, courriel_envoye: false, demande_id: null }, origine, { ticket: E.ticket, modele });
    case "auto-demande":
      return copieVoyageur(
        {
          intention: "voyage",
          circuit: null,
          dossier: { sejour: { arrivee: jour(E.sejour.arrivee), depart: jour(E.sejour.depart) }, lieux: [], raisons: [], services: {}, devise: null, ville: null },
          reponses: { qui: null, adultes: E.quantite, enfants: 0, occasion: null, pays: null, langue: L, conseilDates: false, conseilLieux: false },
          champs: { nom: prenom, email: "", whatsapp: "", message: "" },
          consentement: true,
          piege: "",
          duree: 0,
        },
        E.reference,
        [],
        lien,
        { origine, ticket: E.ticket, modele },
      );
    case "auto-devis-pret":
      return messageDevisPret({ nom: prenom, langue: L, jeton: E.jeton, numero: E.devis, ticket: E.ticket, reference: E.reference, lignes: [{ libelle: E.ligne, quantite: E.quantite, prixUnitaire: E.prix }], montant, valableJusquAu: E.valable, note: null, agent: null, sejour: E.sejour }, origine, modele);
    case "auto-boutique":
      return messageCommande({ id: E.id, reference: E.commande, ticket: E.ticket, jeton: E.jeton, langue: L, contact: { prenom, email: "" }, lignes: [{ nom: E.ligne, quantite: E.quantite, prix_xof: E.prix, options: {} }], remise: { mode: "retrait" }, total_xof: montant, devise: "XOF", taux_usd: null }, origine, modele);
    case "auto-lettre":
      return messageLettre({ langue: L, sujets: newsletter.sujets.slice(0, 2).map((s) => s.id), desinscription: `${origine}/lettre/desinscription/${E.jeton}` }, origine, modele);
    case "auto-code":
      return gabaritCode(prenom, E.code, MINUTES_CODE, L, { premiere: true, origine, modele });
    case "auto-relance":
      return courrielRelance({ id: E.id, facture: E.id, numero: E.facture, client: { nom: prenom, email: "", langue: L }, montant, devis: E.devis }, origine, lien, null, modele);
    case "auto-rdv":
    case "auto-rdv-annule": {
      const rdv = { id: E.id, nom: prenom, email: "", telephone: null, message: null, langue: L, debut: E.rdv.debut, fin: E.rdv.fin, mode: "sur_place" as const, lieu: E.lieu };
      return cle === "auto-rdv" ? messageRdv(rdv, origine, modele) : messageRdvAnnule(rdv, origine, modele);
    }
    case "auto-recu":
      return messageRecu({ langue: L, nom: prenom, email: "", montant, payeLe: E.rdv.debut, passerelle: E.passerelle, transaction: null, reference: E.devis, recu: E.recu, jeton: E.jeton, commande: false }, origine, { modele });
    case "auto-signature":
      return messageSignature({ nom: prenom, email: "", langue: L, signataire: prenom, signeLe: E.rdv.debut, jeton: E.jeton, numero: E.devis, reference: E.reference, montant, agent: null }, origine, modele);
    case "auto-assistant":
      return messageAccuse({ id: E.id, langue: L, passage: E.rdv.debut, resume: null, nom: prenom, email: "", whatsapp: null }, origine, modele);
    case "auto-lien":
      return messageLien({ nom: prenom, langue: L, jeton: E.jeton, montant, expire: E.valable, numero: E.devis, reference: E.reference }, origine, modele);
  }
}
