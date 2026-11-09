import { conciergerie, destinations, devisPage as T, tenReasons, tours } from "@/content/fr";
import { contact, copies } from "@/content/courriels";
import { copiesBillets } from "@/content/courriels-billets";
import { suivi as textesSuivi } from "@/content/suivi";
import releve from "@/content/lieux-ouidah.json";
import { iso } from "@/lib/jours";
import type { Demande } from "@/lib/demande";
import { cloture, dateLongue, debut, langueDe, type Modele, prenomDe, textes } from "./courriels/commun";
import { boutons, courriel, mot, notes, paragraphes, pied, titre, type Note } from "./courriels/gabarit";
import { datesEn } from "./equipe/messages/rendu";

// E-mails d'une demande (gabarit « la lettre illustrée ») : la copie du voyageur dans sa langue, l'avis à OHT en
// français. Tout vient de la demande enregistrée (données nettoyées par le serveur), texte échappé dans le HTML.
// Origine des images : `o.origine`, sinon celle du lien de suivi, sinon SITE_URL ; aucune : e-mail sans image.
const DEFAUTS = { conciergerie, destinations, devisPage: T, tenReasons, tours, releve };
export const nomLieu = (id: string, contenu = DEFAUTS) => contenu.destinations.find((d) => d.slug === id)?.name ?? contenu.releve.lieux.find((l) => `r:${l.slug}` === id)?.nom ?? id;
const lieuxDe = (d: Demande, tours: typeof DEFAUTS.tours) => {
  const circuit = tours.find((t) => t.slug === d.circuit);
  return [...new Set([...(circuit?.stops ?? []), ...d.dossier.lieux])];
};
const demandes = (d: Demande, conciergerie: typeof DEFAUTS.conciergerie) => conciergerie.filter((q) => d.dossier.services[q.id]?.some((l) => !q.options.find((o) => o.label === l)?.passe));
const majuscule = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);
const origineDe = (o: string | undefined, suivi: string | null) => o ?? (suivi ? new URL(suivi).origin : (process.env.SITE_URL?.trim().replace(/\/$/, "") ?? ""));

type Options = { origine?: string; ticket?: string | null; modele?: Modele; contenu?: typeof DEFAUTS; suivi?: typeof textesSuivi };

/** Copie du voyageur : dates, lieux, services, voyageurs, billets, ticket T-, référence DEM-, lien de suivi. */
export function copieVoyageur(d: Demande, reference: string, billets: string[] = [], suivi: string | null = null, o: Options = {}) {
  const contenu = o.contenu ?? DEFAUTS;
  const { tours, conciergerie } = contenu;
  const dictionnaire = o.suivi ?? textesSuivi;
  const L = langueDe(d.reponses.langue), c = copies[L], S = dictionnaire[L], origine = origineDe(o.origine, suivi);
  const s = d.dossier.sejour, question = d.intention === "question", prenom = prenomDe(d.champs.nom);
  const sejour = s ? { arrivee: iso(s.arrivee), depart: iso(s.depart) } : null;
  const lieux = lieuxDe(d, tours).map((id) => nomLieu(id, contenu));
  const services = demandes(d, conciergerie).map((q) => L === "FR" && q.court !== DEFAUTS.conciergerie.find((x) => x.id === q.id)?.court ? q.court : c.noms[q.id] ?? q.court);
  const voyageurs = c.voyageurs(d.reponses.adultes, d.reponses.enfants);
  const circuit = tours.find((t) => t.slug === d.circuit)?.title;
  const t = textes(o.modele ?? null, { prenom: prenom || undefined, dates: datesEn(sejour, L) ?? undefined, lien: suivi ?? undefined, reference }, { sujet: c.sujet, corps: [question ? c.relit : `${c.relit} ${c.devisSuivi}`] });
  const lignes: (Note | false | "" | undefined)[] = question
    ? []
    : [
        circuit && { libelle: S.ticket.circuit, valeur: circuit },
        lieux.length ? { libelle: c.lieux, valeur: lieux } : d.reponses.conseilLieux && { libelle: c.lieux, valeur: c.aConseiller },
        services.length > 0 && { libelle: c.services, valeur: majuscule(services.join(", ")) },
        billets.length > 0 && { libelle: copiesBillets[L].billets, valeur: billets }, // billets envoyés avec la demande (dossier unique)
        Boolean(voyageurs) && { libelle: S.ticket.voyageurs, valeur: voyageurs },
      ];
  if (o.ticket) lignes.push({ libelle: S.ticket.no, valeur: o.ticket, fort: true });
  const donnee = sejour ? c.dates(dateLongue(sejour.arrivee, L, false, dictionnaire), dateLongue(sejour.depart, L, false, dictionnaire)) : !question && d.reponses.conseilDates ? c.datesConseil : null;
  return courriel({ langue: L, sujet: t.sujet, apercu: c.recu }, [
    ...debut(origine, "zoungbodji", L),
    titre({ phrase: { prenom, avant: c.phrase[question ? "question" : "voyage"][0], trait: c.phrase[question ? "question" : "voyage"][1], apres: "." }, donnee }, L, origine),
    paragraphes(t.corps, L),
    boutons({ principal: suivi ? { libelle: c.bouton, href: suivi } : null }, c.sep, "0px 24px 8px"),
    notes(lignes.filter((x): x is Note => Boolean(x)), [`${c.refDemande}${c.sep}${reference}`], L, c.sep),
    ...cloture(L, c.repondre, c.raison),
  ]);
}

/** Avis interne à OHT, en français, même gabarit en plus sobre : tout le dossier, sans photo. */
export function avisOht(d: Demande, reference: string, paysNom: string | null, billets: string[] = [], o: Options = {}) {
  const contenu = o.contenu ?? DEFAUTS;
  const { tours, conciergerie, devisPage: T, tenReasons } = contenu;
  const s = d.dossier.sejour, r = d.reponses, origine = origineDe(o.origine, null);
  const qui = T.qui.options.find((x) => x.id === r.qui);
  const date = (n: number) => dateLongue(iso(n), "FR", false, o.suivi ?? textesSuivi);
  const l = (libelle: string, valeur: string | string[] | null | undefined | false): Note | null => (valeur && valeur.length ? { libelle, valeur } : null);
  const lignes = [
    l("Référence", reference),
    l("Type", d.intention),
    l("Circuit", d.circuit ? tours.find((t) => t.slug === d.circuit)?.title : null),
    l("Langue de réponse", T.langues[r.langue] ?? r.langue),
    l("Nom", d.champs.nom),
    l("E-mail", d.champs.email),
    l("WhatsApp", d.champs.whatsapp),
    l("Pays de départ", paysNom),
    l("Ville détectée ou choisie", d.dossier.ville),
    ...(d.intention === "question"
      ? []
      : [
          l("Dates", s ? `Du ${date(s.arrivee)} au ${date(s.depart)} (${s.depart - s.arrivee} nuits)` : r.conseilDates && "à conseiller"),
          l("Lieux", lieuxDe(d, tours).length ? lieuxDe(d, tours).map((id) => nomLieu(id, contenu)) : r.conseilLieux && "à conseiller"),
          l("Services", demandes(d, conciergerie).map((q) => `${q.court} (${d.dossier.services[q.id].join(", ")})`)),
          l("Voyageurs", qui ? `${qui.phrase}, ${T.qui.nombre(r.adultes, r.enfants)}` : null),
          l("Occasion", r.occasion),
          l("Raisons entourées", d.dossier.raisons.map((x) => tenReasons.find((t) => t.slug === x)?.short ?? x)),
          l("Devise affichée", d.dossier.devise),
        ]),
    l("Billets d’événement", billets),
  ].filter((x): x is Note => x !== null);
  return courriel({ langue: "FR", sujet: `Nouvelle demande · ${d.champs.nom} · ${reference}`, apercu: `${d.champs.nom} · ${d.intention} · ${reference}` }, [
    ...debut(origine, null, "FR"),
    titre({ phrase: { avant: `Nouvelle demande de ${d.champs.nom}`, apres: "." }, donnee: reference }, "FR", origine),
    boutons({ principal: { libelle: `Écrire à ${prenomDe(d.champs.nom)}`, href: `mailto:${d.champs.email}` } }, " : ", "0px 24px 8px"),
    notes(lignes, [], "FR", " : ", "32px 24px 16px"),
    mot(d.champs.message ?? "", d.champs.message ? d.champs.nom : null, "FR", "8px 24px 32px"),
    pied({ adresse: copies.FR.signature, email: contact, raison: "Avis interne envoyé à l’équipe pour chaque demande reçue sur ouidahheritagetour.bj." }, "FR", " : "),
  ]);
}

