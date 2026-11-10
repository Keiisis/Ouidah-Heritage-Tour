// Textes du lot « messages » (L6) de l'espace équipe : rédiger un e-mail, modèles d'e-mails, boîte de réception,
// notifications, La lettre de Ouidah, page publique de désinscription. Rien d'inventé : aucun chiffre, aucun nom, aucune
// donnée d'un client ; les données viennent du serveur (lib/serveur/equipe/messages). Interface en français ; ce qui part
// chez le client (modèles de départ, pied de la lettre, page de désinscription) existe dans les 7 langues.
// Modèles de départ : ceux de la maquette E validée (FR, EN, ES, DE, PT) ; HT et GCF écrits sur le vocabulaire des
// e-mails clients (content/courriels.ts), à faire relire par un locuteur (l'écran Modèles le rappelle).

export const LANGUES_MSG = ["FR", "EN", "ES", "DE", "PT", "HT", "GCF"] as const;
export type LangueMsg = (typeof LANGUES_MSG)[number];
/** Langues dont le texte de départ attend la relecture d'un locuteur. */
export const A_RELIRE: readonly LangueMsg[] = ["HT", "GCF"];

/** Champs variables, remplacés par le serveur avec les vraies données du client. */
export const VARIABLES = { prenom: "{prénom}", dates: "{dates}", lien: "{lien}", reference: "{référence}" } as const;
export type Variable = keyof typeof VARIABLES;

/** `adresses` : plafond des adresses saisies à la main (admin ; un agent : une seule) ; `prenom` : prénom saisi avec elles. */
export const LIMITES_COURRIEL = { objet: 200, corps: 8000, groupe: 50, cle: 40, lot: 40, adresses: 10, prenom: 60 } as const;

type Textes = Record<LangueMsg, string>;
export type ModeleDepart = { nom: string; sujet: Textes; corps: Textes };

export const MODELES_DEPART: Record<"reponse" | "devis" | "rappel", ModeleDepart> = {
  reponse: {
    nom: "Réponse à une demande",
    sujet: { FR: "Votre voyage à Ouidah", EN: "Your trip to Ouidah", ES: "Su viaje a Ouidah", DE: "Ihre Reise nach Ouidah", PT: "A sua viagem a Ouidah", HT: "Vwayaj ou nan Ouidah", GCF: "Vwayaj a-w Ouidah" },
    corps: {
      FR: "Bonjour {prénom},\n\nMerci pour votre demande {référence}. Je prépare votre voyage pour les dates suivantes : {dates}. Je reviens vers vous aujourd'hui avec un programme et un devis.\n\nÀ très bientôt à Ouidah,",
      EN: "Hello {prénom},\n\nThank you for your request {référence}. I am preparing your trip for these dates: {dates}. I will come back to you today with a programme and a quote.\n\nSee you soon in Ouidah,",
      ES: "Hola {prénom}:\n\nGracias por su solicitud {référence}. Preparo su viaje para estas fechas: {dates}. Le escribo hoy mismo con un programa y un presupuesto.\n\nHasta pronto en Ouidah,",
      DE: "Hallo {prénom},\n\nvielen Dank für Ihre Anfrage {référence}. Ich bereite Ihre Reise für diese Daten vor: {dates}. Ich melde mich heute mit einem Programm und einem Angebot.\n\nBis bald in Ouidah,",
      PT: "Olá {prénom},\n\nObrigado pelo seu pedido {référence}. Estou a preparar a sua viagem para estas datas: {dates}. Volto a contactá-lo hoje com um programa e um orçamento.\n\nAté breve em Ouidah,",
      HT: "Bonjou {prénom},\n\nMèsi pou demann ou {référence}. M ap prepare vwayaj ou pou dat sa yo: {dates}. M ap reponn ou jodi a ak yon pwogram ak yon devi.\n\nNa wè byento nan Ouidah,",
      GCF: "Bonjou {prénom},\n\nMèsi pou domann a-w {référence}. Man ka prépare vwayaj a-w pou dat-lasa : {dates}. Man ké réponn-vou jodi-a épi on pwogram é on dévi.\n\nA talè Ouidah,",
    },
  },
  devis: {
    nom: "Envoi du devis",
    sujet: { FR: "Votre devis {référence}", EN: "Your quote {référence}", ES: "Su presupuesto {référence}", DE: "Ihr Angebot {référence}", PT: "O seu orçamento {référence}", HT: "Devi ou {référence}", GCF: "Dévi a-w {référence}" },
    corps: {
      FR: "Bonjour {prénom},\n\nVoici votre devis {référence} pour vos dates : {dates}. Le paiement se fait en une fois, en ligne : {lien}\n\nJe reste à votre écoute,",
      EN: "Hello {prénom},\n\nHere is your quote {référence} for your dates: {dates}. Payment is made in full, online: {lien}\n\nKind regards,",
      ES: "Hola {prénom}:\n\nAquí tiene su presupuesto {référence} para sus fechas: {dates}. El pago se hace de una vez, en línea: {lien}\n\nUn saludo,",
      DE: "Hallo {prénom},\n\nhier ist Ihr Angebot {référence} für Ihre Daten: {dates}. Die Zahlung erfolgt vollständig online: {lien}\n\nViele Grüße,",
      PT: "Olá {prénom},\n\nAqui está o seu orçamento {référence} para as suas datas: {dates}. O pagamento é feito de uma só vez, online: {lien}\n\nCumprimentos,",
      HT: "Bonjou {prénom},\n\nMen devi ou {référence} pou dat ou yo: {dates}. Ou peye an yon sèl fwa, sou entènèt: {lien}\n\nMwen la si w bezwen mwen,",
      GCF: "Bonjou {prénom},\n\nMen dévi a-w {référence} pou dat a-w : {dates}. Ou ka péyé an on sèl fwa, asi entènèt : {lien}\n\nMan la si ou bizwen,",
    },
  },
  rappel: {
    nom: "Rappel avant le départ",
    sujet: { FR: "Bientôt à Ouidah", EN: "Soon in Ouidah", ES: "Pronto en Ouidah", DE: "Bald in Ouidah", PT: "Em breve em Ouidah", HT: "Byento nan Ouidah", GCF: "Talè Ouidah" },
    corps: {
      FR: "Bonjour {prénom},\n\nVotre voyage approche : {dates}. Votre guide vous attend à l'heure prévue. Pensez à votre e-Visa et à une tenue légère.\n\nBon voyage,",
      EN: "Hello {prénom},\n\nYour trip is coming up: {dates}. Your guide will meet you at the planned time. Remember your e-Visa and light clothing.\n\nSafe travels,",
      ES: "Hola {prénom}:\n\nSu viaje se acerca: {dates}. Su guía le espera a la hora prevista. Recuerde su e-Visa y ropa ligera.\n\nBuen viaje,",
      DE: "Hallo {prénom},\n\nIhre Reise steht bevor: {dates}. Ihr Guide erwartet Sie zur vereinbarten Zeit. Denken Sie an Ihr e-Visum und leichte Kleidung.\n\nGute Reise,",
      PT: "Olá {prénom},\n\nA sua viagem aproxima-se: {dates}. O seu guia espera-o à hora prevista. Lembre-se do e-Visa e de roupa leve.\n\nBoa viagem,",
      HT: "Bonjou {prénom},\n\nVwayaj ou ap rive: {dates}. Gid ou ap tann ou a lè nou te fikse a. Pa bliye e-Visa ou ak rad ki lejè.\n\nBon vwayaj,",
      GCF: "Bonjou {prénom},\n\nVwayaj a-w ka vini : {dates}. Gid a-w ké atann-vou a lè-la nou té di. Pa obliyé e-Visa a-w é rad lèjè.\n\nBon vwayaj,",
    },
  },
};
export const CLES_DEPART = Object.keys(MODELES_DEPART) as (keyof typeof MODELES_DEPART)[];

/** Repères de l'aperçu des modèles et de leur test à soi-même, dans la langue du modèle : aucune donnée inventée, le
 * {prénom} est celui de l'admin connecté (il reçoit le test), les autres champs restent signalés entre crochets. */
export const REPERES: Record<LangueMsg, Record<"dates" | "reference" | "lien", string>> = {
  FR: { dates: "[dates du séjour]", reference: "[référence du dossier]", lien: "[lien personnel]" },
  EN: { dates: "[trip dates]", reference: "[booking reference]", lien: "[personal link]" },
  ES: { dates: "[fechas del viaje]", reference: "[referencia del expediente]", lien: "[enlace personal]" },
  DE: { dates: "[Reisedaten]", reference: "[Vorgangsnummer]", lien: "[persönlicher Link]" },
  PT: { dates: "[datas da viagem]", reference: "[referência do processo]", lien: "[ligação pessoal]" },
  HT: { dates: "[dat vwayaj la]", reference: "[referans dosye a]", lien: "[lyen pèsonèl]" },
  GCF: { dates: "[dat a vwayaj-la]", reference: "[référans a dosyé-la]", lien: "[lyen pèsonèl]" },
};

/** Pied d'un e-mail écrit par l'équipe (« Rédiger un e-mail »), dans la langue du destinataire. */
export const RAISON_COURRIER: Record<LangueMsg, string> = {
  FR: "Vous recevez cet e-mail de l’équipe Ouidah Heritage Tour. Répondez-y simplement pour nous écrire.",
  EN: "You are receiving this email from the Ouidah Heritage Tour team. Just reply to write to us.",
  ES: "Recibe este correo del equipo de Ouidah Heritage Tour. Basta con responder para escribirnos.",
  DE: "Sie erhalten diese E-Mail vom Team von Ouidah Heritage Tour. Antworten Sie einfach, um uns zu schreiben.",
  PT: "Recebe este e-mail da equipa Ouidah Heritage Tour. Basta responder para nos escrever.",
  HT: "Ou resevwa imèl sa a nan men ekip Ouidah Heritage Tour. Reponn li pou ekri nou.",
  GCF: "Ou ka résévwa imèl-lasa di lékip Ouidah Heritage Tour. Réponn-li pou ékri nou.",
};

/** Pied de chaque numéro de la lettre (raison) et libellé du lien de désinscription, dans la langue du numéro. */
export const RAISON_LETTRE: Record<LangueMsg, { raison: string; lien: string }> = {
  FR: { raison: "Vous recevez la lettre de Ouidah parce que vous vous y êtes inscrit.", lien: "Se désinscrire" },
  EN: { raison: "You receive the Ouidah letter because you signed up for it.", lien: "Unsubscribe" },
  ES: { raison: "Recibe la carta de Ouidah porque se suscribió.", lien: "Darse de baja" },
  DE: { raison: "Sie erhalten den Brief aus Ouidah, weil Sie sich angemeldet haben.", lien: "Abmelden" },
  PT: { raison: "Recebe a carta de Ouidah porque se inscreveu.", lien: "Cancelar a subscrição" },
  HT: { raison: "Ou resevwa lèt Ouidah a paske ou te enskri.", lien: "Dezabòne" },
  GCF: { raison: "Ou ka résévwa lèt a Ouidah paskè ou té enskri.", lien: "Pa résévwa-y ankò" },
};

/** Pied de chaque numéro de la lettre, dans la langue du numéro (lien de désinscription propre à l'abonné). */
export const PIED_LETTRE: Record<LangueMsg, (lien: string) => string> = {
  FR: (l) => `Vous recevez la lettre de Ouidah parce que vous vous y êtes inscrit. Se désinscrire : ${l}`,
  EN: (l) => `You receive the Ouidah letter because you signed up for it. Unsubscribe: ${l}`,
  ES: (l) => `Recibe la carta de Ouidah porque se suscribió. Darse de baja: ${l}`,
  DE: (l) => `Sie erhalten den Brief aus Ouidah, weil Sie sich angemeldet haben. Abmelden: ${l}`,
  PT: (l) => `Recebe a carta de Ouidah porque se inscreveu. Cancelar a subscrição: ${l}`,
  HT: (l) => `Ou resevwa lèt Ouidah a paske ou te enskri. Pou dezabòne: ${l}`,
  GCF: (l) => `Ou ka résévwa lèt a Ouidah paskè ou té enskri. Pou pa résévwa-y ankò : ${l}`,
};

/** Page publique /lettre/desinscription/<jeton>, dans la langue de l'abonné. */
export const DESINSCRIPTION: Record<LangueMsg, { titre: string; texte: (email: string) => string; bouton: string; envoi: string; fait: string; deja: string; erreur: string; retour: string }> = {
  FR: { titre: "Se désinscrire de la lettre de Ouidah", texte: (e) => `L’adresse ${e} ne recevra plus la lettre.`, bouton: "Confirmer la désinscription", envoi: "Un instant…", fait: "C’est fait : cette adresse ne recevra plus la lettre.", deja: "Cette adresse est déjà désinscrite.", erreur: "La désinscription n’a pas abouti. Réessayez dans un instant.", retour: "Retour au site" },
  EN: { titre: "Unsubscribe from the Ouidah letter", texte: (e) => `The address ${e} will no longer receive the letter.`, bouton: "Confirm", envoi: "One moment…", fait: "Done: this address will no longer receive the letter.", deja: "This address is already unsubscribed.", erreur: "The request did not go through. Please try again in a moment.", retour: "Back to the site" },
  ES: { titre: "Darse de baja de la carta de Ouidah", texte: (e) => `La dirección ${e} ya no recibirá la carta.`, bouton: "Confirmar la baja", envoi: "Un momento…", fait: "Hecho: esta dirección ya no recibirá la carta.", deja: "Esta dirección ya está dada de baja.", erreur: "La baja no se ha completado. Inténtelo de nuevo en un momento.", retour: "Volver al sitio" },
  DE: { titre: "Vom Brief aus Ouidah abmelden", texte: (e) => `Die Adresse ${e} erhält den Brief nicht mehr.`, bouton: "Abmeldung bestätigen", envoi: "Einen Moment…", fait: "Erledigt: Diese Adresse erhält den Brief nicht mehr.", deja: "Diese Adresse ist bereits abgemeldet.", erreur: "Die Abmeldung hat nicht geklappt. Bitte versuchen Sie es gleich noch einmal.", retour: "Zurück zur Website" },
  PT: { titre: "Cancelar a subscrição da carta de Ouidah", texte: (e) => `O endereço ${e} deixará de receber a carta.`, bouton: "Confirmar o cancelamento", envoi: "Um momento…", fait: "Feito: este endereço deixará de receber a carta.", deja: "Este endereço já cancelou a subscrição.", erreur: "O cancelamento não foi concluído. Tente novamente dentro de instantes.", retour: "Voltar ao site" },
  HT: { titre: "Dezabòne nan lèt Ouidah a", texte: (e) => `Adrès ${e} pap resevwa lèt la ankò.`, bouton: "Konfime", envoi: "Yon ti moman…", fait: "Sa fèt: adrès sa a pap resevwa lèt la ankò.", deja: "Adrès sa a deja dezabòne.", erreur: "Sa pa mache. Eseye ankò nan yon ti moman.", retour: "Retounen sou sit la" },
  GCF: { titre: "Pa résévwa lèt a Ouidah ankò", texte: (e) => `Adrès ${e} pé ké résévwa lèt-la ankò.`, bouton: "Konfimé", envoi: "On ti moman…", fait: "Sa fèt : adrès-lasa pé ké résévwa lèt-la ankò.", deja: "Adrès-lasa ja pa ka résévwa lèt-la.", erreur: "Sa pa maché. Éséyé ankò adan on ti moman.", retour: "Routounen asi sit-la" },
};

/** Données d'exemple de l'aperçu réel des e-mails automatiques (écran Modèles) et de leur test à soi-même : jamais envoyées
 * à un client. Le prénom est celui de l'admin connecté ; les thèmes de la lettre sont ceux du site. */
export const EXEMPLE_AUTO = {
  id: "00000000-0000-4000-8000-000000000000",
  jeton: "exemple",
  reference: "DEM-EXEMPLE",
  commande: "OHT-B-EXEMPLE",
  devis: "D-0000-000000",
  ticket: "T-0000-000000",
  facture: "F-0000-000000",
  code: "000000",
  evenement: "Événement d’exemple",
  formule: "Formule d’exemple",
  ligne: "Ligne d’exemple",
  quantite: 2,
  prix: 15000,
  sejour: { arrivee: "2027-03-12", depart: "2027-03-19" },
  valable: "2027-03-01",
};

const plur = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

export const msg = {
  expediteur: "Ouidah Heritage Tour <contact@ouidahheritagetour.bj>",
  signature: (prenom: string, nom: string) => `${prenom} ${nom}\nOuidah Heritage Tour`,
  prefixeTest: "[Test] ",

  refus: {
    refuse: "Action réservée à l’équipe connectée.",
    champs: "Quelques champs sont à corriger.",
    panne: "La base ne répond pas : rien n’a été modifié. Réessayez dans un moment.",
    smtp: "Aucune voie d’envoi : le SMTP d’OHT n’est pas configuré sur ce serveur. Rien n’est parti.",
    envoi: "L’envoi a échoué : l’e-mail est noté « Échec ».",
    variables: "Certains champs variables n’ont pas de valeur pour ce destinataire.",
    etat: "Cet élément a changé entre-temps : rechargez la page.",
    confirmer: "Le nombre de destinataires a changé : relisez-le avant d’envoyer.",
    reseau: "La connexion a échoué. Vérifiez votre réseau, puis réessayez.",
  },
  manque: { prenom: "le prénom", dates: "les dates du séjour", lien: "le lien de suivi", reference: "la référence" } satisfies Record<Variable, string>,
  manquent: (l: string[]) => `Sans valeur pour ce destinataire : ${l.join(", ")}. Retirez ces champs ou complétez le dossier.`,

  courrier: {
    titre: "Rédiger un e-mail",
    sous: { agents: "Envoyé depuis l’adresse de l’agence, dans la langue du client.", admins: "À un client ou à un groupe, depuis l’adresse de l’agence." },
    message: "Le message",
    de: "De",
    a: "À",
    mode: { un: "Un client", adresse: "Une adresse", groupe: "Un groupe" },
    adresses: "Adresse e-mail",
    adressesAide: (n: number) => (n > 1 ? `Une ou plusieurs adresses séparées par une virgule, ${n} au plus, sans fiche client.` : "Une seule adresse, sans fiche client."),
    prenom: "Prénom (facultatif)",
    prenomAide: "Il remplace {prénom}. Sans fiche client, {dates}, {lien} et {référence} n’ont pas de valeur.",
    choisir: "Choisir un client",
    aucunClient: { agents: ["Aucun client pour l’instant.", "Les clients de vos dossiers apparaissent ici."], admins: ["Aucun client pour l’instant.", "Les fiches se remplissent depuis les demandes reçues."] },
    groupe: "Destinataires",
    groupeAide: (n: number) => (n ? `${plur(n, "client", "clients")} dans cette langue. Chacun reçoit son propre e-mail.` : "Aucun client dans cette langue."),
    tous: "Tout cocher",
    aucun: "Tout décocher",
    choisis: (n: number) => plur(n, "destinataire", "destinataires"),
    langue: "Langue",
    choisirLangue: "Choisir la langue",
    modele: "Modèle",
    libre: "E-mail libre",
    objet: "Objet",
    corps: "Message",
    variables: "Champs variables",
    inserer: (v: string) => `Insérer ${v}`,
    pieces: "Document lié",
    aucunePiece: "Aucun document pour ce client.",
    choisirDabord: "Choisissez d’abord un client.",
    pieceDevis: (n: string) => `Devis ${n}`,
    pieceNote: "Le document part en lien sécurisé vers son PDF, dans la langue du client.",
    apercu: "Aperçu",
    apercuVide: "L’aperçu apparaît dès que vous écrivez.",
    apercuGroupe: (nom: string) => `Aperçu pour ${nom}`,
    brouillon: "Enregistrer le brouillon",
    test: "M’envoyer un test",
    envoyer: "Envoyer",
    envoyerGroupe: (n: number) => `Envoyer à ${plur(n, "client", "clients")}`,
    envoi: "Envoi…",
    erreurs: { dest: "Choisissez un destinataire.", objet: "Indiquez l’objet.", langue: "Choisissez la langue du client.", corps: "Le message est trop long.", groupe: "Cochez au moins un client.", adresses: "Saisissez une adresse e-mail valable (ou plusieurs, dans la limite indiquée).", prenom: "Le prénom est trop long." },
    resume: "Trois champs sont obligatoires : destinataire, objet, langue.",
    testEnvoye: (a: string) => `Test envoyé à ${a}.`,
    brouillonOk: "Brouillon enregistré.",
    envoye: (c: string) => `E-mail envoyé à ${c}.`,
    envoyes: (ok: number, ko: number) => `${plur(ok, "e-mail envoyé", "e-mails envoyés")}${ko ? `, ${plur(ko, "échec", "échecs")}` : ""}.`,
    derniers: "Derniers e-mails",
    reprendre: "Reprendre",
    etats: { envoye: "Envoyé", brouillon: "Brouillon", echec: "Échec" } as Record<string, string>,
    vide: ["Aucun e-mail pour l’instant.", "Vos brouillons et vos envois s’affichent ici."],
    pour: (qui: string, quand: string) => `${qui}, ${quand}`,
    locuteur: "Langue créole : faites relire le texte par un locuteur avant l’envoi.",
  },

  modeles: {
    titre: "Modèles d’e-mails",
    sous: "Les textes que le composeur propose, et ceux des e-mails que le site envoie de lui-même, dans les 7 langues.",
    repli: "La liste des modèles enregistrés ne répond pas : les textes de départ s’affichent. Réessayez dans un moment avant d’enregistrer.",
    liste: "Modèles",
    nouveau: "Nouveau modèle",
    cle: "Identifiant",
    cleAide: "Lettres minuscules, chiffres et tirets, par exemple « bienvenue-hotel ».",
    creer: "Créer",
    etats: { base: "Personnalisé", depart: "Texte de départ", vide: "À écrire" },
    aRelire: "Texte de départ à faire relire par un locuteur.",
    choisir: (nom: string, l: string) => `${nom}, ${l}`,
    sujet: "Objet",
    corps: "Message",
    enregistrer: "Enregistrer",
    retirer: "Revenir au texte de départ",
    supprimer: "Retirer cette langue",
    test: "M’envoyer un test",
    apercu: "Aperçu",
    enregistre: (nom: string, l: string) => `${nom} (${l}) enregistré.`,
    retire: (nom: string, l: string) => `${nom} (${l}) : texte retiré.`,
    testEnvoye: (a: string) => `Test envoyé à ${a}.`,
    erreurs: { sujet: "Indiquez l’objet.", corps: "Écrivez le message.", cle: "Identifiant non valable ou déjà pris.", reservee: "Les identifiants « auto-… » sont réservés aux e-mails automatiques du site." },
    vide: ["Rien d’écrit dans cette langue.", "Écrivez l’objet et le message, puis enregistrez."],
    oht: "Les e-mails envoyés automatiquement par le site ont leur propre groupe, plus bas.",
    auto: "E-mails automatiques",
    autoSous: "Textes que le site envoie de lui-même. Une langue sans texte enregistré part avec le texte par défaut du site, affiché dans l’éditeur.",
    autoNoms: { "auto-billets": "Billets d’un événement", "auto-demande": "Demande reçue", "auto-devis-pret": "Devis prêt", "auto-boutique": "Commande de la boutique", "auto-lettre": "La lettre de Ouidah", "auto-code": "Code de connexion de l’équipe", "auto-relance": "Relance d’une facture" } as Record<string, string>,
    defaut: "Texte par défaut du site",
    retirerAuto: "Revenir au texte par défaut du site",
    autoVariables: (v: string[]) => `Champs que cet e-mail remplit : ${v.join(", ")}. Tout autre champ est refusé à l’enregistrement.`,
    horsListe: (v: string[]) => `Champs que cet e-mail ne remplit pas, refusés : ${v.join(", ")}.`,
    autoNotes: {
      "auto-billets": "Par défaut, l’objet reprend le nom de l’événement réservé (ici celui de l’exemple). Un objet enregistré ici sert pour tous les événements.",
      "auto-demande": "Par défaut, une question posée sur le site reçoit un texte plus court, sans la phrase sur le devis. Un texte enregistré ici sert aux deux.",
      "auto-lettre": "La liste des thèmes choisis par l’abonné suit toujours ce texte.",
      "auto-code": "Par défaut, l’objet change entre la première connexion et le mot de passe oublié. Un objet enregistré ici sert aux deux.",
      "auto-relance": "Par défaut, la salutation reprend le nom complet du client ; {prénom} ne donne que son prénom.",
    } as Record<string, string>,
    apercuReel: "Aperçu de l’e-mail tel qu’il part, avec des données d’exemple",
    apercuIndispo: "Aperçu indisponible pour le moment.",
    inconnus: (j: string[]) => `Champs inconnus, refusés : ${j.join(", ")}.`,
    absentes: (v: string[]) => `Champs absents de ce texte : ${v.join(", ")}. Vérifiez que l’e-mail n’en a pas besoin.`,
  },

  boite: {
    titre: "Boîte de réception",
    sous: { agents: "Les messages venus du site pour vos dossiers.", admins: "Tous les messages venus du site." },
    site: "Messages du site",
    repondre: "Répondre",
    voirDossier: "Voir le dossier",
    sansFiche: "Fiche client pas encore créée",
    attribue: (qui: string) => `Suivi par ${qui}`,
    nonAttribue: "Pas encore attribué",
    vide: { agents: ["Aucun message pour l’instant.", "Les questions posées sur le site pour vos dossiers arrivent ici."], admins: ["Aucun message pour l’instant.", "Les questions posées sur le site arrivent ici."] },
    imap: "Boîte contact@ouidahheritagetour.bj",
  },

  notifications: {
    titre: "Notifications",
    sous: "Ce qui s’est passé sur vos dossiers.",
    liste: "Vos notifications",
    nonLues: (n: number) => (n ? plur(n, "non lue", "non lues") : "Tout est lu"),
    marquer: "Marquer comme lue",
    toutLire: "Tout marquer comme lu",
    lue: "Lue",
    types: { dossier_attribue: "Dossier attribué", devis_ouvert: "Devis ouvert", paiement_recu: "Paiement reçu", message_recu: "Message reçu", devis_signe: "Devis signé", conversation_agent: "Demande à parler à un agent" } as Record<string, string>,
    textes: {
      dossier_attribue: (c: string) => `Le dossier de ${c} vous est attribué.`,
      devis_ouvert: (c: string) => `${c} a ouvert son devis.`,
      paiement_recu: (c: string) => `Paiement reçu de ${c}.`,
      message_recu: (c: string) => `${c} a écrit depuis le site.`,
      devis_signe: (c: string) => `${c} a signé son devis en ligne.`,
      conversation_agent: (c: string) => `${c} demande à parler à un agent depuis l'assistant du site.`,
    } as Record<string, (c: string) => string>,
    clientInconnu: "Un client",
    dossierInaccessible: "Ce dossier n’est plus accessible à votre compte.",
    ouvrir: "Ouvrir le dossier",
    vide: ["Aucune notification.", "Les dossiers qu’on vous attribue et les messages de vos clients s’affichent ici."],
    aide: "Ouvrez le dossier pour consulter le détail, puis marquez la notification comme lue.",
  },

  lettre: {
    titre: "La lettre de Ouidah",
    sous: "Les abonnés réels et l’envoi des numéros.",
    abonnes: "Abonnés",
    actifs: (n: number) => plur(n, "abonné", "abonnés"),
    desinscrits: (n: number) => plur(n, "désinscription", "désinscriptions"),
    parTheme: "Par thème",
    parLangue: "Par langue",
    aucunAbonne: ["Aucun abonné pour l’instant.", "Les inscriptions faites sur le site s’affichent ici."],
    numero: "Rédiger un numéro",
    langue: "Langue du numéro",
    themes: "Thèmes",
    themesAide: "Le numéro part aux abonnés de cette langue qui ont choisi au moins un de ces thèmes.",
    objet: "Objet",
    corps: "Texte",
    pied: "Chaque abonné reçoit en bas son propre lien de désinscription.",
    lienExemple: "[lien personnel de désinscription]",
    sansOrigine: "Adresse du site inconnue (SITE_URL) : les liens de désinscription ne peuvent pas être écrits. Rien n’est parti.",
    apercu: "Aperçu",
    brouillon: "Enregistrer le brouillon",
    test: "M’envoyer un test",
    cible: (n: number) => (n ? `Ce numéro partira à ${plur(n, "abonné", "abonnés")}.` : "Aucun abonné ne correspond à cette langue et à ces thèmes."),
    envoyer: (n: number) => `Envoyer à ${plur(n, "abonné", "abonnés")}`,
    confirmer: (n: number) => `Envoyer ce numéro à ${plur(n, "abonné", "abonnés")} ? L’envoi ne se reprend pas.`,
    oui: "Envoyer maintenant",
    non: "Annuler",
    progression: (fait: number, total: number) => `${fait} sur ${total}`,
    fini: (n: number, ko: number) => `Numéro envoyé : ${plur(n, "e-mail", "e-mails")}${ko ? `, ${plur(ko, "échec", "échecs")}` : ""}.`,
    brouillonOk: "Brouillon enregistré.",
    testEnvoye: (a: string) => `Test envoyé à ${a}. Aucun abonné ne l’a reçu.`,
    numeros: "Numéros",
    etats: { brouillon: "Brouillon", en_cours: "En cours", envoye: "Envoyé" } as Record<string, string>,
    reprendre: "Reprendre",
    envoyesA: (n: number) => plur(n, "envoi", "envois"),
    aucunNumero: ["Aucun numéro pour l’instant.", "Vos brouillons et les numéros envoyés s’affichent ici."],
    erreurs: { objet: "Indiquez l’objet.", corps: "Écrivez le texte.", themes: "Cochez au moins un thème.", langue: "Choisissez la langue." },
  },
};
