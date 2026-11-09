import { createHmac, timingSafeEqual } from "node:crypto";

// Billets d'une réservation payée : un par place, dérivés de la réservation (rien d'autre à stocker). Le code du QR est
// signé (HMAC-SHA256) avec BILLET_SECRET ; sans ce secret, aucun billet n'est émis, et aucune valeur de repli n'existe.
export const billetsPossibles = () => Boolean(process.env.BILLET_SECRET && process.env.BILLET_SECRET.length >= 32);

const signer = (contenu: string) => {
  const secret = process.env.BILLET_SECRET;
  if (!secret || secret.length < 32) throw new Error("BILLET_SECRET absent ou trop court : aucun billet ne peut être émis");
  return createHmac("sha256", secret).update(contenu).digest("base64url").slice(0, 22);
};

export type Billet = { numero: string; code: string };

export function billets(r: { id: string; quantite: number }): Billet[] {
  return Array.from({ length: r.quantite }, (_, i) => {
    const contenu = `${r.id}:${i + 1}`;
    return { numero: `OHT-${r.id.slice(0, 8).toUpperCase()}-${i + 1}`, code: `OHT1:${contenu}:${signer(contenu)}` };
  });
}

// Clé d'accès de l'acheteur : remise à la création et dans l'e-mail, elle seule permet de lire l'état et les billets.
export const cleAcces = (reservation: string) => signer(`acces:${reservation}`);

export function cleValide(reservation: string, cle: unknown): boolean {
  if (typeof cle !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(cle)) return false;
  const attendu = Buffer.from(cleAcces(reservation));
  const lu = Buffer.from(cle);
  return attendu.length === lu.length && timingSafeEqual(attendu, lu);
}

/** Vrai si le code lu sur un billet a bien été signé par OHT (contrôle à l'entrée). */
export function billetAuthentique(code: string): boolean {
  const m = /^OHT1:([0-9a-f-]{36}:\d{1,2}):([A-Za-z0-9_-]{22})$/.exec(code);
  if (!m) return false;
  const attendu = Buffer.from(signer(m[1]));
  const lu = Buffer.from(m[2]);
  return attendu.length === lu.length && timingSafeEqual(attendu, lu);
}
