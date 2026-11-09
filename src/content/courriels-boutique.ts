import type { LangueCourriel } from "./courriels";

// E-mail « commande de la boutique reçue » (maquette E validée le 03/11/2026), dans la langue de la commande. Articles,
// prix (euros, ceux de la base), retrait ou livraison et numéros viennent de la commande enregistrée. Statut, Réception,
// Référence, Retrait à Ouidah : content/suivi.ts. Créoles (HT, GCF) et portugais : à faire relire (corpsPaiement du
// 09/11 compris).
type CopieBoutique = {
  sujet: (reference: string) => string;
  apercu: (reference: string) => string;
  phrase: readonly [string, string]; // phrase titre et son trait Soleil
  corps: string;
  corpsPaiement: string; // paiement immédiat (09/11) : commande à régler en ligne, stock réservé 30 minutes
  bouton: string;
  quantite: (n: number, prix: string | null) => string;
  raison: string;
};

export const copiesBoutique: Record<LangueCourriel, CopieBoutique> = {
  FR: {
    sujet: (r) => `Votre commande ${r} est enregistrée`,
    apercu: (r) => `Commande ${r} enregistrée. L’équipe OHT vous contacte pour confirmer la commande et son règlement.`,
    phrase: ["votre commande", "est enregistrée"],
    corps: "Ouidah Heritage Tour vous contacte pour confirmer la commande et son règlement, en une seule fois.",
    corpsPaiement: "Réglez votre commande en ligne pour la confirmer. Vos pièces restent réservées 30 minutes ; sans paiement dans ce délai, la commande est annulée.",
    bouton: "Voir ma commande",
    quantite: (n, p) => (n > 1 && p ? `Quantité ${n} × ${p}` : `Quantité ${n}`),
    raison: "Vous recevez cet e-mail parce que vous avez passé commande sur la boutique de ouidahheritagetour.bj.",
  },
  EN: {
    sujet: (r) => `Your order ${r} has been placed`,
    apercu: (r) => `Order ${r} placed. The OHT team will contact you to confirm the order and its payment.`,
    phrase: ["your order", "has been placed"],
    corps: "Ouidah Heritage Tour will contact you to confirm the order and its payment, in a single instalment.",
    corpsPaiement: "Pay for your order online to confirm it. Your items stay reserved for 30 minutes; without payment within that time, the order is cancelled.",
    bouton: "View my order",
    quantite: (n, p) => (n > 1 && p ? `Quantity ${n} × ${p}` : `Quantity ${n}`),
    raison: "You are receiving this email because you placed an order in the ouidahheritagetour.bj shop.",
  },
  ES: {
    sujet: (r) => `Su pedido ${r} está registrado`,
    apercu: (r) => `Pedido ${r} registrado. El equipo de OHT le contactará para confirmar el pedido y su pago.`,
    phrase: ["su pedido", "está registrado"],
    corps: "Ouidah Heritage Tour le contactará para confirmar el pedido y su pago, en un solo plazo.",
    corpsPaiement: "Pague su pedido en línea para confirmarlo. Sus piezas quedan reservadas 30 minutos; sin pago en ese plazo, el pedido se anula.",
    bouton: "Ver mi pedido",
    quantite: (n, p) => (n > 1 && p ? `Cantidad ${n} × ${p}` : `Cantidad ${n}`),
    raison: "Recibe este correo porque ha hecho un pedido en la tienda de ouidahheritagetour.bj.",
  },
  DE: {
    sujet: (r) => `Ihre Bestellung ${r} ist eingegangen`,
    apercu: (r) => `Bestellung ${r} eingegangen. Das OHT-Team meldet sich, um die Bestellung und ihre Bezahlung zu bestätigen.`,
    phrase: ["Ihre Bestellung", "ist eingegangen"],
    corps: "Ouidah Heritage Tour meldet sich bei Ihnen, um die Bestellung und ihre Bezahlung in einer einzigen Zahlung zu bestätigen.",
    corpsPaiement: "Bezahlen Sie Ihre Bestellung online, um sie zu bestätigen. Ihre Artikel bleiben 30 Minuten reserviert; ohne Zahlung in dieser Zeit wird die Bestellung storniert.",
    bouton: "Meine Bestellung ansehen",
    quantite: (n, p) => (n > 1 && p ? `Menge ${n} × ${p}` : `Menge ${n}`),
    raison: "Sie erhalten diese E-Mail, weil Sie im Shop von ouidahheritagetour.bj bestellt haben.",
  },
  PT: {
    sujet: (r) => `A sua encomenda ${r} está registada`,
    apercu: (r) => `Encomenda ${r} registada. A equipa da OHT contacta-o para confirmar a encomenda e o seu pagamento.`,
    phrase: ["a sua encomenda", "está registada"],
    corps: "A Ouidah Heritage Tour contacta-o para confirmar a encomenda e o seu pagamento, de uma só vez.",
    corpsPaiement: "Pague a sua encomenda online para a confirmar. As suas peças ficam reservadas durante 30 minutos; sem pagamento nesse prazo, a encomenda é anulada.",
    bouton: "Ver a minha encomenda",
    quantite: (n, p) => (n > 1 && p ? `Quantidade ${n} × ${p}` : `Quantidade ${n}`),
    raison: "Recebe este e-mail porque fez uma encomenda na loja de ouidahheritagetour.bj.",
  },
  HT: {
    sujet: (r) => `Kòmand ou ${r} anrejistre`,
    apercu: (r) => `Kòmand ${r} anrejistre. Ekip OHT a ap kontakte w pou konfime kòmand lan ak peman an.`,
    phrase: ["kòmand ou", "anrejistre"],
    corps: "Ouidah Heritage Tour ap kontakte w pou konfime kòmand lan ak peman an, an yon sèl fwa.",
    corpsPaiement: "Peye kòmand ou sou entènèt pou konfime l. Atik ou yo rete rezève pandan 30 minit ; si ou pa peye nan delè sa a, kòmand lan anile.",
    bouton: "Gade kòmand mwen",
    quantite: (n, p) => (n > 1 && p ? `Kantite ${n} × ${p}` : `Kantite ${n}`),
    raison: "Ou resevwa imèl sa a paske ou pase yon kòmand nan boutik ouidahheritagetour.bj.",
  },
  GCF: {
    sujet: (r) => `Kòmand a-w ${r} anrèjistré`,
    apercu: (r) => `Kòmand ${r} anrèjistré. Lékip OHT ké kontakté-w pou konfirmé kòmand-la é péyman a-y.`,
    phrase: ["kòmand a-w", "anrèjistré"],
    corps: "Ouidah Heritage Tour ké kontakté-w pou konfirmé kòmand-la é péyman a-y, an on sèl fwa.",
    corpsPaiement: "Péyé kòmand a-w asi entènèt pou konfirmé-y. Pyès a-w ka rété rézèvé pandan 30 minit ; si pa ni péyman adan délè-lasa, kòmand-la anilé.",
    bouton: "Gadé kòmand an mwen",
    quantite: (n, p) => (n > 1 && p ? `Kantité ${n} × ${p}` : `Kantité ${n}`),
    raison: "Ou ka résévwa imèl-lasa paskè ou pasé on kòmand adan boutik a ouidahheritagetour.bj.",
  },
};
