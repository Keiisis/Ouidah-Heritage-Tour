// Textes et bornes de la section « Ce que l'assistant sait » (écran Assistant des admins) : documents, notes,
// argumentaire commercial et questions sans réponse qui nourrissent l'assistant public d'OHT. Rien d'inventé : aucun
// exemple de document, aucun chiffre de fréquentation ; les seuls nombres affichés sont les bornes ci-dessous et ce que
// la base renvoie. Bornes relues par le serveur (lib/serveur/assistant/extraction.ts et sources.ts) et par la migration
// 20261104_assistant_base.sql (titre 160, fiche 4000, argumentaire 8000, question 500, caractères 200 000).

export const LIMITES_BASE = {
  // octets d'un fichier envoyé depuis l'écran : une action serveur de Next refuse un corps de plus de 1 Mo tant que
  // next.config.ts ne pose pas experimental.serverActions.bodySizeLimit (Next 16.4, action-handler.js) ; à relever avec lui
  envoi: 1_000_000,
  fichier: 10 * 1024 * 1024, // borne du serveur pour tout fichier, quel que soit l'envoi (10 Mo)
  pages: 300, // pages d'un PDF
  xml: 20 * 1024 * 1024, // texte décompressé d'un DOCX (word/document.xml) : au-delà, bombe zip présumée
  morceau: 1500, // caractères visés par morceau (coupé aux paragraphes)
  fiche: 4000, // caractères d'une fiche (contrainte de assistant_fiches.texte)
  titre: 160,
  morceaux: 100, // morceaux d'un même document
  caracteres: 150_000, // texte d'un document, après nettoyage
  note: 20_000,
  reponse: 4000,
  argumentaire: 8000,
  question: 500,
  // connaissance.ts ne lit que les 1 000 fiches publiées les plus récentes : une publication qui dépasserait est refusée
  fichesLues: 1000,
} as const;

const plur = (n: number, un: string, plusieurs: string) => `${new Intl.NumberFormat("fr-FR").format(n)} ${n > 1 ? plusieurs : un}`;
const nombre = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
/** Taille lisible (« 1 Mo », « 350 ko »), en unités décimales. */
export const taille = (o: number) => (o >= 1_000_000 ? `${nombre(Math.round(o / 100_000) / 10)} Mo` : `${nombre(Math.max(1, Math.round(o / 1000)))} ko`);
const MO_ENVOI = taille(LIMITES_BASE.envoi);

export const base = {
  titre: "Ce que l’assistant sait",
  sous: "Documents, notes et réponses que l’assistant public d’OHT peut répéter aux visiteurs du site.",
  public: "Contenu public : l’assistant peut répéter aux visiteurs tout ce qui est publié ici.",
  compteur: (n: number) => `${plur(n, "fiche publiée", "fiches publiées")} sur ${nombre(LIMITES_BASE.fichesLues)} que l’assistant lit au plus.`,
  enregistrer: "Enregistrer",
  envoi: "Envoi…",

  depot: {
    titre: "Ajouter un document",
    zone: "Déposez un fichier ici",
    ou: "ou",
    choisir: "Choisir un fichier",
    aide: `PDF, DOCX, TXT ou MD, ${MO_ENVOI} au plus. Le fichier n’est pas gardé : seul son texte l’est, en brouillon, jusqu’à ce que vous le publiiez.`,
    choisi: (nom: string, o: number) => `Fichier choisi : ${nom} (${taille(o)})`,
    aucun: "Aucun fichier choisi.",
    trop: `Ce fichier dépasse ${MO_ENVOI} : il ne peut pas être envoyé d’ici.`,
    titreChamp: "Titre (facultatif)",
    titreAide: "Sans titre, le nom du fichier sert de titre.",
    bouton: "Lire le document",
    reussite: (n: number) => `Document lu : ${plur(n, "morceau", "morceaux")} en brouillon. Relisez l’aperçu, puis publiez.`,
  },

  sources: {
    titre: "Documents et notes",
    vide: ["Aucun document ni aucune note pour l’instant.", "Ce que vous ajoutez ici apparaît dans cette liste, avec son état."],
    genres: { texte: "Note", pdf: "PDF", docx: "Word (DOCX)", txt: "Texte" } as Record<string, string>,
    etats: { brouillon: "Brouillon", publie: "Publié", retire: "Retiré" } as Record<string, string>,
    pages: (n: number) => plur(n, "page", "pages"),
    caracteres: (n: number) => plur(n, "caractère", "caractères"),
    morceaux: (n: number) => plur(n, "morceau", "morceaux"),
    ajoute: (quand: string, qui: string | null) => (qui ? `Ajouté le ${quand} par ${qui}` : `Ajouté le ${quand}`),
    apercu: "Aperçu du texte extrait",
    apercuAide: "Le texte tel que l’assistant le lira, morceau par morceau. Les passages surlignés sont à vérifier.",
    publier: "Publier",
    republier: "Republier",
    publie_ok: "Publié : l’assistant s’en sert dès la question suivante.",
    retirer: "Retirer de l’assistant",
    retire_ok: "Retiré : l’assistant ne s’en sert plus.",
    supprimer: "Supprimer",
    supprimerConfirme: "Supprimer ce document et son texte ? Rien n’est gardé.",
    supprime_ok: "Supprimé.",
    nomSupprimer: (titre: string) => `Supprimer « ${titre} »`,
    nomRetirer: (titre: string) => `Retirer « ${titre} » de l’assistant`,
    nomPublier: (titre: string) => `Publier « ${titre} »`,
  },

  controle: {
    titre: "Passages sensibles",
    aucun: "Aucun passage sensible repéré : e-mails, téléphones, IBAN, numéros de carte, mots de passe et clés ont été cherchés.",
    sous: "L’assistant pourrait les répéter aux visiteurs. Retirez-les du texte, ou confirmez un par un ceux qui sont publics (un e-mail ou un téléphone d’OHT, par exemple).",
    genres: { email: "Adresse e-mail", telephone: "Téléphone", iban: "IBAN", carte: "Numéro de carte", secret: "Mot de passe", cle: "Clé d’accès" } as Record<string, string>,
    confirmer: "Public, je confirme",
    aRetirer: "À retirer : ne peut pas être publié.",
    retirer: "Retirer du texte",
    nomRetirer: (passage: string) => `Retirer « ${passage} » du texte`,
    retire_ok: "Passage remplacé par [retiré].",
    bloquants: "À retirer ou à confirmer avant d’enregistrer :",
  },

  note: {
    titre: "Ajouter une note",
    sous: "Quelques mots que l’assistant doit savoir : une précision, un horaire, une réponse que l’équipe donne souvent.",
    titreChamp: "Titre",
    texteChamp: "Texte",
    bouton: "Publier la note",
    reussite: "Note publiée : l’assistant s’en sert dès la question suivante.",
  },

  argumentaire: {
    titre: "Argumentaire commercial",
    sous: "Points forts d’OHT, réponses aux objections, offres en cours. Texte saisi par l’équipe, jamais inventé par l’assistant.",
    champ: "Argumentaire",
    aide: (lu: number) => `Contenu public : l’assistant peut le répéter aux visiteurs. ${nombre(LIMITES_BASE.argumentaire)} caractères au plus ; l’assistant en lit les ${nombre(lu)} premiers.`,
    reussite: "Argumentaire enregistré.",
  },

  questions: {
    titre: "L’assistant apprend",
    sous: "Questions de visiteurs auxquelles l’assistant n’a pas su répondre, sans nom ni coordonnée. Votre réponse devient une fiche publiée : l’assistant la connaît dès la question suivante.",
    vide: ["Aucune question sans réponse.", "Quand l’assistant ne sait pas répondre, la question arrive ici, anonymisée."],
    fois: (n: number) => `posée ${plur(n, "fois", "fois")}`,
    derniere: (quand: string) => `dernière fois le ${quand}`,
    dejaRepondue: "Déjà répondue une fois : l’assistant n’a pas trouvé la réponse, précisez-la.",
    langues: { FR: "français", EN: "anglais", ES: "espagnol", DE: "allemand", PT: "portugais", HT: "créole haïtien", GCF: "créole guadeloupéen" } as Record<string, string>,
    repondre: "Répondre",
    reponseChamp: "Réponse",
    reponseAide: "Contenu public : l’assistant répétera cette réponse aux visiteurs.",
    reussite: "Réponse publiée : l’assistant la connaît dès la question suivante.",
    ignorer: "Ignorer",
    ignorerConfirme: "Ignorer cette question ? Elle sort de la liste (elle reviendra si elle est posée de nouveau).",
    ignore_ok: "Question ignorée.",
    nomIgnorer: (q: string) => `Ignorer la question « ${q} »`,
  },

  // refus du serveur (RetourBase, sources.ts)
  erreurs: {
    refuse: "Action réservée à l’équipe connectée.",
    admin: "Action réservée aux admins.",
    champs: "Quelques champs sont à corriger.",
    panne: "La base ne répond pas. Réessayez dans un moment.",
    taille: `Fichier trop lourd : ${MO_ENVOI} au plus depuis cet écran.`,
    signature: "Le contenu du fichier ne correspond pas à son type : PDF, DOCX, TXT ou MD seulement.",
    pages: `PDF de plus de ${nombre(LIMITES_BASE.pages)} pages : découpez-le.`,
    illisible: "Fichier illisible : abîmé, ou protégé par un mot de passe.",
    bombe: `Document Word refusé : son texte décompressé dépasse ${taille(LIMITES_BASE.xml)}.`,
    encodage: "Texte refusé : enregistrez le fichier en UTF-8.",
    vide: "Aucun texte à lire : un document scanné n’a que des images.",
    long: `Texte trop long : ${nombre(LIMITES_BASE.caracteres)} caractères au plus par document. Découpez-le.`,
    sensible: "Des passages sensibles bloquent la publication : retirez-les du texte, ou confirmez ceux qui sont publics.",
    plein: `L’assistant lit ${nombre(LIMITES_BASE.fichesLues)} fiches publiées au plus : retirez-en avant de publier.`,
    etat: "Cette action ne s’applique plus : la liste est à jour.",
    introuvable: "Élément introuvable : la liste est à jour.",
    reseau: "Le serveur n’a pas répondu (envoi trop lourd ou connexion coupée). Réessayez.",
  } as Record<string, string>,

  // champs refusés (nom renvoyé par le serveur → libellé)
  champs: {
    fichier: "Fichier : choisissez un PDF, un DOCX, un TXT ou un MD.",
    titre: `Titre : ${nombre(LIMITES_BASE.titre)} caractères au plus.`,
    texte: `Texte : obligatoire, ${nombre(LIMITES_BASE.note)} caractères au plus.`,
    reponse: `Réponse : obligatoire, ${nombre(LIMITES_BASE.reponse)} caractères au plus.`,
    argumentaire: `Argumentaire : ${nombre(LIMITES_BASE.argumentaire)} caractères au plus.`,
  } as Record<string, string>,
};
