// Valeurs de départ en français (langue par défaut). Rien d'inventé : ce qui manque vaut null et n'est pas affiché.
import type { Circuit, Destination, Evenement, FiltreLieux, Lien, Lieu, Media, QuestionConciergerie, Temoignage, Raison, ThemePreparer } from "./types";
import type { NomObjet } from "@/components/ui/Objet3D";
import traceRouteDesEsclaves from "./trace-route-des-esclaves.json";

const px = (id: number, w = 2000) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`;

// Photos libres prises au Bénin (Pexels, sans attribution obligatoire), en attendant les photos d'OHT.
export const IMG = {
  beachOuidah: { src: px(20231862, 2400), alt: "Une voyageuse face aux vagues, sur la plage de Ouidah au coucher du soleil" },
  ouidahAerial: { src: px(32032141), alt: "Vue aérienne de cases et de verdure à Ouidah" },
  ceremony: { src: px(25945407, 1600), alt: "Danse traditionnelle en pagnes colorés, à Abomey-Calavi" },
  ceremony2: { src: px(25703722, 1600), alt: "Groupe de danseuses en tenues traditionnelles devant un mur de briques" },
  dance: { src: px(25945412, 1600), alt: "Hommes en cérémonie traditionnelle, vus de dos" },
  egungun: { src: px(38242758, 1600), alt: "Costume et masque Egungun brodés de couleurs vives" },
  market: { src: px(31238851, 1600), alt: "Scène de marché au Bénin, une vendeuse assise devant son étal" },
  waxFabric: { src: px(8655018, 1600), alt: "Une jeune femme range des tissus wax colorés au marché" },
  ganvieBoat: { src: px(6729840, 1600), alt: "Pêcheur lançant son filet depuis une pirogue à Ganvié" },
  ganvieRower: { src: px(6729842, 1600), alt: "Une femme pagaie en pirogue sur le lac Nokoué" },
  artisan: { src: px(33812288, 1600), alt: "Mains d'un artisan d'Abomey frappant l'argile au marteau" },
} satisfies Record<string, Media>;

// Barre de navigation : composition reprise du dossier bénin-tours (logo, 6 liens, devise, langue, un bouton).
// Adresses calculées (plan du 23/10/2026) : aucune page ne répète une section de l'accueil. Pages réelles : Créer mon
// voyage (/devis, formulaire unique : devis, question, groupe ; il porte aussi les billets d'événement), Histoire, et les
// 3 pages légales. Un événement se réserve dans la section Agenda (talon), sans page à part (décision du 27/10/2026). Tout le reste mène à sa section de l'accueil. Une fiche apparaît d'elle-même quand son contenu
// existe (rempli depuis l'admin) : circuit publié avec sa durée, lieu avec horaires / tarif / photos, premier article
// visible de la boutique (lu en base, voir `boutique` dans types.ts), équipe réelle. Avant, pas de lien vers une page vide.
// Fiche lieu (décision du 30/10/2026) : publiée pour les lieux à voir dont le relevé a une description ; la route des Pêches
// n'en a pas. Champs remplis depuis les tableaux de bord : vide = ligne non affichée.
// recit : paragraphes du chapitre de la page Histoire qui parlent du lieu (indices dans le chapitre mis à plat).
// usages : ce qui se passe sur place aujourd'hui, formulé positivement, jamais inventé. photo : quand la destination n'en a pas.
// memeCadrage : la photo d'hier et celle d'aujourd'hui ont le même point de vue (comparaison au curseur), sinon côte à côte.
export type FicheLieu = { horaires?: string; tarif?: string; usages?: string; galerie?: Media[]; photo?: Media; memeCadrage?: boolean; recit?: { chapitre: string; paragraphes: number[] } };
export const FICHES_LIEU: Record<string, FicheLieu> = {
  "musee-histoire": {},
  "temple-des-pythons": { recit: { chapitre: "basilique", paragraphes: [0] } },
  basilique: {},
  "foret-sacree-kpasse": { photo: { src: "/histoire/raison-foret-kpasse.webp", alt: "La forêt sacrée de Kpassè, à Ouidah" } },
  "place-chacha": { photo: { src: "/histoire/place-chacha-2025.webp", alt: "La place Chacha réaménagée, en 2025" } },
  "arbre-de-l-oubli": { photo: { src: "/histoire/arbre-oubli-2015.webp", alt: "La sculpture de l'Arbre de l'oubli" } },
  "memorial-zoungbodji": {},
  "arbre-du-retour": { photo: { src: "/histoire/raison-arbre-du-retour.webp", alt: "L'Arbre du retour et sa statue" } },
  "porte-du-non-retour": {},
  ganvie: {},
};
// Équipe (tableaux de bord agent et admin). La présidente vient de l'immatriculation (legal.json) ; portraits à venir.
export type Membre = { nom: string; role: string; portrait: Media | null };
export const equipe: Membre[] = [{ nom: "Nathalie Rosine Riffert", role: "Présidente", portrait: null }];
export const agence = { accroche: null as string | null, histoire: null as string | null }; // « notre histoire » (admin)
export const SECTIONS = { lieux: "/#lieux", raisons: "/#raisons", circuits: "/#chemins", agenda: "/#agenda", conciergerie: "/#conciergerie", preparer: "/#preparer", agence: "/#bienvenue", engagements: "/#engagements" };
export const DEVIS = { voyage: "/devis", question: "/devis?demande=question", groupe: "/devis?demande=groupe" };
export const adresseLieu = (slug: string, fiches = FICHES_LIEU): string | null => (fiches[slug] ? `/ouidah/lieux/${slug}` : null);
// Fiche circuit : publiée pour tout circuit du contenu, même en brouillon (non indexée, « Demander ce circuit » tant que
// durée et prix manquent) ; un slug inconnu mène au formulaire, qui reprend le circuit demandé.
export const adresseCircuit = (slug: string, circuits = tours) => (circuits.some((x) => x.slug === slug) ? `/circuits/${slug}` : `${DEVIS.voyage}?circuit=${slug}`);
// Qui sommes-nous : la page existe toujours (non indexée), le lien n'apparaît qu'avec un premier vrai portrait.
export const adresseAgence = (membres = equipe) => (membres.some((m) => m.portrait) ? "/a-propos" : SECTIONS.agence);

export const nav = {
  primary: [
    // « sous » = menu déroulant (même plan que le pied de page) ; le href d'une entrée à menu ne sert que d'identifiant
    {
      label: "Ouidah",
      href: "#ouidah",
      sous: [
        { label: "Lieux à voir", href: SECTIONS.lieux },
        { label: "10 raisons de venir", href: SECTIONS.raisons },
        { label: "Histoire", href: "/ouidah/histoire" },
      ],
    },
    { label: "Circuits", href: SECTIONS.circuits },
    { label: "Agenda", href: SECTIONS.agenda },
    { label: "Conciergerie", href: SECTIONS.conciergerie },
    { label: "Boutique", href: "/boutique", boutique: true },
    { label: "Blog", href: "/blog", blog: true },
    {
      label: "L'agence",
      href: "#agence",
      sous: [
        { label: "Qui sommes-nous", href: adresseAgence() },
        { label: "Nos engagements", href: SECTIONS.engagements },
        { label: "Nous écrire", href: DEVIS.question },
      ],
    },
  ] satisfies Lien[],
  sousLabel: (label: string) => `Ouvrir le menu ${label}`,
  book: { label: "Créer mon voyage", href: "/devis" },
  voyage: (n: number) => `Votre voyage · ${n}`, // remplace « Créer mon voyage » dès qu'un élément est composé
  contact: { label: "Nous écrire", href: DEVIS.question },
  // logo original d'OHT (emblème rond de la carte de visite), partout, barre et pied compris, sur pastille blanche avec le nom
  // (la patronne, via Kevin le 10/11 : la bannière « OUIDAH » le dénaturait)
  embleme: { src: "/brand/oht-embleme.webp", alt: "Ouidah Heritage Tour" } as Media,
  wordmark: ["Ouidah", "Heritage Tour"], // nom à côté de l'emblème, barre et pied
  home: "Ouidah Heritage Tour, retour à l'accueil",
  currencies: [
    { code: "EUR", short: "EUR €", long: "EUR (€)" },
    { code: "FCFA", short: "FCFA", long: "FCFA (XOF)" },
    { code: "USD", short: "USD $", long: "USD ($)" },
  ],
  currencyLabel: "Devise d'affichage :",
  drawerLabel: "Navigation",
  drawerNote: "Ouidah Heritage Tour — Agence de tourisme mémoriel et culturel à Ouidah, Bénin",
  open: "Ouvrir le menu",
  close: "Fermer le menu",
  whatsapp: {
    label: "WhatsApp",
    number: null as string | null, // [OHT TO PROVIDE]
    message: "Bonjour Ouidah Heritage Tour, je prépare un voyage à Ouidah et j'aimerais en parler avec vous.",
  },
  languages: [
    { code: "FR", label: "Français", active: true },
    { code: "EN", label: "English" },
    { code: "ES", label: "Español" },
    { code: "DE", label: "Deutsch" },
    { code: "PT", label: "Português" },
    { code: "HT", label: "Kreyòl ayisyen" },
    { code: "GCF", label: "Kréyòl" },
  ],
  languageLabel: "Changer de langue",
  brand: "Ouidah Heritage Tour",
  skip: "Aller au contenu",
};

export const welcome = {
  label: "Qui sommes-nous",
  title: ["Bienvenue chez vous,", "au cœur de votre Histoire."],
  paragraphs: [
    "Ouidah Héritage Tour est bien plus qu'une agence : c'est un engagement pour un tourisme responsable et profondément humain.",
    "Nous vous invitons à vivre Ouidah au plus près de son âme, une destination où l'histoire, la spiritualité, la culture, l'art et la nature se rencontrent pour vous offrir une expérience authentique.",
    "Chaque voyage est unique : notre équipe prend soin de vos centres d'intérêt, de vos attentes et de vos besoins. Nous vous accompagnons avant, pendant et après le voyage.",
  ],
  link: { label: "L'histoire de Ouidah", href: "/ouidah/histoire" },
  portrait: IMG.waxFabric, // provisoire : un guide OHT photographié sur la Route [OHT TO PROVIDE]
  caption: null as string | null, // « Nos guides sont nés à Ouidah. » seulement avec la vraie photo d'un guide
};

export const placesIntro = {
  kicker: "La carte · De la ville à l'océan",
  title: "Ouidah en quatre lieux",
  // titre en trois morceaux : le chiffre géant sert de fenêtre sur la carte, puis s'ouvre au défilement
  titleParts: { before: "Ouidah en", number: "4", spoken: "quatre", after: "lieux." },
  intro: "Faites défiler : le trajet se dessine sur la carte, du fort portugais jusqu'à la Porte du Non-Retour, par les rues de la ville.",
  link: "Voir le lieu",
  walked: "km parcourus",
  of: (km: string) => `sur ${km} km de visite`,
  mapLabel: "Carte de Ouidah avec les quatre lieux et le trajet à pied qui les relie",
};
// Coordonnées relevées sur OpenStreetMap ; trajet à pied calculé sur les rues (routing.openstreetmap.de), dans ouidah-route.json.
export const places: Lieu[] = [
  { n: "01", name: "Musée d'histoire de Ouidah", kicker: "Fort portugais, 1721", text: "Le fort portugais abrite depuis le 6 septembre 1967 le musée d'histoire de la ville : la traite, les royaumes, les liens avec le Brésil et les Amériques.", slug: "musee-histoire", href: adresseLieu("musee-histoire"), coords: [6.3588947, 2.0901242], image: { src: "/ouidah/lieu-musee.jpg", alt: "Le mur rouge du fort portugais de Ouidah" }, next: "680 m à pied jusqu'au Temple des Pythons" },
  { n: "02", name: "Temple des Pythons", kicker: "Face à la basilique", text: "Le temple du python Dangbé fait face à la basilique de l'Immaculée-Conception, construite de 1903 à 1909 : deux fois qui vivent côte à côte.", slug: "temple-des-pythons", href: adresseLieu("temple-des-pythons"), coords: [6.3599709, 2.0850407], image: { src: "/ouidah/bienvenue-2-temple-pythons.jpg", alt: "L'entrée peinte du Temple des Pythons" }, next: "2,5 km jusqu'au mémorial de Zoungbodji, par la place Chacha" },
  { n: "03", name: "La Route des Esclaves", kicker: "Environ 4 km, six stations", text: "De la place Chacha à la plage, le chemin que parcouraient les captifs jusqu'aux navires : l'Arbre de l'Oubli, les Cases Zomaï, le Mémorial de Zoungbodji, l'Arbre du Retour.", slug: "route-des-esclaves", href: null, coords: [6.3398445, 2.0893791], image: { src: "/ouidah/visite-zoungbodji.jpg", alt: "Le mémorial de Zoungbodji, sur la Route des Esclaves" }, next: "2 km jusqu'à la plage et la Porte du Non-Retour" },
  { n: "04", name: "Porte du Non-Retour", kicker: "Érigée en 1995, reconstruite en 2025", text: "Sur la plage, face à l'Atlantique, elle marque le lieu de l'embarquement forcé de millions d'Africains.", slug: "porte-du-non-retour", href: adresseLieu("porte-du-non-retour"), coords: [6.3242524, 2.0895803], image: { src: "/ouidah/bienvenue-1-porte-nuit.jpg", alt: "La Porte du Non-Retour illuminée, la nuit" }, next: null },
];

// Section 4 : mosaïque des engagements. Tuile photo (image) ou tuile de couleur (fond + texte) ; la tuile active passe en grand.
export const reasonsIntro = {
  kicker: "Ouidah Heritage Tour · Nos engagements",
  title: "Sept engagements, tenus sur le terrain.",
  intro: "Ce que vous pouvez attendre de nous, de la première question au retour.",
  of: "sur",
};
export const reasons: { title: string; text: string; image?: Media; couleur?: "sun" | "abyss" | "laterite" }[] = [
  { title: "Le territoire, connu de près", text: "Du fort portugais à la plage, nos guides vous mènent à pied.", couleur: "sun" },
  { title: "Des faits vérifiés", text: "Les récits de la visite s'appuient sur l'histoire documentée de la traite.", image: { src: "/ouidah/eng-2-musee.jpg", alt: "L'entrée du musée d'histoire de Ouidah, dans le fort portugais" } },
  { title: "Votre histoire d'abord", text: "Votre circuit se construit autour de votre histoire et de vos questions.", image: { src: "/ouidah/bienvenue-2-temple-pythons.jpg", alt: "L'entrée peinte du Temple des Pythons" } },
  { title: "Des partenaires du pays", text: "Hébergements, tables, guides et artisans du pays : nous choisissons avec vous les adresses du séjour.", couleur: "abyss" },
  { title: "Pour la diaspora", text: "Notre circuit Retour aux sources mène les afro-descendants du fort à la Porte du Non-Retour.", image: { src: "/ouidah/eng-5-porte-jour.jpg", alt: "La Porte du Non-Retour face à l'océan, en plein jour" } },
  { title: "Avant, pendant, après", text: "Réponse sous 24 heures, accueil à l'arrivée, suivi jusqu'au retour.", image: { src: "/ouidah/eng-6-route-peches.jpg", alt: "La route des Pêches, bordée de cocotiers, à Ouidah" } },
  { title: "Pour les acteurs locaux", text: "Nous participons à la formation des acteurs du tourisme local et les faisons connaître.", couleur: "laterite" },
];

export const toursIntro = {
  label: "Nos circuits",
  count: (n: number) => `${n} circuit${n > 1 ? "s" : ""}`,
  all: { label: "Tous les circuits", href: SECTIONS.circuits },
  onRequest: "Prix sur demande",
  from: (price: number) => `À partir de ${new Intl.NumberFormat("fr-FR").format(price)} FCFA`,
  durationPending: "Durée à confirmer",
  filtersLabel: "Filtrer les circuits",
};
/** Clé d'un type de circuit dans l'adresse de recherche du Hero (« Spiritualité » → « spiritualite »). */
export const cleType = (tag: string) => tag.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
export const tourFilters = ["Tous", "Mémoire", "Spiritualité", "Culture", "Nature", "Diaspora"];
// Ouverture : composition du dossier bénin-tours (accroche, titre en deux tons, barre de recherche, chiffres).
// Accroche et chiffres : faits vérifiables sur Ouidah, pas de titre officiel ni de statistique d'agence non fournie.
export const hero = {
  kicker: ["Agence de tourisme mémoriel et culturel", "Ouidah, Bénin"],
  title: { lead: "Ouidah,", accent: "ville du Vodun et de la mémoire" },
  sub: "Suivez à pied la Route des Esclaves, de la place Chacha jusqu'à la Porte du Non-Retour, face à l'Atlantique.",
  // photos en fondu enchaîné, dans cet ordre (6 s chacune) ; à venir : route, temple et basilique
  images: [
    { src: "/hero/hero-4-plage.jpg", alt: "Vue aérienne de la plage de Ouidah : vagues de l'Atlantique, sable doré et cocotiers" },
    { src: "/hero/hero-2-porte.jpg", alt: "La nouvelle Porte du Non-Retour de Ouidah, vue de côté" },
  ] as Media[],
  search: {
    action: SECTIONS.circuits,
    label: "Rechercher un circuit",
    submit: "Rechercher",
    fields: [
      // Destination et Type : ici seulement le choix « tous », traduisible ; la suite se déduit au rendu (Hero.tsx) des
      // lieux (fr.places) et des types portés par un circuit (fr.tourFilters), dans la langue de la page
      { name: "lieu", label: "Destination", objet: "destination" as NomObjet, options: [{ value: "", label: "Tout Ouidah" }] },
      { name: "type", label: "Type de voyage", objet: "type-voyage" as NomObjet, options: [{ value: "", label: "Tous les types" }] },
      { name: "duree", label: "Durée", objet: "calendrier" as NomObjet, options: [{ value: "", label: "Toutes les durées" }, { value: "demi-journee", label: "Demi-journée" }, { value: "journee", label: "Une journée" }, { value: "plusieurs-jours", label: "Plusieurs jours" }] },
    ],
  },
  primary: { label: "Voir nos circuits", href: SECTIONS.circuits },
  secondary: { label: "Concevoir mon voyage sur mesure", href: "/devis" },
  facts: [
    { value: "1721", label: "Fort portugais, devenu musée d'histoire" },
    { value: "4 km", label: "De la place Chacha à la plage, par la Route des Esclaves" },
    { value: "2025", label: "Nouvelle Porte du Non-Retour" },
    { value: "23 août", label: "Journée du souvenir de la traite négrière" },
  ],
};

// Section 5 : catalogue des lieux à découvrir (coordonnées OpenStreetMap). Photo seulement quand nous en avons une vraie.
export const destinations: Destination[] = [
  { slug: "musee-histoire", name: "Musée d'histoire de Ouidah", subtitle: "Fort portugais, 1721", theme: "Mémoire", text: "Le fort portugais abrite le musée d'histoire de la ville : la traite, les royaumes, les liens avec le Brésil et les Amériques.", coords: [6.3588947, 2.0901242], image: { src: "/ouidah/lieu-musee.jpg", alt: "Le mur rouge du fort portugais de Ouidah" }, href: adresseLieu("musee-histoire") },
  { slug: "temple-des-pythons", name: "Temple des Pythons", subtitle: "Face à la basilique", theme: "Spiritualité", text: "Le temple du python Dangbé fait face à la basilique de l'Immaculée-Conception : deux fois qui vivent côte à côte.", coords: [6.3599709, 2.0850407], image: { src: "/ouidah/bienvenue-2-temple-pythons.jpg", alt: "L'entrée peinte du Temple des Pythons" }, href: adresseLieu("temple-des-pythons") },
  { slug: "basilique", name: "Basilique de l'Immaculée-Conception", subtitle: "Construite de 1903 à 1909", theme: "Spiritualité", text: "En face du temple des Pythons, la basilique de l'Immaculée-Conception.", coords: [6.3605968, 2.0848595], image: { src: "/ouidah/visite-basilique.jpg", alt: "La basilique de l'Immaculée-Conception de Ouidah" }, href: adresseLieu("basilique") },
  { slug: "foret-sacree-kpasse", name: "Forêt sacrée de Kpassè", subtitle: null, theme: "Spiritualité", text: null, coords: [6.3648371, 2.0963694], image: null, href: adresseLieu("foret-sacree-kpasse") },
  { slug: "place-chacha", name: "Place Chacha", subtitle: "Départ de la Route des Esclaves", theme: "Mémoire", text: null, coords: [6.3564897, 2.0850349], image: null, href: adresseLieu("place-chacha") },
  { slug: "arbre-de-l-oubli", name: "Arbre de l'Oubli", subtitle: "Sur la Route des Esclaves", theme: "Mémoire", text: null, coords: [6.3480979, 2.0868848], image: null, href: adresseLieu("arbre-de-l-oubli") },
  { slug: "memorial-zoungbodji", name: "Mémorial de Zoungbodji", subtitle: "Sur la Route des Esclaves", theme: "Mémoire", text: "Sur la Route des Esclaves, le mémorial de Zoungbodji.", coords: [6.3398445, 2.0893791], image: { src: "/ouidah/visite-zoungbodji.jpg", alt: "Le mémorial de Zoungbodji, sur la Route des Esclaves" }, href: adresseLieu("memorial-zoungbodji") },
  { slug: "arbre-du-retour", name: "Arbre du Retour", subtitle: "Sur la Route des Esclaves", theme: "Mémoire", text: null, coords: [6.3401724, 2.0889473], image: null, href: adresseLieu("arbre-du-retour") },
  { slug: "porte-du-non-retour", name: "Porte du Non-Retour", subtitle: "Érigée en 1995, reconstruite en 2025", theme: "Mémoire", text: "Sur la plage, face à l'Atlantique, elle marque le lieu de l'embarquement forcé de millions d'Africains.", coords: [6.3242524, 2.0895803], image: { src: "/ouidah/eng-5-porte-jour.jpg", alt: "La Porte du Non-Retour face à l'océan, en plein jour" }, href: adresseLieu("porte-du-non-retour") },
  { slug: "route-des-peches", name: "Route des Pêches", subtitle: "Le long de la côte", theme: "Nature", text: "La route côtière entre l'océan et la lagune, bordée de cocotiers.", coords: [6.339296, 2.2101943], image: { src: "/ouidah/eng-6-route-peches.jpg", alt: "La route des Pêches, bordée de cocotiers, à Ouidah" }, href: adresseLieu("route-des-peches") },
  { slug: "ganvie", name: "Ganvié", subtitle: "Lac Nokoué", theme: "Nature", text: "Le village sur pilotis du lac Nokoué, que l'on rejoint en pirogue.", coords: [6.4681116, 2.3899667], image: IMG.ganvieBoat, href: adresseLieu("ganvie") },
];

export const tours: Circuit[] = [
  { slug: "route-des-esclaves", title: "La Route des Esclaves, à pied", place: "Ouidah", tag: "Mémoire", duration: null, price: null, priceVisible: false, image: { src: "/ouidah/visite-zoungbodji.jpg", alt: "Le mémorial de Zoungbodji, sur la Route des Esclaves" }, draft: true, stops: ["place-chacha", "arbre-de-l-oubli", "memorial-zoungbodji", "arbre-du-retour", "porte-du-non-retour"], trace: traceRouteDesEsclaves.coordinates as [number, number][] },
  { slug: "ouidah-sacree", title: "Ouidah sacrée", place: "Ouidah", tag: "Spiritualité", duration: null, price: null, priceVisible: false, image: { src: "/ouidah/bienvenue-2-temple-pythons.jpg", alt: "L'entrée peinte du Temple des Pythons" }, draft: true, stops: ["temple-des-pythons", "basilique", "foret-sacree-kpasse"], trace: null },
  { slug: "retour-aux-sources", title: "Retour aux sources", place: "Ouidah", tag: "Diaspora", duration: null, price: null, priceVisible: false, image: { src: "/hero/hero-2-porte.jpg", alt: "La Porte du Non-Retour de Ouidah, vue de côté" }, draft: true, stops: ["musee-histoire", "memorial-zoungbodji", "porte-du-non-retour"], trace: null },
  { slug: "ganvie-lac-nokoue", title: "Ganvié, la cité lacustre", place: "Lac Nokoué", tag: "Nature", duration: null, price: null, priceVisible: false, image: IMG.ganvieBoat, draft: true, stops: ["ganvie"], trace: null },
];

// Section 5 « Votre chemin vers Ouidah » : tous les nombres sont calculés à partir des listes ci-dessus.
const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
export const cheminsIntro = {
  origin: [2.0901, 6.3589] as [number, number], // [longitude, latitude] de Ouidah : arrivée de l'arc, calcul du lever et du coucher
  timeZone: "Africa/Porto-Novo",
  kicker: "Nos circuits · Au départ de Ouidah",
  title: { lead: "Votre chemin", accent: "vers Ouidah." },
  intro: "Prenez un circuit déjà composé par nos guides, ou choisissez vos lieux un à un : nous en faisons votre voyage.",
  ready: {
    label: "Circuits prêts",
    desc: (n: number) => `${pluriel(n, "itinéraire composé", "itinéraires composés")} par nos guides`,
    heading: "Des circuits composés par nos guides.",
    steps: (n: number) => pluriel(n, "étape", "étapes"),
    // lien vers la fiche du circuit : « Réserver » quand durée et prix sont publiés, sinon « Demander » (devis)
    book: "Réserver ce circuit",
    demander: "Demander ce circuit",
    customize: "Le personnaliser",
    // recherche envoyée par le Hero : critères rappelés, liste filtrée, et une sortie quand rien ne répond
    recherche: "Votre recherche",
    effacer: "Effacer la recherche",
    aucun: "Aucun circuit prêt ne répond à cette recherche.",
    aucunAide: "Gardez vos lieux un à un, ou décrivez-nous votre voyage : nous le composons avec vous.",
    surMesure: { label: "Créer mon voyage sur mesure", href: "/devis" },
    dureeInconnue: "La durée de ces circuits reste à confirmer : nous l'ajustons avec vous.",
  },
  compose: {
    label: "Composer mon chemin",
    desc: (n: number) => `${pluriel(n, "lieu", "lieux")} à voir, où dormir, où manger : gardez ce qui vous parle`,
    heading: "Gardez les lieux qui vous parlent.",
    views: { deck: "Un lieu à la fois", list: (n: number) => `Tous les lieux · ${n}` },
    viewsLabel: "Façon de parcourir les lieux",
    position: (i: number, n: number) => `Lieu ${i} sur ${n}`,
    skip: "Passer",
    keep: "Garder ce lieu",
    kept: "Gardé",
    see: "Voir",
    noPhoto: "Photo à venir",
    done: "Vous avez parcouru tous les lieux.",
    restart: "Revoir les lieux",
    far: "Plus loin",
  },
  // carte du relevé : filtres par famille de lieux (couleur du point sur la carte), fiche d'un lieu
  filters: [
    { key: "a-voir", label: "À voir", ids: ["a-voir"], color: "#ac3215", group: "voir", on: true },
    { key: "plage", label: "Plages", ids: ["plage"], color: "#2a7ab8", group: "voir", on: true },
    { key: "nature", label: "Nature", ids: ["nature"], color: "#3f8a4e", group: "voir", on: true },
    { key: "hebergement", label: "Où dormir", ids: ["hebergement"], color: "#0f162d", group: "dormir", on: true },
    { key: "restauration", label: "Où manger", ids: ["restauration"], color: "#c98a00", group: "manger", on: true },
    { key: "artisanat", label: "Artisanat", ids: ["artisanat"], color: "#8a4fb3", group: "voir", on: true },
    { key: "marche", label: "Marchés", ids: ["marche"], color: "#d9661f", group: "voir", on: true },
    { key: "pratique", label: "Pratique", ids: ["sante", "argent", "transport", "services"], color: "#5b6478", group: "pratique", on: false },
    { key: "culte", label: "Lieux de culte", ids: ["culte"], color: "#8a8f9c", group: "voir", on: false },
  ] satisfies FiltreLieux[],
  filtersLabel: "Lieux affichés sur la carte",
  groups: { voir: "À voir et à vivre", dormir: "Où dormir", manger: "Où manger", pratique: "Pratique" } as Record<string, string>,
  place: {
    add: "Ajouter à mon voyage",
    remove: "Retirer de mon voyage",
    close: "Fermer la fiche",
    call: "Appeler",
    website: "Site web",
    outside: "Hors de Ouidah",
    verification: { osm: "Relevé sur OpenStreetMap, à confirmer", web: "Relevé dans des sources publiques, à confirmer", "osm+web": "Confirmé par plusieurs sources" } as Record<string, string>,
  },
  mapLocale: {
    "CooperativeGesturesHandler.WindowsHelpText": "Ctrl + molette pour zoomer sur la carte",
    "CooperativeGesturesHandler.MacHelpText": "⌘ + molette pour zoomer sur la carte",
    "CooperativeGesturesHandler.MobileHelpText": "Deux doigts pour déplacer la carte",
    "NavigationControl.ZoomIn": "Zoomer",
    "NavigationControl.ZoomOut": "Dézoomer",
    "AttributionControl.ToggleAttribution": "Sources de la carte",
  } as Record<string, string>,
  trip: {
    label: "Votre chemin",
    count: (n: number) => (n ? `${pluriel(n, "lieu gardé", "lieux gardés")}` : "Aucun lieu gardé"),
    empty: "Gardez un lieu : il s'ajoute ici.",
    note: "Ordre, durée et tarif ajustés avec vous.",
    cta: "Demander ce voyage",
    href: "/devis",
    remove: (nom: string) => `Retirer ${nom}`,
    back: "Bon retour : vos lieux vous attendaient.",
    saved: "Gardé sur cet appareil, sans compte.",
  },
  location: {
    youAre: (ville: string, km: string) => `Vous êtes à ${ville} · ${km} km`,
    ask: "D'où partez-vous ?",
    change: "Modifier",
    field: "Votre ville de départ",
    placeholder: "Ex. : Montréal, Paris, Abidjan",
    submit: "Valider",
    notFound: "Ville introuvable, essayez une autre orthographe.",
    you: "vous",
  },
  time: {
    at: (h: string) => `${h} à Ouidah`,
    night: (h: string) => `il fait nuit · coucher à ${h}`,
    day: (h: string) => `il fait jour · lever à ${h}`,
  },
  globe: { ouidah: (n: number) => `Ouidah · ${pluriel(n, "lieu", "lieux")} à découvrir`, label: "La Terre en ce moment, tournée vers Ouidah" },
  mapLabel: "Carte des lieux de Ouidah et de ses environs",
  mapFallback: "La carte interactive ne peut pas s'afficher sur ce navigateur. Les lieux restent à choisir un à un.",
  tabs: "Choisir comment composer votre voyage",
};

// Section 6 : les grands rendez-vous. Valeurs de départ ; prix et places sont saisis par OHT dans l'admin (null = non affiché).
// Paiement complet en ligne, jamais d'acompte (Kevin, 27/10/2026).
export const evenements: Evenement[] = [
  { slug: "vodun-days", title: "Vodun Days", short: "Vodun Days", theme: "Spiritualité", place: "Ouidah", text: "Le grand rendez-vous annuel des cultures Vodun : cérémonies, danses rituelles, expositions et rencontres, dans le respect des règles fixées par les communautés.", image: IMG.egungun, quand: { type: "editions", dates: [["2027-01-02", "2027-01-09"]] /* 4e édition, annoncée sur vodundays.bj (relevé le 26/10/2026) */ }, organisateur: { type: "externe", nom: "Événement national" }, offre: { type: "sejour", nom: "Séjour Vodun Days", inclus: "hébergement, transferts, guide, accès accompagné", nuits: null, prix: null, places: null } },
  // exemple d'événement OHT, gardé en attendant la confirmation d'OHT (supprimable depuis l'admin)
  { slug: "ouidah-blue", title: "Ouidah Blue", short: "Ouidah Blue", theme: "Culture", place: "Ouidah", text: "Rendez-vous festif autour de la scène artistique locale et internationale : musique, arts visuels et rencontres.", image: null, quand: { type: "paques", debut: -1, fin: 1 }, organisateur: { type: "oht" }, offre: { type: "billet", categories: [{ nom: "Place", detail: "accès à l'événement", prix: null }, { nom: "Place et séjour", detail: "votre place, logement compris", prix: null, logement: true }], places: null, jauge: null } },
  { slug: "souvenir-23-aout", title: "Journée internationale du souvenir de la traite négrière et de son abolition", short: "Journée du souvenir de la traite", theme: "Mémoire", place: "Route des Esclaves, Ouidah", text: "Date reconnue par l'UNESCO, marquée à Ouidah par des cérémonies de recueillement sur la Route des Esclaves.", image: IMG.beachOuidah, quand: { type: "annuel", mois: 8, jour: 23, jours: 1 }, organisateur: { type: "externe", nom: "Commémoration publique" }, offre: { type: "sejour", nom: "Séjour du souvenir", inclus: "hébergement, transferts, guide, cérémonie accompagnée", nuits: null, prix: null, places: null } },
];

const plur = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
export const datesSection = {
  title: { lead: "Venir au", accent: "bon moment." },
  titleStay: (j: number) => ({ lead: "Vous serez à Ouidah", accent: `dans ${plur(j, "jour", "jours")}.` }),
  intro: (nom: string, date: string) => `${nom}, ${date} : le prochain grand rendez-vous. Posez vos dates sur l'année, nous vous disons ce qui se passe pendant votre séjour.`,
  during: (nom: string) => `${nom} tombe pendant votre séjour.`,
  after: (nom: string, oht: boolean) => `${nom}${oht ? ", un événement Ouidah Heritage Tour," : ""} commence juste après votre départ.`,
  none: "Pas de grand rendez-vous à ces dates : Ouidah se visite toute l'année.",
  units: { days: "jours", hours: "h", minutes: "min", seconds: "s" },
  countdownLabel: (j: number, h: number) => `Encore ${j} jours et ${h} heures`,
  live: { next: (nom: string) => `Prochain rendez-vous · ${nom}`, route: (ville: string) => `${ville} → Ouidah`, stay: (date: string, n: number) => `Arrivée ${date} · ${plur(n, "nuit", "nuits")}`, arrival: "Arrivée", departure: "Départ", end: "Fin" },
  pass: {
    oht: "Événement OHT",
    date: "Date", place: "Lieu", in: "Dans", arrival: "Arrivée", departure: "Départ", nights: "Nuits",
    during: "Pendant votre séjour",
    after: "Juste après votre départ",
    dayOf: (a: number, b: number) => (a === b ? `jour ${a}` : `jours ${a}–${b}`),
    stay: (n: number) => `Votre séjour · ${plur(n, "nuit", "nuits")}`,
    from: (prix: string) => `dès ${prix}`,
    onRequest: "Tarif sur demande",
    places: (n: number) => plur(n, "place", "places"),
    placesLeft: (n: number, total: number) => `${plur(n, "place restante", "places restantes")} sur ${total}`,
    extend: (n: number) => `Prolongez de ${plur(n, "nuit", "nuits")} pour y être.`,
    extendCta: "Prolonger",
    bookStay: "Réserver le séjour",
    bookPlace: "Réserver ma place",
    calendar: (nom: string) => `Ajouter ${nom} à mon calendrier`,
    byOht: "Organisé par Ouidah Heritage Tour · vos billets s'affichent dès le paiement confirmé.",
    byOther: (nom: string) => `${nom} : OHT n'organise pas l'événement, nous organisons votre séjour autour.`,
    formulas: "Formule",
  },
  // Talon de réservation (talon B v2, validé le 27/10/2026) : billets et accompagnement, un seul envoi, une seule référence.
  talon: {
    titre: "Votre talon",
    ouvrir: "Réserver ma place",
    fermer: "Fermer la réservation",
    places: "Places",
    restantes: (n: number, total: number) => `${plur(n, "place restante", "places restantes")} sur ${total}`,
    moins: "Une place de moins",
    plus: "Une place de plus",
    accompagnement: "Votre accompagnement",
    accompagnementNote: "sur devis, réponse sous 24 h",
    // sans séjour posé dans l'Agenda, le détail reste général
    navette: (jour: string | null) => ({ titre: "Navette depuis l'aéroport", detail: jour ? `${jour}, à votre arrivée` : "à votre arrivée" }),
    hebergement: (s: { nuits: number; du: string; au: string } | null) => ({ titre: s ? `Hôtel pour vos ${plur(s.nuits, "nuit", "nuits")}` : "Hôtel pour votre séjour", detail: s ? `du ${s.du} au ${s.au}` : "selon vos dates" }),
    vehicule: (jours: string) => ({ titre: "Véhicule avec chauffeur", detail: jours }),
    deja: "déjà choisi dans la Conciergerie",
    unique: { titre: "Un seul envoi, une seule référence.", texte: (services: string, n: number) => `Les billets se paient maintenant. ${services} ${n > 1 ? "partent" : "part"} avec eux en demande de devis.` },
    nom: "Prénom et nom",
    email: "E-mail",
    repris: "repris de votre demande",
    payerAvec: "Payer avec",
    // moyens acceptés selon la documentation officielle de chaque passerelle (relevé du 27/10/2026)
    passerelles: {
      kkiapay: { nom: "Kkiapay", moyens: "Mobile Money, carte" },
      fedapay: { nom: "FedaPay", moyens: "Mobile Money, carte" },
      stripe: { nom: "Stripe", moyens: "Carte bancaire" },
      flutterwave: { nom: "Flutterwave", moyens: "Carte bancaire" },
      paystack: { nom: "Paystack", moyens: "Carte, Mobile Money" },
    } as Record<string, { nom: string; moyens: string }>,
    recommande: (pays: string) => `Recommandé depuis ${pays}`,
    accord: "J'accepte que Ouidah Heritage Tour utilise ces informations pour ma réservation.",
    confidentialite: { label: "Confidentialité", href: "/politique-de-confidentialite" },
    aPayer: (n: number) => `À payer maintenant · ${plur(n, "place", "places")}`,
    eur: (v: string) => `≈ ${v} €`,
    usd: (v: string) => `≈ ${v} $`,
    payer: (montant: string, devis: boolean) => (devis ? `Payer ${montant} et envoyer` : `Payer ${montant}`),
    note: (p: string) => `Billets affichés ici dès que ${p} confirme le paiement.`,
    envoi: "Préparation du paiement…",
    attente: { titre: (p: string) => `Paiement en cours chez ${p}`, texte: (p: string, montant: string) => `Vos billets s'afficheront ici dès que ${p} aura confirmé le paiement de ${montant}.`, devis: "Votre demande d'accompagnement est déjà notée.", autre: "Payer autrement" },
    verification: "Nous vérifions votre paiement…",
    nonConfirme: { titre: "Paiement pas encore confirmé", texte: "Si vous avez payé, la confirmation arrive en général en quelques instants.", reessayer: "Vérifier à nouveau" },
    paye: {
      titre: (prenom: string) => `C'est réservé, ${prenom}.`,
      titreSans: "C'est réservé.",
      resume: (n: number, evenement: string) => `${plur(n, "place", "places")} · ${evenement} · `, // suivi de la date, insécable
      billet: (i: number, n: number) => `Billet ${i} sur ${n}`,
      numero: (x: string) => `N° ${x}`,
      entree: "À présenter à l'entrée",
      precedent: "Billet précédent",
      suivant: "Billet suivant",
      telecharger: "Télécharger les billets",
      reference: "Référence de votre voyage",
      suivi: "Voir mon ticket et mon reçu",
      devis: (services: string) => `${services} : un conseiller vous répond sous 24 heures.`,
      // récapitulatif du corps du billet une fois payé
      recap: { formule: "Formule", paye: "Payé", devis: "Sur devis", places: (n: number) => plur(n, "place", "places") },
      confirme: (montant: string, p: string) => `Paiement de ${montant} confirmé par ${p}.`,
      tampon: "PAYÉ",
    },
    erreurs: {
      champs: "Il manque votre nom, votre e-mail ou votre accord.",
      limite: "Plusieurs réservations viennent d'être faites depuis cette connexion. Réessayez dans une heure.",
      complet: (n: number) => (n ? `Il ne reste que ${plur(n, "place", "places")}.` : "Cet événement est complet."),
      surDemande: "Le tarif de cette formule est sur demande : nous l'ajoutons à votre voyage.",
      passerelle: "Ce moyen de paiement n'est pas disponible. Choisissez-en un autre.",
      indisponible: "Le paiement en ligne ne répond pas pour le moment. Réessayez dans un instant.",
    },
    surDemande: "Ajouter à mon voyage",
  },
  scrub: {
    ask: "Quand venez-vous ?",
    hint: "Glissez la capsule sur l'année",
    range: (a: string, b: string) => `Du ${a} au ${b}`,
    nights: (n: number) => plur(n, "nuit", "nuits"),
    place: "Posez votre séjour",
    today: "Aujourd'hui",
    legendOht: "Événement OHT",
    legendOther: "Grand rendez-vous",
    lengths: [{ label: "Week-end", nuits: 2 }, { label: "Semaine", nuits: 7 }, { label: "10 nuits", nuits: 10 }, { label: "2 semaines", nuits: 14 }],
    lengthsLabel: "Durée du séjour",
    slider: (a: string, n: number) => `Séjour : arrivée le ${a}, ${plur(n, "nuit", "nuits")}. Flèches gauche et droite pour déplacer, Maj + flèches pour changer la durée.`,
    eventDot: (nom: string, date: string) => `${nom}, ${date} : poser mon séjour autour`,
    reset: "Effacer mes dates",
  },
  timeZone: "Africa/Porto-Novo",
  fallbackImage: { src: "/hero/hero-4-plage.jpg", alt: "La plage de Ouidah vue du ciel, vagues de l'Atlantique et cocotiers" } as Media,
};

// Section 7 : planche contact et chapitres. Tirage de la vue lue, texte complet qui s'allume à la lecture, bande de film = progression.
// « Entourer » garde la raison et ajoute ses lieux à « Votre chemin » (section 5). Faits repris de lieux-ouidah.json (vérifiés OSM + web).
export const tenIntro = {
  label: (n: number) => `${n} raisons de visiter Ouidah`,
  title: ["Ce que la ville vous réserve,", "de la mémoire à l'océan."],
  link: { label: "Les découvrir", href: SECTIONS.raisons },
  place: "Ouidah",
  discover: "Découvrir le lieu",
  circle: "Entourer",
  circled: "Entourée",
  kept: (n: number) => `${n} entourée${n > 1 ? "s" : ""}`,
  path: { label: "Voir mon chemin", href: "#chemins" },
  stripLabel: "Les vues, de la mémoire à l'océan",
  frame: (n: string, titre: string) => `Lire la raison ${n} : ${titre}`,
  filmEdge: "OUIDAH 400",
};
export const tenReasons: Raison[] = [
  { slug: "route-des-esclaves", title: "La Route des Esclaves", short: "Route des Esclaves", category: "Mémoire", image: { src: "/ouidah/raison-arbre-du-retour.jpg", alt: "L'Arbre du Retour, dernière station de la Route des Esclaves avant la plage" }, credit: "Ji-Elle, Wikimedia Commons, CC BY-SA 4.0", href: adresseLieu("place-chacha"), lieux: ["place-chacha", "arbre-de-l-oubli", "arbre-du-retour"],
    text: "De la place Chacha, où se tenaient les enchères, jusqu'à la plage : environ 4 km, le chemin que parcouraient les captifs jusqu'aux navires. On passe l'Arbre de l'Oubli, autour duquel on les faisait tourner pour effacer leur nom et leur origine, les Cases Zomaï, où on les enfermait dans le noir, le mémorial de Zoungbodji, puis l'Arbre du Retour, pour que leur âme revienne. On le parcourt à pied, avec un guide qui raconte chaque étape." },
  { slug: "porte-du-non-retour", title: "La Porte du Non-Retour", short: "Porte du Non-Retour", category: "Mémoire", image: { src: "/ouidah/eng-5-porte-jour.jpg", alt: "La Porte du Non-Retour face à l'océan, en plein jour" }, credit: null, href: adresseLieu("porte-du-non-retour"), lieux: ["porte-du-non-retour"],
    text: "Au bout de la Route des Esclaves, sur la plage, face à l'Atlantique. Elle marque le lieu de l'embarquement forcé de millions d'Africains. La première arche, inaugurée le 30 novembre 1995 à l'initiative de l'UNESCO, a laissé place en décembre 2025 à une porte plus haute. On y arrive à pied, après les stations de la route, et l'on se tient là, face à la mer." },
  { slug: "temple-des-pythons", title: "Le Temple des Pythons", short: "Temple des Pythons", category: "Foi", image: { src: "/ouidah/bienvenue-2-temple-pythons.jpg", alt: "L'entrée peinte du Temple des Pythons" }, credit: "Rachad sanoussi, Wikimedia Commons, CC BY-SA 4.0", href: adresseLieu("temple-des-pythons"), lieux: ["temple-des-pythons"],
    text: "Sanctuaire vodun du culte du serpent Dangbé, attesté depuis la fin du XVIIᵉ siècle, où vivent des pythons sacrés. Le temple fait face à la basilique de l'Immaculée-Conception : deux fois qui vivent côte à côte, de part et d'autre d'une même place. La visite se fait dans le respect des règles du lieu." },
  { slug: "basilique", title: "La basilique, face au temple", short: "Basilique", category: "Foi", image: { src: "/ouidah/visite-basilique.jpg", alt: "La basilique de l'Immaculée-Conception de Ouidah" }, credit: "Ji-Elle, Wikimedia Commons, CC BY-SA 4.0", href: adresseLieu("basilique"), lieux: ["basilique"],
    text: "Principal lieu de culte catholique de Ouidah, la basilique de l'Immaculée-Conception a été construite de 1903 à 1909, puis élevée au rang de basilique mineure en 1989. Elle se dresse en face du Temple des Pythons : à Ouidah, on passe de l'une à l'autre en traversant une place." },
  { slug: "musee-histoire", title: "Le musée du fort portugais", short: "Musée d'histoire", category: "Histoire", image: { src: "/ouidah/lieu-musee.jpg", alt: "Le fort portugais de Ouidah, qui abrite le musée d'histoire" }, credit: null, href: adresseLieu("musee-histoire"), lieux: ["musee-histoire"],
    text: "Le fort portugais São João Baptista de Ajudá, construit en 1721, abrite depuis le 6 septembre 1967 le musée d'histoire de la ville : la traite, les royaumes, les liens avec le Brésil et les Amériques, à travers quelque 700 pièces. Le site est en travaux pour accueillir le futur Musée international de la mémoire et de l'esclavage : nous vous disons avant votre venue ce qui est ouvert." },
  { slug: "foret-sacree-kpasse", title: "La forêt sacrée de Kpassè", short: "Forêt de Kpassè", category: "Nature", image: { src: "/ouidah/raison-foret-kpasse.jpg", alt: "Sous les grands arbres de la forêt sacrée de Kpassè, une sculpture vodun" }, credit: "Kulttuurinavigaattori, Wikimedia Commons, CC BY-SA 4.0", href: adresseLieu("foret-sacree-kpasse"), lieux: ["foret-sacree-kpasse"],
    text: "Un îlot forestier de 4 hectares en pleine ville, lié au roi Kpassè. La forêt abrite des divinités vodun et des sculptures, et sert de cadre à des cérémonies, notamment pendant les Vodun Days. On y entre par un portail peint, puis l'on marche sous les grands arbres." },
  { slug: "vodun-days", title: "Les Vodun Days", short: "Vodun Days", category: "Fête", image: { src: "/ouidah/raison-vodun-days.jpg", alt: "Un Egungun dans l'arène de Ouidah pendant les Vodun Days" }, credit: "Eureka9090, Wikimedia Commons, CC BY-SA 4.0", href: SECTIONS.agenda, lieux: [],
    text: "Chaque début janvier, Ouidah accueille le grand rendez-vous annuel des cultures vodun : cérémonies, danses rituelles, expositions et rencontres, dans le respect des règles fixées par les communautés. La grande cérémonie et les concerts se tiennent sur la plage, d'autres moments dans la forêt de Kpassè. Nous n'organisons pas l'événement : nous organisons votre séjour autour." },
  { slug: "memorial-zoungbodji", title: "Le mémorial de Zoungbodji", short: "Zoungbodji", category: "Mémoire", image: { src: "/ouidah/visite-zoungbodji.jpg", alt: "Le mémorial de Zoungbodji, sur la Route des Esclaves" }, credit: "Gbehlon, Wikimedia Commons, CC BY-SA 4.0", href: adresseLieu("memorial-zoungbodji"), lieux: ["memorial-zoungbodji"],
    text: "Le mémorial du village de Zoungbodji marque le dernier lieu où séjournaient les captifs avant l'embarquement, près de la fosse commune où l'on jetait les morts. C'est l'étape la plus grave de la Route des Esclaves, à environ 2 km de la plage et de la Porte du Non-Retour. On s'y arrête un moment avant de rejoindre la mer." },
  { slug: "marches", title: "Artisans, marchés, cuisine", short: "Marchés", category: "Saveurs", image: { src: "/ouidah/eng-7-vendeuses.jpg", alt: "Vendeuses portant leurs marchandises dans une rue de Ouidah" }, credit: "GARNI RAFIK, Wikimedia Commons, CC BY-SA 4.0", href: null, lieux: ["r:marche-de-zobe"],
    text: "Le marché de Zobè, près du fort portugais, et celui du quartier de Kpassè rythment la vie de la ville. Nos guides vous y emmènent, comme chez les artisans et aux bonnes tables de Ouidah, des maquis aux restaurants. C'est la ville d'aujourd'hui, celle qui vit entre deux visites." },
  { slug: "plage-et-lagune", title: "La plage et la lagune", short: "Plage et lagune", category: "Océan", image: { src: "/hero/hero-4-plage.jpg", alt: "La plage de Ouidah vue du ciel, vagues de l'Atlantique et cocotiers" }, credit: null, href: adresseLieu("route-des-peches"), lieux: ["route-des-peches", "r:lagune-de-ouidah"],
    text: "Au bout de la Route des Esclaves, une longue plage peu aménagée, où se tiennent la grande cérémonie et les concerts des Vodun Days. Derrière, la lagune sépare la ville de l'océan : l'un des écosystèmes côtiers les plus importants du Bénin, qu'on découvre en pirogue depuis le petit embarcadère. La route des Pêches, bordée de cocotiers, court entre les deux. Baignade déconseillée par vent fort." },
];

export const stripLabel = "Ouidah et le Bénin en images";
export const stripImages: Media[] = [IMG.ceremony2, IMG.egungun, IMG.waxFabric, IMG.artisan, IMG.ganvieBoat, IMG.dance, IMG.market, IMG.beachOuidah, IMG.ouidahAerial, IMG.ganvieRower];

// Section 9 « Conciergerie » (maquette D3 « Le cadre ») : une question par service, réponses gardées sur l'appareil.
// Nombres d'adresses : comptés côté serveur dans lieux-ouidah.json (champ « releve » des options), jamais écrits ici.
export const conciergeIntro = {
  label: "Conciergerie",
  title: ["Tout ce qui entoure votre visite,", "organisé."],
  link: { label: "Demander un devis", href: "/devis" },
  envoyer: "Envoyer la demande",
  aucunService: "Choisissez un service",
  note: "Nous revenons vers vous avec un devis détaillé.",
  demande: "Votre demande",
  ensuite: (s: string) => `Ensuite : ${s.toLowerCase()}`,
  retour: (s: string) => `Retour : ${s.toLowerCase()}`,
  rien: "Rien de réglé pour l'instant.",
  regles: (n: number, total: number) => `${n} réglé${n > 1 ? "s" : ""} sur ${total}.`,
  reste: (liste: string[]) => ` Reste : ${liste.join(", ")}.`,
  prete: " Demande prête.",
  dates: (a: string, b: string) => `Du ${a} au ${b}`,
  adresses: (n: number) => `${n} adresse${n > 1 ? "s" : ""}`,
  compte: (n: number) => `${n} service${n > 1 ? "s" : ""} demandé${n > 1 ? "s" : ""}`,
  rang: (i: number, n: number) => `${String(i).padStart(2, "0")} / ${String(n).padStart(2, "0")}`,
};
const AUCUN = { label: "Pas besoin", detail: null, releve: null, passe: true };
export const conciergerie: QuestionConciergerie[] = [
  { id: "navette", court: "Navette", nom: "Navette.", question: "Un trajet, ou l'aller-retour ?", moment: "À l'atterrissage", lead: "Depuis l'aéroport international Cardinal Bernardin Gantin : environ 41 km par la route.", leadReleve: null, objet: "navette",
    photo: { src: "/ouidah/aeroport-fresque.jpg", alt: "La fresque « Bienvenue au Bénin » à l'aéroport de Cotonou" }, credit: "Houss 2020, Wikimedia Commons, CC0",
    options: [{ label: "Aller", detail: "Aéroport → Ouidah", releve: null, phrase: "la navette à l'arrivée" }, { label: "Aller-retour", detail: "Et le jour du départ", releve: null, phrase: "la navette aller-retour" }, AUCUN] },
  { id: "accueil", court: "Accueil", nom: "Accueil.", question: "Où voulez-vous qu'on vous attende ?", moment: "À votre arrivée", lead: null, leadReleve: null, objet: "accueil",
    photo: { src: "/ouidah/aeroport-facade.jpg", alt: "La façade de l'aéroport international de Cotonou" }, credit: "Fawaz.tairou, Wikimedia Commons, CC BY-SA 4.0",
    options: [{ label: "À l'aéroport", detail: "Dès la sortie", releve: null, phrase: "l'accueil à l'aéroport" }, { label: "À Ouidah", detail: "À votre adresse", releve: null, phrase: "l'accueil à Ouidah" }, AUCUN] },
  { id: "telephone", court: "Téléphone", nom: "Téléphone.", question: "Une carte SIM en arrivant ?", moment: "Le premier jour", lead: null, leadReleve: null, objet: "telephone",
    photo: { src: "/ouidah/eng-1-rue-basilique.jpg", alt: "Une rue de Ouidah, vers la basilique" }, credit: "Kulttuurinavigaattori, Wikimedia Commons, CC BY-SA 4.0",
    options: [{ label: "Carte SIM", detail: "Appeler, écrire", releve: null, phrase: "une carte SIM" }, { label: "Carte SIM + données", detail: "Et internet mobile", releve: null, phrase: "une carte SIM avec internet" }, AUCUN] },
  { id: "hebergement", court: "Hébergement", nom: "Hébergement.", question: "Quel genre d'adresse ?", moment: "Le premier soir", lead: "{n} adresses relevées à Ouidah. Nous choisissons avec vous celle qui vous ressemble.", leadReleve: "hebergement", objet: "hebergement",
    photo: { src: "/ouidah/eng-3-case-plage.jpg", alt: "Une case ronde au toit de paille, face à la plage" }, cadre: "50% 85%", credit: null,
    options: [{ label: "Hôtel", detail: null, releve: "hebergement/Hôtel", phrase: "un hôtel" }, { label: "Auberge", detail: null, releve: "hebergement/Auberge", phrase: "une auberge" }, { label: "Maison d'hôtes", detail: null, releve: "hebergement/Maison d'hôtes", phrase: "une maison d'hôtes" }, { label: "Campement", detail: null, releve: "hebergement/Campement", phrase: "un campement" }, { label: "J'ai déjà réservé", detail: null, releve: null, passe: true }] },
  { id: "tables", court: "Tables", nom: "Tables.", question: "Où aimez-vous manger ?", moment: "À table", lead: "{n} tables relevées à Ouidah. Plusieurs choix possibles.", leadReleve: "restauration", multi: true, objet: "tables",
    photo: { src: "/ouidah/eng-4-paillote.jpg", alt: "Une paillote au bord de la plage de Ouidah" }, credit: "Fawaz.tairou, Wikimedia Commons, CC BY-SA 4.0",
    options: [{ label: "Restaurants", detail: null, releve: "restauration/Restaurant", phrase: "des restaurants" }, { label: "Bars", detail: null, releve: "restauration/Bar", phrase: "des bars" }, { label: "Cafés", detail: null, releve: "restauration/Café", phrase: "des cafés" }, AUCUN] },
  { id: "vehicule", court: "Véhicule", nom: "Véhicule.", question: "Avec ou sans chauffeur ?", moment: "Les jours suivants", lead: "Pour rejoindre la plage par la route des Pêches, Ganvié ou Abomey à votre rythme.", leadReleve: null, objet: "vehicule",
    photo: { src: "/ouidah/route-des-peches.jpg", alt: "La route des Pêches, bordée de lampadaires, entre lagune et océan" }, credit: "Fawaz.tairou, Wikimedia Commons, CC BY-SA 4.0",
    options: [{ label: "Avec chauffeur", detail: null, releve: null, phrase: "un véhicule avec chauffeur" }, { label: "Sans chauffeur", detail: null, releve: null, phrase: "un véhicule sans chauffeur" }, AUCUN] },
];

export const testimonials: Temoignage[] = []; // avis réels uniquement : la section n'apparaît pas tant qu'il n'y en a aucun

// Section « Préparer votre voyage » (maquette H2 « Carte en main ») : des conseils courts qui rassurent, tous vrais.
// Sources et dates de vérification gardées ici pour l'admin, jamais affichées.
export const prepare = {
  title: ["Préparer votre voyage,", "carte en main."],
  lead: "Ouidah est sur la côte, à 41 km de l'aéroport. L'essentiel tient en quelques conseils.",
  carte: {
    // [longitude, latitude]
    ouidah: [2.0851, 6.3622] as [number, number],
    aeroport: [2.3844, 6.3573] as [number, number],
    porte: [2.0896, 6.3243] as [number, number],
    ville: "Ouidah",
    villeSous: "Côte atlantique",
    ocean: "Océan Atlantique",
    pays: [{ nom: "Togo", lieu: [1.12, 8.2] as [number, number] }, { nom: "Nigeria", lieu: [3.38, 8.4] as [number, number] }],
    cotonou: "Cotonou",
    aeroportNom: "aéroport international",
    porteNom: "Porte du Non-Retour",
    km: "41 km",
    kmSous: "par la route, en navette",
    ariaBenin: "Carte du Bénin : Ouidah, sur la côte atlantique, à 41 km de l'aéroport de Cotonou",
    ariaCote: "La côte du Bénin : la route de l'aéroport de Cotonou à Ouidah, 41 km",
  },
  fiche: {
    image: { src: "/ouidah/eng-5-porte-jour.jpg", alt: "La Porte du Non-Retour face à l'océan, à Ouidah" },
    titre: "Ouidah",
    texte: "Ville d'histoire, face à l'Atlantique.",
    heure: (h: string) => `${h} à Ouidah`,
    heureTexte: "Même heure qu'à Paris en hiver.",
    fuseau: "Africa/Porto-Novo",
  },
  accueil: { titre: "On vous attend.", texte: "À l'arrivée, l'équipe vous accueille à l'aéroport, si vous le souhaitez." },
  ongletsLabel: "Préparer votre voyage, par thème",
  conseils: (n: number) => `${n} petits conseils`,
  numeros: "Numéros utiles",
  question: "Une question avant de partir ? Nous répondons sous 24 heures.",
  whatsapp: "Écrire sur WhatsApp",
  ecrire: { label: "Poser une question", href: DEVIS.question }, // tant que le numéro WhatsApp n'est pas fourni
  verifie: "2026-10-22",
};
export const preparer: ThemePreparer[] = [
  { id: "sur-place", court: "Sur place", objet: "accueil", vue: "benin", titre: "Ouidah se visite l'esprit tranquille.",
    cle: { valeur: "Accompagné", texte: "par notre équipe, avant, pendant et après le voyage." }, mot: true,
    points: ["À l'aéroport, on vous attend si vous le souhaitez : la navette vous conduit jusqu'à Ouidah.", "Hébergement et tables : nous choisissons avec vous parmi les adresses relevées à Ouidah.", "Avant une photo de cérémonie ou un portrait, un mot suffit : demandez, c'est l'usage.", "À la plage, profitez du sable et du coucher de soleil ; pour la baignade, demandez conseil sur place, la barre de l'Atlantique est puissante."],
    source: "Engagements OHT · France Diplomatie (15 sept. 2026) · FCDO" },
  { id: "arriver", court: "Arriver", objet: "navette", vue: "cote", titre: "Arriver, simplement.",
    cle: { valeur: "41 km", texte: "de l'aéroport de Cotonou à Ouidah. La navette OHT vous y conduit." },
    points: ["Votre e-Visa se demande en ligne, sur evisa.bj : 30 ou 90 jours, réponse en 1 à 96 heures.", "Faites la demande au moins 7 jours avant l'arrivée, puis gardez-le à portée de main.", "Ressortissants africains : pas de visa, jusqu'à 90 jours.", "Voyageurs français : passeport valide 6 mois après le retour, billet retour dans le sac."],
    source: "evisa.bj · France Diplomatie · OSRM (41 km)" },
  { id: "sante", court: "Santé", objet: "sante", vue: "benin", titre: "Votre santé, préparée.",
    cle: { valeur: "1 visite", texte: "chez votre médecin ou dans un centre de vaccinations internationales, avant le départ." },
    points: ["Vaccins à jour, hépatite A et typhoïde : votre médecin fait le point avec vous.", "Fièvre jaune : vaccin recommandé dès 9 mois. Glissez votre carnet dans le sac.", "Contre les moustiques : répulsif et manches longues le soir. Votre médecin vous dira si un traitement contre le paludisme est utile."],
    source: "Ministère de la Santé du Bénin (16 sept. 2026) · Institut Pasteur · OMS — fièvre jaune : sources en désaccord, à confirmer" },
  { id: "argent", court: "Argent", objet: "type-voyage", vue: "benin", titre: "L'argent, sans calcul.",
    cle: { valeur: "15,24 €", texte: "pour 10 000 FCFA. Le taux est fixe, toute l'année." },
    points: ["Le franc CFA est arrimé à l'euro : 1 € = 655,957 FCFA, sans variation.", "Repère rapide : 1 000 FCFA font environ 1,50 €.", "Pour retirer, choisissez les distributeurs situés à l'intérieur des agences."],
    source: "BCEAO · France Diplomatie" },
  { id: "pratique", court: "Pratique", objet: "prise", vue: "benin", fiche: "heure", titre: "Bon à savoir.",
    cle: { valeur: "0 h", texte: "de décalage avec Paris en hiver, 1 h en été." },
    points: ["220 V, prises C et E : les chargeurs de France et de Belgique se branchent sans adaptateur.", "Le français est la langue officielle ; à Ouidah, on parle aussi le fon.", "Une carte SIM locale MTN, Moov Africa ou Celtiis, et vous restez joignable.", "Saison sèche de novembre à mars, puis de mi-juillet à mi-septembre."],
    source: "gouv.bj · ARCEP Bénin · IEC · IANA" },
];
export const emergency = [
  { label: "Police", value: "117" },
  { label: "Pompiers", value: "118" },
  { label: "SAMU", value: "112" },
];

export const finalCta = {
  title: ["Votre voyage commence", "par une conversation."],
  sub: "Dites-nous ce que vous cherchez à Ouidah. Nous vous répondons sous 24 heures.",
  primary: { label: "Demander un devis", href: "/devis" },
  whatsapp: "Écrire sur WhatsApp",
  image: IMG.beachOuidah,
};

// Section 12 « La lettre de Ouidah » (maquette E « Ce soir, à la carte ») : aucune fréquence d'envoi ni nombre
// d'abonnés tant qu'OHT ne les a pas fournis.
export const newsletter = {
  nom: "La lettre de Ouidah",
  phrase: (passe: boolean) => [passe ? "Ce soir, le soleil s'est couché à" : "Ce soir, le soleil se couche à", "sur la plage de Ouidah."] as const, // l'heure calculée va entre les deux
  phraseSansHeure: "Ce soir, le soleil se couche sur la plage de Ouidah.",
  maintenant: "À Ouidah",
  dans: (n: number) => (n <= 0 ? "aujourd'hui" : n === 1 ? "demain" : `dans ${n} jours`),
  photo: { src: "/ouidah/bienvenue-3-plage-cocotiers.jpg", alt: "La plage de Ouidah, ses cocotiers et la piste de sable en fin de journée" },
  choisir: "Choisissez ce que Ouidah vous écrit",
  sujets: [
    { id: "departs", nom: "Nos dates de départ", texte: "Les prochains séjours et circuits, avec leurs dates.", objet: "calendrier" as NomObjet },
    { id: "agenda", nom: "L'agenda de Ouidah", texte: "Vodun Days, Journée du souvenir, Ouidah Blue : les rendez-vous de la ville.", objet: "fete" as NomObjet },
  ],
  langue: "La lettre en",
  field: "Votre adresse e-mail",
  exemple: "vous@exemple.com",
  submit: "Recevoir la lettre",
  envoyer: (n: number) => `Recevoir la lettre (${n} ${n > 1 ? "thèmes" : "thème"})`,
  consent: "J'accepte de recevoir la lettre de Ouidah Heritage Tour. Désinscription en un clic.",
  envoi: "Inscription en cours…",
  thanks: "C'est noté : la lettre arrivera dans votre boîte.",
  echec: "L'inscription n'a pas abouti. Réessayez dans un instant.",
  limite: "Plusieurs inscriptions sont déjà parties de cette connexion. Réessayez dans une heure.",
  aucun: "Choisissez au moins un thème.",
  error: "Indiquez une adresse e-mail valide et cochez la case.",
  // ce qui manque, dit précisément (annoncé près des thèmes, puis message du champ fautif) ; libellé visible du bouton
  auMoinsUn: "au moins un thème",
  emailManque: "Indiquez votre adresse e-mail.",
  emailInvalide: "Cette adresse semble incomplète : vérifiez la partie après le @.",
  consentManque: "Cochez la case pour accepter de recevoir la lettre.",
  envoyerCourt: "S'inscrire",
};

// Section 15 — pied de page (maquette A « Verre sur Ouidah ») : vraies photos de Ouidah, annuaire du site (mêmes familles
// que le menu), heure et coucher du soleil de Ouidah. Pages retirées du plan le 22/10/2026 : 10 raisons (section de
// l'accueil), Équipe, Partenaires, Tourisme responsable (sections de « Qui sommes-nous »), Journal et Presse (aucun contenu),
// Témoignages (aucun avis réel), Numéros utiles (dans « Préparer mon voyage »), Guide des tailles (dans la fiche produit),
// Suivre ma réservation (avant les premières réservations). Fusions du même jour : voir « Adresses calculées » en tête.
export const footer = {
  tagline: "Agence de tourisme mémoriel et culturel à Ouidah, Bénin.",
  photos: [
    { src: "/ouidah/raison-foret-kpasse.jpg", legende: "Forêt sacrée de Kpassè, Ouidah", position: "50% 55%", nuit: false },
    { src: "/hero/hero-2-porte.jpg", legende: "Porte du Non-Retour, la nuit", position: "50% 30%", nuit: true },
    { src: "/ouidah/visite-cite-historique.jpg", legende: "Cité historique de Ouidah", position: "50% 40%", nuit: false },
  ],
  photosLabel: (n: number, total: number) => `Photo ${n} sur ${total}`,
  vif: ["Il est", "à Ouidah."] as const, // l'heure calculée va entre les deux
  coucher: (heure: string, passe: boolean) => (passe ? `Le soleil s'est couché à ${heure}` : `Coucher du soleil à ${heure}`),
  columns: [
    { title: "Découvrir", links: [{ label: "Lieux à voir", href: SECTIONS.lieux }, { label: "10 raisons de venir", href: SECTIONS.raisons }, { label: "Histoire", href: "/ouidah/histoire" }, { label: "Blog", href: "/blog", blog: true }] },
    { title: "Voyager", links: [{ label: "Circuits", href: SECTIONS.circuits }, { label: "Agenda", href: SECTIONS.agenda }, { label: "Conciergerie", href: SECTIONS.conciergerie }, { label: "Préparer mon voyage", href: SECTIONS.preparer }, { label: "Créer mon voyage", href: DEVIS.voyage }, { label: "Groupes et professionnels", href: DEVIS.groupe }, { label: "Prendre rendez-vous", href: "/rendez-vous" }] },
    { title: "Acheter", boutique: true, links: [{ label: "Boutique", href: "/boutique" }, { label: "Livraison et retours", href: "/conditions-generales-de-vente#livraison" }] },
    { title: "L'agence", links: [{ label: "Qui sommes-nous", href: adresseAgence() }, { label: "Nos engagements", href: SECTIONS.engagements }, { label: "Nous écrire", href: DEVIS.question }] },
  ] satisfies { title: string; links: Lien[]; boutique?: true }[],
  planLabel: "Plan du site",
  joindre: { avant: "Plus de façons de nous joindre :", whatsapp: "écrire sur WhatsApp", apres: "." }, // affiché quand le numéro est fourni
  legal: [
    { label: "Mentions légales", href: "/mentions-legales" },
    { label: "Confidentialité et cookies", href: "/politique-de-confidentialite" },
    { label: "CGV", href: "/conditions-generales-de-vente" },
    { label: "Crédits photos", href: "/mentions-legales#credits" },
    { label: "Accessibilité", href: "/mentions-legales#accessibilite" },
  ],
  legalLabel: "Informations légales",
  pays: "Bénin",
  langue: "Langue",
  devise: "Devise",
  bientot: "bientôt",
  reglages: "Langue et devise",
  haut: "Haut de page",
  copyright: (year: number) => `© ${year} Ouidah Heritage Tour`,
};

// Bandeau « Vos choix sur ce site » (piste A « La pastille », retenue le 28/10/2026). Relevé du site le 28/10 : aucun cookie
// publicitaire, aucune mesure d'audience ; deux services facultatifs reçoivent l'adresse IP. Refusés, tout fonctionne autrement.
export const consentement = {
  titre: "Vos choix sur ce site",
  court: "Cartes interactives et ville approximative : à vous de choisir.",
  accepter: "Tout accepter",
  refuser: "Tout refuser",
  choisir: "Choisir",
  enregistrer: "Enregistrer mes choix",
  fermer: "Fermer",
  toujours: "Toujours actif",
  politique: { label: "Confidentialité et cookies", href: "/politique-de-confidentialite" },
  categories: [
    { id: "necessaires", nom: "Nécessaires", texte: "Votre dossier de voyage, la devise, le panier et le retour de paiement, gardés dans votre navigateur." },
    { id: "cartes", nom: "Cartes interactives", texte: "Les fonds de carte viennent d'OpenFreeMap, qui reçoit votre adresse IP. Refusées : la carte s'affiche en image." },
    { id: "ville", nom: "Ville approximative", texte: "Votre ville, déduite de votre adresse IP par notre hébergeur, pour situer Ouidah par rapport à chez vous. Elle reste dans votre navigateur. Refusée : vous la saisissez vous-même." },
    { id: "mesure", nom: "Mesure d'audience", texte: "Les pages vues, comptées sans cookie ni identifiant par le compteur d'OHT et par Vercel Web Analytics (États-Unis), pour savoir ce qui intéresse nos visiteurs. Refusée : rien n'est compté." },
  ] as const,
  lienPied: "Cookies", // dans la ligne légale du pied de page : rouvre le bandeau
  afficherCarte: "Afficher la carte interactive", // sur l'image de la carte, tant que les cartes ne sont pas acceptées
};

// Crédits exigés par les licences des photos : une liste discrète en bas des mentions légales, jamais sur l'image.
export const creditsPage = {
  intro: "Certaines photos du site et le fond sonore de la page Histoire sont publiés sous licence libre. Merci à leurs auteurs.",
  modifiee: "adaptée",
  carteSource: "© les contributeurs d'OpenStreetMap",
};

export const enPreparation = {
  metaTitle: "Page en préparation — Ouidah Heritage Tour",
  label: "Bientôt",
  title: "Cette page est en préparation.",
  titre: (page: string) => `« ${page} » arrive bientôt.`,
  text: "Nous construisons le site page par page, en commençant par l'accueil. Revenez très vite, ou écrivez-nous pour préparer votre voyage dès maintenant.",
  back: "Retour à l'accueil",
};

// Compositions éditoriales (refonte de la mise en page)
// Section 2 : bienvenue. Fond blanc, surtitre, grande phrase avec photos rondes dans la ligne, puis trois colonnes numérotées.
export const welcomeStatement = {
  kicker: "Ouidah Heritage Tour · Qui sommes-nous",
  // la phrase, avec les photos posées entre les mots ; ring = couleur du cercle autour de la photo
  segments: [
    { text: "Bienvenue chez vous," },
    { image: { src: "/ouidah/bienvenue-1-porte-nuit.jpg", alt: "La Porte du Non-Retour illuminée, la nuit" }, ring: "sun" },
    { text: "au cœur de votre Histoire," },
    { image: { src: "/ouidah/bienvenue-2-temple-pythons.jpg", alt: "L'entrée peinte du Temple des Pythons" }, ring: "abyss" },
    { text: "de la Route des Esclaves" },
    { image: { src: "/ouidah/bienvenue-3-plage-cocotiers.jpg", alt: "La plage de Ouidah au soleil couchant" }, ring: "sun" },
    { text: "jusqu'à l'océan." },
  ] as ({ text: string } | { image: Media; ring: "sun" | "abyss" })[],
  columns: [
    { title: "Mémoire et culture", text: "Agence de tourisme mémoriel et culturel, nous vous emmenons à pied sur la Route des Esclaves, avec un guide qui raconte chaque étape." },
    { title: "Les lieux que vous choisissez", text: "Le Temple des Pythons face à la basilique, la forêt sacrée de Kpassè, le marché de Zobè, la lagune en pirogue. Nous composons votre séjour avec les lieux qui vous parlent." },
    { title: "De l'aéroport à Ouidah", text: "Navette depuis l'aéroport de Cotonou, hébergement, tables, véhicule : nous organisons avec vous ce qui entoure la visite, avant, pendant et après le voyage." },
  ],
};
// Collage « Une ville qui se vit » : les gens de Ouidah, photos prises à Ouidah (Wikimedia Commons, CC BY-SA 4.0) en attendant celles d'OHT.
// credit = attribution exigée par la licence, affichée seulement sur /credits. L'ordre suit les places du collage (portrait d'abord).
export const collage = {
  label: "Ouidah en images",
  title: ["Une ville", "qui se vit."],
  images: [
    { src: "/ouidah/collage-danse-atchinan-kpasse.jpg", alt: "Une danseuse parée de colliers de perles, lors d'une cérémonie vodun dans la forêt sacrée de Kpassè", credit: "Maelan123, Wikimedia Commons, CC BY-SA 4.0" },
    { src: "/ouidah/collage-egungun-vodun-days.jpg", alt: "Un Egungun en costume brodé, au milieu du public des Vodun Days à Ouidah", credit: "Romario Coffi, Wikimedia Commons, CC BY-SA 4.0" },
    { src: "/ouidah/collage-marche-zobe.jpg", alt: "L'entrée du marché Zobè, à l'ombre des grands arbres", credit: "Ji-Elle, Wikimedia Commons, CC BY-SA 4.0" },
    { src: "/ouidah/collage-danseur-kpasse.jpg", alt: "Un danseur en pagne bleu, au sol, lors d'une cérémonie vodun dans la forêt sacrée de Kpassè", credit: "Maelan123, Wikimedia Commons, CC BY-SA 4.0" },
    { src: "/ouidah/collage-fete-vodoun-2023.jpg", alt: "Danseurs en tenues de fête et coiffes rouges, à la fête du vodun du 10 janvier à Ouidah", credit: "Dieu229, Wikimedia Commons, CC BY-SA 4.0" },
    { src: "/ouidah/collage-zangbeto-meko.jpg", alt: "Deux Zangbéto aux franges colorées pendant les Vodun Days, au village de Mèkô (commune de Ouidah)", credit: "Gildas Lissassi, Wikimedia Commons, CC BY-SA 4.0" },
    { src: "/ouidah/collage-vodun-days-2024.jpg", alt: "Danseuses en pagnes colorés devant le public des Vodun Days 2024 à Ouidah", credit: "Fermi12, Wikimedia Commons, CC BY-SA 4.0" },
  ],
};
export const finalMask = { word: "OUIDAH", image: IMG.beachOuidah };

// Page /devis « Créer mon voyage » (piste E « Le billet pour Ouidah », choisie par Kevin le 26/10/2026) : la demande est
// un billet posé sur le bleu nuit. Le voyage composé sur l'accueil y est déjà inscrit en lettres à palettes, chaque partie
// avec son « Modifier » ; ce qui manque se remplit dans des cases jaunes ; le talon perforé porte les coordonnées et
// l'envoi, et se déchire seulement après la réponse du serveur. Rien n'est coché d'avance (la langue suit celle du site).
const lister = (l: string[]) => (l.length < 2 ? l.join("") : `${l.slice(0, -1).join(", ")} et ${l.at(-1)}`);
export const devisPage = {
  metaTitre: "Créer mon voyage — Ouidah Heritage Tour",
  metaDescription: "Votre billet pour Ouidah : le voyage composé sur le site, ce qui manque à compléter, un conseiller vous répond sous 24 heures.",
  titre: { voyage: "Votre billet pour Ouidah.", groupe: "Votre billet de groupe pour Ouidah.", question: "Nous écrire." },
  intro: {
    compose: "Tout ce que vous avez composé sur l'accueil y est déjà. Complétez les cases jaunes, puis le talon.",
    vide: "Complétez les cases jaunes, puis le talon : un conseiller vous répond sous 24 heures.",
    groupe: "Associations, écoles, entreprises, grandes familles : dites-nous qui vient, nous composons le séjour.",
    question: "Une question avant de partir, une idée de voyage ? Nous vous répondons sous 24 heures.",
  },
  lister,
  reference: { lib: "Référence", note: "attribuée à l'envoi", lib2: "Référence de votre demande" },
  trajet: {
    depart: "Départ",
    arrivee: "Arrivée",
    destination: "Destination",
    vol: "votre vol",
    navette: (km: number) => `navette, environ ${km} km`,
    route: "par la route", // départ d'une ville du Bénin : ni vol ni aéroport
    detectee: "proposée d'après votre connexion",
    choisie: "votre ville",
    villeTrou: "votre ville",
    villeNote: "facultatif",
    villeTitre: "D'où partez-vous ?",
    villeAide: "Ex. : Paris, Montréal, Abidjan",
    villeOk: "Garder cette ville",
    villeIntrouvable: "Ville introuvable, essayez une autre orthographe.",
    aeroport: { code: "COO", nom: "Aéroport de Cotonou", km: 41 },
    ouidah: "OUIDAH",
    pays: "Bénin",
  },
  dates: {
    aller: "Aller",
    retour: "Retour",
    allerRetour: "Aller, retour", // case vide, avant le choix des dates
    sejour: "Séjour",
    nuits: (n: number) => `${n} nuit${n > 1 ? "s" : ""}`,
    trou: "à quelles dates ?",
    conseil: "Conseillez-moi",
    conseillees: "Dates à conseiller",
    choisir: "Je choisis mes dates",
    arrivee: "Date d'arrivée",
    depart: "Date de départ",
    garder: "Garder ces dates",
    manquantes: "Choisissez vos deux dates.",
    invalides: "Le départ suit l'arrivée, au plus tard trois ans après aujourd'hui.",
    modifier: { label: "Modifier les dates", href: SECTIONS.agenda },
    pendant: "pendant les",
  },
  lieux: {
    titre: (n: number) => (n > 1 ? `Vos ${n} lieux` : "Votre lieu"),
    titreVide: "Vos lieux",
    circuit: (titre: string) => `Circuit « ${titre} »`,
    trou: "quels lieux ?",
    conseil: "Conseillez-moi",
    conseilles: "Lieux à conseiller",
    choisir: { label: "Choisir mes lieux", href: SECTIONS.circuits },
    modifier: { label: "Modifier les lieux", href: SECTIONS.circuits },
  },
  // carnet des lieux, ouvert depuis la case « Vos lieux » du billet : circuits, lieux à voir, recherche, carte.
  // {n}, {a}, {q}, {nom} : valeurs posées à l'affichage (garder ces jetons dans chaque langue)
  carnet: {
    chercher: "Chercher un lieu, un circuit",
    filtres: "Filtrer par thème",
    aVoir: "Lieux à voir",
    ville: "Dans la ville",
    accueil: "Les lieux gardés sur l'accueil sont déjà numérotés.",
    recouvre: "{a} sur {n} dans votre voyage",
    ajouterEtapes: { un: "Ajouter son étape", plusieurs: "Ajouter ses {n} étapes" },
    remplacer: { un: "Remplacer mon lieu", plusieurs: "Remplacer mes {n} lieux" },
    retablir: { un: "Rétablir mon lieu", plusieurs: "Rétablir mes {n} lieux" },
    autres: { un: "1 autre lieu gardé", plusieurs: "{n} autres lieux gardés" },
    garde: "{nom} gardé.",
    retire: "{nom} retiré.",
    aucun: "Aucun lieu ne répond à « {q} ».",
    ajouterMessage: "Ajouter « {q} » à ma demande",
    ligneMessage: "Je souhaite aussi voir : {q}",
    ajouteMessage: "« {q} » est ajouté à votre message.",
    vues: "Afficher la carte ou la liste",
    carte: "Carte",
    liste: "Liste",
    ocean: "Océan Atlantique",
    source: "© les contributeurs d'OpenStreetMap",
  },
  services: {
    titre: (n: number) => (n > 1 ? `Vos ${n} services` : "Votre service"),
    titreVide: "Vos services",
    modifier: { label: "Modifier les services", href: SECTIONS.conciergerie },
    aucun: "Navette, hébergement, véhicule :",
    aucunLien: { label: "la conciergerie s'en occupe", href: SECTIONS.conciergerie },
  },
  // billets d'événement choisis dans l'Agenda (dossier unique) : payés avec l'envoi quand leur prix est publié
  billets: {
    titre: (n: number) => (n > 1 ? "Vos billets" : "Votre billet"),
    modifier: { label: "Modifier les billets", href: SECTIONS.agenda },
    ligne: (evenement: string, formule: string, n: number) => `${evenement} · ${formule} × ${n}`,
    aPayer: (montant: string) => `À payer maintenant · ${montant}`,
    surDevis: "Sur devis",
    unSeul: "Un seul événement se paie en ligne par envoi : vos billets partent en demande de devis.",
  },
  qui: {
    lib: "Passagers",
    titre: "Qui voyage ?",
    trou: "avec qui ?",
    options: [
      { id: "Seul(e)", phrase: "seul(e)", adultes: 1 },
      { id: "En couple", phrase: "en couple", adultes: 2 },
      { id: "En famille", phrase: "en famille", adultes: 2 },
      { id: "Entre amis", phrase: "entre amis", adultes: 2 },
      { id: "En groupe", phrase: "en groupe", adultes: 2 },
      { id: "Professionnel", phrase: "pour le travail", adultes: 1 },
    ],
    adultes: "Adultes",
    enfants: "Enfants, moins de 18 ans",
    nombre: (a: number, e: number) => [a ? `${a} adulte${a > 1 ? "s" : ""}` : "", e ? `${e} enfant${e > 1 ? "s" : ""}` : ""].filter(Boolean).join(" et "),
    moins: (q: string) => `Un de moins : ${q}`,
    plus: (q: string) => `Un de plus : ${q}`,
    valider: "Valider",
  },
  pays: { lib: "Pays de départ", titre: "Vous partez de quel pays ?", trou: "votre pays", recherche: "Rechercher un pays", propose: "proposé d'après votre connexion", aucun: "Essayez le nom du pays en français." },
  occasion: {
    lib: "Occasion",
    titre: "Une occasion particulière ?",
    trou: "une occasion ?",
    note: "facultatif",
    options: [
      { id: "Retour aux sources", phrase: "un retour aux sources" },
      { id: "Voyage de noces", phrase: "un voyage de noces" },
      { id: "Anniversaire", phrase: "un anniversaire" },
      { id: "Voyage scolaire", phrase: "un voyage scolaire" },
    ],
    aucune: "Non précisée",
  },
  langue: { lib: "Langue de réponse", titre: "Dans quelle langue vous écrire ?", note: "langue du site", aide: "Pour nos échanges, le devis et, quand c'est possible, la visite." },
  langues: { FR: "français", EN: "anglais", ES: "espagnol", DE: "allemand", PT: "portugais", HT: "créole haïtien", GCF: "créole" } as Record<string, string>,
  fermer: "Fermer",
  // pastille de l'accueil, après un « Choisir » ou « Modifier » du billet qui y mène
  retourBillet: "Revenir à mon billet",
  talon: {
    titre: "À qui répondre ?",
    titreQuestion: "Votre message",
    logo: "Ouidah Heritage Tour",
    manque: (l: string[]) => `Il manque : ${lister(l)}.`,
    noms: { dates: "vos dates", lieux: "vos lieux", qui: "avec qui", pays: "votre pays", nom: "votre nom", email: "votre e-mail", message: "votre message", consent: "votre accord" } as Record<string, string>,
    champs: { nom: "Prénom et nom", email: "E-mail", whatsapp: "WhatsApp", facultatif: "facultatif", whatsappAide: "Indicatif et numéro", message: "Quelque chose à ajouter ?", messageQuestion: "Votre message", messageAide: "Un rythme, une envie, une contrainte de santé, un souhait de cérémonie…" },
    emailInvalide: "Cette adresse semble incomplète : vérifiez la partie après le @.",
    consent: "J'accepte que Ouidah Heritage Tour utilise ces informations pour préparer mon devis. Rien d'autre.",
    consentQuestion: "J'accepte que Ouidah Heritage Tour utilise ces informations pour me répondre. Rien d'autre.",
    confidentialite: { label: "Confidentialité", href: "/politique-de-confidentialite" },
    bouton: "Envoyer ma demande",
    payerAvec: "Payer avec",
    payer: (montant: string) => `Payer ${montant} et envoyer`,
    envoi: "Envoi en cours…",
    reessayer: "Réessayer l'envoi",
    promesse: "Nous vous répondons sous 24 heures.",
    echec: "L'envoi n'a pas abouti. Rien n'est perdu : vos réponses restent sur cet appareil. Réessayez dans un instant.",
    limite: "Plusieurs demandes sont déjà parties de cette connexion. Réessayez dans une heure.",
    reprise: {
      bouton: "Reprendre sur un autre appareil",
      creation: "Création du lien…",
      lien: "Votre lien, valable 30 jours :",
      copier: "Copier le lien",
      copie: "Lien copié",
      note: "Gardez-le pour vous : il ouvre votre demande.",
      erreur: "Le lien n'a pas pu être créé. Réessayez dans un instant.",
    },
  },
  merci: {
    titre: (p: string) => `C'est entre nos mains${p ? `, ${p}` : ""}.`,
    texte: (langue: string, email: string) => `Nous vous répondons sous 24 heures, en ${langue}, à ${email}.`,
    copie: "Une copie de votre demande vient de partir dans votre boîte.",
    retour: { label: "Retour à l'accueil", href: "/" },
    suivre: "Suivre ma demande (ticket et devis)",
  },
  reprendre: {
    metaTitre: "Reprendre mon voyage — Ouidah Heritage Tour",
    chargement: "Votre voyage revient…",
    invalide: "Ce lien n'est plus valable : il a peut-être expiré. Composez de nouveau votre voyage, ou écrivez-nous.",
    accueil: { label: "Composer mon voyage", href: "/devis" },
  },
};
