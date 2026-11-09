// E-mail des billets après un paiement confirmé (gabarit « la lettre illustrée », maquette E validée le 03/11/2026), dans
// la langue du client (7 langues du site), avec les vraies données de la réservation. Salutation, signature et libellés
// du ticket (Formule, Payé avec, Ticket n°, Reçu n°) : courriels.ts et suivi.ts.
// Créoles (HT, GCF) et portugais : à faire relire par un locuteur avant la mise en ligne.
type CopieBillets = {
  sujet: (evenement: string) => string;
  apercu: (places: string, formule: string, evenement: string, date: string) => string;
  phrase: (n: number, evenement: string) => string; // après « Prénom, »
  places: (n: number) => string;
  corps: string;
  bouton: string;
  billets: string;
  raison: string;
};

export const copiesBillets: Record<"FR" | "EN" | "ES" | "DE" | "PT" | "HT" | "GCF", CopieBillets> = {
  FR: {
    sujet: (e) => `Vos billets : ${e}`,
    apercu: (p, f, e, d) => `Paiement confirmé : ${p} ${f} pour ${e}, ${d}.`,
    phrase: (n, e) => (n > 1 ? `vos ${n} places pour ${e} sont confirmées.` : `votre place pour ${e} est confirmée.`),
    places: (n) => `${n} place${n > 1 ? "s" : ""}`,
    corps: "Votre paiement est confirmé. À l’entrée, présentez le QR code de chaque billet, sur votre téléphone ou imprimé. Vous les trouvez sur votre page de suivi.",
    bouton: "Afficher mes billets",
    billets: "Vos billets",
    raison: "Vous recevez cet e-mail parce que vous avez payé des billets sur ouidahheritagetour.bj.",
  },
  EN: {
    sujet: (e) => `Your tickets: ${e}`,
    apercu: (p, f, e, d) => `Payment confirmed: ${p}, ${f}, for ${e}, ${d}.`,
    phrase: (n, e) => (n > 1 ? `your ${n} tickets for ${e} are confirmed.` : `your ticket for ${e} is confirmed.`),
    places: (n) => `${n} ticket${n > 1 ? "s" : ""}`,
    corps: "Your payment is confirmed. At the entrance, show the QR code of each ticket, on your phone or printed. You will find them on your tracking page.",
    bouton: "Show my tickets",
    billets: "Your tickets",
    raison: "You are receiving this email because you paid for tickets on ouidahheritagetour.bj.",
  },
  ES: {
    sujet: (e) => `Sus entradas: ${e}`,
    apercu: (p, f, e, d) => `Pago confirmado: ${p} ${f} para ${e}, ${d}.`,
    phrase: (n, e) => (n > 1 ? `sus ${n} entradas para ${e} están confirmadas.` : `su entrada para ${e} está confirmada.`),
    places: (n) => `${n} entrada${n > 1 ? "s" : ""}`,
    corps: "Su pago está confirmado. En la entrada, muestre el código QR de cada entrada, en su móvil o impreso. Los encontrará en su página de seguimiento.",
    bouton: "Ver mis entradas",
    billets: "Sus entradas",
    raison: "Recibe este correo porque ha pagado entradas en ouidahheritagetour.bj.",
  },
  DE: {
    sujet: (e) => `Ihre Tickets: ${e}`,
    apercu: (p, f, e, d) => `Zahlung bestätigt: ${p} ${f} für ${e}, ${d}.`,
    phrase: (n, e) => (n > 1 ? `Ihre ${n} Tickets für ${e} sind gebucht.` : `Ihr Ticket für ${e} ist gebucht.`),
    places: (n) => `${n} ${n > 1 ? "Tickets" : "Ticket"}`,
    corps: "Ihre Zahlung ist bestätigt. Zeigen Sie am Eingang den QR-Code jedes Tickets vor, auf dem Handy oder ausgedruckt. Sie finden die QR-Codes auf Ihrer Übersichtsseite.",
    bouton: "Meine Tickets anzeigen",
    billets: "Ihre Tickets",
    raison: "Sie erhalten diese E-Mail, weil Sie auf ouidahheritagetour.bj Tickets bezahlt haben.",
  },
  PT: {
    sujet: (e) => `Os seus bilhetes: ${e}`,
    apercu: (p, f, e, d) => `Pagamento confirmado: ${p} ${f} para ${e}, ${d}.`,
    phrase: (n, e) => (n > 1 ? `os seus ${n} bilhetes para ${e} estão confirmados.` : `o seu bilhete para ${e} está confirmado.`),
    places: (n) => `${n} ${n > 1 ? "bilhetes" : "bilhete"}`,
    corps: "O seu pagamento está confirmado. À entrada, apresente o código QR de cada bilhete, no telemóvel ou impresso. Encontra-os na sua página de acompanhamento.",
    bouton: "Ver os meus bilhetes",
    billets: "Os seus bilhetes",
    raison: "Recebe este e-mail porque pagou bilhetes em ouidahheritagetour.bj.",
  },
  HT: {
    sujet: (e) => `Tikè ou yo: ${e}`,
    apercu: (p, f, e, d) => `Peman konfime: ${p} ${f} pou ${e}, ${d}.`,
    phrase: (n, e) => (n > 1 ? `${n} plas ou yo pou ${e} konfime.` : `plas ou pou ${e} konfime.`),
    places: (n) => `${n} plas`,
    corps: "Peman ou an konfime. Nan antre a, montre kòd QR chak tikè, sou telefòn ou oswa enprime. W ap jwenn yo sou paj swivi ou.",
    bouton: "Gade tikè mwen yo",
    billets: "Tikè ou yo",
    raison: "Ou resevwa imèl sa a paske ou peye tikè sou ouidahheritagetour.bj.",
  },
  GCF: {
    sujet: (e) => `Tiké a-w : ${e}`,
    apercu: (p, f, e, d) => `Péyman konfirmé : ${p} ${f} pou ${e}, ${d}.`,
    phrase: (n, e) => (n > 1 ? `${n} plas a-w pou ${e} konfirmé.` : `plas a-w pou ${e} konfirmé.`),
    places: (n) => `${n} plas`,
    corps: "Péyman a-w konfirmé. Lè ou ka rantré, montré kòd QR a chak tiké, asi téléfòn a-w oben enprimé. Ou ké touvé yo asi paj a swivi a-w.",
    bouton: "Gadé tiké an mwen",
    billets: "Tiké a-w",
    raison: "Ou ka résévwa imèl-lasa paskè ou péyé tiké asi ouidahheritagetour.bj.",
  },
};
