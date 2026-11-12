import type { LangueDoc } from "@/lib/suivi";

export const relancesEquipe = {
  titre: "Relances de paiement",
  aide: "Jours après l'émission de la facture, par exemple 7, 15, 30 : une relance à chaque palier, puis plus rien. Vide : relances désactivées. Ce réglage ne fixe pas d'échéance contractuelle.",
  sous: "Documents déjà émis dont un montant reste attendu, 50 au plus par envoi. Les paliers configurés s'appliquent aussi aux relances manuelles ; chaque relance part aussi en copie à l'équipe.",
  automatique: "Les relances automatiques utilisent la tâche serveur protégée. Sa programmation se configure séparément.",
  desactivees: "Les relances sont désactivées. Renseignez les paliers dans les coordonnées de l'agence pour les activer.",
  vide: "Aucune relance à effectuer aujourd'hui.",
  lancer: "Relancer les documents affichés",
  confirmer: "Envoyer un e-mail aux clients des documents affichés",
  envoi: "Envoi des relances…",
  indisponible: "Les relances ne peuvent pas être chargées.",
  numero: "Document", client: "Client", depuis: "Depuis", etat: "État",
  historique: "Dernières tentatives",
  etats: { reservee: "Réservée pour envoi", envoyee: "Envoyée", ignoree: "Non envoyée", incertaine: "À vérifier" },
  doute: "Une tentative réservée ou incertaine bloque tout nouvel envoi pour ce document. Vérifiez le journal SMTP avant une reprise manuelle.",
  resultat: (envoyees: number, ignorees: number, incertaines: number) => `${envoyees} envoyée(s), ${ignorees} non envoyée(s), ${incertaines} à vérifier.`,
  erreurs: { acces: "Un compte admin est nécessaire.", confirmation: "Confirmez l'envoi aux clients affichés.", smtp: "Aucune voie d'envoi n'est configurée.", origine: "L'adresse du site n'est pas configurée.", panne: "Le traitement n'a pas pu être confirmé. Consultez les tentatives avant de recommencer." },
};

type Copie = { sujet: (n: string) => string; titre: string; corps: string; solde: string; payer: string; raison: string; deja: string };
export const copiesRelance: Record<LangueDoc, Copie> = {
  FR: { sujet: (n) => `Rappel de paiement ${n} · Ouidah Heritage Tour`, titre: "Votre paiement reste attendu", corps: "Nous revenons vers vous au sujet du document ci-dessous. Notre suivi indique le montant restant à régler.", solde: "Montant restant à régler", payer: "Consulter le paiement", raison: "Vous recevez ce rappel au sujet de votre dossier Ouidah Heritage Tour.", deja: "Si vous avez déjà réglé ce montant, répondez à cet e-mail pour nous permettre de vérifier votre paiement." },
  EN: { sujet: (n) => `Payment reminder ${n} · Ouidah Heritage Tour`, titre: "Your payment is still pending", corps: "We are following up on the document below. Our records show the remaining amount to be paid.", solde: "Remaining amount to pay", payer: "View payment", raison: "You are receiving this reminder about your Ouidah Heritage Tour booking.", deja: "If you have already paid this amount, reply to this email so we can check your payment." },
  ES: { sujet: (n) => `Recordatorio de pago ${n} · Ouidah Heritage Tour`, titre: "Su pago sigue pendiente", corps: "Le escribimos acerca del documento que figura a continuación. Nuestros registros indican el importe que queda por pagar.", solde: "Importe pendiente", payer: "Consultar el pago", raison: "Recibe este recordatorio sobre su reserva con Ouidah Heritage Tour.", deja: "Si ya ha pagado este importe, responda a este correo para que podamos comprobar el pago." },
  DE: { sujet: (n) => `Zahlungserinnerung ${n} · Ouidah Heritage Tour`, titre: "Ihre Zahlung steht noch aus", corps: "Wir melden uns wegen des unten genannten Dokuments. Unsere Unterlagen zeigen den noch zu zahlenden Betrag.", solde: "Offener Betrag", payer: "Zahlung ansehen", raison: "Sie erhalten diese Erinnerung zu Ihrer Buchung bei Ouidah Heritage Tour.", deja: "Falls Sie diesen Betrag bereits bezahlt haben, antworten Sie bitte auf diese E-Mail, damit wir die Zahlung prüfen können." },
  PT: { sujet: (n) => `Lembrete de pagamento ${n} · Ouidah Heritage Tour`, titre: "O seu pagamento continua pendente", corps: "Entramos em contacto acerca do documento abaixo. Os nossos registos indicam o montante que falta pagar.", solde: "Montante por pagar", payer: "Consultar o pagamento", raison: "Recebe este lembrete sobre a sua reserva com a Ouidah Heritage Tour.", deja: "Se já pagou este montante, responda a este e-mail para podermos verificar o pagamento." },
  HT: { sujet: (n) => `Rapèl peman ${n} · Ouidah Heritage Tour`, titre: "Nou poko resevwa peman ou an", corps: "N ap ekri ou konsènan dokiman ki anba a. Dosye nou montre kantite lajan ki rete pou peye a.", solde: "Lajan ki rete pou peye", payer: "Gade peman an", raison: "Ou resevwa rapèl sa a konsènan dosye ou ak Ouidah Heritage Tour.", deja: "Si ou deja peye lajan sa a, reponn imèl sa a pou nou ka verifye peman ou an." },
  GCF: { sujet: (n) => `Rapèl péman ${n} · Ouidah Heritage Tour`, titre: "Nou ka atann péman a-w toujou", corps: "Nou ka ékri-w pou dokiman-la ki anba la. Dosyé an nou ka montré lajan-la ki rété pou péyé.", solde: "Lajan ki rété pou péyé", payer: "Gadé péman-la", raison: "Ou ka risivwè rapèl-lasa pou dosyé a-w épi Ouidah Heritage Tour.", deja: "Si ou ja péyé lajan-lasa, réponn imèl-lasa pou nou pé vérifyé péman a-w." },
};
