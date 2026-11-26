import { base } from "../base";
import { refusLimite } from "../garde";

// Appels aux passerelles (clés marchandes d'OHT) déclenchés par un visiteur : retour du client (POST /api/paiement/verifier)
// et page /payer (lancer, vérifier). Chacun est noté AVANT de partir ; la base le refuse sous verrou au-delà de 20 par
// heure et par empreinte de connexion, ou de 10 par heure pour une même réservation ou un même lien (migration
// 20261202_limites_paiement). Les webhooks, authentifiés par la passerelle, n'y passent pas.
// « limite » : à rendre en 429 ; « base » : base muette, aucun appel (même choix que limiteAtteinte).
export async function noterAppel(ip: string, reference: string): Promise<"ok" | "limite" | "base"> {
  const r = await base("paiement_appels", { method: "POST", corps: { ip_hash: ip, reference }, prefer: "return=minimal" }).catch(() => null);
  if (r?.ok) return "ok";
  return (await refusLimite(r)) ? "limite" : "base";
}
