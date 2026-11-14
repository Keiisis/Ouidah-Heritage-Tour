// E-mails envoyés après une demande (/devis), gabarit « la lettre illustrée ». La copie du voyageur est écrite dans sa langue (7 langues du site) avec les
// vraies données de sa demande ; l'avis à OHT est en français. Les noms de lieux restent ceux d'OHT (noms propres).
// Créoles (HT, GCF) et portugais (« Benim ») : à faire relire par un locuteur avant la mise en ligne.
type Copie = {
  sep: string; // deux-points selon la typographie de la langue
  sujet: string;
  recu: string;
  dates: (a: string, b: string) => string;
  datesConseil: string;
  lieux: string;
  services: string;
  noms: Record<string, string>; // services de la conciergerie, par identifiant
  voyageurs: (a: number, e: number) => string;
  repondre: string;
  signature: string;
  // gabarit « la lettre illustrée » (03/11/2026)
  phrase: { voyage: readonly [string, string]; question: readonly [string, string] }; // phrase titre et son trait Soleil
  relit: string;
  devisSuivi: string;
  bouton: string;
  refDemande: string;
  aConseiller: string;
  raison: string; // pied : pourquoi cet e-mail arrive
};

// Nom affiché comme expéditeur de tous les e-mails clients (adresse : SMTP_UTILISATEUR).
export const expediteur = "Ouidah Heritage Tour";

export const copies: Record<"FR" | "EN" | "ES" | "DE" | "PT" | "HT" | "GCF", Copie> = {
  FR: {
    phrase: { voyage: ["votre demande de séjour à Ouidah est", "bien arrivée"], question: ["votre question est", "bien arrivée"] },
    relit: "Un conseiller la relit et vous répond sous 24 heures.",
    devisSuivi: "Votre devis s’affichera sur votre page de suivi dès qu’il l’aura validé.",
    bouton: "Suivre ma demande",
    refDemande: "Référence de la demande",
    aConseiller: "à conseiller",
    raison: "Vous recevez cet e-mail en copie de la demande envoyée depuis ouidahheritagetour.bj.",
    sep: " : ",
    sujet: "Votre voyage à Ouidah : demande bien reçue",
    recu: "Nous avons bien reçu votre demande. Un conseiller la relit et vous répond sous 24 heures.",
    dates: (a, b) => `Du ${a} au ${b}`,
    datesConseil: "Dates : à conseiller",
    lieux: "Lieux",
    services: "Services",
    noms: { navette: "navette", accueil: "accueil", telephone: "téléphone", hebergement: "hébergement", tables: "tables", vehicule: "véhicule" },
    voyageurs: (a, e) => [a ? `${a} adulte${a > 1 ? "s" : ""}` : "", e ? `${e} enfant${e > 1 ? "s" : ""}` : ""].filter(Boolean).join(", "),
    repondre: "Pour ajouter un détail, répondez à cet e-mail.",
    signature: "Ouidah Heritage Tour, Ouidah (Bénin)",
  },
  EN: {
    phrase: { voyage: ["your request for a stay in Ouidah has", "been received"], question: ["your question has", "been received"] },
    relit: "An advisor is reviewing it and will reply within 24 hours.",
    devisSuivi: "Your quote will appear on your tracking page as soon as they have approved it.",
    bouton: "Track my request",
    refDemande: "Request reference",
    aConseiller: "to be advised",
    raison: "You are receiving this email as a copy of the request sent from ouidahheritagetour.bj.",
    sep: ": ",
    sujet: "Your trip to Ouidah: request received",
    recu: "We have received your request. An advisor is reviewing it and will reply within 24 hours.",
    dates: (a, b) => `From ${a} to ${b}`,
    datesConseil: "Dates: to be advised",
    lieux: "Places",
    services: "Services",
    noms: { navette: "airport shuttle", accueil: "welcome", telephone: "phone", hebergement: "accommodation", tables: "dining", vehicule: "vehicle" },
    voyageurs: (a, e) => [a ? `${a} adult${a > 1 ? "s" : ""}` : "", e ? `${e} ${e > 1 ? "children" : "child"}` : ""].filter(Boolean).join(", "),
    repondre: "To add a detail, reply to this email.",
    signature: "Ouidah Heritage Tour, Ouidah (Benin)",
  },
  ES: {
    phrase: { voyage: ["su solicitud de estancia en Ouidah", "ha llegado"], question: ["su pregunta", "ha llegado"] },
    relit: "Un asesor la revisa y le responderá en un plazo de 24 horas.",
    devisSuivi: "Su presupuesto aparecerá en su página de seguimiento en cuanto lo haya validado.",
    bouton: "Seguir mi solicitud",
    refDemande: "Referencia de la solicitud",
    aConseiller: "por aconsejar",
    raison: "Recibe este correo como copia de la solicitud enviada desde ouidahheritagetour.bj.",
    sep: ": ",
    sujet: "Su viaje a Ouidah: solicitud recibida",
    recu: "Hemos recibido su solicitud. Un asesor la revisa y le responderá en un plazo de 24 horas.",
    dates: (a, b) => `Del ${a} al ${b}`,
    datesConseil: "Fechas: por aconsejar",
    lieux: "Lugares",
    services: "Servicios",
    noms: { navette: "traslado", accueil: "recepción", telephone: "teléfono", hebergement: "alojamiento", tables: "comidas", vehicule: "vehículo" },
    voyageurs: (a, e) => [a ? `${a} adulto${a > 1 ? "s" : ""}` : "", e ? `${e} niño${e > 1 ? "s" : ""}` : ""].filter(Boolean).join(", "),
    repondre: "Para añadir un detalle, responda a este correo.",
    signature: "Ouidah Heritage Tour, Ouidah (Benín)",
  },
  DE: {
    phrase: { voyage: ["Ihre Anfrage für einen Aufenthalt in Ouidah ist", "gut angekommen"], question: ["Ihre Frage ist", "gut angekommen"] },
    relit: "Ein Berater prüft sie und antwortet Ihnen innerhalb von 24 Stunden.",
    devisSuivi: "Ihr Angebot erscheint auf Ihrer Übersichtsseite, sobald er es freigegeben hat.",
    bouton: "Meine Anfrage verfolgen",
    refDemande: "Referenz der Anfrage",
    aConseiller: "bitte beraten",
    raison: "Sie erhalten diese E-Mail als Kopie der Anfrage, die Sie über ouidahheritagetour.bj gesendet haben.",
    sep: ": ",
    sujet: "Ihre Reise nach Ouidah: Anfrage erhalten",
    recu: "Wir haben Ihre Anfrage erhalten. Ein Berater prüft sie und antwortet Ihnen innerhalb von 24 Stunden.",
    dates: (a, b) => `Vom ${a} bis ${b}`,
    datesConseil: "Reisedaten: bitte beraten",
    lieux: "Orte",
    services: "Leistungen",
    noms: { navette: "Flughafentransfer", accueil: "Empfang", telephone: "Telefon", hebergement: "Unterkunft", tables: "Essen", vehicule: "Fahrzeug" },
    voyageurs: (a, e) => [a ? `${a} ${a > 1 ? "Erwachsene" : "Erwachsener"}` : "", e ? `${e} ${e > 1 ? "Kinder" : "Kind"}` : ""].filter(Boolean).join(", "),
    repondre: "Um etwas zu ergänzen, antworten Sie auf diese E-Mail.",
    signature: "Ouidah Heritage Tour, Ouidah (Benin)",
  },
  PT: {
    phrase: { voyage: ["o seu pedido de estadia em Ouidah", "chegou bem"], question: ["a sua pergunta", "chegou bem"] },
    relit: "Um consultor está a analisá-lo e responder-lhe-á no prazo de 24 horas.",
    devisSuivi: "O seu orçamento aparecerá na sua página de acompanhamento assim que ele o validar.",
    bouton: "Acompanhar o meu pedido",
    refDemande: "Referência do pedido",
    aConseiller: "a aconselhar",
    raison: "Recebe este e-mail como cópia do pedido enviado a partir de ouidahheritagetour.bj.",
    sep: ": ",
    sujet: "A sua viagem a Ouidah: pedido recebido",
    recu: "Recebemos o seu pedido. Um consultor está a analisá-lo e responder-lhe-á no prazo de 24 horas.",
    dates: (a, b) => `De ${a} a ${b}`,
    datesConseil: "Datas: a aconselhar",
    lieux: "Locais",
    services: "Serviços",
    noms: { navette: "transfer", accueil: "acolhimento", telephone: "telefone", hebergement: "alojamento", tables: "refeições", vehicule: "veículo" },
    voyageurs: (a, e) => [a ? `${a} adulto${a > 1 ? "s" : ""}` : "", e ? `${e} criança${e > 1 ? "s" : ""}` : ""].filter(Boolean).join(", "),
    repondre: "Para acrescentar um pormenor, responda a este e-mail.",
    signature: "Ouidah Heritage Tour, Ouidah (Benim)",
  },
  HT: {
    phrase: { voyage: ["demann sejou ou nan Ouidah", "rive byen"], question: ["kesyon ou", "rive byen"] },
    relit: "Yon konseye ap li l epi l ap reponn ou nan 24 èdtan.",
    devisSuivi: "Devi ou ap parèt sou paj swivi ou depi li valide l.",
    bouton: "Swiv demann mwen",
    refDemande: "Referans demann lan",
    aConseiller: "n ap konseye w",
    raison: "Ou resevwa imèl sa a kòm kopi demann ou voye sou ouidahheritagetour.bj.",
    sep: ": ",
    sujet: "Vwayaj ou nan Ouidah: nou resevwa demann ou",
    recu: "Nou resevwa demann ou an. Yon konseye ap li l epi l ap reponn ou nan 24 èdtan.",
    dates: (a, b) => `Soti ${a} rive ${b}`,
    datesConseil: "Dat: n ap konseye w",
    lieux: "Kote",
    services: "Sèvis",
    noms: { navette: "navèt", accueil: "akèy", telephone: "telefòn", hebergement: "lojman", tables: "manje", vehicule: "machin" },
    voyageurs: (a, e) => [a ? `${a} granmoun` : "", e ? `${e} timoun` : ""].filter(Boolean).join(", "),
    repondre: "Pou w ajoute yon detay, reponn imèl sa a.",
    signature: "Ouidah Heritage Tour, Ouidah (Benen)",
  },
  GCF: {
    phrase: { voyage: ["domann a séjou a-w Ouidah", "rivé byen"], question: ["kèsyon a-w", "rivé byen"] },
    relit: "On konséyé ka li-y é i ké réponn-vou adan 24 èr.",
    devisSuivi: "Dévi a-w ké parèt asi paj a swivi a-w osito i validé-y.",
    bouton: "Swiv domann an mwen",
    refDemande: "Référans a domann-la",
    aConseiller: "nou ké konséyé-w",
    raison: "Ou ka résévwa imèl-lasa kon kopi a domann ou voyé asi ouidahheritagetour.bj.",
    sep: " : ",
    sujet: "Vwayaj a-w Ouidah : nou byen résévwa domann a-w",
    recu: "Nou byen résévwa domann a-w. On konséyé ka li-y é i ké réponn-vou adan 24 èr.",
    dates: (a, b) => `Dépi ${a} jis ${b}`,
    datesConseil: "Dat : nou ké konséyé-w",
    lieux: "Koté",
    services: "Sèvis",
    noms: { navette: "navèt", accueil: "lakèy", telephone: "téléfòn", hebergement: "lojman", tables: "manjé", vehicule: "loto" },
    voyageurs: (a, e) => [a ? `${a} granmoun` : "", e ? `${e} timoun` : ""].filter(Boolean).join(", "),
    repondre: "Pou ajouté on détay, réponn a imèl-lasa.",
    signature: "Ouidah Heritage Tour, Ouidah (Benen)",
  },
};

// ---------- gabarit « la lettre illustrée » (maquette E validée le 03/11/2026) : textes communs aux e-mails clients ----------
export type LangueCourriel = keyof typeof copies;
export const contact = "contact@ouidahheritagetour.bj"; // adresse publique d'OHT (pied de chaque e-mail)
export type PhotoCourriel = "zangbeto" | "zoungbodji" | "porte" | "wax" | "rue-basilique"; // public/courriels/<nom>.jpg

type Commun = { salutation: string; equipe: string; question: string; et: string; pdf: (libelle: string) => string; photos: Record<PhotoCourriel, string> };

export const communs: Record<LangueCourriel, Commun> = {
  FR: {
    salutation: "Bien à vous,",
    equipe: "L’équipe Ouidah Heritage Tour",
    question: "Une question ? Répondez à cet e-mail.",
    et: " et ",
    pdf: (l) => `${l} (PDF)`,
    photos: {
      zangbeto: "Deux Zangbeto, gardiens aux grandes robes de raphia colorées, devant des spectateurs à Ouidah",
      zoungbodji: "Le mémorial de Zoungbodji, à Ouidah, sous le ciel de midi",
      porte: "La Porte du Non-Retour à Ouidah, sa frise en relief éclairée la nuit",
      wax: "Détail d’une chemise en wax : col, boutons et motifs bleu nuit, latérite et safran",
      "rue-basilique": "Rue pavée de Ouidah : le mur peint du temple des Pythons, la basilique au fond",
    },
  },
  EN: {
    salutation: "Kind regards,",
    equipe: "The Ouidah Heritage Tour team",
    question: "Any questions? Reply to this email.",
    et: " and ",
    pdf: (l) => `${l} (PDF)`,
    photos: {
      zangbeto: "Two Zangbeto, guardians in large colourful raffia robes, in front of onlookers in Ouidah",
      zoungbodji: "The Zoungbodji memorial in Ouidah under the midday sky",
      porte: "The Door of No Return in Ouidah, its relief frieze lit at night",
      wax: "Detail of a wax-print shirt: collar, buttons and patterns in midnight blue, laterite and saffron",
      "rue-basilique": "A paved street in Ouidah: the painted wall of the Python Temple, the basilica beyond",
    },
  },
  ES: {
    salutation: "Un saludo,",
    equipe: "El equipo de Ouidah Heritage Tour",
    question: "¿Alguna pregunta? Responda a este correo.",
    et: " y ",
    pdf: (l) => `${l} (PDF)`,
    photos: {
      zangbeto: "Dos Zangbeto, guardianes con grandes túnicas de rafia de colores, ante el público en Ouidah",
      zoungbodji: "El memorial de Zoungbodji, en Ouidah, bajo el cielo del mediodía",
      porte: "La Puerta del No Retorno en Ouidah, con su friso en relieve iluminado de noche",
      wax: "Detalle de una camisa de wax: cuello, botones y motivos azul noche, laterita y azafrán",
      "rue-basilique": "Calle adoquinada de Ouidah: el muro pintado del templo de las Pitones y, al fondo, la basílica",
    },
  },
  DE: {
    salutation: "Mit freundlichen Grüßen",
    equipe: "Das Team von Ouidah Heritage Tour",
    question: "Fragen? Antworten Sie auf diese E-Mail.",
    et: " und ",
    pdf: (l) => `${l} (PDF)`,
    photos: {
      zangbeto: "Zwei Zangbeto, Wächter in bunten Bastgewändern, vor Zuschauern in Ouidah",
      zoungbodji: "Das Mahnmal von Zoungbodji in Ouidah unter dem Mittagshimmel",
      porte: "Das Tor ohne Wiederkehr in Ouidah, sein Relieffries nachts beleuchtet",
      wax: "Detail eines Wax-Hemds: Kragen, Knöpfe und Muster in Nachtblau, Laterit und Safran",
      "rue-basilique": "Gepflasterte Straße in Ouidah: die bemalte Mauer des Pythontempels, dahinter die Basilika",
    },
  },
  PT: {
    salutation: "Com os melhores cumprimentos,",
    equipe: "A equipa da Ouidah Heritage Tour",
    question: "Alguma dúvida? Responda a este e-mail.",
    et: " e ",
    pdf: (l) => `${l} (PDF)`,
    photos: {
      zangbeto: "Dois Zangbeto, guardiões com grandes vestes de ráfia coloridas, diante do público em Ouidah",
      zoungbodji: "O memorial de Zoungbodji, em Ouidah, sob o céu do meio-dia",
      porte: "A Porta do Não Retorno em Ouidah, com o seu friso em relevo iluminado à noite",
      wax: "Pormenor de uma camisa de wax: gola, botões e padrões azul-noite, laterite e açafrão",
      "rue-basilique": "Rua calcetada de Ouidah: o muro pintado do templo das Pítons e, ao fundo, a basílica",
    },
  },
  HT: {
    salutation: "Avèk respè,",
    equipe: "Ekip Ouidah Heritage Tour",
    question: "Ou gen yon kesyon? Reponn imèl sa a.",
    et: " ak ",
    pdf: (l) => `${l} (PDF)`,
    photos: {
      zangbeto: "De Zangbeto, gadyen ak gwo rad rafya ki gen koulè, devan moun k ap gade nan Ouidah",
      zoungbodji: "Memoryal Zoungbodji, nan Ouidah, anba syèl midi",
      porte: "Pòt San Retou nan Ouidah, ak fris li an relyèf ki klere lannwit",
      wax: "Detay yon chemiz wax: kolèt, bouton ak desen ble lannwit, laterit ak safran",
      "rue-basilique": "Yon ri pave nan Ouidah: mi pent tanp Piton yo, ak bazilik la dèyè",
    },
  },
  GCF: {
    salutation: "An tout lanmityé,",
    equipe: "Lékip Ouidah Heritage Tour",
    question: "Ou ni on kèsyon ? Réponn imèl-lasa.",
    et: " é ",
    pdf: (l) => `${l} (PDF)`,
    photos: {
      zangbeto: "Dé Zangbeto, gadyen épi gran wòb rafya koulè, douvan moun ka gadé Ouidah",
      zoungbodji: "Mémoryal Zoungbodji, Ouidah, anba syèl a midi",
      porte: "Pòt San Rétou Ouidah, épi fris a-y an rélyèf klèré lannuit",
      wax: "Détay a on chimiz wax : kolé, bouton é désen blé lannuit, latérit é safran",
      "rue-basilique": "On ri pavé Ouidah : miray penn a tanp a Piton, bazilik-la dèyè",
    },
  },
};

// Code à 6 chiffres de l'équipe (gabarit, branché par la session de l'équipe) : objets et consigne « ignorer » dans
// content/courriels-equipe.ts ; ici la phrase titre, la validité réelle (minutes) et le pied.
type CopieCodeCourriel = { premiere: string; oubli: string; corps: (minutes: number) => string; apercu: (minutes: number) => string; raison: string };

export const codes: Record<LangueCourriel, CopieCodeCourriel> = {
  FR: {
    premiere: "voici votre code de première connexion.",
    oubli: "voici votre code pour choisir un nouveau mot de passe.",
    corps: (m) => `Ce code vous ouvre l’espace de l’équipe Ouidah Heritage Tour. Il est valable ${m} minutes et ne sert qu’une fois.`,
    apercu: (m) => `Votre code pour l’espace de l’équipe Ouidah Heritage Tour, valable ${m} minutes.`,
    raison: "Vous recevez cet e-mail parce qu’un code a été demandé pour votre compte de l’équipe Ouidah Heritage Tour.",
  },
  EN: {
    premiere: "here is your first sign-in code.",
    oubli: "here is your code to choose a new password.",
    corps: (m) => `This code opens the Ouidah Heritage Tour team area. It is valid for ${m} minutes and can be used once.`,
    apercu: (m) => `Your code for the Ouidah Heritage Tour team area, valid for ${m} minutes.`,
    raison: "You are receiving this email because a code was requested for your Ouidah Heritage Tour team account.",
  },
  ES: {
    premiere: "este es su código de primer acceso.",
    oubli: "este es su código para elegir una nueva contraseña.",
    corps: (m) => `Este código le abre el espacio del equipo de Ouidah Heritage Tour. Es válido durante ${m} minutos y solo sirve una vez.`,
    apercu: (m) => `Su código para el espacio del equipo de Ouidah Heritage Tour, válido durante ${m} minutos.`,
    raison: "Recibe este correo porque se ha solicitado un código para su cuenta del equipo de Ouidah Heritage Tour.",
  },
  DE: {
    premiere: "hier ist Ihr Code für die erste Anmeldung.",
    oubli: "hier ist Ihr Code für ein neues Passwort.",
    corps: (m) => `Dieser Code öffnet den Teambereich von Ouidah Heritage Tour. Er ist ${m} Minuten gültig und nur einmal verwendbar.`,
    apercu: (m) => `Ihr Code für den Teambereich von Ouidah Heritage Tour, ${m} Minuten gültig.`,
    raison: "Sie erhalten diese E-Mail, weil für Ihr Teamkonto bei Ouidah Heritage Tour ein Code angefordert wurde.",
  },
  PT: {
    premiere: "eis o seu código de primeiro acesso.",
    oubli: "eis o seu código para escolher uma nova palavra-passe.",
    corps: (m) => `Este código abre-lhe o espaço da equipa da Ouidah Heritage Tour. É válido durante ${m} minutos e só pode ser usado uma vez.`,
    apercu: (m) => `O seu código para o espaço da equipa da Ouidah Heritage Tour, válido durante ${m} minutos.`,
    raison: "Recebe este e-mail porque foi pedido um código para a sua conta da equipa da Ouidah Heritage Tour.",
  },
  HT: {
    premiere: "men kòd premye koneksyon ou.",
    oubli: "men kòd ou pou chwazi yon nouvo modpas.",
    corps: (m) => `Kòd sa a louvri espas ekip Ouidah Heritage Tour la pou ou. Li valab pandan ${m} minit epi li sèvi yon sèl fwa.`,
    apercu: (m) => `Kòd ou pou espas ekip Ouidah Heritage Tour la, valab pandan ${m} minit.`,
    raison: "Ou resevwa imèl sa a paske yon moun mande yon kòd pou kont ekip Ouidah Heritage Tour ou.",
  },
  GCF: {
    premiere: "men kòd a-w pou prèmyé konnèksyon.",
    oubli: "men kòd a-w pou chwazi on nouvo mod-pas.",
    corps: (m) => `Kòd-lasa ka ouvè lèspas a lékip Ouidah Heritage Tour ba-w. I bon pannan ${m} minit é i ka sèvi on sèl fwa.`,
    apercu: (m) => `Kòd a-w pou lèspas a lékip Ouidah Heritage Tour, bon pannan ${m} minit.`,
    raison: "Ou ka résévwa imèl-lasa paskè yo mandé on kòd pou kont a-w adan lékip Ouidah Heritage Tour.",
  },
};
