// Textes de l'espace de l'équipe une fois connecté (/agents, /admins) : tableau de bord E « La course du soleil »
// (maquette t-e-soleil.html, objet TXT), en français. Rien d'inventé ici : aucun chiffre, aucun nom, aucune donnée
// d'exemple. Les données viennent du serveur (lib/serveur/equipe/espace.ts) ; ce fichier ne garde que les mots.
// SECTIONS (23 agent, 44 admin) sert à la navigation, à la palette Ctrl K, à generateStaticParams et aux tests.
import type { Role } from "./equipe";

export type Picto =
  | "soleil" | "lune" | "recherche" | "plateau" | "personnes" | "personne" | "billet" | "sac" | "bulle" | "calendrier" | "carte"
  | "crayon" | "reglages" | "maison" | "plus" | "fermer" | "chevron" | "coche" | "lien" | "cloche" | "voiture" | "repere" | "drapeau"
  | "sortie" | "courrier" | "caisse" | "dossier" | "document" | "livre" | "qr" | "courbe" | "image" | "cle" | "bouclier" | "menu" | "pause";

export type Section = { id: string; nom: string; picto: Picto; fonctions: string[]; groupe: string };
export type Groupe = { groupe: string; sections: Section[] };

// [groupe, [[id, nom, picto, fonctions séparées par « | »]]] : carte fonctionnelle complète du brief (30/10)
type Brut = [string, [string, string, Picto, string][]][];
const lire = (g: Brut): Groupe[] => g.map(([groupe, items]) => ({ groupe, sections: items.map(([id, nom, picto, f]) => ({ id, nom, picto, groupe, fonctions: f.split("|") })) }));

export const GROUPES: Record<Role, Groupe[]> = {
  agents: lire([
    ["Aujourd’hui", [["accueil", "Aujourd’hui", "soleil", "Heure de Ouidah|Demandes à traiter|Billets à contrôler|Retraits boutique"]]],
    ["Demandes", [
      ["demandes", "Demandes", "plateau", "Demandes reçues par /devis : devis, question, groupe"],
      ["dossiers", "Dossiers voyage", "dossier", "Étapes : nouveau, devis envoyé, payé, en voyage, terminé"],
      ["clients", "Clients", "personnes", "Fiche client : langue, pays, e-mail, WhatsApp|Notes et historique|Documents"],
      ["pistes", "Pistes", "drapeau", "Contacts à relancer|Priorité"],
    ]],
    ["Ventes", [
      ["devis", "Devis", "document", "Création depuis la grille tarifaire|PDF dans la langue du client|Lien client et suivi d’ouverture"],
      ["factures", "Factures et reçus", "document", "Factures et reçus de vos dossiers|PDF dans la langue du client"],
      ["liens", "Liens de paiement", "lien", "Montant total du devis ou de la facture, sans acompte|Langue du client et expiration|Suivi : créé, envoyé, ouvert, payé, expiré"],
      ["agence", "Paiements reçus en agence", "caisse", "Virement, espèces, Mobile Money, chèque|Justificatif obligatoire pour un virement|Vos saisies et leur état : un admin confirme chaque paiement"],
      ["grille", "Grille tarifaire", "reglages", "Prix des circuits, entrées et conciergerie, en lecture seule"],
    ]],
    ["Terrain", [
      ["agenda", "Agenda", "calendrier", "Départs, visites, appels, rendez-vous"],
      ["rendez-vous", "Rendez-vous", "calendrier", "Créneaux disponibles|Rendez-vous réservés par les visiteurs"],
      ["billets", "Contrôle des billets", "billet", "Code QR en plein écran sur téléphone|Saisie du code à la main|Hors ligne toléré"],
      ["commandes", "Commandes boutique", "sac", "À préparer ou à remettre"],
    ]],
    ["Messages", [
      ["boite", "Boîte de réception", "bulle", "Messages du site et réponses des clients|Limitée à vos dossiers"],
      ["courrier", "Rédiger un e-mail", "courrier", "Modèle et langue du client|Pièce jointe, aperçu, envoi de test"],
      ["notifications", "Notifications", "cloche", "Paiements reçus, nouvelles demandes, rappels"],
    ]],
    ["Ressources", [
      ["devises", "Devises", "caisse", "Taux du dollar, historique et ajustement manuel"],
      ["documents", "Documents", "dossier", "Passeports, billets d’avion, contrats, justificatifs"],
      ["wiki", "Wiki", "livre", "Procédures|Fiches des lieux|Réponses types"],
      ["carte", "Carte de visite", "qr", "QR vers votre contact pro, à montrer sur le terrain"],
      ["contenu", "Contenu du site", "crayon", "Textes et images du site, en brouillon|Aperçu, puis publication par un admin|Avec le droit « site » seulement"],
      ["blog", "Blog", "livre", "Vos articles en brouillon|Envoi en relecture, publication par un admin|Avec le droit « site » seulement"],
    ]],
    ["Moi", [
      ["performances", "Performances", "courbe", "Dossiers traités, délai de réponse, encaissé|Jamais de classement entre agents"],
      ["profil", "Profil", "personne", "Langues, mot de passe, thème clair ou sombre"],
    ]],
  ]),
  admins: lire([
    ["Pilotage", [
      ["accueil", "Accueil", "maison", "Encaissé et à confirmer|Réservations à venir|Demandes en attente|Activité récente"],
      ["statistiques", "Statistiques", "courbe", "Visites|Conversions|Pays|Sources"],
      ["direct", "En direct", "soleil", "Visiteurs en ligne|Pages vues|Sans donnée personnelle"],
      ["rapport", "Rapport hebdomadaire", "document", "Synthèse de la semaine, envoyée chaque lundi"],
    ]],
    ["Ventes", [
      ["demandes", "Demandes et dossiers", "plateau", "Toutes les demandes|Attribution à un agent"],
      ["reservations", "Réservations et billets", "billet", "Événements OHT|Places et participants"],
      ["devis", "Devis", "document", "Tous les devis, par agent et par état"],
    ]],
    ["Finances", [
      ["finances", "Comptabilité et factures", "caisse", "Encaissé par mode : passerelles, virement, espèces, Mobile Money, chèque|Dépenses avec justificatif|Factures et avoirs|Clôture du mois, exports CSV et Excel"],
      ["liens", "Liens de paiement", "lien", "Montant total, sans acompte|Suivi : créé, envoyé, ouvert, payé, expiré"],
      ["manuels", "Paiements manuels", "caisse", "File des paiements à confirmer, justificatif visible|Confirmation ou rejet avec motif|Reçu dans la langue du client"],
      ["grille", "Grille tarifaire", "reglages", "Prix des circuits, entrées, conciergerie|En FCFA et en €"],
      ["finances/regles", "TVA et commissions", "reglages", "Taux configurables|Application aux nouvelles opérations|Désactivés avant configuration"],
    ]],
    ["Site", [
      ["pages", "Pages", "crayon", "Textes et visuels de chaque section|7 langues|Brouillon puis publication"],
      ["lieux", "Lieux", "repere", "Musée d’histoire, Temple des Pythons, Route des Esclaves, Porte du Non-Retour, Forêt sacrée de Kpassè"],
      ["circuits", "Circuits et expériences", "carte", "Programme jour par jour|Prix affiché ou non"],
      ["evenements", "Événements", "calendrier", "OHT : billets|Externes comme Vodun Days : séjours"],
      ["conciergerie", "Conciergerie", "voiture", "Navette, hôtel, véhicule"],
      ["histoire", "Histoire", "livre", "Page Histoire de Ouidah"],
      ["medias", "Galerie et médias", "image", "Photos, point focal, texte alternatif"],
      ["temoignages", "Témoignages", "bulle", "Témoignages réels seulement"],
      ["partenaires", "Partenaires", "personnes", "Hôtels, chauffeurs, artisans"],
      ["traductions", "Traductions", "bulle", "7 langues|Relecture par un locuteur"],
      ["legales", "Pages légales", "document", "Mentions, confidentialité, cookies"],
      ["navigation", "Navigation et pied de page", "carte", "Menu, liens, pied de page"],
      ["blog", "Blog", "livre", "Articles en 7 langues|Relecture, publication, retrait|Historique et traductions"],
    ]],
    ["Boutique", [["boutique", "Boutique", "sac", "Produits, catégories, matières|Stocks|Commandes, retraits et livraisons"]]],
    ["Clients et messages", [
      ["clients", "Clients", "personnes", "Tous les clients et leurs dossiers"],
      ["services", "Rendez-vous et candidatures", "calendrier", "Disponibilités et rendez-vous|Candidatures partenaires|Demandes d’effacement"],
      ["boite", "Boîte de réception", "bulle", "Messages du site et réponses des clients"],
      ["courrier", "Rédiger un e-mail", "courrier", "À un client ou à un groupe|Modèle, langue, pièce jointe, aperçu"],
      ["modeles", "Modèles d’e-mails", "courrier", "E-mails automatiques par langue|Aperçu et envoi de test"],
      ["lettre", "La lettre de Ouidah", "courrier", "Abonnés et envoi"],
    ]],
    ["Équipe", [
      ["equipe", "Agents", "personnes", "Ajouter, suspendre, réinviter"],
      ["roles", "Rôles et droits", "cle", "Ce que chaque rôle peut voir et faire"],
      ["perfs", "Performances par agent", "courbe", "Dossiers traités, délai de réponse, encaissé"],
      ["wiki", "Wiki", "livre", "Procédures, fiches des lieux, réponses types"],
    ]],
    ["Sécurité", [
      ["securite", "Pare-feu et sessions", "bouclier", "Pare-feu : attaques, IP bloquées, règles, journal|Journal d’activité|Sessions ouvertes"],
      ["sauvegardes", "Sauvegardes", "dossier", "Export par table|Date de la dernière sauvegarde"],
      ["donnees", "Protection des données", "cle", "Registre des traitements|Demandes d’accès et d’effacement|Procédure de violation sous 72 h|Consentements"],
    ]],
    ["Réglages", [
      ["passerelles", "Passerelles et paiements", "caisse", "Les 5 passerelles, clés et activation|Coordonnées bancaires et numéros Mobile Money de l’agence, pour le virement et le paiement direct|Modifiables par un admin, chaque modification au journal"],
      ["devises", "Devises", "caisse", "FCFA et €, taux fixe de 655,957"],
      ["envoi", "E-mail d’envoi", "courrier", "contact@ouidahheritagetour.bj|Test d’envoi|Le mot de passe n’apparaît jamais"],
      ["docs", "Documents", "document", "En-tête, pied, mentions légales, signature"],
      ["emcf", "Normalisation e-MCF", "document", "Désactivée tant que le comptable n’a pas confirmé"],
      ["assistant", "Assistant d’écriture", "crayon", "Aide à rédiger, jamais d’envoi sans relecture"],
      ["maintenance", "Maintenance", "reglages", "Mettre le site en maintenance"],
    ]],
  ]),
};

/** Toutes les sections d'un espace, à plat (l'accueil compris : il vit à /agents ou /admins). */
export const SECTIONS: Record<Role, Section[]> = { agents: GROUPES.agents.flatMap((g) => g.sections), admins: GROUPES.admins.flatMap((g) => g.sections) };
export const section = (role: Role, id: string) => SECTIONS[role].find((x) => x.id === id);
/** Adresse d'une section : l'accueil est l'entrée elle-même. */
export const chemin = (role: Role, id: string) => (id === "accueil" ? `/${role}` : `/${role}/${id}`);

// Modes d'encaissement, dans l'ordre de la comptabilité : les 5 passerelles en ligne, puis les paiements manuels
// (table paiements_manuels au lot L7 : jusque-là, ces modes n'ont aucune donnée et l'affichent).
export const MODES = ["kkiapay", "fedapay", "stripe", "flutterwave", "paystack", "virement", "especes", "mobile_money", "cheque"] as const;
export type Mode = (typeof MODES)[number];
export const MODES_EN_LIGNE: readonly Mode[] = ["kkiapay", "fedapay", "stripe", "flutterwave", "paystack"];

// Logo de chaque emplacement (règle confirmée par Kevin le 02/11 : logo « OUIDAH » à la corde réservé à la barre de navigation,
// emblème rond partout ailleurs). Bascule en une ligne ici, aucun chemin d'image dans les composants.
const LOGO_CORDE = { src: "/brand/oht-logo.png", largeur: 1633, hauteur: 469, alt: "Ouidah Heritage Tour" };
const EMBLEME = { src: "/brand/oht-embleme.webp", largeur: 512, hauteur: 512, alt: "Ouidah Heritage Tour" };
export const logos = { navigation: LOGO_CORDE, enteteMobile: EMBLEME };

/** Logo officiel d'une passerelle (public/paiement). */
export const logoPasserelle = (id: string) => `/paiement/${id}.svg`;

const plur = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

export const espace = {
  meta: { suffixe: { agents: "Espace agent · Ouidah Heritage Tour", admins: "Administration · Ouidah Heritage Tour" } satisfies Record<Role, string> },
  role: { agent: "Agent", admin: "Administration" },
  // Ouidah : coordonnées du calcul du lever et du coucher du soleil (côté navigateur), heure UTC+1 toute l'année
  ouidah: { lat: 6.36, lon: 2.08, decalage: 60, fuseau: "Africa/Porto-Novo", nom: "Ouidah" },
  taux: 655.957, // FCFA pour 1 €, taux fixe
  monnaie: { fcfa: "FCFA" },

  // enveloppe
  nav: { navigation: "Navigation de l’espace", menu: "Menu", fermer: "Fermer", principal: "Contenu principal" },
  // barre du bas sur téléphone : quatre accès directs (id de section, libellé court)
  bas: {
    agents: [["accueil", "Aujourd’hui"], ["demandes", "Demandes"], ["billets", "Billets"], ["courrier", "E-mail"]],
    admins: [["accueil", "Accueil"], ["equipe", "Agents"], ["finances", "Finances"], ["securite", "Sécurité"]],
  } satisfies Record<Role, [string, string][]>,
  theme: { clair: "Mode clair", sombre: "Mode sombre" },
  deconnexion: "Se déconnecter",
  sortie: "Déconnexion…",
  chercher: "Chercher ou aller à…",
  raccourci: "Ctrl K",
  palette: { titre: "Chercher ou aller à", place: "Un écran, une fonction…", rien: "Aucun résultat.", action: "Action" },
  onglets: "Rubriques de l’accueil",
  voirTout: "Tout voir",

  // fiche d'une section sans écran détaillé
  fiche: { fonctions: "Fonctions", mention: "Cet écran arrive bientôt : ses fonctions sont listées ci-dessus.", retour: "Retour à l’accueil" },

  // en-tête de l'accueil, à l'heure de Ouidah
  salut: (minutes: number) => (minutes >= 18 * 60 || minutes < 5 * 60 ? "Bonsoir" : "Bonjour"),
  bonjour: (salut: string, prenom: string) => `${salut} ${prenom}.`,
  sousAgent: "Votre journée à Ouidah :",
  sousAdmin: "La journée de l’équipe à Ouidah :",

  journee: {
    titre: "La course du soleil",
    sousAgent: "Votre journée posée sur la course du soleil, à l’heure de Ouidah.",
    sousAdmin: "La journée de l’équipe sur la course du soleil, et la caisse du jour.",
    lumiere: "Lumière",
    lumieres: { aube: "Aube", jour: "Plein jour", soir: "Fin d’après-midi", nuit: "Nuit" },
    aube: "Aube", lever: "Lever", coucher: "Coucher",
    avant: (h: string) => `La journée commence à ${h}.`,
    apres: (h: string) => `Le soleil s’est couché à ${h}.`,
    proposer: "Le soleil est couché : passer en mode sombre",
    sombreOk: "Mode sombre activé pour la soirée.",
    // agent, sous l'horizon : en cours (événement du jour), à clore (retrait reçu avant aujourd'hui, pas encore traité),
    // ensuite (retraits reçus aujourd'hui : deux lignes, le reste replié). Rien de passé dans « Ensuite ».
    enCours: "En cours",
    rienEnCours: "Rien en cours pour l’instant.",
    aClore: "À clore",
    ensuite: "Ensuite",
    autres: (n: number) => plur(n, "autre", "autres"),
    evenement: (titre: string, n: number) => `${titre} : ${plur(n, "billet vendu", "billets vendus")}`,
    retrait: (ref: string, client: string) => `Retrait boutique ${ref}, ${client}`,
    recu: (quand: string) => `reçu ${quand.toLowerCase()}`,
    // moments des dossiers (lot L4) : à venir sur l'arc, passés sous l'horizon, « À clore » s'ils attendent d'être traités
    fait: "Sous l’horizon",
    rienAujourdhui: "Aucun moment prévu aujourd’hui. Les visites, départs, appels et rendez-vous de vos dossiers se posent ici.",
    rienEquipe: "Aucun moment prévu aujourd’hui pour l’équipe.",
    arcNom: "Moments du jour sur la course du soleil",
    repere: (heure: string, qui: string | null, type: string, quoi: string, etat: string | null) => `${heure}, ${qui ? `${qui}, ` : ""}${type} : ${quoi}${etat ? `, ${etat}` : ""}`,
    etats: { encours: "en cours", aclore: "à clore", avenir: null, fait: "fait" } as Record<string, string | null>,
    // admin : le total du jour dans le ciel, un trait sur l'horizon par paiement
    caisse: "Encaissé aujourd’hui",
    caisseVide: "Rien d’encaissé aujourd’hui. Les réservations, liens payés et paiements manuels confirmés s’affichent ici.",
    paiements: { reservation: "Réservation", lien: "Lien de paiement", manuel: "Paiement reçu en agence" },
    heureNonRenseignee: "Heure non renseignée",
  },

  vides: { indisponible: "Données indisponibles pour l’instant. Réessayez dans un moment." },

  agent: {
    demandes: { titre: "Mes demandes à traiter", vide: ["Aucune nouvelle demande à traiter.", "Les demandes qu’un admin vous attribue arrivent ici."] },
    billets: {
      titre: "Billets à contrôler",
      vendus: "vendus",
      ouvrir: "Ouvrir le contrôle",
      entrees: "Entrées comptées au contrôle des billets.",
    },
    // onglets de l'accueil en 390 (grille sur ordinateur)
    onglets: { demandes: "Demandes", alertes: "Alertes", commandes: "Commandes", clients: "Clients" },
    alertes: { titre: "Mes alertes", vide: ["Aucune alerte non lue.", "Les notifications de vos dossiers s’affichent ici."] },
    clients: { titre: "Mes clients du jour", vide: ["Aucun client aujourd’hui.", "Les voyageurs de vos moments du jour s’affichent ici."], moments: (n: number) => plur(n, "moment", "moments") },
    retraits: {
      titre: "Retraits boutique",
      vide: ["Aucune commande en retrait à confirmer.", "Les commandes de la boutique arrivent ici, à part du dossier voyage."],
      articles: (n: number) => plur(n, "article", "articles"),
      etat: "À confirmer",
    },
  },

  admin: {
    billets: (n: number) => plur(n, "billet", "billets"),
    onglets: { caisse: "Caisse", reservations: "Réservations", demandes: "Demandes", commandes: "Commandes", activite: "Activité" },
    caisse: {
      titre: "La caisse",
      encaisseMois: (mois: string) => `Encaissé en ${mois}`,
      encaisseJour: "Encaissé aujourd’hui",
      attente: "En attente de paiement",
      attenteDetail: (n: number) => plur(n, "devis envoyé", "devis envoyés"),
      aConfirmer: "À confirmer",
      parMode: "Encaissé par mode",
      aucun: "aucun paiement",
      paiements: (n: number) => plur(n, "paiement", "paiements"),
    },
    reservations: {
      titre: "Réservations à venir",
      cols: { quand: "Quand", quoi: "Réservation", qui: "Client", etat: "Paiement" },
      places: (formule: string, n: number) => `${formule} × ${n}`,
      paye: "Payé",
      vide: ["Aucune réservation à venir.", "Les billets payés en ligne s’affichent ici."],
    },
    demandes: {
      titre: "Demandes en attente",
      types: { voyage: "Demande de devis", question: "Question", groupe: "Demande de groupe" } as Record<string, string>,
      plusAncienne: (d: string) => `La plus ancienne attend depuis ${d}.`,
      nonAttribuee: "Non attribuée",
      attribuee: (agent: string) => `attribuée à ${agent}`,
      attribuer: "Attribuer les demandes",
      vide: ["Aucune demande en attente de devis.", "Les demandes reçues par /devis arrivent ici."],
    },
    commandes: {
      titre: "Commandes boutique",
      etat: "À confirmer",
      retrait: "Retrait à l’agence",
      livraison: "Livraison",
      articles: (n: number) => plur(n, "article", "articles"),
      vide: ["Aucune commande à confirmer.", "Les commandes de la boutique arrivent ici, à part du dossier voyage."],
    },
    passerelles: {
      titre: "Passerelles de paiement",
      sous: "Le site ne propose que les passerelles actives et configurées.",
      etats: { active: "Active", coupee: "Coupée", nonconf: "Clés à saisir" },
      regler: "Réglages",
      // ligne d'état en 390 : « Passerelles : 3 actives · 1 coupée · 1 clés à saisir »
      ligne: "Passerelles :",
      compte: { active: (n: number) => plur(n, "active", "actives"), coupee: (n: number) => plur(n, "coupée", "coupées"), nonconf: (n: number) => `${n} clés à saisir` },
    },
    activite: {
      titre: "Activité récente",
      demande: (nom: string, type: string) => `Nouvelle demande de ${nom} : ${type.toLowerCase()}.`,
      paiement: (mode: string, montant: string, quoi: string) => `Paiement ${mode} de ${montant}, ${quoi}.`,
      commande: (ref: string, remise: string) => `Nouvelle commande boutique ${ref}, ${remise.toLowerCase()}.`,
      vide: ["Pas encore d’activité.", "Demandes, paiements et commandes s’inscrivent ici."],
    },
    editer: {
      titre: "Éditer le site",
      sous: "Tout ce que le site affiche se modifie ici.",
      // [id de section, détail]
      raccourcis: [["lieux", "fiches des lieux"], ["circuits", "programmes jour par jour"], ["evenements", "billets et séjours"], ["boutique", "articles et commandes"], ["traductions", "7 langues"], ["legales", "mentions, confidentialité, cookies"]] as [string, string][],
    },
  },

  // écran Équipe (lot L3, maquette E ?ecran=equipe) : les comptes viennent de la base, jamais d'ici
  equipe: {
    titre: "Équipe",
    sous: "Vous créez les comptes : chaque agent reçoit une invitation de première connexion.",
    ajouter: "Ajouter un agent",
    cols: { qui: "Membre", role: "Rôle", langues: "Langues", jour: "Aujourd’hui", etat: "État", actions: "Actions" },
    etats: { actif: "Actif", invite: "Invité", suspendu: "Suspendu" },
    roles: { agent: "Agent", admin: "Admin" },
    // compteurs, qui servent aussi de filtres
    filtres: "Filtrer par état",
    resume: { tous: (n: number) => (n > 1 ? "membres" : "membre"), actif: (n: number) => (n > 1 ? "actifs" : "actif"), invite: (n: number) => (n > 1 ? "invités" : "invité"), suspendu: (n: number) => (n > 1 ? "suspendus" : "suspendu") },
    filtreVide: "Aucun membre dans cet état.",
    vide: ["Aucun agent pour l’instant.", "Ajoutez le premier : il recevra une invitation de première connexion."],
    moi: "Vous",
    suspendre: "Suspendre",
    reactiver: "Réactiver",
    reinviter: "Réinviter",
    actionDe: (action: string, qui: string) => `${action} : ${qui}`,
    // petite course du soleil de chaque membre actif : ses moments du jour arrivent avec les dossiers voyage (lot L4)
    jourVide: "Rien de prévu",
    jourArc: "La course du soleil d’aujourd’hui : rien de prévu.",
    jourMoments: (n: number) => plur(n, "moment prévu", "moments prévus"),
    jourArcMoments: (n: number) => `La course du soleil d’aujourd’hui : ${plur(n, "moment prévu", "moments prévus")}.`,
    // dates relatives, à l'heure de Ouidah
    derniere: (quand: string) => `connecté ${quand}`,
    jamais: "jamais connecté",
    invitation: (quand: string) => `invitation envoyée ${quand}`,
    instant: "à l’instant",
    le: (date: string) => `le ${date}`,
    form: {
      titre: "Ajouter un agent",
      sous: "Il recevra un e-mail d’invitation pour choisir son mot de passe.",
      prenom: "Prénom",
      nom: "Nom",
      email: "E-mail",
      tel: "Téléphone",
      telAide: "Facultatif. Pour WhatsApp, avec l’indicatif.",
      langues: "Langues parlées",
      langueEmails: "Langue des e-mails",
      langueEmailsAide: "L’invitation et les codes partent dans cette langue.",
      role: "Rôle",
      droits: "Droits",
      droitsAdmin: "Un admin a tous les droits.",
      envoyer: "Envoyer l’invitation",
      envoi: "Envoi…",
      annuler: "Annuler",
      erreurs: {
        prenom: "Indiquez le prénom (80 caractères au plus).",
        nom: "Indiquez le nom (80 caractères au plus).",
        email: "Indiquez une adresse e-mail valide.",
        telephone: "Indiquez un numéro valide, avec l’indicatif.",
        langues: "Choisissez au moins une langue de la liste.",
        role: "Choisissez un rôle de la liste.",
        droits: "Droits illisibles : rechargez la page.",
      },
      resume: "Quelques champs sont à compléter.",
    },
    // [identifiant gardé dans equipe_profils.droits, libellé, coché d'avance]
    droits: [["demandes", "Demandes et devis", true], ["liens", "Liens de paiement", true], ["billets", "Contrôle des billets", true], ["boutique", "Commandes boutique", false], ["site", "Proposer des modifications du site (validées par vous)", false]] as [string, string, boolean][],
    annonces: {
      invite: (qui: string) => `Invitation envoyée à ${qui}.`,
      suspendu: (qui: string) => `Compte de ${qui} suspendu : plus aucune connexion possible.`,
      reactive: (qui: string) => `Compte de ${qui} réactivé.`,
      reinvite: (qui: string) => `Nouvelle invitation envoyée à ${qui}.`,
    },
    erreurs: {
      refuse: "Action réservée aux admins connectés.",
      champs: "Quelques champs sont à compléter.",
      smtp: "L’e-mail d’envoi d’OHT (SMTP) n’est pas configuré : aucun compte n’a été créé ni aucune invitation envoyée.",
      existe: "Cette adresse est déjà utilisée par un compte de l’équipe : rien n’a été créé.",
      envoi: "Le compte est créé, mais l’e-mail n’est pas parti : utilisez « Réinviter ».",
      panne: "La base ne répond pas : rien n’a été modifié. Réessayez dans un moment.",
      trop_tot: (s: number) => `Une invitation vient de partir : réessayez dans ${s} s.`,
      soi: "Vous ne pouvez pas suspendre votre propre compte.",
      dernier_admin: "Impossible : c’est le dernier admin actif.",
      etat: "Ce compte a changé d’état entre-temps : la liste est à jour.",
      reseau: "La connexion a échoué. Vérifiez votre réseau, puis réessayez.",
    },
  },

  // écrans Demandes et Dossiers voyage (lot L4, maquette E ?ecran=dossier) : les demandes viennent de la base
  demandes: {
    titre: { agents: "Mes demandes", admins: "Demandes et dossiers" } satisfies Record<Role, string>,
    sous: { agents: "Les demandes qui vous sont attribuées, de la réception au retour du voyageur.", admins: "Toutes les demandes reçues par /devis : attribuez chacune à un agent actif." } satisfies Record<Role, string>,
    titreDossiers: "Dossiers voyage",
    sousDossiers: "Vos dossiers rangés par étape, de la demande au retour.",
    liste: "Demandes",
    filtres: "Filtrer par étape",
    toutes: (n: number) => (n > 1 ? "demandes" : "demande"),
    agent: "Agent",
    tousAgents: "Tous les agents",
    nonAttribuees: "Non attribuées",
    attribuerDe: (client: string) => `Agent de la demande de ${client}`,
    nonAttribuee: "Non attribuée",
    recue: (quand: string) => `reçue ${quand}`,
    voyageurs: (n: number) => plur(n, "voyageur", "voyageurs"),
    ouvrir: (client: string) => `Ouvrir le dossier de ${client}`,
    filtreVide: "Aucune demande ne répond à ce filtre.",
    vide: {
      agents: ["Aucune demande ne vous est attribuée.", "Un admin vous attribue les demandes reçues par /devis : elles arrivent ici."],
      admins: ["Aucune demande reçue pour l’instant.", "Les demandes envoyées par /devis arrivent ici."],
    } satisfies Record<Role, [string, string]>,
    annonces: { attribuee: (client: string, agent: string) => `Demande de ${client} attribuée à ${agent}.`, retiree: (client: string) => `La demande de ${client} n’a plus d’agent.` },
  },
  etapes: { nouvelle: "Nouvelle", devis_envoye: "Devis envoyé", payee: "Payée", en_voyage: "En voyage", terminee: "Terminée", perdue: "Perdue" } as Record<string, string>,

  // le dossier, dans son tiroir (adresse propre /agents/demandes/<id>)
  dossier: {
    fermer: "Fermer le dossier",
    recue: (ref: string, quand: string, langue: string) => `${ref}, reçue ${quand}, en ${langue}`,
    voyage: "Le voyage",
    dates: "Dates",
    sansDates: "À conseiller",
    du: (a: string, b: string) => `du ${a} au ${b}`,
    voyageurs: "Voyageurs",
    personnes: (adultes: number, enfants: number) => [plur(adultes, "adulte", "adultes"), enfants ? plur(enfants, "enfant", "enfants") : ""].filter(Boolean).join(", "),
    pays: "Pays",
    langue: "Langue du client",
    email: "E-mail",
    tel: "WhatsApp",
    circuit: "Circuit",
    lieux: "Lieux choisis",
    services: "Conciergerie demandée",
    message: "Message du client",
    nonPrecise: "Non précisé",
    suivi: "Le dossier",
    etape: "Étape",
    etapeAide: "« Devis envoyé » vient de l’envoi du devis, « Payée » du paiement : ni l’une ni l’autre ne se pose à la main.",
    changerEtape: "Passer à l’étape",
    etapeChangee: (e: string) => `Le dossier passe à l’étape « ${e} ».`,
    noteEnregistree: "Note de l’équipe enregistrée.",
    titre: "Dossier voyage",
    agent: "Agent du dossier",
    note: "Note de l’équipe",
    noteAide: (n: number) => `${new Intl.NumberFormat("fr-FR").format(n)} / 2 000 caractères. Visible de l’équipe seulement.`,
    enregistrerNote: "Enregistrer la note",
    historique: "Historique",
    historiqueVide: "Rien d’inscrit pour l’instant.",
    // une ligne d'historique, d'après le journal (equipe_journal) : jamais le texte d'une note ni un montant
    journal: (action: string, qui: string, x: { cible?: string; etape?: string; type?: string; nombre?: number; motif?: string }) => {
      const q = qui || "Quelqu’un";
      switch (action) {
        case "dossier.attribution": return x.cible ? `${q} a attribué le dossier à ${x.cible}.` : `${q} a retiré l’agent du dossier.`;
        case "dossier.etape": return `${q} a passé le dossier à l’étape « ${x.etape ?? ""} ».`;
        case "dossier.note": return `${q} a modifié la note de l’équipe.`;
        case "moment.ajout": return `${q} a ajouté un moment : ${(x.type ?? "").toLowerCase()}.`;
        case "moment.deplacement": return `${q} a déplacé un moment.`;
        case "moment.suppression": return `${q} a supprimé un moment${x.type ? ` : ${x.type.toLowerCase()}` : ""}.`;
        case "moment.clos": return `${q} a clos un moment.`;
        case "moment.proposes": return `${q} a posé ${plur(x.nombre ?? 0, "créneau proposé", "créneaux proposés")}.`;
        case "devis.brouillon": return `${q} a enregistré le brouillon du devis.`;
        case "devis.pret": return `${q} a envoyé le devis : il est prêt sur la page du client.`;
        case "devis.refus": return x.motif === "pages" ? `Envoi refusé à ${q} : le devis dépassait une page.` : `Saisie du devis refusée à ${q}.`;
        default: return null;
      }
    },
    indisponible: "Ce dossier ne se lit pas pour l’instant. Réessayez dans un moment.",
  },

  carte: {
    titre: "Le parcours",
    nom: (l: string) => `Carte de Ouidah, de la ville à l’océan : ${l}.`,
    vide: "Carte de Ouidah, de la ville à l’océan : aucun lieu posé pour l’instant.",
    lagune: "Lagune",
    ocean: "Océan Atlantique",
    puis: ", puis ",
    vers: (d: string) => `puis ${d} à vol d’oiseau`,
    total: (d: string, n: number) => `${plur(n, "étape", "étapes")}, ${d} à vol d’oiseau. Les heures fixent l’ordre des visites.`,
    jour: (d: string, l: string, c: string) => `Jour du voyage, ${d} : lever du soleil à ${l}, coucher à ${c}. Créneaux à confirmer avec le client.`,
    jourNom: (d: string, l: string, c: string) => `Course du soleil du ${d}, de ${l} à ${c}, avec les moments de ce jour`,
    horsCarte: "hors de la carte de Ouidah",
    km: (n: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: n < 10 ? 1 : 0 }).format(n)} km`,
  },

  moments: {
    titre: "Moments du dossier",
    types: { visite: "Visite", depart: "Départ", rdv: "Rendez-vous", appel: "Appel", retrait: "Retrait" } as Record<string, string>,
    vide: "Aucun moment posé : ajoutez une visite, un départ, un appel ou un rendez-vous.",
    dureeVisite: 60, // minutes par visite dans les créneaux proposés (à confirmer avec le client)
    creneau: (de: string, a: string) => `${de} à ${a}`,
    ajouter: "Ajouter un moment",
    type: "Type",
    lieu: "Lieu",
    sansLieu: "Sans lieu",
    date: "Date",
    heure: "Heure à Ouidah",
    duree: "Durée",
    durees: [15, 30, 45, 60, 90, 120, 180, 240] as number[],
    minutes: (n: number) => (n < 60 ? `${n} min` : `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60}` : ""}`),
    note: "Note",
    ajout: "Ajouter",
    proposer: "Proposer les créneaux",
    proposerAide: "Une visite par lieu choisi, une heure après le lever du soleil du premier jour, jamais après le coucher.",
    deplacer: "Déplacer",
    deplacerDe: (quoi: string) => `Déplacer : ${quoi}`,
    valider: "Valider",
    supprimer: "Supprimer",
    supprimerDe: (quoi: string) => `Supprimer : ${quoi}`,
    clore: "Clore",
    cloreDe: (quoi: string) => `Clore : ${quoi}`,
    fait: "Fait",
    aClore: "À clore",
    erreurs: {
      date: "Indiquez une date.",
      heure: "Indiquez une heure.",
      duree: "Durée de 5 min à 12 h.",
      type: "Choisissez un type de la liste.",
      lieu: "Choisissez un lieu de la liste.",
      note: "280 caractères et 3 retours à la ligne au plus.",
      hors: "Date trop éloignée : un an en arrière, trois ans en avant au plus.",
      dates: "Le séjour n’a pas encore de dates : convenez-en avec le client, puis ajoutez les moments à la main.",
      lieux: "Aucun lieu choisi sans visite : chaque lieu du dossier a déjà la sienne.",
      court: "Le séjour est trop court pour toutes les visites entre le lever et le coucher : ajoutez-les à la main.",
      etat: "Ce moment est déjà clos, ou pas encore commencé.",
    } as Record<string, string>,
    annonces: { ajoute: "Moment ajouté.", deplace: "Moment déplacé.", supprime: "Moment supprimé.", clos: "Moment clos : il passe sous l’horizon.", proposes: (n: number) => `${plur(n, "créneau proposé", "créneaux proposés")}, à confirmer avec le client.` },
  },

  // éditeur du devis (une page, LIMITES_DEVIS de content/documents.ts) : le total est la somme des lignes, sans acompte
  devis: {
    titre: "Le devis",
    designation: "Désignation",
    qte: "Qté",
    pu: "Prix unitaire (FCFA)",
    montant: "Montant",
    total: "Total",
    libelleDe: (n: number) => `Désignation, ligne ${n}`,
    qteDe: (n: number) => `Quantité, ligne ${n}`,
    puDe: (n: number) => `Prix unitaire en FCFA, ligne ${n}`,
    retirerDe: (n: number) => `Retirer la ligne ${n}`,
    retirer: "Retirer",
    ajouterLigne: "Ajouter une ligne",
    lignes: (n: number, max: number) => `${n} / ${max} lignes`,
    caracteres: (n: number, max: number) => `${n} / ${max}`,
    note: "Note au client",
    noteCompte: (n: number, max: number, r: number, rmax: number) => `${new Intl.NumberFormat("fr-FR").format(n)} / ${new Intl.NumberFormat("fr-FR").format(max)} caractères, ${r} / ${rmax} retours à la ligne`,
    valable: "Valable jusqu’au",
    valableAide: "Facultatif.",
    apercu: "Aperçu",
    apercuSous: "Le PDF doit tenir sur une page : c’est vérifié à l’envoi.",
    calcule: "Le serveur recalcule le total à chaque enregistrement : la somme des lignes, rien d’autre. Paiement complet, sans acompte.",
    vide: "Aucune ligne pour l’instant : ajoutez la première.",
    question: "Une question : la réponse part depuis la boîte de réception. Un devis reste possible ci-dessous.",
    brouillon: "Enregistrer le brouillon",
    envoyer: "Envoyer le devis",
    envoi: "Envoi…",
    enregistre: (montant: string) => `Brouillon enregistré. Total calculé : ${montant}.`,
    lienPaiement: "Lien de paiement",
    pret: (numero: string) => `Devis ${numero} prêt : le client le voit sur sa page de suivi.`,
    publie: (numero: string, date: string) => `${numero}, envoyé le ${date}. Un devis prêt ne se modifie plus.`,
    lienClient: "Page du client",
    copier: "Copier le lien",
    copie: "Lien copié.",
    parti: "Le client a reçu l’e-mail « votre devis est prêt », avec le lien de cette page.",
    manque: "Aucun e-mail n’est parti (envoi non configuré ou refusé) : copiez la page du client et envoyez-la-lui vous-même.",
    sansLien: "Lien du client indisponible : le secret des liens de suivi n’est pas configuré.",
    erreurs: {
      lignes: "Entre 1 et 20 lignes.",
      libelle: "Désignation de 1 à 90 caractères.",
      quantite: "Quantité de 1 à 999.",
      prix: "Prix unitaire de 0 à 9 999 999 FCFA.",
      note: "1 000 caractères au plus.",
      retours: "8 retours à la ligne au plus.",
      valable: "Choisissez une date à venir.",
      total: "Total trop élevé pour un devis.",
      pages: "Le devis dépasse une page : raccourcir les libellés ou la note.",
      publie: "Ce devis est déjà prêt : il ne se modifie plus.",
      pdf: "La vérification de la page a échoué : rien n’a été envoyé. Réessayez dans un moment.",
    } as Record<string, string>,
    resume: "Quelques champs du devis sont à corriger.",
  },

  // fiches clients (lot L4) : une par adresse e-mail, remplie depuis les demandes
  clients: {
    titre: { agents: "Mes clients", admins: "Clients" } satisfies Record<Role, string>,
    sous: { agents: "Les voyageurs de vos dossiers.", admins: "Une fiche par adresse e-mail, remplie depuis les demandes reçues." } satisfies Record<Role, string>,
    liste: "Fiches clients",
    dossiers: (n: number) => plur(n, "dossier", "dossiers"),
    ouvrir: (nom: string) => `Ouvrir la fiche de ${nom}`,
    fiche: "Fiche client",
    langue: "Langue",
    pays: "Pays",
    email: "E-mail",
    tel: "Téléphone ou WhatsApp",
    telAide: "Avec l’indicatif.",
    notes: "Notes",
    notesAide: "Visibles de l’équipe seulement.",
    lies: "Dossiers liés",
    aucunLie: "Aucun dossier lié.",
    enregistrer: "Enregistrer la fiche",
    annuler: "Fermer",
    enregistre: (nom: string) => `Fiche de ${nom} enregistrée.`,
    remplir: "Remplir depuis les demandes",
    remplis: (n: number) => (n ? `${plur(n, "fiche ajoutée", "fiches ajoutées")} depuis les demandes.` : "Aucune nouvelle fiche : chaque adresse a déjà la sienne."),
    vide: {
      agents: ["Aucun client pour l’instant.", "Les voyageurs de vos dossiers ont ici leur fiche."],
      admins: ["Aucune fiche client pour l’instant.", "Remplissez-les depuis les demandes reçues."],
    } satisfies Record<Role, [string, string]>,
    erreurs: { telephone: "Indiquez un numéro valide, avec l’indicatif.", notes: "2 000 caractères au plus." } as Record<string, string>,
  },

  // refus communs des écrans Demandes, Dossier et Clients
  refus: {
    refuse: "Action réservée à l’équipe connectée.",
    champs: "Quelques champs sont à corriger.",
    agent: "Ce membre n’est pas actif : choisissez-en un dans la liste.",
    panne: "La base ne répond pas : rien n’a été modifié. Réessayez dans un moment.",
    introuvable: "Ce dossier n’est plus accessible : rechargez la liste.",
    reseau: "La connexion a échoué. Vérifiez votre réseau, puis réessayez.",
  },

  modes: {
    kkiapay: "Kkiapay", fedapay: "FedaPay", stripe: "Stripe", flutterwave: "Flutterwave", paystack: "Paystack",
    virement: "Virement", especes: "Espèces", mobile_money: "Mobile Money direct", cheque: "Chèque",
  } satisfies Record<Mode, string>,

  langues: { FR: "Français", EN: "Anglais", ES: "Espagnol", DE: "Allemand", PT: "Portugais", HT: "Créole haïtien", GCF: "Créole guadeloupéen" } as Record<string, string>,

  // durées (« la plus ancienne attend depuis 3 j ») et dates
  duree: (min: number) => (min < 60 ? `${Math.max(1, Math.round(min))} min` : min < 48 * 60 ? `${Math.floor(min / 60)} h` : `${Math.floor(min / 1440)} j`),
  aujourdhui: "Aujourd’hui",
  hier: "Hier",
  demain: "Demain",
};
