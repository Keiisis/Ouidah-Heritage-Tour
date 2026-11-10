import { lireContenu } from "@/lib/contenu";
import { chargerCles, cle } from "./cles";
import { appel, json, libelle, lireJson, prenomNom, signatureHorodatee } from "./outils";
import type { Constat, Passerelle } from "./types";

// FedaPay (docs.fedapay.com, OpenAPI v1, SDK officiels Node/PHP, lus le 27/10/2026). Le serveur crée la transaction
// (POST /v1/transactions, Bearer clé secrète, montant XOF entier, merchant_reference = notre réservation), puis son lien de
// paiement hébergé (POST /v1/transactions/{id}/token). Relecture : GET /v1/transactions/{id} ; succès = approved ou
// transferred (declined et canceled ne sont pas définitifs). Webhook : en-tête X-FEDAPAY-SIGNATURE « t=…,s=… »,
// HMAC-SHA256 hex de `${t}.${corps brut}` avec le secret du point de terminaison, 5 min de tolérance.
const env = () => ({ secrete: cle("fedapay", "FEDAPAY_SECRET_KEY"), webhook: cle("fedapay", "FEDAPAY_WEBHOOK_SECRET"), sandbox: cle("fedapay", "FEDAPAY_SANDBOX") === "true" });
const api = () => (env().sandbox ? "https://sandbox-api.fedapay.com/v1" : "https://api.fedapay.com/v1");
const entetes = () => ({ authorization: `Bearer ${env().secrete}`, "content-type": "application/json" });

type Transaction = { id?: number; status?: string; amount?: number; currency_id?: number; merchant_reference?: string | null };
const transactionDe = (x: Record<string, unknown> | null) => (x?.["v1/transaction"] ?? x?.transaction ?? null) as Transaction | null;
const devises = new Map<number, string>();

async function iso(id: number | undefined) {
  if (id === undefined) return null;
  if (!devises.has(id)) {
    const c = await json<Record<string, { iso?: string }>>(await appel(`${api()}/currencies/${id}`, { headers: entetes() }));
    const v = c?.["v1/currency"]?.iso ?? c?.currency?.iso;
    if (!v) return null;
    devises.set(id, v);
  }
  return devises.get(id)!;
}

export const fedapay: Passerelle = {
  nom: "fedapay",
  disponible: () => Boolean(env().secrete && env().webhook),
  async lancer(r, retour) {
    await chargerCles();
    const evenements = await lireContenu("fr.evenements");
    const { prenom, nom } = prenomNom(r.nom);
    const t = transactionDe(await json(await appel(`${api()}/transactions`, {
      method: "POST",
      headers: entetes(),
      body: JSON.stringify({ description: `Ouidah Heritage Tour · ${libelle(r, evenements)}`, amount: r.montant, currency: { iso: "XOF" }, callback_url: retour, merchant_reference: r.id, custom_metadata: { reservation: r.id }, customer: { firstname: prenom, lastname: nom, email: r.email } }),
    })));
    if (!t?.id) return null;
    const jeton = await json<{ url?: string; token?: string }>(await appel(`${api()}/transactions/${t.id}/token`, { method: "POST", headers: entetes() }));
    if (!jeton?.url) return null;
    return { transaction: String(t.id), lancement: { mode: "redirection", url: jeton.url } };
  },
  async constater(transaction) {
    if (!transaction || !/^\d{1,20}$/.test(transaction)) return null;
    await chargerCles();
    const t = transactionDe(await json(await appel(`${api()}/transactions/${transaction}`, { headers: entetes() })));
    if (!t?.status) return null;
    const etat: Constat["etat"] = t.status === "approved" || t.status === "transferred" ? "reussi" : t.status === "refunded" ? "rembourse" : t.status === "expired" ? "echoue" : "en_cours";
    return { transaction, reservation: t.merchant_reference ?? null, etat, montant: Number.isInteger(t.amount) ? t.amount! : null, devise: await iso(t.currency_id) };
  },
  lireWebhook(brut, h) {
    const secret = env().webhook;
    if (!secret || !signatureHorodatee(h.get("x-fedapay-signature"), "s", secret, brut)) return null;
    const corps = lireJson(brut);
    const id = (corps?.entity as { id?: number } | undefined)?.id;
    return Number.isInteger(id) ? { transaction: String(id) } : "ignorer";
  },
};
