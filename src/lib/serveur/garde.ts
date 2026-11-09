import { createHash } from "node:crypto";
import { compter } from "./base";

// Garde des formulaires publics : adresse IP gardée seulement en empreinte salée (jamais en clair), limite de fréquence
// comptée en base, corps lu avec une taille bornée. Sur Vercel, x-real-ip / x-forwarded-for sont posés par la plateforme.
export function empreinteIp(req: Request) {
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "inconnue";
  return createHash("sha256").update(`${process.env.EMPREINTE_SEL ?? ""}|${ip}`).digest("hex");
}

/** Vrai quand `max` envois sont déjà partis de cette empreinte dans les `minutes` passées (ou si la base ne répond pas). */
export async function limiteAtteinte(table: string, ip: string, max: number, minutes: number, filtre = "") {
  const depuis = new Date(Date.now() - minutes * 60_000).toISOString();
  const n = await compter(table, `ip_hash=eq.${ip}&cree_le=gte.${encodeURIComponent(depuis)}${filtre}`);
  return n === null || n >= max;
}

/** Corps JSON d'au plus `max` octets, sinon null. */
export async function lireCorps(req: Request, max = 32_000): Promise<unknown> {
  if (!Number.isSafeInteger(max) || max < 0 || Number(req.headers.get("content-length") ?? 0) > max || !req.body) return null;
  const lecteur = req.body.getReader(), decodeur = new TextDecoder("utf-8", { fatal: true });
  let taille = 0, texte = "";
  try {
    while (true) {
      const { done, value } = await lecteur.read();
      if (done) break;
      taille += value.byteLength;
      if (taille > max) { await lecteur.cancel().catch(() => undefined); return null; }
      texte += decodeur.decode(value, { stream: true });
    }
    return JSON.parse(texte + decodeur.decode()) as unknown;
  } catch {
    await lecteur.cancel().catch(() => undefined);
    return null;
  } finally { lecteur.releaseLock(); }
}

export const reponse = (corps: unknown, status: number) => Response.json(corps, { status, headers: { "cache-control": "private, no-store" } });
