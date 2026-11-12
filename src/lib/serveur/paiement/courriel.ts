import { communs, copies } from "@/content/courriels";
import { copiesBillets } from "@/content/courriels-billets";
import { datesSection, evenements } from "@/content/fr";
import { lireContenu } from "@/lib/contenu";
import { suivi } from "@/content/suivi";
import { courrielConfigure, envoyerCourriel } from "../courriel";
import { cloture, dateLongue, debut, fcfa, langueDe, lireModele, type Modele, prenomDe, textes } from "../courriels/commun";
import { boutons, courriel, notes, paragraphes, titre } from "../courriels/gabarit";
import { emettre } from "../documents/emettre";
import { jetonSuivi } from "../documents/jeton";
import { datesEn } from "../equipe/messages/rendu";
import { billets, cleAcces } from "./billet";
import { prendreEnvoi, rendreEnvoi } from "./finaliser";
import type { Reservation } from "./types";

// E-mail des billets, envoyé une seule fois par réservation payée (le retour et le webhook peuvent arriver ensemble :
// un seul prend la main). Les QR codes s'affichent sur le site par le lien personnel du client (page de suivi). Sans SMTP
// configuré, rien ne part et la réservation reste marquée « non envoyé » pour un envoi ultérieur.
export async function envoyerBillets(r: Reservation, origine: string) {
  if (r.statut !== "paye" || r.courriel_envoye || !courrielConfigure()) return false;
  if (!(await prendreEnvoi(r.id))) return false;
  const [ticket, recu, modele, evenements, datesSection, textesSuivi] = await Promise.all([emettre("T", "reservation", r.id), emettre("R", "reservation", r.id), lireModele("auto-billets", langueDe(r.langue)), lireContenu("fr.evenements"), lireContenu("fr.datesSection"), lireContenu("suivi.suivi")]);
  const m = messageBillets(r, origine, { ticket: ticket?.numero ?? null, recu: recu?.numero ?? null, modele, contenu: { evenements, datesSection }, suivi: textesSuivi });
  const parti = await envoyerCourriel({ a: r.email, sujet: m.sujet, html: m.html, texte: m.texte, repondreA: process.env.EMAIL_OHT || null, cle: `${r.id}-billets`, modele: "auto-billets" });
  if (!parti) await rendreEnvoi(r.id);
  return parti;
}

const liste = (x: string[], et: string) => (x.length > 1 ? `${x.slice(0, -1).join(", ")}${et}${x[x.length - 1]}` : (x[0] ?? ""));
const DEFAUTS = { evenements, datesSection };

/** Billets payés : date, montant et tampon PAYÉ, lien de suivi (QR codes) et reçu PDF, formule, passerelle, numéros. */
export function messageBillets(r: Reservation, origine: string, o: { ticket?: string | null; recu?: string | null; modele?: Modele; contenu?: typeof DEFAUTS; suivi?: typeof suivi } = {}) {
  const { evenements, datesSection } = o.contenu ?? DEFAUTS;
  const dictionnaire = o.suivi ?? suivi;
  const L = langueDe(r.langue), c = copies[L], b = copiesBillets[L], T = dictionnaire[L], k = communs[L];
  const evenement = evenements.find((e) => e.slug === r.evenement)?.title ?? r.evenement;
  const date = dateLongue(r.occurrence, L, true, dictionnaire), montant = fcfa(r.montant, L, dictionnaire), prenom = prenomDe(r.nom);
  // page de suivi : ticket, reçu PDF et billets QR, dans la langue du client
  const jeton = jetonSuivi("r", r.id);
  const lien = jeton ? `${origine}/suivi/${jeton}` : `${origine}/?reservation=${r.id}&cle=${cleAcces(r.id)}#agenda`;
  const reference = r.demande_id ? `DEM-${r.demande_id.slice(0, 6).toUpperCase()}` : `RES-${r.id.slice(0, 6).toUpperCase()}`;
  const passerelle = (datesSection.talon.passerelles as Record<string, { nom: string }>)[r.passerelle]?.nom ?? r.passerelle;
  const t = textes(o.modele ?? null, { prenom: prenom || undefined, dates: datesEn({ arrivee: r.occurrence, depart: r.occurrence }, L) ?? undefined, lien, reference }, { sujet: b.sujet(evenement), corps: [b.corps] });
  const image = L === "FR" ? "paye" : L === "DE" ? "bezahlt" : null; // tampons dessinés ; autres langues : tampon en texte
  return courriel({ langue: L, sujet: t.sujet, apercu: b.apercu(b.places(r.quantite), r.formule_nom, evenement, date) }, [
    ...debut(origine, "zangbeto", L),
    titre({ phrase: { prenom, avant: b.phrase(r.quantite, evenement) }, donnee: date, montant, tampon: { alt: T.statut.paye, image } }, L, origine),
    paragraphes(t.corps, L),
    boutons({ principal: { libelle: b.bouton, href: lien }, secondaire: jeton && o.recu ? { libelle: k.pdf(T.actions.recu), href: `${lien}/document` } : null }, c.sep, "0px 24px 8px"),
    notes(
      [
        { libelle: T.ticket.formule, valeur: `${r.formule_nom}, ${b.places(r.quantite)}` },
        { libelle: T.ticket.payeAvec, valeur: passerelle },
        ...(o.ticket ? [{ libelle: T.ticket.no, valeur: o.ticket, fort: true }] : []),
      ],
      [`${b.billets}${c.sep}${liste(billets(r).map((x) => x.numero), k.et)}`, ...(o.recu ? [`${T.numero.recu} ${o.recu}`] : [])],
      L,
      c.sep,
    ),
    ...cloture(L, k.question, b.raison),
  ]);
}
