import { appel, egal, hmac, json, lireJson } from "./outils";
import type { Constat, Passerelle } from "./types";

// Paystack (paystack.com/docs, lus le 27/10/2026). Création côté serveur : POST /transaction/initialize (Bearer clé
// secrète), montant en sous-unités même pour le XOF (15 000 XOF → 1500000), reference = notre réservation → page de
// paiement hébergée (authorization_url). Relecture : GET /transaction/verify/:reference ; succès = data.status « success ».
// Webhook : en-tête x-paystack-signature = HMAC-SHA512 hex du corps brut avec la clé secrète, comparé à temps constant.
// Comptes marchands : Nigeria, Ghana, Kenya, Afrique du Sud, Côte d'Ivoire (pas le Bénin) : à activer seulement si OHT
// dispose d'un compte.
const env = () => ({ secrete: process.env.PAYSTACK_SECRET_KEY });
const API = "https://api.paystack.co";
const entetes = () => ({ authorization: `Bearer ${env().secrete}`, "content-type": "application/json" });
const SOUS_UNITES = 100;

type Donnees = { status?: string; reference?: string; amount?: number; requested_amount?: number; currency?: string };

export const paystack: Passerelle = {
  nom: "paystack",
  disponible: () => Boolean(env().secrete),
  async lancer(r, retour) {
    const p = await json<{ status?: boolean; data?: { authorization_url?: string; reference?: string } }>(await appel(`${API}/transaction/initialize`, {
      method: "POST",
      headers: entetes(),
      body: JSON.stringify({ email: r.email, amount: r.montant * SOUS_UNITES, currency: "XOF", reference: r.id, callback_url: retour, metadata: { reservation: r.id } }),
    }));
    if (!p?.status || !p.data?.authorization_url) return null;
    return { transaction: p.data.reference ?? r.id, lancement: { mode: "redirection", url: p.data.authorization_url } };
  },
  async constater(transaction, r) {
    const reference = transaction ?? r?.id ?? null;
    if (!reference || !/^[A-Za-z0-9.=-]{1,100}$/.test(reference)) return null;
    const v = await json<{ status?: boolean; data?: Donnees }>(await appel(`${API}/transaction/verify/${encodeURIComponent(reference)}`, { headers: entetes() }));
    const d = v?.status ? v.data : null;
    if (!d?.status) return null;
    const etat: Constat["etat"] = d.status === "success" ? "reussi" : d.status === "reversed" ? "rembourse" : d.status === "failed" || d.status === "abandoned" ? "echoue" : "en_cours";
    // montant demandé (hors frais éventuellement payés par le client), en sous-unités
    const brut = d.requested_amount ?? d.amount;
    const montant = Number.isInteger(brut) && brut! % SOUS_UNITES === 0 ? brut! / SOUS_UNITES : null;
    return { transaction: reference, reservation: d.reference ?? null, etat, montant, devise: d.currency ?? null };
  },
  lireWebhook(brut, h) {
    const secret = env().secrete;
    if (!secret || !egal(h.get("x-paystack-signature"), hmac("sha512", secret, brut))) return null;
    const corps = lireJson(brut) as { event?: string; data?: { reference?: string } } | null;
    return corps?.event === "charge.success" && typeof corps.data?.reference === "string" ? { transaction: corps.data.reference } : "ignorer";
  },
};
