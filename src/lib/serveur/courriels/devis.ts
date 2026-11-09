import { communs, copies } from "@/content/courriels";
import { copiesDevis } from "@/content/courriels-devis";
import { suivi } from "@/content/suivi";
import { datesEn } from "../equipe/messages/rendu";
import { cloture, dateLongue, debut, fcfa, langueDe, type Modele, prenomDe, textes } from "./commun";
import { addition, boutons, courriel, mot, notes, paragraphes, titre } from "./gabarit";

// « Votre devis pour Ouidah est prêt » : montant, lignes, validité, mot de l'agent, numéros D- et T-, bouton « Signer mon
// devis » (/suivi/<jeton>/signer) et PDF (/suivi/<jeton>/document). Toutes les valeurs viennent du devis publié.
export type DonneesDevis = {
  nom: string;
  langue: string;
  jeton: string; // lien de suivi de la demande (d-…)
  numero: string | null; // D-AAAA-NNNNNN
  ticket: string | null; // T-AAAA-NNNNNN
  reference: string; // DEM-…
  lignes: { libelle: string; quantite: number; prixUnitaire: number }[];
  montant: number; // FCFA, somme des lignes recalculée par le serveur
  valableJusquAu: string | null; // AAAA-MM-JJ
  note: string | null; // mot de l'agent
  agent: string | null; // prénom de l'agent
  sejour: { arrivee: string; depart: string } | null; // AAAA-MM-JJ
};

export function messageDevisPret(d: DonneesDevis, origine: string, modele: Modele = null, textesSuivi = suivi) {
  const L = langueDe(d.langue), c = copies[L], v = copiesDevis[L], T = textesSuivi[L];
  const prenom = prenomDe(d.nom), lien = `${origine}/suivi/${d.jeton}`;
  const montant = fcfa(d.montant, L, textesSuivi), jusquau = d.valableJusquAu ? dateLongue(d.valableJusquAu, L, false, textesSuivi) : null;
  const t = textes(modele, { prenom: prenom || undefined, dates: datesEn(d.sejour, L) ?? undefined, lien, reference: d.reference }, { sujet: v.sujet, corps: [v.corps] });
  const gris = [d.numero ? `${T.numero.devis} ${d.numero}` : "", `${c.refDemande}${c.sep}${d.reference}`].filter(Boolean);
  return courriel({ langue: L, sujet: t.sujet, apercu: v.apercu(d.numero ?? d.reference, montant, jusquau) }, [
    ...debut(origine, "porte", L),
    titre({ phrase: { prenom, avant: v.phrase[0], trait: v.phrase[1], apres: "." }, donnee: d.sejour ? c.dates(dateLongue(d.sejour.arrivee, L, false, textesSuivi), dateLongue(d.sejour.depart, L, false, textesSuivi)) : null, montant }, L, origine),
    paragraphes(t.corps, L),
    boutons({ principal: { libelle: v.signer, href: `${lien}/signer` }, secondaire: { libelle: communs[L].pdf(T.actions.devis), href: `${lien}/document` } }, c.sep, "0px 24px 28px"),
    mot(d.note ?? "", d.agent ? v.conseiller(d.agent) : null, L),
    addition(
      d.lignes.map((l) => ({ titre: l.libelle, detail: `${l.quantite} × ${fcfa(l.prixUnitaire, L, textesSuivi)}`, montant: fcfa(l.quantite * l.prixUnitaire, L, textesSuivi), valeur: l.quantite * l.prixUnitaire })),
      { libelle: T.devis.total, montant, valeur: d.montant },
      L,
      c.sep,
      "36px 24px 0px",
    ),
    notes([...(jusquau ? [{ libelle: v.valable, valeur: jusquau }] : []), ...(d.ticket ? [{ libelle: T.ticket.no, valeur: d.ticket, fort: true }] : [])], gris, L, c.sep, "28px 24px 0px"),
    ...cloture(L, v.modifier, v.raison, {}, "28px 24px 48px"),
  ]);
}
