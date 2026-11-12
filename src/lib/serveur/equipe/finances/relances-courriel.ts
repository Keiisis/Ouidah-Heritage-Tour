import { copiesFacture } from "@/content/espace-finances";
import { copiesRelance } from "@/content/relances";
import { copies } from "@/content/courriels";
import { langueDoc } from "@/lib/suivi";
import { avis, ligne, nomLangue } from "../../courriels/avis";
import { cloture, debut, fcfa, prenomDe, textes, type Modele } from "../../courriels/commun";
import { boutons, courriel, notes, paragraphes, titre } from "../../courriels/gabarit";
import type { Reglages } from "./lectures";
import { virementActif } from "./lectures";

export type DocumentRelance = { id: string; facture: string; numero: string; client: { nom: string; email: string; langue: string }; montant: number; devis: string };

/** Copie interne de chaque relance envoyée, en français, aux destinataires des avis à l'équipe. */
export function avisRelance(d: DocumentRelance, origine: string, lien: string | null) {
  return avis(
    {
      sujet: `Relance envoyée · ${d.numero} · ${d.client.nom}`,
      apercu: `${d.client.nom} · ${fcfa(d.montant, "FR")} restant à régler · ${d.numero}`,
      titre: `Relance envoyée à ${d.client.nom}`,
      donnee: d.numero,
      bouton: { libelle: `Écrire à ${prenomDe(d.client.nom)}`, href: `mailto:${d.client.email}` },
      lignes: [
        ligne("Facture", d.numero),
        ligne("Montant restant", fcfa(d.montant, "FR")),
        ligne("Client", d.client.nom),
        ligne("E-mail", d.client.email),
        ligne("Langue", nomLangue(langueDoc(d.client.langue))),
        ligne("Lien de paiement", lien ? "joint à la relance" : "aucun lien valable joint"),
      ],
      raison: "Copie interne de chaque relance de facture envoyée par ouidahheritagetour.bj.",
    },
    origine,
  );
}

/** Même gabarit que les courriels devis. Aucun délai, pénalité ou montant inventé. */
export function courrielRelance(d: DocumentRelance, origine: string, lien: string | null, reglages: Reglages | null, modele: Modele = null) {
  const L = langueDoc(d.client.langue), r = copiesRelance[L], f = copiesFacture[L], sep = copies[L].sep;
  const t = textes(modele, { prenom: prenomDe(d.client.nom), reference: d.numero, lien: lien ?? undefined }, { sujet: r.sujet(d.numero), corps: [f.bonjour(d.client.nom), r.corps] });
  const banque = virementActif(reglages) && reglages ? [[f.titulaire, reglages.titulaire], [f.banque, reglages.banque], [f.iban, reglages.iban], [f.bic, reglages.bic]].filter((v): v is [string, string] => Boolean(v[1])) : [];
  const coordonnees = [...banque.map(([libelle, valeur]) => ({ libelle, valeur })), ...(reglages?.mobile ?? []).map((valeur) => ({ libelle: f.mobile, valeur }))];
  return courriel({ langue: L, sujet: t.sujet, apercu: `${d.numero}${sep}${fcfa(d.montant, L)}` }, [
    ...debut(origine, null, L),
    titre({ phrase: { avant: r.titre }, donnee: d.numero, montant: fcfa(d.montant, L) }, L, origine),
    paragraphes(t.corps, L),
    notes([{ libelle: r.solde, valeur: fcfa(d.montant, L), fort: true }], [], L, sep, "0px 24px 24px"),
    boutons({ principal: lien ? { libelle: r.payer, href: lien } : null }, sep, "0px 24px 28px"),
    notes(coordonnees, coordonnees.length ? [f.reference(d.numero)] : [], L, sep, "0px 24px 24px"),
    paragraphes([r.deja], L),
    ...cloture(L, null, r.raison),
  ]);
}
