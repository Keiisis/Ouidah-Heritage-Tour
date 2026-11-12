// Page de suivi d'une commande (/suivi/<jeton>), ticket imprimé et animation « Bienvenue au Bénin » (maquette
// experience.html validée par Kevin, 22-23/10/2026). Tous les textes, dans les 7 langues du site ; la page s'affiche
// dans la langue enregistrée avec la commande. HT et GCF : à faire valider par un locuteur. PT : « Benin » (23/10/2026).
// Les valeurs (nom, circuit, articles, montants, numéros) viennent du dossier, jamais d'ici.
import type { CasTicket, LangueDoc, StatutSuivi } from "@/lib/suivi";

/** Situation affichée : le cas du ticket, précisé par le statut (réservation remboursée, devis réglé). */
export type VueSuivi = "paiement" | "rembourse" | "boutique" | "attente" | "pret" | "regle";

export type TexteSuivi = {
  html: string; // attribut lang du conteneur
  locale: string | null; // Intl ; null = mois écrits à la main (HT, GCF)
  mois?: readonly string[];
  formatMois?: "long"; // pt-PT court = chiffres seuls
  titre: readonly [string, string]; // « Bienvenue au » / « Bénin »
  doc: Record<CasTicket, string>;
  ticket: {
    no: string; date: string; voyageur: string; client: string;
    evenement: string; dates: string; formule: string; places: string;
    circuit: string; projet: string; periode: string; voyageurs: string;
    article: string; reception: string;
    montant: string; total: string; totalRegle: string; payeAvec: string; dansDevis: string;
  };
  projet: { voyage: string; groupe: string; question: string };
  remise: { retrait: string; livraison: string };
  statut: Record<StatutSuivi, string>;
  reglementAgence: string;
  // commande confirmée, pas encore réglée : bouton du suivi vers la page de paiement (montant relu par le serveur)
  enLigne: { payer: string; indisponible: string };
  titres: Record<VueSuivi, string>;
  sous: Record<VueSuivi, string>;
  merci: Record<VueSuivi, string>; // {pays} = « Bénin » dans la langue
  qr: { recu: string; devis: string; attente: string; boutique: string; suivi: string; code: string };
  numero: { recu: string; devis: string };
  actions: { recu: string; devis: string; agent: string };
  billets: { titre: (n: number) => string; billet: (i: number, n: number) => string; numero: (x: string) => string; entree: string };
  recap: { titre: string; reference: string; statut: string; transaction: string; payeLe: string };
  documents: { titre: string; recu: string; devis: string; telecharger: string };
  devis: { titre: string; quantite: string; prix: string; total: string; valable: (date: string) => string };
  lie: { accompagnement: { titre: string; texte: string }; billets: { titre: string; texte: string }; ouvrir: string };
  contact: { titre: string; texte: (reference: string) => string; ecrire: string; email: string; telephone: string };
  // lien de suivi ou de paiement faux, incomplet ou retiré (/suivi/<jeton>, /payer/<jeton>) : écran dédié, réponse 404
  invalide: { metaTitre: string; titre: string; texte: string; ecrire: string; devis: string };
};

const fr: TexteSuivi = {
  html: "fr", locale: "fr-FR",
  titre: ["Bienvenue au", "Bénin"],
  doc: { paiement: "Ticket de paiement", boutique: "Ticket de commande", attente: "Ticket de demande de devis", pret: "Ticket de devis" },
  ticket: {
    no: "Ticket n°", date: "Date", voyageur: "Voyageur", client: "Client",
    evenement: "Événement", dates: "Dates", formule: "Formule", places: "Places",
    circuit: "Circuit", projet: "Projet", periode: "Période", voyageurs: "Voyageurs",
    article: "Article", reception: "Réception",
    montant: "Montant", total: "Total", totalRegle: "Total réglé", payeAvec: "Payé avec", dansDevis: "dans le devis",
  },
  projet: { voyage: "Voyage sur mesure", groupe: "Voyage de groupe", question: "Question à un agent" },
  remise: { retrait: "Retrait à Ouidah", livraison: "Livraison" },
  statut: { paye: "Payé", rembourse: "Remboursé", attente: "Devis en vérification", pret: "Prêt à régler", a_confirmer: "Reçue, à confirmer", a_preparer: "Confirmée, en préparation", prete: "Prête", remise: "Remise", annulee: "Annulée" },
  reglementAgence: "Paiement en agence",
  enLigne: { payer: "Payer en ligne", indisponible: "Le paiement en ligne n’a pas pu s’ouvrir. Réessayez dans un moment ou écrivez à un agent." },
  titres: { paiement: "Paiement confirmé", rembourse: "Réservation remboursée", boutique: "Commande reçue", attente: "Demande de devis envoyée", pret: "Votre devis est prêt", regle: "Devis réglé" },
  sous: {
    paiement: "Votre ticket s’imprime. Le QR code ouvre votre reçu.",
    rembourse: "Votre réservation a été remboursée. Le QR code ouvre ce suivi.",
    boutique: "L’équipe confirme votre commande et revient vers vous très vite. Le QR code ouvre son suivi.",
    attente: "Un agent vérifie votre demande. Le QR code ouvre son suivi.",
    pret: "Le QR code ouvre votre devis. Un agent reste à votre écoute.",
    regle: "Votre devis est réglé. Le QR code ouvre votre devis.",
  },
  merci: { paiement: "Merci. Bienvenue au {pays}", rembourse: "Merci de votre confiance.", boutique: "Merci pour votre commande", attente: "Merci, on revient vers vous très vite.", pret: "Merci. À très vite au {pays}", regle: "Merci. À très vite au {pays}" },
  qr: {
    recu: "Scannez pour télécharger votre reçu (document PDF séparé).",
    devis: "Scannez pour ouvrir votre devis (document PDF séparé).",
    attente: "Scannez pour suivre votre demande. Le devis (document séparé) s’affichera dès sa validation par un agent.",
    boutique: "Scannez pour suivre votre commande.",
    suivi: "Scannez pour retrouver ce suivi.",
    code: "Code QR",
  },
  numero: { recu: "Reçu n°", devis: "Devis n°" },
  actions: { recu: "Télécharger le reçu", devis: "Télécharger le devis", agent: "Écrire à un agent" },
  billets: { titre: (n) => (n > 1 ? "Vos billets d’entrée" : "Votre billet d’entrée"), billet: (i, n) => `Billet ${i} sur ${n}`, numero: (x) => `N° ${x}`, entree: "À présenter à l’entrée" },
  recap: { titre: "Récapitulatif", reference: "Référence", statut: "Statut", transaction: "Transaction", payeLe: "Payé le" },
  documents: { titre: "Documents", recu: "Reçu", devis: "Devis", telecharger: "Télécharger le PDF" },
  devis: { titre: "Votre devis", quantite: "Quantité", prix: "Prix unitaire", total: "Total", valable: (d) => `Valable jusqu’au ${d}` },
  lie: {
    accompagnement: { titre: "Votre accompagnement", texte: "Le suivi de la demande envoyée avec vos billets." },
    billets: { titre: "Vos billets", texte: "Le suivi de la réservation payée avec cette demande." },
    ouvrir: "Ouvrir ce suivi",
  },
  contact: { titre: "Une question ?", texte: (r) => `Un agent vous répond. Donnez-lui votre référence ${r}.`, ecrire: "Écrire à un agent", email: "E-mail", telephone: "Téléphone" },
  invalide: { metaTitre: "Ce lien n’est plus valable — Ouidah Heritage Tour", titre: "Ce lien n’est plus valable.", texte: "Il est peut-être incomplet, ou il a expiré. Écrivez-nous en donnant votre nom : un agent vous renvoie le bon lien.", ecrire: "Écrivez-nous :", devis: "Créer mon voyage" },
};

const en: TexteSuivi = {
  html: "en", locale: "en-GB",
  titre: ["Welcome to", "Benin"],
  doc: { paiement: "Payment ticket", boutique: "Order ticket", attente: "Quote request ticket", pret: "Quote ticket" },
  ticket: {
    no: "Ticket no.", date: "Date", voyageur: "Traveller", client: "Customer",
    evenement: "Event", dates: "Dates", formule: "Package", places: "Places",
    circuit: "Tour", projet: "Project", periode: "Period", voyageurs: "Travellers",
    article: "Item", reception: "Delivery",
    montant: "Amount", total: "Total", totalRegle: "Total paid", payeAvec: "Paid with", dansDevis: "in the quote",
  },
  projet: { voyage: "Tailor-made trip", groupe: "Group trip", question: "Question for an agent" },
  remise: { retrait: "Collection in Ouidah", livraison: "Delivery" },
  statut: { paye: "Paid", rembourse: "Refunded", attente: "Quote under review", pret: "Ready to pay", a_confirmer: "Received, to be confirmed", a_preparer: "Confirmed, being prepared", prete: "Ready", remise: "Handed over", annulee: "Cancelled" },
  reglementAgence: "Agency payment",
  enLigne: { payer: "Pay online", indisponible: "Online payment could not be opened. Please try again in a moment or message an agent." },
  titres: { paiement: "Payment confirmed", rembourse: "Booking refunded", boutique: "Order received", attente: "Quote request sent", pret: "Your quote is ready", regle: "Quote paid" },
  sous: {
    paiement: "Your ticket is printing. The QR code opens your receipt.",
    rembourse: "Your booking has been refunded. The QR code opens this page.",
    boutique: "Our team will confirm your order and get back to you very soon. The QR code opens its tracking page.",
    attente: "An agent is reviewing your request. The QR code opens its tracking page.",
    pret: "The QR code opens your quote. An agent is here to help.",
    regle: "Your quote has been paid. The QR code opens your quote.",
  },
  merci: { paiement: "Thank you. Welcome to {pays}", rembourse: "Thank you for your trust.", boutique: "Thank you for your order", attente: "Thank you, we’ll get back to you very soon.", pret: "Thank you. See you soon in {pays}", regle: "Thank you. See you soon in {pays}" },
  qr: {
    recu: "Scan to download your receipt (separate PDF document).",
    devis: "Scan to open your quote (separate PDF document).",
    attente: "Scan to track your request. The quote (separate document) will appear once an agent has approved it.",
    boutique: "Scan to track your order.",
    suivi: "Scan to come back to this page.",
    code: "QR code",
  },
  numero: { recu: "Receipt no.", devis: "Quote no." },
  actions: { recu: "Download the receipt", devis: "Download the quote", agent: "Message an agent" },
  billets: { titre: (n) => (n > 1 ? "Your entry tickets" : "Your entry ticket"), billet: (i, n) => `Ticket ${i} of ${n}`, numero: (x) => `No. ${x}`, entree: "Show at the entrance" },
  recap: { titre: "Summary", reference: "Reference", statut: "Status", transaction: "Transaction", payeLe: "Paid on" },
  documents: { titre: "Documents", recu: "Receipt", devis: "Quote", telecharger: "Download the PDF" },
  devis: { titre: "Your quote", quantite: "Quantity", prix: "Unit price", total: "Total", valable: (d) => `Valid until ${d}` },
  lie: {
    accompagnement: { titre: "Your travel services", texte: "Tracking for the request sent with your tickets." },
    billets: { titre: "Your tickets", texte: "Tracking for the booking paid with this request." },
    ouvrir: "Open tracking",
  },
  contact: { titre: "A question?", texte: (r) => `An agent will reply. Please quote your reference ${r}.`, ecrire: "Message an agent", email: "Email", telephone: "Phone" },
  invalide: { metaTitre: "This link is no longer valid — Ouidah Heritage Tour", titre: "This link is no longer valid.", texte: "It may be incomplete, or it may have expired. Write to us with your name and an agent will send you the right link.", ecrire: "Write to us:", devis: "Create my trip" },
};

const es: TexteSuivi = {
  html: "es", locale: "es-ES",
  titre: ["Bienvenidos a", "Benín"],
  doc: { paiement: "Ticket de pago", boutique: "Ticket de pedido", attente: "Ticket de solicitud de presupuesto", pret: "Ticket de presupuesto" },
  ticket: {
    no: "Ticket n.º", date: "Fecha", voyageur: "Viajero", client: "Cliente",
    evenement: "Evento", dates: "Fechas", formule: "Fórmula", places: "Plazas",
    circuit: "Circuito", projet: "Proyecto", periode: "Periodo", voyageurs: "Viajeros",
    article: "Artículo", reception: "Entrega",
    montant: "Importe", total: "Total", totalRegle: "Total pagado", payeAvec: "Pagado con", dansDevis: "en el presupuesto",
  },
  projet: { voyage: "Viaje a medida", groupe: "Viaje en grupo", question: "Pregunta a un agente" },
  remise: { retrait: "Recogida en Ouidah", livraison: "Envío" },
  statut: { paye: "Pagado", rembourse: "Reembolsado", attente: "Presupuesto en revisión", pret: "Listo para pagar", a_confirmer: "Recibido, por confirmar", a_preparer: "Confirmado, en preparación", prete: "Listo", remise: "Entregado", annulee: "Cancelado" },
  reglementAgence: "Pago en la agencia",
  enLigne: { payer: "Pagar en línea", indisponible: "No se pudo abrir el pago en línea. Inténtelo de nuevo en un momento o escriba a un agente." },
  titres: { paiement: "Pago confirmado", rembourse: "Reserva reembolsada", boutique: "Pedido recibido", attente: "Solicitud de presupuesto enviada", pret: "Su presupuesto está listo", regle: "Presupuesto pagado" },
  sous: {
    paiement: "Su ticket se está imprimiendo. El código QR abre su recibo.",
    rembourse: "Su reserva ha sido reembolsada. El código QR abre este seguimiento.",
    boutique: "El equipo confirmará su pedido y le responderá muy pronto. El código QR abre su seguimiento.",
    attente: "Un agente está revisando su solicitud. El código QR abre su seguimiento.",
    pret: "El código QR abre su presupuesto. Un agente queda a su disposición.",
    regle: "Su presupuesto está pagado. El código QR abre su presupuesto.",
  },
  merci: { paiement: "Gracias. Bienvenidos a {pays}", rembourse: "Gracias por su confianza.", boutique: "Gracias por su pedido", attente: "Gracias, le responderemos muy pronto.", pret: "Gracias. Hasta muy pronto en {pays}", regle: "Gracias. Hasta muy pronto en {pays}" },
  qr: {
    recu: "Escanee para descargar su recibo (documento PDF aparte).",
    devis: "Escanee para abrir su presupuesto (documento PDF aparte).",
    attente: "Escanee para seguir su solicitud. El presupuesto (documento aparte) aparecerá en cuanto un agente lo valide.",
    boutique: "Escanee para seguir su pedido.",
    suivi: "Escanee para volver a este seguimiento.",
    code: "Código QR",
  },
  numero: { recu: "Recibo n.º", devis: "Presupuesto n.º" },
  actions: { recu: "Descargar el recibo", devis: "Descargar el presupuesto", agent: "Escribir a un agente" },
  billets: { titre: (n) => (n > 1 ? "Sus entradas" : "Su entrada"), billet: (i, n) => `Entrada ${i} de ${n}`, numero: (x) => `N.º ${x}`, entree: "Presentar en la entrada" },
  recap: { titre: "Resumen", reference: "Referencia", statut: "Estado", transaction: "Transacción", payeLe: "Pagado el" },
  documents: { titre: "Documentos", recu: "Recibo", devis: "Presupuesto", telecharger: "Descargar el PDF" },
  devis: { titre: "Su presupuesto", quantite: "Cantidad", prix: "Precio unitario", total: "Total", valable: (d) => `Válido hasta el ${d}` },
  lie: {
    accompagnement: { titre: "Sus servicios de viaje", texte: "El seguimiento de la solicitud enviada con sus entradas." },
    billets: { titre: "Sus entradas", texte: "El seguimiento de la reserva pagada con esta solicitud." },
    ouvrir: "Abrir el seguimiento",
  },
  contact: { titre: "¿Una pregunta?", texte: (r) => `Un agente le responderá. Indique su referencia ${r}.`, ecrire: "Escribir a un agente", email: "Correo electrónico", telephone: "Teléfono" },
  invalide: { metaTitre: "Este enlace ya no es válido — Ouidah Heritage Tour", titre: "Este enlace ya no es válido.", texte: "Puede que esté incompleto o que haya caducado. Escríbanos indicando su nombre y un agente le enviará el enlace correcto.", ecrire: "Escríbanos:", devis: "Crear mi viaje" },
};

const de: TexteSuivi = {
  html: "de", locale: "de-DE",
  titre: ["Willkommen in", "Benin"],
  doc: { paiement: "Zahlungsticket", boutique: "Bestellticket", attente: "Ticket zur Angebotsanfrage", pret: "Angebotsticket" },
  ticket: {
    no: "Ticket-Nr.", date: "Datum", voyageur: "Gast", client: "Kunde",
    evenement: "Veranstaltung", dates: "Termin", formule: "Paket", places: "Plätze",
    circuit: "Tour", projet: "Projekt", periode: "Zeitraum", voyageurs: "Reisende",
    article: "Artikel", reception: "Zustellung",
    montant: "Betrag", total: "Gesamt", totalRegle: "Gesamt bezahlt", payeAvec: "Bezahlt mit", dansDevis: "im Angebot",
  },
  projet: { voyage: "Individuelle Reise", groupe: "Gruppenreise", question: "Frage an einen Mitarbeiter" },
  remise: { retrait: "Abholung in Ouidah", livraison: "Lieferung" },
  statut: { paye: "Bezahlt", rembourse: "Erstattet", attente: "Angebot in Prüfung", pret: "Zahlungsbereit", a_confirmer: "Eingegangen, Bestätigung folgt", a_preparer: "Bestätigt, in Vorbereitung", prete: "Abholbereit", remise: "Übergeben", annulee: "Storniert" },
  reglementAgence: "Zahlung in der Agentur",
  enLigne: { payer: "Online bezahlen", indisponible: "Die Online-Zahlung konnte nicht geöffnet werden. Versuchen Sie es gleich noch einmal oder kontaktieren Sie einen Mitarbeiter." },
  titres: { paiement: "Zahlung bestätigt", rembourse: "Buchung erstattet", boutique: "Bestellung eingegangen", attente: "Angebotsanfrage gesendet", pret: "Ihr Angebot ist fertig", regle: "Angebot bezahlt" },
  sous: {
    paiement: "Ihr Ticket wird gedruckt. Der QR-Code öffnet Ihren Beleg.",
    rembourse: "Ihre Buchung wurde erstattet. Der QR-Code öffnet diese Seite.",
    boutique: "Unser Team bestätigt Ihre Bestellung und meldet sich sehr bald. Der QR-Code öffnet die Statusseite.",
    attente: "Ein Mitarbeiter prüft Ihre Anfrage. Der QR-Code öffnet die Statusseite.",
    pret: "Der QR-Code öffnet Ihr Angebot. Ein Mitarbeiter ist für Sie da.",
    regle: "Ihr Angebot ist bezahlt. Der QR-Code öffnet Ihr Angebot.",
  },
  merci: { paiement: "Danke. Willkommen in {pays}", rembourse: "Danke für Ihr Vertrauen.", boutique: "Danke für Ihre Bestellung", attente: "Danke, wir melden uns sehr bald.", pret: "Danke. Bis bald in {pays}", regle: "Danke. Bis bald in {pays}" },
  qr: {
    recu: "Scannen, um Ihren Beleg herunterzuladen (separates PDF-Dokument).",
    devis: "Scannen, um Ihr Angebot zu öffnen (separates PDF-Dokument).",
    attente: "Scannen, um Ihre Anfrage zu verfolgen. Das Angebot (separates Dokument) erscheint, sobald ein Mitarbeiter es freigegeben hat.",
    boutique: "Scannen, um Ihre Bestellung zu verfolgen.",
    suivi: "Scannen, um diese Seite wieder zu öffnen.",
    code: "QR-Code",
  },
  numero: { recu: "Beleg Nr.", devis: "Angebot Nr." },
  actions: { recu: "Beleg herunterladen", devis: "Angebot herunterladen", agent: "Mitarbeiter kontaktieren" },
  billets: { titre: (n) => (n > 1 ? "Ihre Eintrittskarten" : "Ihre Eintrittskarte"), billet: (i, n) => `Karte ${i} von ${n}`, numero: (x) => `Nr. ${x}`, entree: "Am Eingang vorzeigen" },
  recap: { titre: "Übersicht", reference: "Referenz", statut: "Status", transaction: "Transaktion", payeLe: "Bezahlt am" },
  documents: { titre: "Dokumente", recu: "Beleg", devis: "Angebot", telecharger: "PDF herunterladen" },
  devis: { titre: "Ihr Angebot", quantite: "Menge", prix: "Einzelpreis", total: "Gesamt", valable: (d) => `Gültig bis ${d}` },
  lie: {
    accompagnement: { titre: "Ihre Reiseleistungen", texte: "Die Statusseite der Anfrage, die mit Ihren Karten gesendet wurde." },
    billets: { titre: "Ihre Eintrittskarten", texte: "Die Statusseite der Buchung, die mit dieser Anfrage bezahlt wurde." },
    ouvrir: "Statusseite öffnen",
  },
  contact: { titre: "Eine Frage?", texte: (r) => `Ein Mitarbeiter antwortet Ihnen. Bitte nennen Sie Ihre Referenz ${r}.`, ecrire: "Mitarbeiter kontaktieren", email: "E-Mail", telephone: "Telefon" },
  invalide: { metaTitre: "Dieser Link ist nicht mehr gültig — Ouidah Heritage Tour", titre: "Dieser Link ist nicht mehr gültig.", texte: "Er ist vielleicht unvollständig oder abgelaufen. Schreiben Sie uns mit Ihrem Namen, ein Mitarbeiter schickt Ihnen den richtigen Link.", ecrire: "Schreiben Sie uns:", devis: "Meine Reise planen" },
};

const pt: TexteSuivi = {
  html: "pt", locale: "pt-PT", formatMois: "long",
  titre: ["Bem-vindos ao", "Benin"],
  doc: { paiement: "Ticket de pagamento", boutique: "Ticket de encomenda", attente: "Ticket de pedido de orçamento", pret: "Ticket de orçamento" },
  ticket: {
    no: "Ticket n.º", date: "Data", voyageur: "Viajante", client: "Cliente",
    evenement: "Evento", dates: "Datas", formule: "Fórmula", places: "Lugares",
    circuit: "Circuito", projet: "Projeto", periode: "Período", voyageurs: "Viajantes",
    article: "Artigo", reception: "Entrega",
    montant: "Valor", total: "Total", totalRegle: "Total pago", payeAvec: "Pago com", dansDevis: "no orçamento",
  },
  projet: { voyage: "Viagem à medida", groupe: "Viagem de grupo", question: "Pergunta a um agente" },
  remise: { retrait: "Levantamento em Ouidah", livraison: "Entrega" },
  statut: { paye: "Pago", rembourse: "Reembolsado", attente: "Orçamento em verificação", pret: "Pronto a pagar", a_confirmer: "Recebida, a confirmar", a_preparer: "Confirmada, em preparação", prete: "Pronta", remise: "Entregue", annulee: "Cancelada" },
  reglementAgence: "Pagamento na agência",
  enLigne: { payer: "Pagar online", indisponible: "Não foi possível abrir o pagamento online. Tente novamente dentro de momentos ou fale com um agente." },
  titres: { paiement: "Pagamento confirmado", rembourse: "Reserva reembolsada", boutique: "Encomenda recebida", attente: "Pedido de orçamento enviado", pret: "O seu orçamento está pronto", regle: "Orçamento pago" },
  sous: {
    paiement: "O seu ticket está a ser impresso. O código QR abre o seu recibo.",
    rembourse: "A sua reserva foi reembolsada. O código QR abre este acompanhamento.",
    boutique: "A equipa confirma a sua encomenda e responde-lhe muito em breve. O código QR abre o acompanhamento.",
    attente: "Um agente está a verificar o seu pedido. O código QR abre o acompanhamento.",
    pret: "O código QR abre o seu orçamento. Um agente está ao seu dispor.",
    regle: "O seu orçamento está pago. O código QR abre o seu orçamento.",
  },
  merci: { paiement: "Obrigado. Bem-vindos ao {pays}", rembourse: "Obrigado pela sua confiança.", boutique: "Obrigado pela sua encomenda", attente: "Obrigado, entraremos em contacto muito em breve.", pret: "Obrigado. Até breve no {pays}", regle: "Obrigado. Até breve no {pays}" },
  qr: {
    recu: "Digitalize para descarregar o seu recibo (documento PDF à parte).",
    devis: "Digitalize para abrir o seu orçamento (documento PDF à parte).",
    attente: "Digitalize para acompanhar o seu pedido. O orçamento (documento à parte) aparecerá assim que um agente o validar.",
    boutique: "Digitalize para acompanhar a sua encomenda.",
    suivi: "Digitalize para voltar a este acompanhamento.",
    code: "Código QR",
  },
  numero: { recu: "Recibo n.º", devis: "Orçamento n.º" },
  actions: { recu: "Descarregar o recibo", devis: "Descarregar o orçamento", agent: "Falar com um agente" },
  billets: { titre: (n) => (n > 1 ? "Os seus bilhetes de entrada" : "O seu bilhete de entrada"), billet: (i, n) => `Bilhete ${i} de ${n}`, numero: (x) => `N.º ${x}`, entree: "Apresentar à entrada" },
  recap: { titre: "Resumo", reference: "Referência", statut: "Estado", transaction: "Transação", payeLe: "Pago em" },
  documents: { titre: "Documentos", recu: "Recibo", devis: "Orçamento", telecharger: "Descarregar o PDF" },
  devis: { titre: "O seu orçamento", quantite: "Quantidade", prix: "Preço unitário", total: "Total", valable: (d) => `Válido até ${d}` },
  lie: {
    accompagnement: { titre: "Os seus serviços de viagem", texte: "O acompanhamento do pedido enviado com os seus bilhetes." },
    billets: { titre: "Os seus bilhetes", texte: "O acompanhamento da reserva paga com este pedido." },
    ouvrir: "Abrir o acompanhamento",
  },
  contact: { titre: "Uma pergunta?", texte: (r) => `Um agente responde-lhe. Indique a sua referência ${r}.`, ecrire: "Falar com um agente", email: "E-mail", telephone: "Telefone" },
  invalide: { metaTitre: "Este link já não é válido — Ouidah Heritage Tour", titre: "Este link já não é válido.", texte: "Pode estar incompleto ou ter expirado. Escreva-nos com o seu nome e um agente envia-lhe o link certo.", ecrire: "Escreva-nos:", devis: "Criar a minha viagem" },
};

const ht: TexteSuivi = {
  html: "ht", locale: null,
  mois: ["janvye", "fevriye", "mas", "avril", "me", "jen", "jiyè", "out", "septanm", "oktòb", "novanm", "desanm"],
  titre: ["Byenvini nan", "Benen"],
  doc: { paiement: "Tikè peman", boutique: "Tikè kòmand", attente: "Tikè demann devi", pret: "Tikè devi" },
  ticket: {
    no: "Tikè nº", date: "Dat", voyageur: "Vwayajè", client: "Kliyan",
    evenement: "Evènman", dates: "Dat yo", formule: "Fòmil", places: "Plas",
    circuit: "Sikwi", projet: "Pwojè", periode: "Peryòd", voyageurs: "Vwayajè",
    article: "Atik", reception: "Livrezon",
    montant: "Montan", total: "Total", totalRegle: "Total peye", payeAvec: "Peye ak", dansDevis: "nan devi a",
  },
  projet: { voyage: "Vwayaj sou mezi", groupe: "Vwayaj an gwoup", question: "Kesyon pou yon ajan" },
  remise: { retrait: "Al chèche l Ouidah", livraison: "Livrezon" },
  statut: { paye: "Peye", rembourse: "Ranbouse", attente: "Devi an verifikasyon", pret: "Pare pou peye", a_confirmer: "Resevwa, pou konfime", a_preparer: "Konfime, n ap prepare l", prete: "Pare", remise: "Remèt", annulee: "Anile" },
  reglementAgence: "Peman nan ajans lan",
  enLigne: { payer: "Peye sou entènèt", indisponible: "Peman sou entènèt la pa t ka louvri. Eseye ankò nan yon ti moman oswa ekri yon ajan." },
  titres: { paiement: "Peman konfime", rembourse: "Rezèvasyon ranbouse", boutique: "Kòmand resevwa", attente: "Demann devi voye", pret: "Devi ou pare", regle: "Devi peye" },
  sous: {
    paiement: "Tikè ou ap enprime. Kòd QR la ouvri resi ou.",
    rembourse: "Rezèvasyon ou ranbouse. Kòd QR la ouvri swivi sa a.",
    boutique: "Ekip la ap konfime kòmand ou epi l ap reponn ou trè vit. Kòd QR la ouvri swivi li.",
    attente: "Yon ajan ap verifye demann ou. Kòd QR la ouvri swivi li.",
    pret: "Kòd QR la ouvri devi ou. Yon ajan la pou ede w.",
    regle: "Devi ou peye. Kòd QR la ouvri devi ou.",
  },
  merci: { paiement: "Mèsi. Byenvini nan {pays}", rembourse: "Mèsi paske ou fè nou konfyans.", boutique: "Mèsi pou kòmand ou", attente: "Mèsi, n ap reponn ou trè vit.", pret: "Mèsi. A byento nan {pays}", regle: "Mèsi. A byento nan {pays}" },
  qr: {
    recu: "Eskane pou telechaje resi ou (dokiman PDF apa).",
    devis: "Eskane pou ouvri devi ou (dokiman PDF apa).",
    attente: "Eskane pou swiv demann ou. Devi a (dokiman apa) ap parèt depi yon ajan valide l.",
    boutique: "Eskane pou swiv kòmand ou.",
    suivi: "Eskane pou retounen sou swivi sa a.",
    code: "Kòd QR",
  },
  numero: { recu: "Resi nº", devis: "Devi nº" },
  actions: { recu: "Telechaje resi a", devis: "Telechaje devi a", agent: "Ekri yon ajan" },
  billets: { titre: (n) => (n > 1 ? "Tikè antre ou yo" : "Tikè antre ou"), billet: (i, n) => `Tikè ${i} sou ${n}`, numero: (x) => `Nº ${x}`, entree: "Pou montre nan antre a" },
  recap: { titre: "Rezime", reference: "Referans", statut: "Estati", transaction: "Tranzaksyon", payeLe: "Peye le" },
  documents: { titre: "Dokiman", recu: "Resi", devis: "Devi", telecharger: "Telechaje PDF la" },
  devis: { titre: "Devi ou", quantite: "Kantite", prix: "Pri inite", total: "Total", valable: (d) => `Valab jiska ${d}` },
  lie: {
    accompagnement: { titre: "Sèvis vwayaj ou", texte: "Swivi demann ki pati ak tikè ou yo." },
    billets: { titre: "Tikè ou yo", texte: "Swivi rezèvasyon ki peye ak demann sa a." },
    ouvrir: "Ouvri swivi a",
  },
  contact: { titre: "Ou gen yon kesyon?", texte: (r) => `Yon ajan ap reponn ou. Ba li referans ou: ${r}.`, ecrire: "Ekri yon ajan", email: "Imèl", telephone: "Telefòn" },
  invalide: { metaTitre: "Lyen sa a pa valab ankò — Ouidah Heritage Tour", titre: "Lyen sa a pa valab ankò.", texte: "Petèt li pa konplè, oswa li ekspire. Ekri nou ak non ou, yon ajan ap voye bon lyen an ba ou.", ecrire: "Ekri nou:", devis: "Kreye vwayaj mwen" },
};

const gcf: TexteSuivi = {
  html: "gcf", locale: null,
  mois: ["janvyé", "févryé", "mas", "avril", "mé", "jen", "jiyé", "out", "sèptanm", "oktòb", "novanm", "désanm"],
  titre: ["Byenvini an", "Benen"],
  doc: { paiement: "Tikè pèman", boutique: "Tikè kòmand", attente: "Tikè dimann dévi", pret: "Tikè dévi" },
  ticket: {
    no: "Tikè nº", date: "Dat", voyageur: "Vwayajè", client: "Kliyan",
    evenement: "Évènman", dates: "Dat", formule: "Fòmil", places: "Plas",
    circuit: "Sikwi", projet: "Pwojè", periode: "Péryòd", voyageurs: "Vwayajè",
    article: "Atik", reception: "Livrézon",
    montant: "Montan", total: "Total", totalRegle: "Total péyé", payeAvec: "Péyé épi", dansDevis: "adan dévi a",
  },
  projet: { voyage: "Vwayaj asi mizi", groupe: "Vwayaj an gwoup", question: "Kèsyon pou on ajan" },
  remise: { retrait: "Vin chèché-y Ouidah", livraison: "Livrézon" },
  statut: { paye: "Péyé", rembourse: "Ranbousé", attente: "Dévi an vérifikasyon", pret: "Paré pou péyé", a_confirmer: "Rousouvwè, pou konfirmé", a_preparer: "Konfirmé, ka prépawé", prete: "Paré", remise: "Rimèt", annulee: "Anilé" },
  reglementAgence: "Péman an ajans-la",
  enLigne: { payer: "Péyé asi entènèt", indisponible: "Péman asi entènèt-la pa té pé ouvè. Éséyé ankò adan on ti moman oben ékri on ajan." },
  titres: { paiement: "Pèman konfirmé", rembourse: "Rézèvasyon ranbousé", boutique: "Kòmand rousouvwè", attente: "Dimann dévi voyé", pret: "Dévi a-w paré", regle: "Dévi péyé" },
  sous: {
    paiement: "Tikè a-w ka enprimé. Kòd QR la ka ouvè rési a-w.",
    rembourse: "Rézèvasyon a-w ranbousé. Kòd QR la ka ouvè swivi-lasa.",
    boutique: "Lékip la ké konfirmé kòmand a-w é ké réponn-vou vitman. Kòd QR la ka ouvè swivi a-y.",
    attente: "On ajan ka vérifyé dimann a-w. Kòd QR la ka ouvè swivi a-y.",
    pret: "Kòd QR la ka ouvè dévi a-w. On ajan la pou édé-w.",
    regle: "Dévi a-w péyé. Kòd QR la ka ouvè dévi a-w.",
  },
  merci: { paiement: "Mèsi. Byenvini an {pays}", rembourse: "Mèsi pou konfyans a-w.", boutique: "Mèsi pou kòmand a-w", attente: "Mèsi, nou ké réponn-vou vitman.", pret: "Mèsi. A biento an {pays}", regle: "Mèsi. A biento an {pays}" },
  qr: {
    recu: "Èskanné pou téléchajé rési a-w (dokiman PDF apa).",
    devis: "Èskanné pou ouvè dévi a-w (dokiman PDF apa).",
    attente: "Èskanné pou swiv dimann a-w. Dévi a (dokiman apa) ké parèt lè on ajan ké validé-y.",
    boutique: "Èskanné pou swiv kòmand a-w.",
    suivi: "Èskanné pou rouvè swivi-lasa.",
    code: "Kòd QR",
  },
  numero: { recu: "Rési nº", devis: "Dévi nº" },
  actions: { recu: "Téléchajé rési a", devis: "Téléchajé dévi a", agent: "Ékri on ajan" },
  billets: { titre: () => "Tikè antré a-w", billet: (i, n) => `Tikè ${i} asi ${n}`, numero: (x) => `Nº ${x}`, entree: "Pou montré lantré" },
  recap: { titre: "Rézimé", reference: "Référans", statut: "Éta", transaction: "Tranzaksyon", payeLe: "Péyé lé" },
  documents: { titre: "Dokiman", recu: "Rési", devis: "Dévi", telecharger: "Téléchajé PDF-la" },
  devis: { titre: "Dévi a-w", quantite: "Kantité", prix: "Pri inité", total: "Total", valable: (d) => `Valab jis ${d}` },
  lie: {
    accompagnement: { titre: "Sèvis vwayaj a-w", texte: "Swivi a dimann-la ki pati épi tikè a-w." },
    billets: { titre: "Tikè a-w", texte: "Swivi a rézèvasyon-la ki péyé épi dimann-lasa." },
    ouvrir: "Ouvè swivi-la",
  },
  contact: { titre: "On kèsyon?", texte: (r) => `On ajan ké réponn-vou. Ba-y référans a-w: ${r}.`, ecrire: "Ékri on ajan", email: "Imèl", telephone: "Téléfòn" },
  invalide: { metaTitre: "Lyen-tala pa valid ankò — Ouidah Heritage Tour", titre: "Lyen-tala pa valid ankò.", texte: "Pétèt i pa konplè, oben i èkspiré. Ékri nou èvè non a-w, on ajan ké voyé-w bon lyen-la.", ecrire: "Ékri nou :", devis: "Kréyé vwayaj mwen" },
};

export const suivi: Record<LangueDoc, TexteSuivi> = { FR: fr, EN: en, ES: es, DE: de, PT: pt, HT: ht, GCF: gcf };

// ——— Signature en ligne du devis (/suivi/<jeton>/signer, maquette E « signer » validée le 03/11/2026) ———
// Dans la langue de la demande. `ecran` ne contient que des chaînes (passées au navigateur) : {x} est remplacé à
// l'affichage. « Arrêté le présent devis à la somme de… » : montant en lettres en français seulement (lettres: null
// ailleurs, la phrase n'est pas affichée). HT, GCF et PT : à relire par un locuteur.
export type TexteEcranSigner = {
  titre: string; nom: string; facon: string; tracer: string; taper: string; signature: string; effacer: string; invite: string; tapee: string;
  accord: string; bouton: string; envoi: string; barre: string; heure: string;
  aide: { manque: readonly [string, string]; et: string; nom: string; signature: string; accord: string; pret: string; expire: string };
  erreurs: Record<"incomplet" | "lien" | "deja" | "expire" | "limite" | "base", string>;
  client: { aSigner: string; signe: string; vide: string; role: string; attente: string; le: string; a: string; pied: string; piedSigne: string; alt: string };
  signe: { etat: string; titre: string; par: string; tapee: string; quand: string; le: string; empreinte: string; verification: string; telecharger: string };
};
export type TexteSigner = {
  lien: string; // bouton de la page de suivi
  onglet: string; devis: string; emis: string; preparePour: string; sejour: string; valable: string;
  nuits: (n: number) => string;
  personnes: (adultes: number, enfants: number) => string;
  etape: string; designation: string; montant: string; etapeUne: string; etapesDeA: string; a: string;
  total: string; lettres: string | null; demande: string; bonPourAccord: string;
  direction: { titre: string; role: string; signature: string; cachet: string; pied: string };
  verifier: string;
  carte: { aria: string; sans: string; ocean: string; lagune: string; parcours: string };
  ecran: TexteEcranSigner;
};
const liste = (...p: string[]) => p.filter(Boolean).join(", ");

const signerFr: TexteSigner = {
  lien: "Signer mon devis", onglet: "Signer le devis {numero}", devis: "Devis", emis: "Émis le {date}", preparePour: "Préparé pour", sejour: "Séjour", valable: "valable jusqu’au {date}",
  nuits: (n) => (n > 1 ? `${n} nuits` : "1 nuit"),
  personnes: (a, e) => liste(a ? `${a} adulte${a > 1 ? "s" : ""}` : "", e ? `${e} enfant${e > 1 ? "s" : ""}` : ""),
  etape: "Étape", designation: "Désignation", montant: "Montant (FCFA)", etapeUne: "Étape {n}", etapesDeA: "Étapes {a} à {b}", a: "à",
  total: "Total du séjour", lettres: "Arrêté le présent devis à la somme de {somme}.", demande: "Demande", bonPourAccord: "Bon pour accord",
  direction: { titre: "La Direction générale", role: "Présidente", signature: "signature", cachet: "cachet", pied: "Signature et cachet de l’entreprise" },
  verifier: "Vérifier ce devis :",
  carte: { aria: "Carte du séjour, nord en haut : {etapes}", sans: "Carte de Ouidah, nord en haut", ocean: "Océan Atlantique", lagune: "Lagune", parcours: "Parcours à pied, {km} km" },
  ecran: {
    titre: "Signer le devis", nom: "Votre nom", facon: "Façon de signer", tracer: "Tracer", taper: "Taper ma signature", signature: "Votre signature", effacer: "Effacer",
    invite: "Signez ici, à la souris ou au doigt", tapee: "Signature tapée", accord: "J’accepte ce devis et le signe électroniquement", bouton: "Signer le devis",
    envoi: "Signature en cours…", barre: "Signer le devis · {montant}", heure: "{h} h {m}",
    aide: { manque: ["Il manque {liste}.", "Il manque {liste}."], et: "et", nom: "votre nom", signature: "votre signature", accord: "la case d’accord", pret: "Tout est prêt : vous pouvez signer.", expire: "Ce devis n’est plus valable. Écrivez à un agent pour le renouveler." },
    erreurs: {
      incomplet: "Il manque une information : vérifiez le nom, la signature et la case d’accord.",
      lien: "Ce devis ne peut plus être signé depuis ce lien. Écrivez à un agent.",
      deja: "Ce devis est déjà signé.",
      expire: "Ce devis n’est plus valable. Écrivez à un agent pour le renouveler.",
      limite: "Trop d’essais depuis cette connexion. Réessayez dans une heure.",
      base: "La signature n’a pas pu être enregistrée. Réessayez dans un instant.",
    },
    client: { aSigner: "À signer", signe: "Signé", vide: "votre signature", role: "Signataire", attente: "En attente de votre signature", le: "Signé électroniquement le {jour}", a: "à {heure} (UTC+1)", pied: "L’empreinte du devis émis s’ajoute à la signature.", piedSigne: "Empreinte du devis émis :", alt: "Signature de {nom}" },
    signe: { etat: "Signé", titre: "Devis signé", par: "Signé par", tapee: "(signature tapée)", quand: "Date et heure", le: "{jour} à {heure} (UTC+1)", empreinte: "Empreinte SHA-256 du devis émis", verification: "Vérification", telecharger: "Télécharger le devis (PDF)" },
  },
};

const signerEn: TexteSigner = {
  lien: "Sign my quote", onglet: "Sign quote {numero}", devis: "Quote", emis: "Issued on {date}", preparePour: "Prepared for", sejour: "Stay", valable: "valid until {date}",
  nuits: (n) => (n > 1 ? `${n} nights` : "1 night"),
  personnes: (a, e) => liste(a ? `${a} adult${a > 1 ? "s" : ""}` : "", e ? `${e} ${e > 1 ? "children" : "child"}` : ""),
  etape: "Stop", designation: "Description", montant: "Amount (FCFA)", etapeUne: "Stop {n}", etapesDeA: "Stops {a} to {b}", a: "to",
  total: "Total for the stay", lettres: null, demande: "Request", bonPourAccord: "Agreed and accepted",
  direction: { titre: "General Management", role: "President", signature: "signature", cachet: "stamp", pied: "Company signature and stamp" },
  verifier: "Verify this quote:",
  carte: { aria: "Map of the stay, north at the top: {etapes}", sans: "Map of Ouidah, north at the top", ocean: "Atlantic Ocean", lagune: "Lagoon", parcours: "Walking route, {km} km" },
  ecran: {
    titre: "Sign the quote", nom: "Your name", facon: "How to sign", tracer: "Draw", taper: "Type my signature", signature: "Your signature", effacer: "Clear",
    invite: "Sign here with your mouse or finger", tapee: "Typed signature", accord: "I accept this quote and sign it electronically", bouton: "Sign the quote",
    envoi: "Signing…", barre: "Sign the quote · {montant}", heure: "{h}:{m}",
    aide: { manque: ["Still missing: {liste}.", "Still missing: {liste}."], et: "and", nom: "your name", signature: "your signature", accord: "the consent box", pret: "All set: you can sign.", expire: "This quote is no longer valid. Message an agent to renew it." },
    erreurs: {
      incomplet: "Something is missing: check your name, your signature and the consent box.",
      lien: "This quote can no longer be signed from this link. Message an agent.",
      deja: "This quote has already been signed.",
      expire: "This quote is no longer valid. Message an agent to renew it.",
      limite: "Too many attempts from this connection. Please try again in an hour.",
      base: "Your signature could not be saved. Please try again in a moment.",
    },
    client: { aSigner: "To sign", signe: "Signed", vide: "your signature", role: "Signatory", attente: "Awaiting your signature", le: "Signed electronically on {jour}", a: "at {heure} (UTC+1)", pied: "The fingerprint of the issued quote is added to the signature.", piedSigne: "Fingerprint of the issued quote:", alt: "Signature of {nom}" },
    signe: { etat: "Signed", titre: "Quote signed", par: "Signed by", tapee: "(typed signature)", quand: "Date and time", le: "{jour} at {heure} (UTC+1)", empreinte: "SHA-256 fingerprint of the issued quote", verification: "Verification", telecharger: "Download the quote (PDF)" },
  },
};

const signerEs: TexteSigner = {
  lien: "Firmar mi presupuesto", onglet: "Firmar el presupuesto {numero}", devis: "Presupuesto", emis: "Emitido el {date}", preparePour: "Preparado para", sejour: "Estancia", valable: "válido hasta el {date}",
  nuits: (n) => (n > 1 ? `${n} noches` : "1 noche"),
  personnes: (a, e) => liste(a ? `${a} adulto${a > 1 ? "s" : ""}` : "", e ? `${e} niño${e > 1 ? "s" : ""}` : ""),
  etape: "Etapa", designation: "Concepto", montant: "Importe (FCFA)", etapeUne: "Etapa {n}", etapesDeA: "Etapas {a} a {b}", a: "a",
  total: "Total de la estancia", lettres: null, demande: "Solicitud", bonPourAccord: "Conforme",
  direction: { titre: "La Dirección General", role: "Presidenta", signature: "firma", cachet: "sello", pied: "Firma y sello de la empresa" },
  verifier: "Verificar este presupuesto:",
  carte: { aria: "Mapa de la estancia, norte arriba: {etapes}", sans: "Mapa de Ouidah, norte arriba", ocean: "Océano Atlántico", lagune: "Laguna", parcours: "Recorrido a pie, {km} km" },
  ecran: {
    titre: "Firmar el presupuesto", nom: "Su nombre", facon: "Forma de firmar", tracer: "Dibujar", taper: "Escribir mi firma", signature: "Su firma", effacer: "Borrar",
    invite: "Firme aquí con el ratón o con el dedo", tapee: "Firma escrita", accord: "Acepto este presupuesto y lo firmo electrónicamente", bouton: "Firmar el presupuesto",
    envoi: "Firmando…", barre: "Firmar el presupuesto · {montant}", heure: "{h}:{m}",
    aide: { manque: ["Falta {liste}.", "Faltan {liste}."], et: "y", nom: "su nombre", signature: "su firma", accord: "la casilla de aceptación", pret: "Todo listo: puede firmar.", expire: "Este presupuesto ya no es válido. Escriba a un agente para renovarlo." },
    erreurs: {
      incomplet: "Falta un dato: revise el nombre, la firma y la casilla de aceptación.",
      lien: "Este presupuesto ya no se puede firmar desde este enlace. Escriba a un agente.",
      deja: "Este presupuesto ya está firmado.",
      expire: "Este presupuesto ya no es válido. Escriba a un agente para renovarlo.",
      limite: "Demasiados intentos desde esta conexión. Vuelva a intentarlo dentro de una hora.",
      base: "No se pudo guardar la firma. Vuelva a intentarlo en un momento.",
    },
    client: { aSigner: "Por firmar", signe: "Firmado", vide: "su firma", role: "Firmante", attente: "Pendiente de su firma", le: "Firmado electrónicamente el {jour}", a: "a las {heure} (UTC+1)", pied: "La huella del presupuesto emitido se añade a la firma.", piedSigne: "Huella del presupuesto emitido:", alt: "Firma de {nom}" },
    signe: { etat: "Firmado", titre: "Presupuesto firmado", par: "Firmado por", tapee: "(firma escrita)", quand: "Fecha y hora", le: "{jour} a las {heure} (UTC+1)", empreinte: "Huella SHA-256 del presupuesto emitido", verification: "Verificación", telecharger: "Descargar el presupuesto (PDF)" },
  },
};

const signerDe: TexteSigner = {
  lien: "Mein Angebot unterschreiben", onglet: "Angebot {numero} unterschreiben", devis: "Angebot", emis: "Ausgestellt am {date}", preparePour: "Erstellt für", sejour: "Aufenthalt", valable: "gültig bis {date}",
  nuits: (n) => (n > 1 ? `${n} Nächte` : "1 Nacht"),
  personnes: (a, e) => liste(a ? (a > 1 ? `${a} Erwachsene` : "1 Erwachsener") : "", e ? (e > 1 ? `${e} Kinder` : "1 Kind") : ""),
  etape: "Etappe", designation: "Bezeichnung", montant: "Betrag (FCFA)", etapeUne: "Etappe {n}", etapesDeA: "Etappen {a} bis {b}", a: "bis",
  total: "Gesamtbetrag des Aufenthalts", lettres: null, demande: "Anfrage", bonPourAccord: "Einverstanden",
  direction: { titre: "Die Geschäftsführung", role: "Präsidentin", signature: "Unterschrift", cachet: "Stempel", pied: "Unterschrift und Stempel des Unternehmens" },
  verifier: "Dieses Angebot prüfen:",
  carte: { aria: "Karte des Aufenthalts, Norden oben: {etapes}", sans: "Karte von Ouidah, Norden oben", ocean: "Atlantischer Ozean", lagune: "Lagune", parcours: "Fußweg, {km} km" },
  ecran: {
    titre: "Angebot unterschreiben", nom: "Ihr Name", facon: "Art der Unterschrift", tracer: "Zeichnen", taper: "Unterschrift tippen", signature: "Ihre Unterschrift", effacer: "Löschen",
    invite: "Hier mit Maus oder Finger unterschreiben", tapee: "Getippte Unterschrift", accord: "Ich nehme dieses Angebot an und unterschreibe es elektronisch", bouton: "Angebot unterschreiben",
    envoi: "Wird unterschrieben…", barre: "Angebot unterschreiben · {montant}", heure: "{h}:{m}",
    aide: { manque: ["Es fehlt {liste}.", "Es fehlen {liste}."], et: "und", nom: "Ihr Name", signature: "Ihre Unterschrift", accord: "die Zustimmung", pret: "Alles bereit: Sie können unterschreiben.", expire: "Dieses Angebot ist nicht mehr gültig. Kontaktieren Sie einen Mitarbeiter, um es zu erneuern." },
    erreurs: {
      incomplet: "Eine Angabe fehlt: Prüfen Sie Name, Unterschrift und Zustimmung.",
      lien: "Dieses Angebot kann über diesen Link nicht mehr unterschrieben werden. Kontaktieren Sie einen Mitarbeiter.",
      deja: "Dieses Angebot ist bereits unterschrieben.",
      expire: "Dieses Angebot ist nicht mehr gültig. Kontaktieren Sie einen Mitarbeiter, um es zu erneuern.",
      limite: "Zu viele Versuche von dieser Verbindung. Bitte versuchen Sie es in einer Stunde erneut.",
      base: "Die Unterschrift konnte nicht gespeichert werden. Bitte versuchen Sie es gleich noch einmal.",
    },
    client: { aSigner: "Zu unterschreiben", signe: "Unterschrieben", vide: "Ihre Unterschrift", role: "Unterzeichnende Person", attente: "Wartet auf Ihre Unterschrift", le: "Elektronisch unterschrieben am {jour}", a: "um {heure} Uhr (UTC+1)", pied: "Die Prüfsumme des ausgestellten Angebots wird der Unterschrift beigefügt.", piedSigne: "Prüfsumme des ausgestellten Angebots:", alt: "Unterschrift von {nom}" },
    signe: { etat: "Unterschrieben", titre: "Angebot unterschrieben", par: "Unterschrieben von", tapee: "(getippte Unterschrift)", quand: "Datum und Uhrzeit", le: "{jour} um {heure} Uhr (UTC+1)", empreinte: "SHA-256-Prüfsumme des ausgestellten Angebots", verification: "Prüfung", telecharger: "Angebot herunterladen (PDF)" },
  },
};

// à relire (PT, portugais d'Europe comme le reste du suivi)
const signerPt: TexteSigner = {
  lien: "Assinar o meu orçamento", onglet: "Assinar o orçamento {numero}", devis: "Orçamento", emis: "Emitido em {date}", preparePour: "Preparado para", sejour: "Estadia", valable: "válido até {date}",
  nuits: (n) => (n > 1 ? `${n} noites` : "1 noite"),
  personnes: (a, e) => liste(a ? `${a} adulto${a > 1 ? "s" : ""}` : "", e ? `${e} criança${e > 1 ? "s" : ""}` : ""),
  etape: "Etapa", designation: "Designação", montant: "Montante (FCFA)", etapeUne: "Etapa {n}", etapesDeA: "Etapas {a} a {b}", a: "a",
  total: "Total da estadia", lettres: null, demande: "Pedido", bonPourAccord: "Aceite",
  direction: { titre: "A Direção-Geral", role: "Presidente", signature: "assinatura", cachet: "carimbo", pied: "Assinatura e carimbo da empresa" },
  verifier: "Verificar este orçamento:",
  carte: { aria: "Mapa da estadia, norte em cima: {etapes}", sans: "Mapa de Ouidah, norte em cima", ocean: "Oceano Atlântico", lagune: "Lagoa", parcours: "Percurso a pé, {km} km" },
  ecran: {
    titre: "Assinar o orçamento", nom: "O seu nome", facon: "Forma de assinar", tracer: "Desenhar", taper: "Escrever a minha assinatura", signature: "A sua assinatura", effacer: "Apagar",
    invite: "Assine aqui com o rato ou com o dedo", tapee: "Assinatura escrita", accord: "Aceito este orçamento e assino-o eletronicamente", bouton: "Assinar o orçamento",
    envoi: "A assinar…", barre: "Assinar o orçamento · {montant}", heure: "{h}h{m}",
    aide: { manque: ["Falta {liste}.", "Faltam {liste}."], et: "e", nom: "o seu nome", signature: "a sua assinatura", accord: "a caixa de aceitação", pret: "Tudo pronto: pode assinar.", expire: "Este orçamento já não é válido. Fale com um agente para o renovar." },
    erreurs: {
      incomplet: "Falta um dado: verifique o nome, a assinatura e a caixa de aceitação.",
      lien: "Este orçamento já não pode ser assinado a partir deste link. Fale com um agente.",
      deja: "Este orçamento já está assinado.",
      expire: "Este orçamento já não é válido. Fale com um agente para o renovar.",
      limite: "Demasiadas tentativas a partir desta ligação. Tente novamente dentro de uma hora.",
      base: "Não foi possível guardar a assinatura. Tente novamente dentro de momentos.",
    },
    client: { aSigner: "Por assinar", signe: "Assinado", vide: "a sua assinatura", role: "Signatário", attente: "A aguardar a sua assinatura", le: "Assinado eletronicamente em {jour}", a: "às {heure} (UTC+1)", pied: "O hash do orçamento emitido junta-se à assinatura.", piedSigne: "Hash do orçamento emitido:", alt: "Assinatura de {nom}" },
    signe: { etat: "Assinado", titre: "Orçamento assinado", par: "Assinado por", tapee: "(assinatura escrita)", quand: "Data e hora", le: "{jour} às {heure} (UTC+1)", empreinte: "Hash SHA-256 do orçamento emitido", verification: "Verificação", telecharger: "Descarregar o orçamento (PDF)" },
  },
};

// à relire (créole haïtien)
const signerHt: TexteSigner = {
  lien: "Siyen devi m", onglet: "Siyen devi {numero}", devis: "Devi", emis: "Pibliye {date}", preparePour: "Prepare pou", sejour: "Sejou", valable: "valab jiska {date}",
  nuits: (n) => `${n} nwit`,
  personnes: (a, e) => liste(a ? `${a} granmoun` : "", e ? `${e} timoun` : ""),
  etape: "Etap", designation: "Deziyasyon", montant: "Montan (FCFA)", etapeUne: "Etap {n}", etapesDeA: "Etap {a} rive {b}", a: "rive",
  total: "Total sejou a", lettres: null, demande: "Demann", bonPourAccord: "Bon pou dakò",
  direction: { titre: "Direksyon jeneral", role: "Prezidan", signature: "siyati", cachet: "so", pied: "Siyati ak so antrepriz la" },
  verifier: "Verifye devi sa a:",
  carte: { aria: "Kat sejou a, nò anlè: {etapes}", sans: "Kat Ouidah, nò anlè", ocean: "Oseyan Atlantik", lagune: "Lagon", parcours: "Wout a pye, {km} km" },
  ecran: {
    titre: "Siyen devi a", nom: "Non ou", facon: "Fason pou siyen", tracer: "Trase", taper: "Tape siyati m", signature: "Siyati ou", effacer: "Efase",
    invite: "Siyen la a ak sourit la oswa ak dwèt ou", tapee: "Siyati tape", accord: "Mwen aksepte devi sa a epi m siyen l elektwonikman", bouton: "Siyen devi a",
    envoi: "N ap siyen…", barre: "Siyen devi a · {montant}", heure: "{h}h{m}",
    aide: { manque: ["Li manke {liste}.", "Li manke {liste}."], et: "ak", nom: "non ou", signature: "siyati ou", accord: "kaz dakò a", pret: "Tout bagay pare: ou ka siyen.", expire: "Devi sa a pa valab ankò. Ekri yon ajan pou renouvle l." },
    erreurs: {
      incomplet: "Gen yon enfòmasyon ki manke: verifye non an, siyati a ak kaz dakò a.",
      lien: "Ou pa ka siyen devi sa a ankò ak lyen sa a. Ekri yon ajan.",
      deja: "Devi sa a deja siyen.",
      expire: "Devi sa a pa valab ankò. Ekri yon ajan pou renouvle l.",
      limite: "Twòp eseye depi koneksyon sa a. Eseye ankò nan inèdtan.",
      base: "Nou pa t ka anrejistre siyati a. Eseye ankò nan yon ti moman.",
    },
    client: { aSigner: "Pou siyen", signe: "Siyen", vide: "siyati ou", role: "Moun ki siyen", attente: "N ap tann siyati ou", le: "Siyen elektwonikman le {jour}", a: "a {heure} (UTC+1)", pied: "Anprent devi ki pibliye a ajoute sou siyati a.", piedSigne: "Anprent devi ki pibliye a:", alt: "Siyati {nom}" },
    signe: { etat: "Siyen", titre: "Devi siyen", par: "Siyen pa", tapee: "(siyati tape)", quand: "Dat ak lè", le: "{jour} a {heure} (UTC+1)", empreinte: "Anprent SHA-256 devi ki pibliye a", verification: "Verifikasyon", telecharger: "Telechaje devi a (PDF)" },
  },
};

// à relire (créole guadeloupéen)
const signerGcf: TexteSigner = {
  lien: "Siyé dévi an mwen", onglet: "Siyé dévi {numero}", devis: "Dévi", emis: "Pibliyé {date}", preparePour: "Prépawé pou", sejour: "Séjou", valable: "valab jis {date}",
  nuits: (n) => `${n} lannuit`,
  personnes: (a, e) => liste(a ? `${a} gran moun` : "", e ? `${e} timoun` : ""),
  etape: "Étap", designation: "Dézinyasyon", montant: "Montan (FCFA)", etapeUne: "Étap {n}", etapesDeA: "Étap {a} jis {b}", a: "jis",
  total: "Total a séjou-la", lettres: null, demande: "Dimann", bonPourAccord: "Bon pou dakò",
  direction: { titre: "Dirèksyon jénéral", role: "Prézidan", signature: "siyati", cachet: "tanpon", pied: "Siyati é tanpon a lantrépriz-la" },
  verifier: "Vérifyé dévi-lasa:",
  carte: { aria: "Kat a séjou-la, nò anlè: {etapes}", sans: "Kat a Ouidah, nò anlè", ocean: "Océyan Atlantik", lagune: "Lagon", parcours: "Chimen a pyé, {km} km" },
  ecran: {
    titre: "Siyé dévi a", nom: "Non a-w", facon: "Fason pou siyé", tracer: "Trasé", taper: "Tapé siyati an mwen", signature: "Siyati a-w", effacer: "Éfasé",
    invite: "Siyé isi, épi sourit-la oben épi dwèt a-w", tapee: "Siyati tapé", accord: "An ka aksèpté dévi-lasa é an ka siyé-y élèktwonikman", bouton: "Siyé dévi a",
    envoi: "Nou ka siyé…", barre: "Siyé dévi a · {montant}", heure: "{h}h{m}",
    aide: { manque: ["I ka manké {liste}.", "I ka manké {liste}."], et: "é", nom: "non a-w", signature: "siyati a-w", accord: "kaz dakò-la", pret: "Tout bagay paré: ou pé siyé.", expire: "Dévi-lasa pa valab ankò. Ékri on ajan pou rounouvlé-y." },
    erreurs: {
      incomplet: "I ka manké on enfòwmasyon: vérifyé non-la, siyati-la é kaz dakò-la.",
      lien: "Ou pa pé siyé dévi-lasa ankò épi lyen-lasa. Ékri on ajan.",
      deja: "Dévi-lasa ja siyé.",
      expire: "Dévi-lasa pa valab ankò. Ékri on ajan pou rounouvlé-y.",
      limite: "Two otan ésé dèpi konèksyon-lasa. Ésèyé ankò adan on lè.",
      base: "Nou pa té pé anréjistré siyati-la. Ésèyé ankò adan on ti moman.",
    },
    client: { aSigner: "Pou siyé", signe: "Siyé", vide: "siyati a-w", role: "Moun-la ki ka siyé", attente: "Nou ka atann siyati a-w", le: "Siyé élèktwonikman lé {jour}", a: "a {heure} (UTC+1)", pied: "Lanprent a dévi-la ki pibliyé ka ajouté asi siyati-la.", piedSigne: "Lanprent a dévi-la ki pibliyé:", alt: "Siyati a {nom}" },
    signe: { etat: "Siyé", titre: "Dévi siyé", par: "Siyé pa", tapee: "(siyati tapé)", quand: "Dat é lè", le: "{jour} a {heure} (UTC+1)", empreinte: "Lanprent SHA-256 a dévi-la ki pibliyé", verification: "Vérifikasyon", telecharger: "Téléchajé dévi a (PDF)" },
  },
};

export const signer: Record<LangueDoc, TexteSigner> = { FR: signerFr, EN: signerEn, ES: signerEs, DE: signerDe, PT: signerPt, HT: signerHt, GCF: signerGcf };
