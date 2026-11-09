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
