import { appel, egal, json, lireJson } from "./outils";
import type { Constat, Passerelle } from "./types";

// Kkiapay (docs.kkiapay.me v1, SDK officiels Node/PHP, lus le 27/10/2026). Aucune API de création : le paiement s'ouvre
// dans le widget officiel (k.js) avec le montant et partnerId = notre réservation. Le serveur relit la transaction par
// POST /api/v1/transactions/status (en-têtes x-api-key, x-private-key, x-secret-key). Montant en XOF entiers, seule
// devise. Webhook : en-tête x-kkiapay-secret = « secret hash » choisi dans le tableau de bord, comparé à temps constant
// (la doc ne publie ni algorithme ni signature du corps : la transaction est toujours relue). À contrôler au premier test.
const env = () => ({
  publique: process.env.KKIAPAY_PUBLIC_KEY,
  privee: process.env.KKIAPAY_PRIVATE_KEY,
  secrete: process.env.KKIAPAY_SECRET_KEY,
  webhook: process.env.KKIAPAY_WEBHOOK_SECRET,
  sandbox: process.env.KKIAPAY_SANDBOX === "true",
});
const api = () => (env().sandbox ? "https://api-sandbox.kkiapay.me" : "https://api.kkiapay.me");

type Statut = { status?: string; type?: string; amount?: number | string; partnerId?: string | null; state?: { reservation?: string } | string | null; transactionId?: string };
type Webhook = { transactionId?: string };

export const kkiapay: Passerelle = {
  nom: "kkiapay",
  disponible: () => {
    const e = env();
    return Boolean(e.publique && e.privee && e.secrete && e.webhook);
  },
  async lancer(r, retour) {
    const e = env();
    return {
      transaction: null, // l'identifiant n'existe qu'après le paiement, rendu par le widget ou le webhook
      lancement: {
        mode: "widget",
        options: { passerelle: "kkiapay", key: e.publique, sandbox: e.sandbox, amount: r.montant, partnerId: r.id, data: { reservation: r.id }, email: r.email, name: r.nom, callback: retour },
      },
    };
  },
  async constater(transaction) {
    if (!transaction) return null;
    const e = env();
    const s = await json<Statut>(await appel(`${api()}/api/v1/transactions/status`, { method: "POST", headers: { "x-api-key": e.publique!, "x-private-key": e.privee!, "x-secret-key": e.secrete!, "content-type": "application/json" }, body: JSON.stringify({ transactionId: transaction }) }));
    if (!s?.status) return null;
    const montant = Number(s.amount);
    const etat: Constat["etat"] = s.status === "SUCCESS" && s.type === "DEBIT" ? "reussi" : s.status === "REVERTED" ? "rembourse" : s.status === "PENDING" ? "en_cours" : "echoue";
    // partnerId en priorité ; sinon `state` (le `data` du widget), objet ou chaîne JSON selon les cas (forme non documentée)
    const etatLu = typeof s.state === "string" ? (lireJson(s.state) as { reservation?: string } | null) : s.state;
    const reservation = s.partnerId ?? etatLu?.reservation ?? null;
    return { transaction, reservation, etat, montant: Number.isInteger(montant) ? montant : null, devise: "XOF" };
  },
  lireWebhook(brut, entetes) {
    if (!egal(entetes.get("x-kkiapay-secret"), env().webhook)) return null;
    const corps = lireJson(brut) as Webhook | null;
    return typeof corps?.transactionId === "string" && corps.transactionId ? { transaction: corps.transactionId } : "ignorer";
  },
};
