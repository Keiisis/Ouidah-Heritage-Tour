import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Role } from "@/content/equipe";

// Outils partagés de la liaison de l'équipe. Rien de secret n'est stocké en clair : jetons en SHA-256 (32 octets
// aléatoires, inutile de les saler), codes et adresses e-mail en HMAC-SHA256 avec EQUIPE_SEL.
export const COOKIE = "__Host-oht_equipe"; // session : 12 h glissantes, 7 jours au plus
export const COOKIE_CODE = "__Host-oht_equipe_code"; // jeton court posé par « verifier », exigé par « nouveau »
export const SESSION_MS = 12 * 3600_000;
export const SESSION_MAX_MS = 7 * 24 * 3600_000;
export const JETON_CODE_MS = 10 * 60_000;

export type RoleCompte = "agent" | "admin";
export type Profil = { id: string; prenom: string; email: string; role: RoleCompte; etat: "invite" | "actif" | "suspendu" | "supprime"; langues: string[] };

const sel = () => process.env.EQUIPE_SEL ?? "";
export const selConfigure = () => sel().length >= 32;
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const hmac = (s: string) => createHmac("sha256", sel()).update(s).digest("hex");
export const empreinteEmail = (email: string) => hmac(`email|${email}`);
// même format que scripts/equipe-premier-admin.mjs
export const empreinteCode = (profilId: string, code: string) => hmac(`code|${profilId}|${code}`);
export const nouveauJeton = () => randomBytes(32).toString("base64url");
export const jetonValide = (j: string | undefined): j is string => typeof j === "string" && /^[A-Za-z0-9_-]{43}$/.test(j);
export const egaux = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const iso = (ms: number) => new Date(ms).toISOString();

/** Un admin entre aussi par /agents ; un agent n'entre jamais par /admins. */
export const autorise = (role: RoleCompte, page: Role) => role === "admin" || page === "agents";

/** Options du cookie : httpOnly, Secure, chemin « / » et aucun domaine (exigés par le préfixe __Host-). */
export const optionsCookie = (maxAge: number, sameSite: "lax" | "strict" = "lax") => ({ httpOnly: true, secure: true, sameSite, path: "/", maxAge });
