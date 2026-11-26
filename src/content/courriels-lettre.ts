import type { LangueCourriel } from "./courriels";

// E-mail « inscription à la lettre de Ouidah » (maquette E validée le 03/11/2026), dans la langue choisie à l'inscription.
// Thèmes : ceux cochés par l'abonné ; en français, leurs textes de content/fr.ts (newsletter.sujets), ici leur traduction
// par identifiant. Aucune fréquence d'envoi ni nombre d'abonnés (rien n'est fourni par OHT). Créoles et portugais : à relire.
type CopieLettre = {
  sujet: string;
  phrase: readonly [string, string]; // « … arrivera dans » + trait Soleil ; un point suit
  intro: (n: number) => string;
  themes: Record<string, { nom: string; texte: string }>; // hors FR (le FR vient de fr.ts)
  langue: string;
  lien: string;
  consigne: string; // sans lien de désinscription : répondre à l'e-mail
  raison: string;
};

export const copiesLettre: Record<LangueCourriel, CopieLettre> = {
  FR: {
    sujet: "La lettre de Ouidah : inscription confirmée",
    phrase: ["C’est noté : la lettre de Ouidah arrivera dans", "votre boîte"],
    intro: (n) => (n > 1 ? "Vous recevrez des nouvelles sur ces sujets :" : "Vous recevrez des nouvelles sur ce sujet :"),
    themes: {},
    langue: "Elle vous parviendra en français.",
    lien: "Se désinscrire",
    consigne: "Pour ne plus la recevoir, répondez « désinscription » à cet e-mail.",
    raison: "Vous recevez cet e-mail parce que cette adresse a été inscrite à la lettre de Ouidah sur ouidahheritagetour.bj.",
  },
  EN: {
    sujet: "The Ouidah letter: subscription confirmed",
    phrase: ["Noted: the Ouidah letter will arrive in", "your inbox"],
    intro: (n) => (n > 1 ? "You will receive news on these topics:" : "You will receive news on this topic:"),
    themes: {
      departs: { nom: "Our departure dates", texte: "Upcoming stays and tours, with their dates." },
      agenda: { nom: "The Ouidah calendar", texte: "Vodun Days, Journée du souvenir, Ouidah Blue: the town’s events." },
    },
    langue: "It will reach you in English.",
    lien: "Unsubscribe",
    consigne: "To stop receiving it, reply “unsubscribe” to this email.",
    raison: "You are receiving this email because this address was signed up for the Ouidah letter on ouidahheritagetour.bj.",
  },
  ES: {
    sujet: "La carta de Ouidah: suscripción confirmada",
    phrase: ["Anotado: la carta de Ouidah llegará a", "su buzón"],
    intro: (n) => (n > 1 ? "Recibirá noticias sobre estos temas:" : "Recibirá noticias sobre este tema:"),
    themes: {
      departs: { nom: "Nuestras fechas de salida", texte: "Las próximas estancias y circuitos, con sus fechas." },
      agenda: { nom: "La agenda de Ouidah", texte: "Vodun Days, Journée du souvenir, Ouidah Blue: las citas de la ciudad." },
    },
    langue: "Le llegará en español.",
    lien: "Darse de baja",
    consigne: "Para dejar de recibirla, responda «baja» a este correo.",
    raison: "Recibe este correo porque esta dirección se suscribió a la carta de Ouidah en ouidahheritagetour.bj.",
  },
  DE: {
    sujet: "Der Brief aus Ouidah: Anmeldung bestätigt",
    phrase: ["Notiert: Der Brief aus Ouidah kommt in", "Ihr Postfach"],
    intro: (n) => (n > 1 ? "Sie erhalten Neuigkeiten zu diesen Themen:" : "Sie erhalten Neuigkeiten zu diesem Thema:"),
    themes: {
      departs: { nom: "Unsere Abreisetermine", texte: "Die nächsten Aufenthalte und Rundreisen, mit ihren Terminen." },
      agenda: { nom: "Der Kalender von Ouidah", texte: "Vodun Days, Journée du souvenir, Ouidah Blue: die Termine der Stadt." },
    },
    langue: "Er erreicht Sie auf Deutsch.",
    lien: "Abmelden",
    consigne: "Um ihn nicht mehr zu erhalten, antworten Sie mit „Abmelden“ auf diese E-Mail.",
    raison: "Sie erhalten diese E-Mail, weil diese Adresse auf ouidahheritagetour.bj für den Brief aus Ouidah angemeldet wurde.",
  },
  PT: {
    sujet: "A carta de Ouidah: inscrição confirmada",
    phrase: ["Fica registado: a carta de Ouidah chegará à", "sua caixa"],
    intro: (n) => (n > 1 ? "Receberá notícias sobre estes temas:" : "Receberá notícias sobre este tema:"),
    themes: {
      departs: { nom: "As nossas datas de partida", texte: "As próximas estadias e circuitos, com as suas datas." },
      agenda: { nom: "A agenda de Ouidah", texte: "Vodun Days, Journée du souvenir, Ouidah Blue: os encontros da cidade." },
    },
    langue: "Chegará em português.",
    lien: "Cancelar a subscrição",
    consigne: "Para deixar de a receber, responda «cancelar» a este e-mail.",
    raison: "Recebe este e-mail porque este endereço foi inscrito na carta de Ouidah em ouidahheritagetour.bj.",
  },
  HT: {
    sujet: "Lèt Ouidah a: enskripsyon konfime",
    phrase: ["Nou note sa: lèt Ouidah a ap rive nan", "bwat ou"],
    intro: (n) => (n > 1 ? "W ap resevwa nouvèl sou sijè sa yo:" : "W ap resevwa nouvèl sou sijè sa a:"),
    themes: {
      departs: { nom: "Dat depa nou yo", texte: "Pwochen sejou ak sikui yo, ak dat yo." },
      agenda: { nom: "Ajanda Ouidah", texte: "Vodun Days, Journée du souvenir, Ouidah Blue: randevou vil la." },
    },
    langue: "L ap rive w an kreyòl ayisyen.",
    lien: "Dezabòne",
    consigne: "Pou w pa resevwa l ankò, reponn « dezabòne » nan imèl sa a.",
    raison: "Ou resevwa imèl sa a paske adrès sa a te enskri nan lèt Ouidah a sou ouidahheritagetour.bj.",
  },
  GCF: {
    sujet: "Lèt a Ouidah : enskripsyon konfirmé",
    phrase: ["Sé noté : lèt a Ouidah ké rivé adan", "bwèt a-w"],
    intro: (n) => (n > 1 ? "Ou ké résévwa nouvèl asi sé sijè-lasa :" : "Ou ké résévwa nouvèl asi sijè-lasa :"),
    themes: {
      departs: { nom: "Dat a dépa an nou", texte: "Pwochen séjou é sikui, épi dat a yo." },
      agenda: { nom: "Ajanda a Ouidah", texte: "Vodun Days, Journée du souvenir, Ouidah Blue : sé randé-vou a vil-la." },
    },
    langue: "I ké rivé-w an kréyòl.",
    lien: "Pa résévwa-y ankò",
    consigne: "Pou pa résévwa-y ankò, réponn « désinskripsyon » a imèl-lasa.",
    raison: "Ou ka résévwa imèl-lasa paskè adrès-lasa enskri a lèt a Ouidah asi ouidahheritagetour.bj.",
  },
};

// E-mail « Votre abonnement à la lettre de Ouidah » (26/11/2026) : une adresse déjà connue a été soumise au formulaire
// public. Rien n'est modifié ; l'e-mail porte le lien de gestion (/lettre/abonnement/<jeton>, valable `jours` jours), dans
// la langue enregistrée de l'abonné, jamais celle de la demande. Même gabarit que la confirmation. `bouton` sert aussi de
// libellé au lien de gestion de la confirmation et des numéros de la lettre. Créoles : à relire par un locuteur.
type CopieGestion = {
  sujet: string;
  phrase: readonly [string, string]; // titre + trait Soleil ; un point suit
  texte: string;
  action: (jours: number) => string;
  bouton: string;
  ignorer: string;
  raison: string;
};

/** Lien de gestion de l'aperçu et du test à soi-même d'un numéro (aucun abonné réel). */
export const LIEN_GESTION_EXEMPLE = "[lien personnel de gestion]";

export const copiesGestion: Record<LangueCourriel, CopieGestion> = {
  FR: {
    sujet: "Votre abonnement à la lettre de Ouidah",
    phrase: ["Votre abonnement à", "la lettre de Ouidah"],
    texte: "Une inscription à la lettre de Ouidah vient d’être demandée pour cette adresse, que nous connaissons déjà. Rien n’a changé.",
    action: (j) => `Pour changer la langue ou les thèmes, vous désinscrire ou vous réinscrire, ouvrez votre page d’abonnement. Ce lien personnel reste valable ${j} jours.`,
    bouton: "Gérer mon abonnement",
    ignorer: "Si la demande ne vient pas de vous, ignorez cet e-mail : votre abonnement reste tel quel.",
    raison: "Vous recevez cet e-mail parce qu’une inscription à la lettre de Ouidah a été demandée pour cette adresse sur ouidahheritagetour.bj.",
  },
  EN: {
    sujet: "Your subscription to the Ouidah letter",
    phrase: ["Your subscription to", "the Ouidah letter"],
    texte: "Someone just asked to sign this address up for the Ouidah letter. We already know this address, so nothing has changed.",
    action: (j) => `To change the language or topics, unsubscribe or subscribe again, open your subscription page. This personal link stays valid for ${j} days.`,
    bouton: "Manage my subscription",
    ignorer: "If you did not make this request, ignore this email: your subscription stays as it is.",
    raison: "You are receiving this email because a sign-up for the Ouidah letter was requested for this address on ouidahheritagetour.bj.",
  },
  ES: {
    sujet: "Su suscripción a la carta de Ouidah",
    phrase: ["Su suscripción a", "la carta de Ouidah"],
    texte: "Se acaba de solicitar una suscripción a la carta de Ouidah para esta dirección, que ya conocemos. No ha cambiado nada.",
    action: (j) => `Para cambiar el idioma o los temas, darse de baja o volver a suscribirse, abra su página de suscripción. Este enlace personal es válido durante ${j} días.`,
    bouton: "Gestionar mi suscripción",
    ignorer: "Si la solicitud no viene de usted, ignore este correo: su suscripción sigue igual.",
    raison: "Recibe este correo porque se solicitó una suscripción a la carta de Ouidah para esta dirección en ouidahheritagetour.bj.",
  },
  DE: {
    sujet: "Ihr Abonnement des Briefs aus Ouidah",
    phrase: ["Ihr Abonnement des", "Briefs aus Ouidah"],
    texte: "Für diese Adresse wurde soeben eine Anmeldung zum Brief aus Ouidah angefragt. Die Adresse ist uns bereits bekannt, es hat sich nichts geändert.",
    action: (j) => `Um Sprache oder Themen zu ändern, sich abzumelden oder wieder anzumelden, öffnen Sie Ihre Abonnementseite. Dieser persönliche Link ist ${j} Tage lang gültig.`,
    bouton: "Abonnement verwalten",
    ignorer: "Falls die Anfrage nicht von Ihnen stammt, ignorieren Sie diese E-Mail: Ihr Abonnement bleibt unverändert.",
    raison: "Sie erhalten diese E-Mail, weil auf ouidahheritagetour.bj für diese Adresse eine Anmeldung zum Brief aus Ouidah angefragt wurde.",
  },
  PT: {
    sujet: "A sua subscrição da carta de Ouidah",
    phrase: ["A sua subscrição da", "carta de Ouidah"],
    texte: "Acaba de ser pedida uma inscrição na carta de Ouidah para este endereço, que já conhecemos. Nada mudou.",
    action: (j) => `Para mudar o idioma ou os temas, cancelar ou voltar a subscrever, abra a sua página de subscrição. Esta ligação pessoal é válida durante ${j} dias.`,
    bouton: "Gerir a minha subscrição",
    ignorer: "Se o pedido não partiu de si, ignore este e-mail: a sua subscrição continua igual.",
    raison: "Recebe este e-mail porque foi pedida uma inscrição na carta de Ouidah para este endereço em ouidahheritagetour.bj.",
  },
  HT: {
    sujet: "Abònman ou nan lèt Ouidah a",
    phrase: ["Abònman ou nan", "lèt Ouidah a"],
    texte: "Yon moun fèk mande pou enskri adrès sa a nan lèt Ouidah a. Nou deja konnen adrès sa a, kidonk anyen pa chanje.",
    action: (j) => `Pou chanje lang oswa sijè yo, dezabòne oswa reabòne, louvri paj abònman ou. Lyen pèsonèl sa a bon pandan ${j} jou.`,
    bouton: "Jere abònman mwen",
    ignorer: "Si se pa ou ki fè demann lan, pa okipe imèl sa a: abònman ou rete jan l te ye a.",
    raison: "Ou resevwa imèl sa a paske yon moun te mande yon enskripsyon nan lèt Ouidah a pou adrès sa a sou ouidahheritagetour.bj.",
  },
  GCF: {
    sujet: "Abònman a-w a lèt a Ouidah",
    phrase: ["Abònman a-w a", "lèt a Ouidah"],
    texte: "On moun sòti mandé enskri adrès-lasa a lèt a Ouidah. Nou ja konnèt adrès-lasa, kidonk ayen pa chanjé.",
    action: (j) => `Pou chanjé lang oben sijè, pa résévwa lèt-la ankò oben enskri-w ankò, ouvè paj abònman a-w. Lyen pèsonèl-lasa bon pandan ${j} jou.`,
    bouton: "Jéré abònman an mwen",
    ignorer: "Si sé pa vou ki fè demann-lasa, pa okipé-w di imèl-lasa : abònman a-w ka rété kon i té yé.",
    raison: "Ou ka résévwa imèl-lasa paskè on moun mandé on enskripsyon a lèt a Ouidah pou adrès-lasa asi ouidahheritagetour.bj.",
  },
};
