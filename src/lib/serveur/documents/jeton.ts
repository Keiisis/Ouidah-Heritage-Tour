import { createHmac, timingSafeEqual } from "node:crypto";

// Lien secret de suivi : /suivi/<s>-<uuid>-<signature>. s = r (réservation), d (demande), b (commande de la boutique).
// Signature HMAC-SHA256 avec BILLET_SECRET (comme les billets), sur un contenu propre au suivi : un lien ne se devine pas
// et ne donne accès qu'à sa commande. Sans secret, aucun lien n'est émis ni accepté.
export type SourceSuivi = "r" | "d" | "b";
const FORME = /^([rdb])-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([A-Za-z0-9_-]{22})$/;

const secret = () => {
  const s = process.env.BILLET_SECRET;
  return s && s.length >= 32 ? s : null;
};
const signer = (s: SourceSuivi, id: string, cle: string) => createHmac("sha256", cle).update(`suivi:${s}:${id}`).digest("base64url").slice(0, 22);

export function jetonSuivi(s: SourceSuivi, id: string): string | null {
  const cle = secret();
  return cle ? `${s}-${id}-${signer(s, id, cle)}` : null;
}

/** Source et identifiant d'un jeton authentique, sinon null (forme, secret ou signature). */
export function lireJeton(jeton: string): { s: SourceSuivi; id: string } | null {
  const m = FORME.exec(jeton);
  const cle = secret();
  if (!m || !cle) return null;
  const attendu = Buffer.from(signer(m[1] as SourceSuivi, m[2], cle));
  const lu = Buffer.from(m[3]);
  return attendu.length === lu.length && timingSafeEqual(attendu, lu) ? { s: m[1] as SourceSuivi, id: m[2] } : null;
}
