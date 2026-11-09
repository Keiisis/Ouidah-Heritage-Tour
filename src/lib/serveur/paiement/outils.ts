import { createHmac, timingSafeEqual } from "node:crypto";

// Outils communs aux passerelles : comparaison à temps constant, HMAC, appel d'API borné dans le temps (sans journaliser
// ni corps ni clé), découpage du nom en prénom / nom.
export function egal(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const hmac = (algo: "sha256" | "sha512", cle: string, contenu: string) => createHmac(algo, cle).update(contenu, "utf8").digest("hex");

/** Signature « t=…,<schema>=… » (Stripe v1, FedaPay s) : HMAC-SHA256 de `${t}.${corps}`, horodatage récent (5 min). */
export function signatureHorodatee(entete: string | null, schema: string, secret: string, brut: string, tolerance = 300): boolean {
  if (!entete) return false;
  const parts = entete.split(",").map((p) => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const signatures = parts.filter(([k]) => k === schema).map(([, v]) => v);
  if (!t || !/^\d{1,12}$/.test(t) || !signatures.length) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > tolerance) return false;
  const attendue = hmac("sha256", secret, `${t}.${brut}`);
  return signatures.some((s) => egal(s, attendue));
}

export async function appel(url: string, init: RequestInit & { delai?: number } = {}): Promise<Response | null> {
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(init.delai ?? 15_000) });
  } catch {
    return null;
  }
}

export async function json<T>(r: Response | null): Promise<T | null> {
  if (!r?.ok) return null;
  try {
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export function prenomNom(nom: string) {
  const [prenom, ...reste] = nom.trim().split(/\s+/);
  return { prenom: prenom ?? nom, nom: reste.join(" ") || prenom || nom };
}

export function lireJson(brut: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(brut) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Adresse publique du site pour les retours de paiement et les liens d'e-mail : SITE_URL configurée sur le serveur
 *  (jamais un en-tête de la requête, doc Stripe « Checkout fulfillment »). Hors production seulement, repli sur l'adresse
 *  de la requête pour les essais locaux. */
export function origineSite(req: Request): string | null {
  const conf = process.env.SITE_URL?.trim();
  if (conf && /^https?:\/\/[^/\s]+$/.test(conf.replace(/\/$/, ""))) return conf.replace(/\/$/, "");
  return process.env.NODE_ENV === "production" ? null : new URL(req.url).origin;
}

/** Libellé lisible d'une réservation sur la page de paiement de la passerelle (« Ouidah Blue · Place × 2 »). */
export function libelle(r: { evenement: string; formule_nom: string; quantite: number }, titres: { slug: string; title: string }[]) {
  return `${titres.find((e) => e.slug === r.evenement)?.title ?? r.evenement} · ${r.formule_nom} × ${r.quantite}`;
}
