import { lireContenu } from "@/lib/contenu";
import { chargerCles, cle } from "./cles";
import { appel, json, libelle, lireJson, signatureHorodatee } from "./outils";
import type { Constat, Passerelle } from "./types";

// Stripe Checkout, page hébergée (docs.stripe.com, lus le 27/10/2026). Création : POST /v1/checkout/sessions en
// form-urlencoded, authentification Basic (clé secrète), XOF sans décimale (15 000 XOF = 15000), client_reference_id et
// métadonnées = notre réservation, expiration 31 min. Relecture : GET /v1/checkout/sessions/{id} ; payé si
// payment_status = paid. Webhook : en-tête Stripe-Signature « t=…,v1=… », HMAC-SHA256 de `${t}.${corps brut}` avec le
// secret whsec_ du point de terminaison, seul le schéma v1 compte, 5 min de tolérance. Sans SDK (fetch seul).
const env = () => ({ secrete: cle("stripe", "STRIPE_SECRET_KEY"), webhook: cle("stripe", "STRIPE_WEBHOOK_SECRET") });
const auth = () => `Basic ${Buffer.from(`${env().secrete}:`).toString("base64")}`;
const LOCALES: Record<string, string> = { FR: "fr", EN: "en", ES: "es", DE: "de", PT: "pt", HT: "fr", GCF: "fr" };

type Session = { id?: string; url?: string; status?: string; payment_status?: string; amount_total?: number; currency?: string; client_reference_id?: string | null };

export const stripe: Passerelle = {
  nom: "stripe",
  disponible: () => Boolean(env().secrete && env().webhook),
  async lancer(r, retour) {
    await chargerCles();
    const evenements = await lireContenu("fr.evenements");
    const succes = new URL(retour);
    succes.searchParams.set("session", "{CHECKOUT_SESSION_ID}");
    const f = new URLSearchParams({
      mode: "payment",
      "line_items[0][price_data][currency]": "xof",
      "line_items[0][price_data][unit_amount]": String(r.montant / r.quantite),
      "line_items[0][price_data][product_data][name]": libelle({ ...r, quantite: 1 }, evenements).replace(/ × 1$/, ""),
      "line_items[0][quantity]": String(r.quantite),
      success_url: succes.toString().replace("%7BCHECKOUT_SESSION_ID%7D", "{CHECKOUT_SESSION_ID}"),
      cancel_url: retour,
      client_reference_id: r.id,
      "metadata[reservation]": r.id,
      "payment_intent_data[metadata][reservation]": r.id,
      customer_email: r.email,
      locale: LOCALES[r.langue] ?? "auto",
      submit_type: "book",
      expires_at: String(Math.floor(Date.now() / 1000) + 31 * 60),
    });
    const s = await json<Session>(await appel("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { authorization: auth(), "content-type": "application/x-www-form-urlencoded", "idempotency-key": `oht-${r.id}` }, body: f.toString() }));
    if (!s?.id || !s.url) return null;
    return { transaction: s.id, lancement: { mode: "redirection", url: s.url } };
  },
  async constater(transaction) {
    if (!transaction || !/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(transaction)) return null;
    await chargerCles();
    const s = await json<Session>(await appel(`https://api.stripe.com/v1/checkout/sessions/${transaction}`, { headers: { authorization: auth() } }));
    if (!s?.id) return null;
    const etat: Constat["etat"] = s.payment_status === "paid" ? "reussi" : s.status === "expired" ? "echoue" : "en_cours";
    return { transaction: s.id, reservation: s.client_reference_id ?? null, etat, montant: Number.isInteger(s.amount_total) ? s.amount_total! : null, devise: s.currency ? s.currency.toUpperCase() : null };
  },
  lireWebhook(brut, h) {
    const secret = env().webhook;
    if (!secret || !signatureHorodatee(h.get("stripe-signature"), "v1", secret, brut)) return null;
    const corps = lireJson(brut) as { type?: string; data?: { object?: { id?: string; object?: string } } } | null;
    const o = corps?.data?.object;
    return corps?.type?.startsWith("checkout.session.") && o?.object === "checkout.session" && o.id ? { transaction: o.id } : "ignorer";
  },
};
