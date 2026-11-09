import type { LangueCourriel } from "./courriels";

// E-mail « votre devis pour Ouidah est prêt » (maquette E validée le 03/11/2026), dans la langue de la demande. Lignes,
// montants, numéros, validité et mot de l'agent viennent du devis publié, jamais d'ici. Libellés du ticket (Ticket n°,
// Devis n°, Total, Télécharger le devis) : content/suivi.ts. Créoles (HT, GCF) et portugais : à faire relire.
type CopieDevis = {
  sujet: string;
  apercu: (numero: string, montant: string, jusquau: string | null) => string;
  phrase: readonly [string, string]; // phrase titre et son trait Soleil
  corps: string;
  signer: string;
  valable: string;
  conseiller: (prenom: string) => string;
  modifier: string;
  raison: string;
};

export const copiesDevis: Record<LangueCourriel, CopieDevis> = {
  FR: {
    sujet: "Votre devis pour Ouidah est prêt",
    apercu: (n, m, j) => `Votre devis ${n} : ${m}${j ? `, valable jusqu’au ${j}` : ""}.`,
    phrase: ["votre devis pour Ouidah", "est prêt"],
    corps: "Votre conseiller a préparé le devis de votre séjour, ligne par ligne. Relisez-le, puis signez-le en ligne depuis votre page de suivi.",
    signer: "Signer mon devis",
    valable: "Valable jusqu’au",
    conseiller: (p) => `${p}, votre conseiller`,
    modifier: "Pour modifier une ligne ou poser une question, répondez simplement à cet e-mail.",
    raison: "Vous recevez cet e-mail parce qu’un conseiller a préparé le devis de votre demande de voyage.",
  },
  EN: {
    sujet: "Your quote for Ouidah is ready",
    apercu: (n, m, j) => `Your quote ${n}: ${m}${j ? `, valid until ${j}` : ""}.`,
    phrase: ["your quote for Ouidah", "is ready"],
    corps: "Your advisor has prepared the quote for your stay, line by line. Read it through, then sign it online from your tracking page.",
    signer: "Sign my quote",
    valable: "Valid until",
    conseiller: (p) => `${p}, your advisor`,
    modifier: "To change a line or ask a question, simply reply to this email.",
    raison: "You are receiving this email because an advisor has prepared the quote for your travel request.",
  },
  ES: {
    sujet: "Su presupuesto para Ouidah está listo",
    apercu: (n, m, j) => `Su presupuesto ${n}: ${m}${j ? `, válido hasta el ${j}` : ""}.`,
    phrase: ["su presupuesto para Ouidah", "está listo"],
    corps: "Su asesor ha preparado el presupuesto de su estancia, línea por línea. Revíselo y fírmelo en línea desde su página de seguimiento.",
    signer: "Firmar mi presupuesto",
    valable: "Válido hasta el",
    conseiller: (p) => `${p}, su asesor`,
    modifier: "Para modificar una línea o hacer una pregunta, basta con responder a este correo.",
    raison: "Recibe este correo porque un asesor ha preparado el presupuesto de su solicitud de viaje.",
  },
  DE: {
    sujet: "Ihr Angebot für Ouidah ist fertig",
    apercu: (n, m, j) => `Ihr Angebot ${n}: ${m}${j ? `, gültig bis ${j}` : ""}.`,
    phrase: ["Ihr Angebot für Ouidah", "ist fertig"],
    corps: "Ihr Berater hat das Angebot für Ihren Aufenthalt Zeile für Zeile erstellt. Lesen Sie es durch und unterschreiben Sie es online auf Ihrer Übersichtsseite.",
    signer: "Angebot unterschreiben",
    valable: "Gültig bis",
    conseiller: (p) => `${p}, Ihr Berater`,
    modifier: "Um eine Zeile zu ändern oder eine Frage zu stellen, antworten Sie einfach auf diese E-Mail.",
    raison: "Sie erhalten diese E-Mail, weil ein Berater das Angebot zu Ihrer Reiseanfrage erstellt hat.",
  },
  PT: {
    sujet: "O seu orçamento para Ouidah está pronto",
    apercu: (n, m, j) => `O seu orçamento ${n}: ${m}${j ? `, válido até ${j}` : ""}.`,
    phrase: ["o seu orçamento para Ouidah", "está pronto"],
    corps: "O seu consultor preparou o orçamento da sua estadia, linha a linha. Leia-o e assine-o online na sua página de acompanhamento.",
    signer: "Assinar o meu orçamento",
    valable: "Válido até",
    conseiller: (p) => `${p}, o seu consultor`,
    modifier: "Para alterar uma linha ou colocar uma questão, basta responder a este e-mail.",
    raison: "Recebe este e-mail porque um consultor preparou o orçamento do seu pedido de viagem.",
  },
  HT: {
    sujet: "Devi ou pou Ouidah pare",
    apercu: (n, m, j) => `Devi ou ${n}: ${m}${j ? `, valab jiska ${j}` : ""}.`,
    phrase: ["devi ou pou Ouidah", "pare"],
    corps: "Konseye ou a prepare devi sejou ou, liy pa liy. Li l, epi siyen l sou entènèt nan paj swivi ou.",
    signer: "Siyen devi mwen",
    valable: "Valab jiska",
    conseiller: (p) => `${p}, konseye ou`,
    modifier: "Pou chanje yon liy oswa poze yon kesyon, jis reponn imèl sa a.",
    raison: "Ou resevwa imèl sa a paske yon konseye prepare devi pou demann vwayaj ou.",
  },
  GCF: {
    sujet: "Dévi a-w pou Ouidah paré",
    apercu: (n, m, j) => `Dévi a-w ${n} : ${m}${j ? `, valab jis ${j}` : ""}.`,
    phrase: ["dévi a-w pou Ouidah", "paré"],
    corps: "Konséyé a-w paré dévi a séjou a-w, lign pa lign. Li-y, é siyé-y anlign asi paj a swivi a-w.",
    signer: "Siyé dévi an mwen",
    valable: "Valab jis",
    conseiller: (p) => `${p}, konséyé a-w`,
    modifier: "Pou chanjé on lign oben pozé on kèsyon, réponn sèlman a imèl-lasa.",
    raison: "Ou ka résévwa imèl-lasa paskè on konséyé paré dévi a domann a vwayaj a-w.",
  },
};
