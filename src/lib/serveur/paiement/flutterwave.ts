import { lireContenu } from "@/lib/contenu";
import { appel, egal, json, libelle, lireJson } from "./outils";
import type { Constat, Passerelle } from "./types";

// Flutterwave Standard v3 (developer.flutterwave.com, lus le 27/10/2026). Création : POST /v3/payments (Bearer clé
// secrète), tx_ref = notre réservation, currency XOF (sinon NGN par défaut), montant en unité principale → lien de la page
// hébergée. L'identifiant de transaction n'existe qu'après le paiement : relecture par id (GET /v3/transactions/{id}/verify)
// ou par notre référence (GET /v3/transactions/verify_by_reference?tx_ref=…) ; succès = status « successful ».
// Webhook v3 : en-tête verif-hash = « secret hash » choisi dans le tableau de bord (pas une signature), comparé à temps
// constant ; la transaction est toujours relue.
const env = () => ({ secrete: process.env.FLUTTERWAVE_SECRET_KEY, hash: process.env.FLUTTERWAVE_SECRET_HASH });
const API = "https://api.flutterwave.com/v3";
const entetes = () => ({ authorization: `Bearer ${env().secrete}`, "content-type": "application/json" });

type Donnees = { id?: number; tx_ref?: string; status?: string; amount?: number; currency?: string };

export const flutterwave: Passerelle = {
  nom: "flutterwave",
  disponible: () => Boolean(env().secrete && env().hash),
  async lancer(r, retour) {
    const evenements = await lireContenu("fr.evenements");
    const p = await json<{ status?: string; data?: { link?: string } }>(await appel(`${API}/payments`, {
      method: "POST",
      headers: entetes(),
      body: JSON.stringify({ tx_ref: r.id, amount: r.montant, currency: "XOF", redirect_url: retour, customer: { email: r.email, name: r.nom }, meta: { reservation: r.id }, customizations: { title: "Ouidah Heritage Tour", description: libelle(r, evenements) } }),
    }));
    if (p?.status !== "success" || !p.data?.link) return null;
    return { transaction: null, lancement: { mode: "redirection", url: p.data.link } };
  },
  async constater(transaction, r) {
    const url = transaction && /^\d{1,20}$/.test(transaction) ? `${API}/transactions/${transaction}/verify` : r ? `${API}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(r.id)}` : null;
    if (!url) return null;
    const v = await json<{ status?: string; data?: Donnees }>(await appel(url, { headers: entetes() }));
    const d = v?.status === "success" ? v.data : null;
    if (!d?.id || !d.status) return null;
    const etat: Constat["etat"] = d.status === "successful" ? "reussi" : d.status === "failed" ? "echoue" : "en_cours";
    return { transaction: String(d.id), reservation: d.tx_ref ?? null, etat, montant: Number.isInteger(d.amount) ? d.amount! : null, devise: d.currency ?? null };
  },
  lireWebhook(brut, h) {
    if (!egal(h.get("verif-hash"), env().hash)) return null;
    const corps = lireJson(brut) as { data?: { id?: number } } | null;
    return Number.isInteger(corps?.data?.id) ? { transaction: String(corps!.data!.id) } : "ignorer";
  },
};
