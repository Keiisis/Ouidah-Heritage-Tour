import { communs, copies } from "@/content/courriels";
import { copiesBoutique } from "@/content/courriels-boutique";
import { suivi } from "@/content/suivi";
import { lireContenu } from "@/lib/contenu";
import type { ChoixOptions } from "@/lib/boutique-types";
import { envoyerCourriel } from "../courriel";
import { cloture, debut, dollars, euros, fcfa, langueDe, lireModele, type Modele, textes } from "./commun";
import { addition, boutons, courriel, notes, paragraphes, titre } from "./gabarit";

// « Commande de la boutique reçue » : statut « à confirmer », articles et prix en FCFA (ceux de la base, enregistrés avec
// la commande ; équivalent en € ou en $ au total quand le client a choisi cette devise, au taux figé avec la commande), retrait ou livraison, ticket T-, référence OHT-B-…, lien de suivi.
// Paiement immédiat (09/11) : statut « prêt à régler », texte « réglez en ligne, pièces réservées 30 minutes » à la place
// du texte (ou du modèle éditable) « l'équipe vous contacte » ; frais de livraison en ligne de l'addition.
export type DonneesCommande = {
  id: string;
  reference: string;
  ticket: string | null;
  jeton: string | null; // lien de suivi (b-…)
  langue: string;
  contact: { prenom: string; email: string };
  lignes: { nom: string; quantite: number; prix_xof: number | null; options: ChoixOptions }[];
  remise: { mode: string; adresse?: string; ville?: string; pays?: string };
  total_xof: number | null; // frais de livraison compris
  frais_xof?: number | null;
  immediat?: boolean;
  devise: string;
  taux_usd: number | null;
};

export function messageCommande(d: DonneesCommande, origine: string, modele: Modele = null, textesSuivi = suivi) {
  const L = langueDe(d.langue), c = copies[L], b = copiesBoutique[L], T = textesSuivi[L];
  const lien = d.jeton ? `${origine}/suivi/${d.jeton}` : null;
  const prix = (v: number | null) => (v === null ? null : fcfa(v, L, textesSuivi));
  const equivalent = d.total_xof === null ? null : d.devise === "EUR" ? euros(d.total_xof / 655.957, L, textesSuivi) : d.devise === "USD" && d.taux_usd ? dollars(d.total_xof / d.taux_usd, L, textesSuivi) : null;
  const t = textes(modele, { prenom: d.contact.prenom || undefined, lien: lien ?? undefined, reference: d.reference }, { sujet: b.sujet(d.reference), corps: [b.corps] });
  if (d.immediat) t.corps = [b.corpsPaiement];
  const livraison = d.remise.mode === "livraison";
  const pays = d.remise.pays ? (new Intl.DisplayNames([T.locale ?? "fr-FR"], { type: "region" }).of(d.remise.pays) ?? d.remise.pays) : null;
  const remise = livraison ? [T.remise.livraison, d.remise.adresse, [d.remise.ville, pays].filter(Boolean).join(", ")].filter((x): x is string => Boolean(x)) : [T.remise.retrait];
  return courriel({ langue: L, sujet: t.sujet, apercu: d.immediat ? b.corpsPaiement : b.apercu(d.reference) }, [
    ...debut(origine, "wax", L),
    titre({ phrase: { prenom: d.contact.prenom, avant: b.phrase[0], trait: b.phrase[1], apres: "." }, donnee: `${T.recap.statut}${c.sep}${d.immediat ? T.statut.pret : T.statut.a_confirmer}` }, L, origine),
    paragraphes(t.corps, L),
    boutons({ principal: lien ? { libelle: b.bouton, href: lien } : null }, c.sep, "0px 24px 28px"),
    addition(
      d.lignes.map((l) => ({
        titre: l.nom,
        detail: [...Object.values(l.options).filter((x): x is string => typeof x === "string" && x.length > 0), b.quantite(l.quantite, prix(l.prix_xof))].join(", "),
        montant: prix(l.prix_xof === null ? null : l.prix_xof * l.quantite) ?? "—",
      })).concat(d.frais_xof ? [{ titre: T.remise.livraison, detail: "", montant: prix(d.frais_xof) ?? "—" }] : []),
      { libelle: T.devis.total, montant: [prix(d.total_xof), equivalent && `≈ ${equivalent}`].filter(Boolean).join(" · ") || "—" },
      L,
      c.sep,
      "16px 24px 0px",
    ),
    notes([{ libelle: T.ticket.reception, valeur: remise }, ...(d.ticket ? [{ libelle: T.ticket.no, valeur: d.ticket, fort: true }] : [])], [`${T.recap.reference}${c.sep}${d.reference}`], L, c.sep, "28px 24px 0px"),
    ...cloture(L, communs[L].question, b.raison, {}, "28px 24px 48px"),
  ]);
}

/** Envoi au client après l'enregistrement de la commande ; false si l'envoi n'est pas configuré ou échoue. */
export async function envoyerCommande(d: DonneesCommande, origine: string) {
  const [modele, textesSuivi] = await Promise.all([lireModele("auto-boutique", langueDe(d.langue)), lireContenu("suivi.suivi")]);
  const m = messageCommande(d, origine, modele, textesSuivi);
  return envoyerCourriel({ a: d.contact.email, sujet: m.sujet, html: m.html, texte: m.texte, repondreA: process.env.EMAIL_OHT || null, cle: `boutique-${d.id}-recue` });
}
