import { createHash } from "node:crypto";
import { isIPv4, isIPv6 } from "node:net";
import { compter } from "./base";

// Garde des formulaires publics : adresse IP gardée seulement en empreinte salée (jamais en clair), limite de fréquence
// comptée en base, corps lu avec une taille bornée. Sur Vercel, x-vercel-forwarded-for, x-real-ip et x-forwarded-for sont
// posés par la plateforme ; x-vercel-forwarded-for d'abord : il reste juste si un proxy est mis devant Vercel, qui peut
// réécrire x-forwarded-for (vercel.com/docs/headers/request-headers, lu le 26/11/2026).

/** Clé d'une connexion : IPv4 entière ; IPv6 ramenée à son préfixe /64 (un abonné reçoit en général tout un /64 : compter
 * par adresse lui donnerait un quota par adresse) ; IPv4 mappée (::ffff:a.b.c.d) rendue en IPv4 ; zone (%…) retirée. */
export function cleIp(brute: string) {
  const ip = brute.trim().replace(/%.*$/, "").toLowerCase();
  if (isIPv4(ip) || !isIPv6(ip)) return ip;
  // forme normale WHATWG : hexadécimal seulement (IPv4 finale convertie), « :: » pour la plus longue suite de zéros
  const h = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const [a, b] = h.split("::").map((x) => (x ? x.split(":") : []));
  const g = (b ? [...a, ...Array(8 - a.length - b.length).fill("0"), ...b] : a).map((x) => parseInt(x, 16));
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255].join(".");
  return `${g.slice(0, 4).map((x) => x.toString(16)).join(":")}::/64`;
}

export function empreinteIp(req: { headers: Pick<Headers, "get"> }) {
  const h = req.headers;
  const ip = (h.get("x-vercel-forwarded-for") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for"))?.split(",")[0]?.trim() || "inconnue";
  return createHash("sha256").update(`${process.env.EMPREINTE_SEL ?? ""}|${cleIp(ip)}`).digest("hex");
}

/** Vrai quand `max` envois sont déjà partis de cette empreinte dans les `minutes` passées (ou si la base ne répond pas).
 * Pré-contrôle bon marché : il lit puis la route écrit. Pour demandes, réservations, abonnés de la lettre et commandes de
 * la boutique, la limite qui fait foi est recomptée sous verrou à l'écriture (déclencheur limiter_formulaires_publics,
 * migration 20261129) ; son refus se lit avec `refusLimite`. */
export async function limiteAtteinte(table: string, ip: string, max: number, minutes: number, filtre = "") {
  const depuis = new Date(Date.now() - minutes * 60_000).toISOString();
  const n = await compter(table, `ip_hash=eq.${ip}&cree_le=gte.${encodeURIComponent(depuis)}${filtre}`);
  return n === null || n >= max;
}

/** Écriture refusée par la base pour dépassement de la limite (exception « limite » d'un déclencheur) : à rendre en 429. */
export async function refusLimite(r: Response | null | undefined) {
  if (!r || r.ok) return false;
  const e = (await r.json().catch(() => null)) as { message?: unknown } | null;
  return e?.message === "limite";
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
