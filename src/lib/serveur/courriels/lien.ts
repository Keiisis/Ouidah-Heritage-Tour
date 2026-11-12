import { communs, copies } from "@/content/courriels";
import { copiesAuto } from "@/content/courriels-auto";
import { suivi } from "@/content/suivi";
import { cloture, dateLongue, debut, fcfa, langueDe, type Modele, prenomDe, textes } from "./commun";
import { boutons, courriel, notes, paragraphes, titre } from "./gabarit";

// Lien de paiement créé par l'équipe et envoyé au client (case « Envoyer le lien au client par e-mail ») : montant du
// lien (total du devis), fin de validité, bouton vers /payer/<jeton>, numéros du devis et de la demande, dans la langue
// enregistrée avec le lien (celle du client).
export type DonneesLien = { nom: string; langue: string; jeton: string; montant: number; expire: string; numero: string | null; reference: string };

export function messageLien(d: DonneesLien, origine: string, modele: Modele = null, textesSuivi = suivi) {
  const L = langueDe(d.langue), c = copies[L], a = copiesAuto[L].lien, T = textesSuivi[L];
  const prenom = prenomDe(d.nom), lien = `${origine}/payer/${d.jeton}`, ref = d.numero ?? d.reference;
  const montant = fcfa(d.montant, L, textesSuivi), jusquau = dateLongue(d.expire, L, false, textesSuivi);
  const t = textes(modele, { prenom: prenom || undefined, lien, reference: ref }, { sujet: a.sujet(ref), corps: [a.corps] });
  return courriel({ langue: L, sujet: t.sujet, apercu: a.apercu(montant, jusquau) }, [
    ...debut(origine, "porte", L),
    titre({ phrase: { prenom, avant: a.phrase[0], trait: a.phrase[1], apres: "." }, donnee: T.devis.valable(jusquau), montant }, L, origine),
    paragraphes(t.corps, L),
    boutons({ principal: { libelle: a.bouton, href: lien } }, c.sep, "0px 24px 8px"),
    notes([], [...(d.numero ? [`${T.numero.devis} ${d.numero}`] : []), `${c.refDemande}${c.sep}${d.reference}`], L, c.sep),
    ...cloture(L, communs[L].question, a.raison),
  ]);
}
