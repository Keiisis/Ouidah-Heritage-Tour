// Portes P2 (webhook non authentifié refusé), P3 (montant/devise lus de l'API), P8 (aucun secret journalisé) et contrat de
// chaque passerelle selon sa documentation officielle (relevé du 27/10/2026), APIs simulées.
// Lancement : node --conditions=react-server --import ./ts-chargeur.mjs --test paiement-passerelles.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

Object.assign(process.env, {
  KKIAPAY_PUBLIC_KEY: "pk_kk", KKIAPAY_PRIVATE_KEY: "pv_kk", KKIAPAY_SECRET_KEY: "sk_kk", KKIAPAY_WEBHOOK_SECRET: "hash-kkiapay", KKIAPAY_SANDBOX: "true",
  FEDAPAY_SECRET_KEY: "sk_sandbox_fp", FEDAPAY_WEBHOOK_SECRET: "wh_sandbox_xxxxxxxxxxxx", FEDAPAY_SANDBOX: "true",
  STRIPE_SECRET_KEY: "sk_test_st", STRIPE_WEBHOOK_SECRET: "whsec_st",
  FLUTTERWAVE_SECRET_KEY: "FLWSECK_TEST-xxxxxxxxxxxx", FLUTTERWAVE_SECRET_HASH: "test-hash-flutterwave",
  PAYSTACK_SECRET_KEY: "sk_test_ps",
});
const { kkiapay } = await import("@/lib/serveur/paiement/kkiapay");
const { fedapay } = await import("@/lib/serveur/paiement/fedapay");
const { stripe } = await import("@/lib/serveur/paiement/stripe");
const { flutterwave } = await import("@/lib/serveur/paiement/flutterwave");
const { paystack } = await import("@/lib/serveur/paiement/paystack");

const ID = "0f1e2d3c-4b5a-4968-8776-655443322110";
const RESA = { id: ID, evenement: "ouidah-blue", occurrence: "2027-03-27", formule_nom: "Place", quantite: 2, montant: 30000, devise: "XOF", passerelle: "stripe", transaction_id: null, statut: "attente", nom: "Awa Houénou", email: "awa@exemple.test", telephone: null, langue: "FR", paye_le: null, courriel_envoye: false, demande_id: null };
const RETOUR = `https://oht.test/?reservation=${ID}&cle=abc`;
const H = (o) => new Headers(o);
const maintenant = () => Math.floor(Date.now() / 1000);

// API simulée : chaque appel est noté ; la réponse dépend de l'adresse
let appels = [];
function api(routes) {
  appels = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    appels.push({ url: u, methode: init.method ?? "GET", entetes: Object.fromEntries(new Headers(init.headers ?? {})), corps: init.body ?? null });
    for (const [motif, reponse] of routes) if (u.includes(motif)) return Response.json(reponse);
    return new Response("{}", { status: 404 });
  };
}

test("toutes les passerelles sont disponibles avec leurs clés, aucune sans", () => {
  for (const p of [kkiapay, fedapay, stripe, flutterwave, paystack]) assert.equal(p.disponible(), true, p.nom);
  const garde = process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  assert.equal(stripe.disponible(), false, "Stripe sans secret de webhook : non proposée");
  process.env.STRIPE_WEBHOOK_SECRET = garde;
});

test("Kkiapay : widget (montant XOF, partnerId = réservation) ; relecture POST transactions/status avec 3 clés", async () => {
  const l = await kkiapay.lancer(RESA, RETOUR);
  assert.equal(l.lancement.mode, "widget");
  assert.equal(l.lancement.options.amount, 30000);
  assert.equal(l.lancement.options.partnerId, ID);
  assert.equal(l.lancement.options.key, "pk_kk", "clé PUBLIQUE seulement côté navigateur");
  assert.ok(!JSON.stringify(l).includes("sk_kk") && !JSON.stringify(l).includes("pv_kk"), "aucune clé secrète vers le navigateur");
  api([["/api/v1/transactions/status", { status: "SUCCESS", type: "DEBIT", amount: 30000, partnerId: ID, transactionId: "kk-1" }]]);
  const c = await kkiapay.constater("kk-1");
  assert.equal(appels[0].url, "https://api-sandbox.kkiapay.me/api/v1/transactions/status");
  assert.equal(appels[0].methode, "POST");
  assert.equal(appels[0].entetes["x-api-key"], "pk_kk");
  assert.equal(appels[0].entetes["x-private-key"], "pv_kk");
  assert.equal(appels[0].entetes["x-secret-key"], "sk_kk");
  assert.deepEqual(JSON.parse(appels[0].corps), { transactionId: "kk-1" });
  assert.deepEqual(c, { transaction: "kk-1", reservation: ID, etat: "reussi", montant: 30000, devise: "XOF" });
  api([["/status", { status: "PENDING", type: "DEBIT", amount: 30000, partnerId: ID }]]);
  assert.equal((await kkiapay.constater("kk-2")).etat, "en_cours");
  api([["/status", { status: "SUCCESS", type: "CREDIT", amount: 30000, partnerId: ID }]]);
  assert.equal((await kkiapay.constater("kk-3")).etat, "echoue", "un crédit n'est pas un paiement");
  api([["/status", { status: "FAILED", amount: 30000, state: JSON.stringify({ reservation: ID }) }]]);
  assert.equal((await kkiapay.constater("kk-4")).reservation, ID, "state en chaîne JSON relu");
});

test("Kkiapay : webhook authentifié par x-kkiapay-secret (secret hash), sinon refusé", () => {
  const corps = JSON.stringify({ transactionId: "kk-1", isPaymentSucces: true, partnerId: ID, event: "transaction.success" });
  assert.deepEqual(kkiapay.lireWebhook(corps, H({ "x-kkiapay-secret": "hash-kkiapay" })), { transaction: "kk-1" });
  assert.equal(kkiapay.lireWebhook(corps, H({ "x-kkiapay-secret": "faux" })), null);
  assert.equal(kkiapay.lireWebhook(corps, H({})), null);
  assert.equal(kkiapay.lireWebhook("{}", H({ "x-kkiapay-secret": "hash-kkiapay" })), "ignorer");
});

test("FedaPay : transaction créée côté serveur (XOF entier, merchant_reference) puis lien hébergé ; relecture", async () => {
  api([["/transactions/77/token", { token: "t", url: "https://sandbox-checkout.fedapay.com/t" }], ["/v1/transactions", { "v1/transaction": { id: 77, status: "pending" } }]]);
  const l = await fedapay.lancer(RESA, RETOUR);
  assert.deepEqual(l, { transaction: "77", lancement: { mode: "redirection", url: "https://sandbox-checkout.fedapay.com/t" } });
  const creation = JSON.parse(appels[0].corps);
  assert.equal(appels[0].url, "https://sandbox-api.fedapay.com/v1/transactions");
  assert.equal(appels[0].entetes.authorization, "Bearer sk_sandbox_fp");
  assert.equal(creation.amount, 30000);
  assert.deepEqual(creation.currency, { iso: "XOF" });
  assert.equal(creation.merchant_reference, ID);
  assert.equal(creation.callback_url, RETOUR);
  api([["/v1/currencies/1", { "v1/currency": { iso: "XOF" } }], ["/v1/transactions/77", { "v1/transaction": { id: 77, status: "approved", amount: 30000, currency_id: 1, merchant_reference: ID } }]]);
  assert.deepEqual(await fedapay.constater("77"), { transaction: "77", reservation: ID, etat: "reussi", montant: 30000, devise: "XOF" });
  api([["/v1/transactions/78", { "v1/transaction": { id: 78, status: "declined", amount: 30000, currency_id: 1, merchant_reference: ID } }]]);
  assert.equal((await fedapay.constater("78")).etat, "en_cours", "declined n'est pas définitif (doc FedaPay)");
  assert.equal(await fedapay.constater("../x"), null, "identifiant non numérique refusé avant tout appel");
});

test("FedaPay : webhook signé X-FEDAPAY-SIGNATURE (t=…,s=HMAC-SHA256) ; faux, ancien ou absent refusés", () => {
  const corps = JSON.stringify({ name: "transaction.approved", entity: { id: 77 } });
  const t = maintenant();
  const s = createHmac("sha256", "wh_sandbox_xxxxxxxxxxxx").update(`${t}.${corps}`).digest("hex");
  assert.deepEqual(fedapay.lireWebhook(corps, H({ "x-fedapay-signature": `t=${t},s=${s}` })), { transaction: "77" });
  assert.equal(fedapay.lireWebhook(corps, H({ "x-fedapay-signature": `t=${t},s=${"0".repeat(64)}` })), null);
  const vieux = t - 600;
  assert.equal(fedapay.lireWebhook(corps, H({ "x-fedapay-signature": `t=${vieux},s=${createHmac("sha256", "wh_sandbox_xxxxxxxxxxxx").update(`${vieux}.${corps}`).digest("hex")}` })), null, "rejeu de plus de 5 min");
  assert.equal(fedapay.lireWebhook(corps + " ", H({ "x-fedapay-signature": `t=${t},s=${s}` })), null, "corps modifié");
  assert.equal(fedapay.lireWebhook(corps, H({})), null);
});

test("Stripe : session Checkout (xof sans décimale, référence, retour serveur) ; relecture payment_status", async () => {
  api([["/v1/checkout/sessions", { id: "cs_test_abcdefghij123", url: "https://checkout.stripe.com/c/pay/cs_test_abcdefghij123" }]]);
  const l = await stripe.lancer(RESA, RETOUR);
  assert.deepEqual(l, { transaction: "cs_test_abcdefghij123", lancement: { mode: "redirection", url: "https://checkout.stripe.com/c/pay/cs_test_abcdefghij123" } });
  const f = new URLSearchParams(appels[0].corps);
  assert.equal(appels[0].entetes["content-type"], "application/x-www-form-urlencoded");
  assert.equal(appels[0].entetes.authorization, `Basic ${Buffer.from("sk_test_st:").toString("base64")}`);
  assert.equal(f.get("line_items[0][price_data][currency]"), "xof");
  assert.equal(f.get("line_items[0][price_data][unit_amount]"), "15000", "XOF sans décimale : 15 000 → 15000, sans ×100");
  assert.equal(f.get("line_items[0][quantity]"), "2");
  assert.equal(f.get("client_reference_id"), ID);
  assert.ok(f.get("success_url").includes("session={CHECKOUT_SESSION_ID}"), f.get("success_url"));
  assert.ok(f.get("success_url").startsWith("https://oht.test/"), "retour construit sur l'adresse du serveur");
  assert.equal(f.get("line_items[0][price_data][product_data][name]"), "Ouidah Blue · Place");
  api([["/v1/checkout/sessions/cs_test_abcdefghij123", { id: "cs_test_abcdefghij123", payment_status: "paid", status: "complete", amount_total: 30000, currency: "xof", client_reference_id: ID }]]);
  assert.deepEqual(await stripe.constater("cs_test_abcdefghij123"), { transaction: "cs_test_abcdefghij123", reservation: ID, etat: "reussi", montant: 30000, devise: "XOF" });
  assert.equal(await stripe.constater("pi_123"), null, "seuls les identifiants de session sont relus");
});

test("Stripe : webhook Stripe-Signature (t=…,v1=HMAC-SHA256) ; v0 seul, faux, ancien refusés ; autres événements ignorés", () => {
  const corps = JSON.stringify({ type: "checkout.session.completed", data: { object: { id: "cs_test_abcdefghij123", object: "checkout.session" } } });
  const t = maintenant();
  const v1 = createHmac("sha256", "whsec_st").update(`${t}.${corps}`).digest("hex");
  assert.deepEqual(stripe.lireWebhook(corps, H({ "stripe-signature": `t=${t},v1=${v1},v0=abc` })), { transaction: "cs_test_abcdefghij123" });
  assert.equal(stripe.lireWebhook(corps, H({ "stripe-signature": `t=${t},v0=${v1}` })), null, "seul v1 compte");
  assert.equal(stripe.lireWebhook(corps, H({ "stripe-signature": `t=${t - 900},v1=${createHmac("sha256", "whsec_st").update(`${t - 900}.${corps}`).digest("hex")}` })), null);
  const autre = JSON.stringify({ type: "payment_intent.created", data: { object: { id: "pi_1", object: "payment_intent" } } });
  assert.equal(stripe.lireWebhook(autre, H({ "stripe-signature": `t=${t},v1=${createHmac("sha256", "whsec_st").update(`${t}.${autre}`).digest("hex")}` })), "ignorer");
});

test("Flutterwave : page hébergée (tx_ref = réservation, XOF, montant en unité principale) ; relecture par référence", async () => {
  api([["/v3/payments", { status: "success", data: { link: "https://checkout.flutterwave.com/v3/hosted/pay/x" } }]]);
  const l = await flutterwave.lancer(RESA, RETOUR);
  assert.deepEqual(l, { transaction: null, lancement: { mode: "redirection", url: "https://checkout.flutterwave.com/v3/hosted/pay/x" } });
  const c = JSON.parse(appels[0].corps);
  assert.equal(appels[0].entetes.authorization, "Bearer FLWSECK_TEST-xxxxxxxxxxxx");
  assert.equal(c.tx_ref, ID);
  assert.equal(c.currency, "XOF");
  assert.equal(c.amount, 30000);
  assert.equal(c.redirect_url, RETOUR);
  api([["verify_by_reference", { status: "success", data: { id: 991, tx_ref: ID, status: "successful", amount: 30000, currency: "XOF" } }]]);
  assert.deepEqual(await flutterwave.constater(null, RESA), { transaction: "991", reservation: ID, etat: "reussi", montant: 30000, devise: "XOF" });
  assert.ok(appels[0].url.endsWith(`tx_ref=${ID}`));
  api([["/v3/transactions/991/verify", { status: "success", data: { id: 991, tx_ref: ID, status: "failed", amount: 30000, currency: "XOF" } }]]);
  assert.equal((await flutterwave.constater("991")).etat, "echoue");
});

test("Flutterwave : webhook verif-hash (secret hash) comparé à temps constant", () => {
  const corps = JSON.stringify({ event: "charge.completed", data: { id: 991, tx_ref: ID, status: "successful" } });
  assert.deepEqual(flutterwave.lireWebhook(corps, H({ "verif-hash": "test-hash-flutterwave" })), { transaction: "991" });
  assert.equal(flutterwave.lireWebhook(corps, H({ "verif-hash": "hash-flutterwav" })), null);
  assert.equal(flutterwave.lireWebhook(corps, H({})), null);
});

test("Paystack : montant ×100 même en XOF ; relecture par référence ; montant demandé hors frais", async () => {
  api([["/transaction/initialize", { status: true, data: { authorization_url: "https://checkout.paystack.com/abc", reference: ID } }]]);
  const l = await paystack.lancer(RESA, RETOUR);
  assert.deepEqual(l, { transaction: ID, lancement: { mode: "redirection", url: "https://checkout.paystack.com/abc" } });
  const c = JSON.parse(appels[0].corps);
  assert.equal(c.amount, 3000000, "15 000 × 2 XOF → 3 000 000 en sous-unités (doc Paystack)");
  assert.equal(c.currency, "XOF");
  assert.equal(c.reference, ID);
  api([[`/transaction/verify/${ID}`, { status: true, data: { status: "success", reference: ID, amount: 3058500, requested_amount: 3000000, currency: "XOF" } }]]);
  assert.deepEqual(await paystack.constater(null, RESA), { transaction: ID, reservation: ID, etat: "reussi", montant: 30000, devise: "XOF" });
  api([[`/transaction/verify/${ID}`, { status: true, data: { status: "abandoned", reference: ID, amount: 3000000, currency: "XOF" } }]]);
  assert.equal((await paystack.constater(ID)).etat, "echoue");
});

test("Paystack : webhook x-paystack-signature = HMAC-SHA512 du corps brut ; seul charge.success est traité", () => {
  const corps = JSON.stringify({ event: "charge.success", data: { reference: ID } });
  const sig = createHmac("sha512", "sk_test_ps").update(corps).digest("hex");
  assert.deepEqual(paystack.lireWebhook(corps, H({ "x-paystack-signature": sig })), { transaction: ID });
  assert.equal(paystack.lireWebhook(corps, H({ "x-paystack-signature": sig.replace(/^./, sig[0] === "a" ? "b" : "a") })), null);
  assert.equal(paystack.lireWebhook(corps, H({})), null);
  const autre = JSON.stringify({ event: "transfer.success", data: {} });
  assert.equal(paystack.lireWebhook(autre, H({ "x-paystack-signature": createHmac("sha512", "sk_test_ps").update(autre).digest("hex") })), "ignorer");
});

test("API injoignable ou réponse inattendue : aucune passerelle n'invente de constat", async () => {
  globalThis.fetch = async () => { throw new Error("réseau"); };
  assert.equal(await kkiapay.constater("kk"), null);
  assert.equal(await fedapay.constater("77"), null);
  assert.equal(await stripe.constater("cs_test_abcdefghij123"), null);
  assert.equal(await flutterwave.constater("991"), null);
  assert.equal(await paystack.constater(ID), null);
  assert.equal(await stripe.lancer(RESA, RETOUR), null);
});

test("P8 : aucun journal (console) dans le code de paiement ni dans les routes de paiement", () => {
  const dossiers = [fileURLToPath(new URL("../src/lib/serveur/paiement/", import.meta.url)), fileURLToPath(new URL("../src/app/api/paiement/verifier/", import.meta.url)), fileURLToPath(new URL("../src/app/api/paiement/webhook/[passerelle]/", import.meta.url)), fileURLToPath(new URL("../src/app/api/devis/", import.meta.url))];
  for (const d of dossiers) for (const f of readdirSync(d).filter((x) => statSync(d + x).isFile())) {
    const s = readFileSync(d + f, "utf8");
    assert.ok(!/console\.(log|error|warn|info|debug)/.test(s), `${f} journalise`);
  }
});
