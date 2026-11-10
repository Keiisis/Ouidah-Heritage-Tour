import "server-only";
import * as assistantSite from "@/content/assistant-site";
import * as boutique from "@/content/boutique";
import { copiesBlog } from "@/content/blog-site";
import * as credits from "@/content/credits-photos";
import { copiesDocuments } from "@/content/documents";
import { copiesPayer } from "@/content/espace-finances";
import * as ficheCircuit from "@/content/fiche-circuit";
import * as ficheLieu from "@/content/fiche-lieu";
import * as fr from "@/content/fr";
import * as histoire from "@/content/histoire";
import * as introuvable from "@/content/introuvable";
import legal from "@/content/legal.json";
import { legalUi } from "@/content/legal-ui";
import releve from "@/content/lieux-ouidah.json";
import * as quiSommesNous from "@/content/qui-sommes-nous";
import * as suivi from "@/content/suivi";
import type { Media } from "@/content/types";
import { collecter, type Contexte, donnees, F, type Forme, inferer, longueurMax } from "./contenu-regles";
import { MODELES_MESSAGES } from "./traductions-messages";
import { estLangue, type Langue } from "./langue";
import { copiesServices, servicesEquipe } from "@/content/services";
import { seoSite, themeSite } from "@/content/site";
import { traductionAuto } from "@/content/traduction-auto";
import { reglages } from "@/content/espace-reglages";

// Registre du contenu modifiable : chaque export de données du site public, sa section du menu admin, la page publique
// où l'apercevoir et ses protections. Le défaut est l'export lui-même (jamais recopié) ; la forme s'en déduit
// (contenu-regles.ts), sauf aux chemins de INDICES, écrits à la main quand le défaut ne suffit pas (champ toujours vide,
// liste vide, dictionnaire de fiches, choix). Une rubrique « verrouillee » se lit dans l'éditeur sans se modifier
// (adresses techniques lues par le code).

export const SECTIONS_CONTENU = ["pages", "lieux", "circuits", "evenements", "conciergerie", "histoire", "medias", "temoignages", "traductions", "legales", "navigation"] as const;
export type SectionContenu = (typeof SECTIONS_CONTENU)[number];

// Partenaire de l'agence (hôtels, chauffeurs, artisans) : aucune donnée dans le code, la liste part vide.
export type Partenaire = { nom: string; activite: string; ville: string | null; site: string | null; logo: Media | null };

type Entree<T> = { defaut: T; section: SectionContenu; page: string; protege: boolean; verrouille: boolean };
const e = <T,>(defaut: T, section: SectionContenu, page = "/", o: { protege?: boolean; verrouille?: boolean } = {}): Entree<T> => ({ defaut, section, page, protege: o.protege ?? false, verrouille: o.verrouille ?? false });

export const REGISTRE = {
  "traduction-auto.interface": e(traductionAuto, "traductions"),
  "reglages.assistant": e(reglages.assistant, "traductions"),
  "reglages.emcf": e(reglages.emcf, "traductions"),
  "site.messages": e(MODELES_MESSAGES, "traductions"),
  "blog-site.copiesBlog": e(copiesBlog, "traductions", "/blog"),
  "services.copiesServices": e(copiesServices, "traductions"),
  "services.servicesEquipe": e(servicesEquipe, "traductions"),
  "site.seo": e(seoSite, "pages"),
  "site.theme": e(themeSite, "pages"),
  // Pages : textes de l'accueil et des pages (Hero, collage et appel final compris, avec des limites plus strictes)
  "fr.hero": e(fr.hero, "pages", "/", { protege: true }),
  "fr.welcome": e(fr.welcome, "pages"),
  "fr.welcomeStatement": e(fr.welcomeStatement, "pages"),
  "fr.placesIntro": e(fr.placesIntro, "pages", "/#lieux"),
  "fr.reasonsIntro": e(fr.reasonsIntro, "pages", "/#engagements"),
  "fr.reasons": e(fr.reasons, "pages", "/#engagements"),
  "fr.tenIntro": e(fr.tenIntro, "pages", "/#raisons"),
  "fr.tenReasons": e(fr.tenReasons, "pages", "/#raisons"),
  "fr.toursIntro": e(fr.toursIntro, "pages", "/#chemins"),
  "fr.cheminsIntro": e(fr.cheminsIntro, "pages", "/#chemins"),
  "fr.datesSection": e(fr.datesSection, "pages", "/#agenda"),
  "fr.prepare": e(fr.prepare, "pages", "/#preparer"),
  "fr.preparer": e(fr.preparer, "pages", "/#preparer"),
  "fr.emergency": e(fr.emergency, "pages", "/#preparer"),
  "fr.newsletter": e(fr.newsletter, "pages"),
  "fr.collage": e(fr.collage, "pages", "/", { protege: true }),
  "fr.finalCta": e(fr.finalCta, "pages", "/", { protege: true }),
  "fr.finalMask": e(fr.finalMask, "pages", "/", { protege: true }),
  "fr.devisPage": e(fr.devisPage, "pages", "/devis"),
  // libellés d'une ancienne présentation, absente du site actuel : conservés pour l'historique, sans édition sans effet
  "fr.enPreparation": e(fr.enPreparation, "pages", "/", { verrouille: true }),
  "fr.agence": e(fr.agence, "pages", "/a-propos"),
  "fr.equipe": e(fr.equipe, "pages", "/a-propos"),
  "qui-sommes-nous.quiSommesNous": e(quiSommesNous.quiSommesNous, "pages", "/a-propos"),
  "fiche-circuit.ficheCircuit": e(ficheCircuit.ficheCircuit, "pages", "/circuits/route-des-esclaves"),
  "fiche-lieu.ficheLieu": e(ficheLieu.ficheLieu, "pages", "/ouidah/lieux/musee-histoire"),
  "introuvable.introuvable": e(introuvable.introuvable, "pages", "/apercu-page-introuvable"),
  "boutique.boutique": e(boutique.boutique, "pages", "/boutique"),
  // Lieux (les listes du Hero comprises : lieux de la recherche)
  "fr.places": e(fr.places, "lieux", "/#lieux"),
  "fr.destinations": e(fr.destinations, "lieux", "/#chemins"),
  "fr.FICHES_LIEU": e(fr.FICHES_LIEU, "lieux", "/ouidah/lieux/musee-histoire"),
  "lieux-ouidah": e(releve, "lieux", "/#chemins"),
  // Circuits (filtres compris : types de voyage de la recherche du Hero)
  "fr.tours": e(fr.tours, "circuits", "/#chemins"),
  "fr.tourFilters": e(fr.tourFilters, "circuits", "/#chemins"),
  "fr.evenements": e(fr.evenements, "evenements", "/#agenda"),
  "fr.conciergeIntro": e(fr.conciergeIntro, "conciergerie", "/#conciergerie"),
  "fr.conciergerie": e(fr.conciergerie, "conciergerie", "/#conciergerie"),
  "histoire.histoireOuverture": e(histoire.histoireOuverture, "histoire", "/ouidah/histoire"),
  "histoire.histoireChapitres": e(histoire.histoireChapitres, "histoire", "/ouidah/histoire"),
  "histoire.histoireFinale": e(histoire.histoireFinale, "histoire", "/ouidah/histoire"),
  "histoire.histoirePage": e(histoire.histoirePage, "histoire", "/ouidah/histoire"),
  // ancien bandeau remplacé par fr.collage : ces exports n'ont plus de rendu public
  "fr.stripLabel": e(fr.stripLabel, "medias", "/", { verrouille: true }),
  "fr.stripImages": e(fr.stripImages, "medias", "/", { verrouille: true }),
  "fr.creditsPage": e(fr.creditsPage, "medias", "/mentions-legales#credits"),
  "credits-photos.creditsPhotos": e(credits.creditsPhotos, "medias", "/mentions-legales#credits"),
  "assistant-site.PHOTOS_ASSISTANT": e(assistantSite.PHOTOS_ASSISTANT, "medias"),
  // photos de départ réutilisées par les autres rubriques au chargement du code : aucun composant ne les lit ; une photo
  // se change dans la rubrique qui l'affiche
  "fr.IMG": e(fr.IMG, "medias", "/", { verrouille: true }),
  "fr.testimonials": e(fr.testimonials, "temoignages"),
  // aucune section partenaires dans le dessin actuel (les candidatures arrivent dans « Rendez-vous et candidatures ») :
  // la rubrique et ses versions restent dans les archives de « Pages », en lecture seule
  "site.partenaires": e([] as Partenaire[], "pages", "/a-propos", { verrouille: true }),
  "suivi.suivi": e(suivi.suivi, "traductions"),
  "suivi.signer": e(suivi.signer, "traductions"),
  "documents.copiesDocuments": e(copiesDocuments, "traductions"),
  "espace-finances.copiesPayer": e(copiesPayer, "traductions"),
  "assistant-site.assistantSite": e(assistantSite.assistantSite, "traductions"),
  "assistant-site.NOMS_LANGUES": e(assistantSite.NOMS_LANGUES, "traductions"),
  legal: e(legal, "legales", "/mentions-legales"),
  "legal-ui.legalUi": e(legalUi, "legales", "/mentions-legales"),
  "fr.consentement": e(fr.consentement, "legales", "/politique-de-confidentialite"),
  "fr.nav": e(fr.nav, "navigation"),
  "fr.footer": e(fr.footer, "navigation"),
  // ancres des sections et adresses du formulaire, lues par le code : modifiables seulement avec le code
  "fr.SECTIONS": e(fr.SECTIONS, "navigation", "/", { verrouille: true }),
  "fr.DEVIS": e(fr.DEVIS, "navigation", "/devis", { verrouille: true }),
};

export type Registre = typeof REGISTRE;
export type CleContenu = keyof Registre;
export type ValeurContenu<K extends CleContenu> = Registre[K]["defaut"];
export const estCle = (c: unknown): c is CleContenu => typeof c === "string" && Object.hasOwn(REGISTRE, c);
export type CleEdition = CleContenu | `${Exclude<Langue, "FR">}:${CleContenu}`;
export const cleEdition = (cle: CleContenu, langue: Langue = "FR"): CleEdition => langue === "FR" ? cle : `${langue}:${cle}`;
export function decomposerCle(cle: CleEdition): { cle: CleContenu; langue: Langue } {
  const i = cle.indexOf(":");
  return i < 0 ? { cle: cle as CleContenu, langue: "FR" } : { cle: cle.slice(i + 1) as CleContenu, langue: cle.slice(0, i) as Langue };
}
export function estCleEdition(v: unknown): v is CleEdition {
  if (estCle(v)) return true;
  if (typeof v !== "string") return false;
  const [langue, cle, reste] = v.split(":");
  return reste === undefined && langue !== "FR" && estLangue(langue) && estCle(cle) && traduisible(cle);
}
export const traduisible = (cle: CleContenu) => cle !== "site.theme" && !REGISTRE[cle].verrouille && (REGISTRE[cle].section !== "traductions" || cle === "site.messages");

const texteNul = (max = 200, long = false) => F.nul(F.texte(max, { long }));
// prix, places, nuits : entiers positifs ou nuls (montants en FCFA encaissés : jamais négatifs), null = non affiché
const nombreNul = (entier = true) => F.nul(F.nombre(entier, 0));
const mediaHistoire = F.nul(F.objet({ src: F.texte(500, { min: 1, motif: "src" }), largeur: F.nombre(true), hauteur: F.nombre(true), legende: F.texte(400, { min: 1, long: true }) }));
// recherche du Hero : libellés modifiables ; les options « Destination » et « Type de voyage » se déduisent des lieux
// (fr.places, écran Lieux) et des filtres (fr.tourFilters, écran Circuits) : figées ici ; « Durée » garde ses valeurs
const champsRecherche: Forme = {
  k: "paire",
  de: fr.hero.search.fields.map((c) =>
    F.objet({
      name: F.fixe(c.name),
      label: F.texte(longueurMax(c.label.length, true), { min: 1 }),
      objet: F.fixe(c.objet),
      options: c.name === "duree" ? { k: "paire", de: c.options.map((x) => F.objet({ value: F.fixe(x.value), label: F.texte(longueurMax(x.label.length, true), { min: 1 }) })) } : F.fixe(donnees(c.options) ?? null),
    }),
  ),
};

// Formes écrites à la main, par chemin (« [] » = élément de liste, « {} » = fiche d'un dictionnaire).
const INDICES: Contexte["indices"] = {
  "lieux-ouidah.lieux[].nom": F.texte(longueurMax(Math.max(...releve.lieux.map((l) => l.nom.length)), false), { min: 1, traduire: false }),
  "fr.equipe[].nom": F.texte(longueurMax(Math.max(...fr.equipe.map((p) => p.nom.length)), false), { min: 1, traduire: false }),
  "site.seo.pages": F.liste(F.objet({ chemin: F.texte(300, { min: 1, motif: "lien" }), titre: F.texte(200), description: F.texte(500, { long: true }), indexer: F.booleen() }), 300),
  // locales techniques des documents : les libellés se modifient, pas les identifiants lus par Intl et le PDF
  ...Object.fromEntries(Object.entries(copiesDocuments).flatMap(([langue, copie]) => [
    [`documents.copiesDocuments.${langue}.intl`, F.fixe(copie.intl)],
    [`documents.copiesDocuments.${langue}.langue`, F.fixe(copie.langue)],
    [`documents.copiesDocuments.${langue}.mois`, copie.mois ? F.liste(F.texte(40, { min: 1 }), 12, 12) : F.fixe(null)],
  ])),
  // mêmes dates et montants dans le suivi, la signature et les courriels de commande
  ...Object.fromEntries(Object.entries(suivi.suivi).flatMap(([langue, copie]) => [
    [`suivi.suivi.${langue}.html`, F.fixe(copie.html)],
    [`suivi.suivi.${langue}.locale`, F.fixe(copie.locale)],
    [`suivi.suivi.${langue}.mois`, copie.mois ? F.liste(F.texte(40, { min: 1 }), 12, 12) : F.fixe(null)],
    [`suivi.suivi.${langue}.formatMois`, F.fixe(copie.formatMois ?? null)],
  ])),
  // circuits : durée et prix saisis par OHT (null = « à confirmer », « sur demande »)
  "fr.tours[].duration": texteNul(60),
  "fr.tours[].price": nombreNul(),
  // fiches des lieux (FicheLieu, fr.ts) : un champ vide n'est pas affiché
  "fr.FICHES_LIEU": F.dict(
    F.objet({
      horaires: [F.texte(200), "opt"],
      tarif: [F.texte(200), "opt"],
      usages: [F.texte(600, { long: true }), "opt"],
      galerie: [F.liste(F.media(), 12), "opt"],
      photo: [F.media(), "opt"],
      memeCadrage: [F.booleen(), "opt"],
      recit: [F.objet({ chapitre: F.texte(40, { min: 1, motif: "id" }), paragraphes: F.liste(F.nombre(true), 12) }), "opt"],
    }),
  ),
  // événements : prix et places saisis par OHT (null = non affiché)
  "fr.evenements[].offre.nuits": nombreNul(),
  "fr.evenements[].offre.prix": nombreNul(),
  "fr.evenements[].offre.places": nombreNul(),
  "fr.evenements[].offre.jauge": nombreNul(),
  "fr.evenements[].offre.categories[].prix": nombreNul(),
  // témoignages réels seulement (Temoignage, types.ts) : la liste part vide
  "fr.testimonials": F.liste(F.objet({ name: F.texte(80, { min: 1, traduire: false }), country: F.texte(60, { min: 1 }), quote: F.texte(600, { min: 1, long: true }), photo: [F.media(), "opt"] }), 40),
  "site.partenaires": F.liste(F.objet({ nom: F.texte(120, { min: 1 }), activite: F.texte(120, { min: 1 }), ville: texteNul(80), site: F.nul(F.texte(300, { motif: "lien" })), logo: F.nul(F.media()) }), 100),
  "fr.hero.search.fields": champsRecherche,
  // crédit exigé par la licence d'une photo changée ; détail d'une option
  "fr.conciergerie[].credit": texteNul(120),
  "fr.conciergerie[].options[].detail": texteNul(80),
  // documents d'époque et photos d'aujourd'hui de la page Histoire (MediaHistoire)
  "histoire.histoireChapitres[].pieces[].hier": mediaHistoire,
  "histoire.histoireChapitres[].pieces[].auj": mediaHistoire,
  // informations de la société encore attendues (agence, licence)
  "legal.societe.agence.valeur": texteNul(200),
  "legal.societe.licence.valeur": texteNul(200),
  "legal._note": F.fixe(legal._note),
  // champs fournis plus tard par OHT
  "fr.nav.whatsapp.number": texteNul(30),
  "fr.welcome.caption": texteNul(120),
  "fr.agence.accroche": texteNul(300, true),
  "fr.agence.histoire": texteNul(3000, true),
  "fr.equipe[].portrait": F.nul(F.media()),
  // réglages techniques lus par le code (fuseau, point d'arrivée de l'arc, fichiers son) : figés
  "fr.cheminsIntro.origin": F.fixe(fr.cheminsIntro.origin),
  "fr.cheminsIntro.timeZone": F.fixe(fr.cheminsIntro.timeZone),
  "fr.datesSection.timeZone": F.fixe(fr.datesSection.timeZone),
  "fr.prepare.fiche.fuseau": F.fixe(fr.prepare.fiche.fuseau),
  "histoire.histoirePage.son": F.fixe(histoire.histoirePage.son),
};

const FORMES = new Map<string, Forme>();

/** Forme d'une rubrique (déduite une fois par processus). */
export function formeDe(cle: CleContenu): Forme {
  const deja = FORMES.get(cle);
  if (deja) return deja;
  const x = REGISTRE[cle];
  const f = x.verrouille ? F.fixe(donnees(x.defaut) ?? null) : inferer([x.defaut], cle, { indices: INDICES, protege: x.protege, vus: collecter(x.defaut, cle) });
  FORMES.set(cle, f);
  return f;
}

/** Préfixes d'images acceptés hors du site : photos libres de départ et compartiment public site-medias. */
export const prefixesMedias = () => ["https://images.pexels.com/photos/", ...(process.env.SUPABASE_URL ? [`${process.env.SUPABASE_URL}/storage/v1/object/public/site-medias/`] : [])];
