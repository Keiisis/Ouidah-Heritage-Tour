// Textes de la boutique (page /boutique, fiche /boutique/:slug, panier, commande), en français.
// Rien d'inventé : aucun produit, prix ni photo d'article ici (tout vient du catalogue de l'admin). Pas d'avis, d'étoiles,
// de stock ni de promotion. Jamais d'acompte (Kevin, 27/10). Paiement immédiat (Kevin, 09/11) : la commande se règle en
// une fois au moment de commander, pièces réservées 30 minutes ; frais de livraison selon la zone (grille de l'admin).
// Sans passerelle active, l'ancien parcours reste : commande confirmée puis réglée avec l'équipe (merci, ci-dessous).
// Traductions des six autres langues : migration 20261113_boutique_paiement_immediat.sql (HT, GCF à faire relire).
import type { Media } from "./types";

const pieces = (n: number) => `${n} pièce${n > 1 ? "s" : ""}`;
const articles = (n: number) => `${n} article${n > 1 ? "s" : ""}`;
// conditions vraies, répétées sous le panier, dans la fiche et dans la commande
const REGLEMENT = "Paiement en une fois à la commande, sans acompte. Frais de livraison selon la zone, indiqués avant le paiement.";
const TAUX = "Prix en euros ou en francs CFA au taux fixe de 1 € = 655,957 FCFA ; en dollars, à titre indicatif, au taux fixé par OHT.";
const NOM_DEVISE: Record<string, string> = { EUR: "en euros", FCFA: "en francs CFA", USD: "en dollars" };

export const boutique = {
  pieces,
  articles,
  meta: {
    titre: "Boutique — Ouidah Heritage Tour",
    description: "La boutique de Ouidah Heritage Tour : habits sur mesure, œuvres d'art, bijoux et objets pour la maison, à retirer à Ouidah ou à recevoir chez vous. Prix en euros ou en francs CFA.",
    fiche: (nom: string) => `${nom} — Boutique Ouidah Heritage Tour`,
    ficheDescription: (nom: string, categorie: string, matiere: string) => `${nom} : ${categorie}, ${matiere.toLowerCase()}. Retrait à Ouidah ou livraison, prix en euros ou en francs CFA.`,
  },
  saut: "Aller à la boutique",

  // barre Océan sous l'en-tête du site : recherche, devise, panier, mention de retrait
  barre: {
    region: "Boutique",
    accueil: { label: "Boutique", href: "/boutique" },
    chercherDans: "Chercher dans",
    toutes: "Toutes catégories",
    champ: "Rechercher une pièce",
    indice: "Rechercher une pièce, une matière…",
    lancer: "Lancer la recherche",
    suggestions: "Suggestions",
    voirTout: (n: number, q: string) => `${n > 1 ? `Voir les ${n} pièces` : "Voir la pièce"} pour « ${q} »`,
    aucune: (q: string) => `Aucune pièce ne correspond à « ${q} ».`,
    devise: (code: string, suivante: string) => `Prix ${NOM_DEVISE[code]}. Passer ${NOM_DEVISE[suivante]}`,
    symbole: { EUR: "€", FCFA: "FCFA", USD: "$" },
    panier: "Panier",
    panierAria: (n: number) => (n ? `Panier, ${articles(n)}` : "Panier, vide"),
    retrait: ["Retrait à Ouidah", "ou livraison"] as const,
  },

  // sous-navigation Nuit : « Tout » (tiroir), catégories (méga-menu)
  nav: {
    label: "Catégories de la boutique",
    tout: "Tout",
    toutAria: "Ouvrir le menu des catégories",
    vrai: "Paiement en une fois, sans acompte",
    matieres: "Matières",
    lesPieces: "Les pièces",
    aDecouvrir: "À découvrir",
    toutVoir: "Tout voir",
    menuTitre: "Acheter par catégorie",
    fermerMenu: "Fermer le menu",
    touteLaBoutique: "Toute la boutique",
    retraitLien: "Retrait à Ouidah ou livraison",
    // photos de Ouidah du méga-menu, données aux catégories dans l'ordre de l'admin (la 1re à la 1re, et ainsi de suite)
    photos: [
      { src: "/ouidah/collage-marche-zobe.jpg", alt: "L'entrée du marché Zobè à Ouidah, étals et passants sous les arbres", legende: "Le marché Zobè, Ouidah" },
      { src: "/ouidah/eng-1-rue-basilique.jpg", alt: "Rue pavée bordée d'un temple peint, la basilique au fond", legende: "La rue de la basilique, Ouidah" },
      { src: "/ouidah/eng-3-case-plage.jpg", alt: "Case ronde au toit de chaume posée sur le sable, la mer au fond", legende: "Ouidah, côté plage" },
      { src: "/ouidah/raison-foret-kpasse.jpg", alt: "Grand arbre sacré dans une clairière de terre rouge", legende: "Forêt sacrée de Kpassè" },
    ] satisfies (Media & { legende: string })[],
  },

  hero: {
    titre: ["L’artisanat de Ouidah,", "chez vous."],
    phrase: "Habits sur mesure, œuvres d’art, bijoux, maison : retrait à Ouidah ou livraison.",
    bouton: "Voir la boutique",
    photo: { src: "/ouidah/eng-7-vendeuses.jpg", alt: "Quatre femmes marchent sur une route de sable à Ouidah, une bassine sur la tête" } satisfies Media,
  },

  categories: { titre: "Acheter par catégorie" },

  // mise en avant d'une catégorie (maquette I, « Pour la maison ») : photo de Ouidah, deux pièces, lien vers toutes.
  // Catégorie absente ou vide : bloc non affiché.
  miseEnAvant: {
    categorie: "maison",
    titre: "Pour la maison",
    photo: { src: "/ouidah/eng-4-paillote.jpg", alt: "Paillote au toit de chaume entourée de verdure, à Ouidah" } satisfies Media,
    texte: (n: number, matieres: string[]) => `${pieces(n)} pour la maison : ${matieres.join(", ")}.`,
    voir: (n: number) => `Voir ${n > 1 ? "les " : "la "}${pieces(n)}`,
  },

  liste: {
    titre: "Toute la boutique",
    filtrer: "Filtrer",
    filtres: "Filtres",
    fermerFiltres: "Fermer les filtres",
    groupes: { cat: "Catégorie", mat: "Matière", coul: "Couleur" },
    choisis: (n: number) => `, ${n} choisi${n > 1 ? "s" : ""}`,
    effacer: "Effacer",
    fermer: "Fermer",
    toutEffacer: "Tout effacer",
    voir: (n: number) => `Voir ${pieces(n)}`,
    trier: "Trier par",
    tris: [
      { v: "admin", l: "Ordre de la boutique" },
      { v: "az", l: "Nom, de A à Z" },
      { v: "za", l: "Nom, de Z à A" },
      { v: "cat", l: "Catégorie" },
    ],
    recherche: (q: string) => `Recherche : « ${q} »`,
    retirerFiltre: (nom: string) => `Retirer le filtre ${nom}`,
    annonce: (n: number) => `${pieces(n)} affichée${n > 1 ? "s" : ""}.`,
    vide: "Aucune pièce ne correspond à ces critères.",
  },

  carte: {
    personnalisable: "Personnalisable",
    unique: "Pièce unique",
    options: "Choisir les options",
    ajouterUnique: "Ajouter au panier",
    ajouter: "Ajouter",
    ajouterN: (n: number) => `Ajouter · ${n}`,
    ajoute: "Ajouté",
    pris: "Dans votre panier",
    indisponible: "Épuisé",
    stockInsuffisant: "La quantité demandée dépasse le stock disponible. Réduisez la quantité dans votre panier.",
    ajouterAria: (n: number, nom: string) => `Ajouter ${n} × ${nom} au panier`,
    quantite: (nom: string) => `Quantité de ${nom}`,
    moins: "Retirer une unité",
    plus: "Ajouter une unité",
    favori: (nom: string, oui: boolean) => (oui ? `Retirer ${nom} des favoris` : `Garder ${nom} en favori`),
    couleurs: (noms: string[]) => `Couleurs : ${noms.join(", ")}`,
  },

  // tiroir d'ajout rapide (articles personnalisables) et encadré d'achat de la fiche
  options: {
    titre: "Choisir les options",
    fermer: "Fermer",
    taille: "Taille",
    surMesure: "Sur mesure",
    mesures: "Vos mesures",
    mesuresIndice: "Tour de poitrine, tour de taille, longueur… en centimètres",
    modeMoi: "J’indique mes mesures",
    modeContact: "Nous vous contacterons",
    aideContact: "Nous vous contactons après la commande pour convenir de vos mesures.",
    mesuresContact: "à convenir avec l’équipe OHT", // texte envoyé comme mesures quand le visiteur choisit d'être contacté
    broderie: "Texte à broder",
    broderieIndice: "Prénom ou initiales",
    compteur: (n: number, max: number) => `${n} / ${max} caractères`,
    apercu: "Aperçu de la broderie",
    coloris: "Coloris",
    quantite: "Quantité",
    ajouter: "Ajouter au panier",
    besoin: { taille: "choisissez une taille", mesures: "indiquez vos mesures (ou choisissez « Nous vous contacterons »)", broderie: "indiquez le texte à broder", coloris: "choisissez un coloris" } as Record<string, string>,
    manque: (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)} pour ajouter au panier.`,
    et: " et ",
    choix: (s: string) => `Votre choix : ${s}.`,
    // résumé des options choisies (panier, popover, commande)
    resume: { taille: (t: string) => `Taille ${t}`, surMesure: (m: string) => `Sur mesure : ${m}`, broderie: (b: string) => `Broderie « ${b} »`, coloris: (c: string) => `Coloris ${c}` },
  },

  popover: {
    region: "Ajouté au panier",
    titre: "Ajouté au panier",
    refus: "Déjà dans votre panier",
    refusTexte: (nom: string) => `« ${nom} » est une pièce unique : elle est déjà dans votre panier.`,
    fermer: "Fermer",
    voirPanier: "Voir le panier",
    commander: "Commander",
    quantite: (n: number) => `Quantité : ${n}`,
    annonce: (nom: string, n: number, total: number) => `${nom} ajouté au panier, quantité ${n}. Le panier contient ${articles(total)}.`,
  },

  panier: {
    titre: "Panier",
    fermer: "Fermer le panier",
    unique: "Pièce unique",
    retirer: "Retirer",
    retirerAria: (nom: string) => `Retirer ${nom} du panier`,
    quantite: (nom: string) => `Quantité de ${nom}`,
    moins: (nom: string) => `Retirer un ${nom}`,
    plus: (nom: string) => `Ajouter un ${nom}`,
    sousTotal: "Sous-total",
    note: `${REGLEMENT} ${TAUX}`,
    commander: "Commander",
    continuer: "Continuer mes achats",
    videTitre: "Votre panier est vide",
    videTexte: "Ajoutez une pièce depuis la boutique.",
    videBouton: "Voir la boutique",
  },

  // étape « Commander » dans le tiroir : coordonnées, retrait ou livraison, message
  commande: {
    titre: "Commander",
    retour: "Retour au panier",
    recap: (n: number) => `Votre commande · ${articles(n)}`,
    coordonnees: "Vos coordonnées",
    prenom: "Prénom",
    nom: "Nom",
    email: "E-mail",
    telephone: "Téléphone",
    telephoneAide: "Avec l’indicatif du pays, par exemple +229 ou +33.",
    pays: "Pays",
    choisirPays: "Choisir un pays",
    remise: "Retrait ou livraison",
    retrait: "Retrait à Ouidah",
    livraison: "Livraison",
    adresse: "Adresse",
    ville: "Ville",
    paysLivraison: "Pays de livraison",
    message: "Message (facultatif)",
    messageIndice: "Une précision pour l’équipe OHT",
    site: "Ne pas remplir ce champ",
    note: `${REGLEMENT} ${TAUX}`,
    envoyer: "Envoyer la commande",
    envoi: "Envoi en cours…",
    // paiement immédiat (09/11) ; {n} : nombre de jours
    payer: "Commander et payer",
    paiement: "Ouverture du paiement…",
    reservation: "Vos pièces sont réservées 30 minutes, le temps du paiement.",
    fraisLivraison: "Frais de livraison",
    gratuit: "Gratuit",
    totalPayer: "Total à payer",
    delaiLivraison: "Délai indicatif : {n} jours",
    zoneSansPrix: "La livraison vers ce pays n’est pas encore payable en ligne. Choisissez le retrait à Ouidah ou écrivez-nous pour l’organiser.",
    nousEcrire: "Écrire à un agent",
    paiementPlusTard: "Le paiement n’a pas pu s’ouvrir. Vous pouvez régler la commande depuis son suivi pendant 30 minutes.",
    erreurs: {
      prenom: "Indiquez votre prénom.",
      nom: "Indiquez votre nom.",
      email: "Indiquez une adresse e-mail valide.",
      telephone: "Indiquez un numéro de téléphone.",
      pays: "Choisissez votre pays.",
      adresse: "Indiquez l’adresse de livraison.",
      ville: "Indiquez la ville de livraison.",
      paysLivraison: "Choisissez le pays de livraison.",
    } as Record<string, string>,
    corriger: "Vérifiez les champs signalés.",
    lignes: (noms: string) => `À revoir dans le panier : ${noms}. La pièce n’est plus disponible ou ses options sont à compléter.`,
    echec: "La commande n’a pas pu être enregistrée. Vérifiez votre connexion et réessayez.",
    merciTitre: "Commande enregistrée.",
    merci: (ref: string) => [`Référence ${ref}.`, "L’équipe OHT vous contacte pour confirmer la commande et son règlement."] as const,
    suivi: "Voir mon ticket de commande",
    fin: "Continuer mes achats",
  },

  fiche: {
    ariane: "Fil d’Ariane",
    boutique: { label: "Boutique", href: "/boutique" },
    categorie: "Catégorie :",
    matiere: "Matière :",
    prixNote: "Paiement en une fois, à la commande.",
    uniqueNote: "Il n’en existe qu’un exemplaire.",
    // sur mesure, broderie ou délai saisi par l'admin (09/11) ; {n} : jours, jamais inventé
    fabrication: "Fabriqué pour vous, prêt sous {n} jours.",
    fabricationEquipe: "Fabriqué pour vous, délai précisé par l’équipe.",
    notes: { taille: "Taille au choix.", tailleMesure: "Taille au choix ou sur mesure.", broderie: "Broderie au texte de votre choix." },
    carac: "Caractéristiques",
    lignes: { matiere: "Matière", categorie: "Catégorie", lieu: "Lieu de Ouidah", artisan: "Artisan", dimensions: "Dimensions", tailles: "Tailles", couleurs: "Couleurs" },
    afournir: "à fournir",
    description: "Description",
    entretien: "Entretien",
    retraitTitre: "Retrait et livraison",
    retraitTexte: ["Retrait à Ouidah ou livraison, au choix à la commande.", REGLEMENT, TAUX],
    galerie: "Photos de la pièce",
    choisirPhoto: "Choisir une photo",
    vue: (n: number) => (n === 1 ? "vue d’ensemble" : n === 2 ? "détail" : `vue ${n}`),
    photo: (i: number, nom: string) => `Photo ${i} : ${nom}`,
    photoSur: (i: number, n: number) => `Photo ${i} sur ${n}`,
    agrandir: (i: number, n: number) => `Agrandir la photo ${i} sur ${n} : `,
    indice: "Survolez la photo pour zoomer, cliquez pour l’agrandir",
    sansPhoto: "Photos à fournir",
    loupeTitre: (nom: string, i: number, n: number) => `${nom} · photo ${i} sur ${n}`,
    fermerLoupe: "Fermer l’agrandissement",
    precedente: "Photo précédente",
    suivante: "Photo suivante",
    achat: "Acheter cette pièce",
    retrait: "Retrait à Ouidah ou livraison",
    maintenant: "Acheter maintenant",
    info: [REGLEMENT, TAUX],
    favori: (oui: boolean) => (oui ? "Dans vos favoris" : "Ajouter aux favoris"),
    barre: "Achat rapide",
    aimerez: "Vous aimerez aussi",
    toute: (cat: string) => `Toute la catégorie ${cat}`,
  },

  // trois engagements vrais, avec les objets 3D du site
  reassurance: {
    label: "Commander en confiance",
    points: [
      { objet: "billet", titre: "Paiement en une fois", texte: "Vous réglez votre commande en une fois au moment de commander, sans acompte." },
      { objet: "vehicule", titre: "Retrait ou livraison", texte: "Retirez votre commande à Ouidah ou faites-la livrer chez vous." },
      { objet: "garder", titre: "En euros ou en francs CFA", texte: "Les prix s’affichent en euros ou en francs CFA, au taux fixe de 1 € = 655,957 FCFA." },
    ] as const,
  },
};
