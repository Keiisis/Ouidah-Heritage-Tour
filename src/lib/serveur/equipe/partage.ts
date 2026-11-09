import type { RoleCompte } from "./outils";

// Règles des comptes de l'équipe, partagées par l'écran Équipe (validation dans le navigateur), ses actions serveur
// (gestion.ts), le script scripts/equipe-premier-admin.mjs et le test L3. Aucun import à l'exécution (ni « server-only »
// ni alias @/) : Node le lit tel quel (types effacés) et le navigateur peut l'embarquer. Aucun secret ici : l'adresse de
// la base et la clé secrète n'entrent que passées en argument par le serveur ou le script.
// Clé secrète dans l'en-tête « apikey » (doc Supabase « API keys »). POST /auth/v1/admin/users : 422 « email_exists »
// si l'adresse a déjà un compte ; DELETE /auth/v1/admin/users/<id> (source github.com/supabase/auth, internal/api/admin.go,
// adminUserCreate et adminUserDelete, lue le 02/11/2026).

export const LANGUES = ["FR", "EN", "ES", "DE", "PT", "HT", "GCF"] as const;
export const ROLES = ["agent", "admin"] as const;
export const DROITS = ["demandes", "liens", "billets", "boutique", "site"] as const;
export type Langue = (typeof LANGUES)[number];
export type Droit = (typeof DROITS)[number];
export type Invitation = { prenom: string; nom: string; email: string; telephone: string | null; langues: Langue[]; role: RoleCompte; droits: Partial<Record<Droit, boolean>> };
export type ChampInvalide = "prenom" | "nom" | "email" | "telephone" | "langues" | "role" | "droits";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TELEPHONE = /^\+?[0-9][0-9 ().-]{5,31}$/;
const texte = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
const dans = <T extends string>(liste: readonly T[], v: unknown): v is T => typeof v === "string" && (liste as readonly string[]).includes(v);

/** Champs d'un nouveau compte relus et normalisés (mêmes règles que la base, migration 20261030_equipe.sql), ou la
 * liste des champs refusés. La première langue sert aux e-mails envoyés à ce compte. */
export function lireInvitation(brut: unknown): { ok: true; v: Invitation } | { ok: false; champs: ChampInvalide[] } {
  const o = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
  const prenom = texte(o.prenom);
  const nom = texte(o.nom);
  const email = texte(o.email).toLowerCase();
  const telephone = texte(o.telephone);
  const langues = Array.isArray(o.langues) ? [...new Set(o.langues)] : [];
  const role = o.role ?? "agent";
  const droits = o.droits ?? {};
  const champs: ChampInvalide[] = [];
  if (!prenom || prenom.length > 80) champs.push("prenom");
  if (!nom || nom.length > 80) champs.push("nom");
  if (email.length < 3 || email.length > 254 || !EMAIL.test(email)) champs.push("email");
  if (telephone && !TELEPHONE.test(telephone)) champs.push("telephone");
  if (!langues.length || langues.length > LANGUES.length || !langues.every((l) => dans(LANGUES, l))) champs.push("langues");
  if (!dans(ROLES, role)) champs.push("role");
  const droitsLus = droits && typeof droits === "object" && !Array.isArray(droits) ? Object.entries(droits) : null;
  if (!droitsLus || droitsLus.some(([k, v]) => !dans(DROITS, k) || typeof v !== "boolean")) champs.push("droits");
  if (champs.length) return { ok: false, champs };
  return {
    ok: true,
    v: {
      prenom,
      nom,
      email,
      telephone: telephone || null,
      langues: langues as Langue[],
      role: role as RoleCompte,
      // un admin a tous les droits : rien à garder pour lui
      droits: role === "admin" ? {} : (Object.fromEntries(droitsLus ?? []) as Partial<Record<Droit, boolean>>),
    },
  };
}

/** Motif de refus d'une suspension, ou null : jamais soi-même, jamais le dernier admin actif. */
export function refusSuspension(acteurId: string, cible: { id: string; role: RoleCompte; etat: string }, adminsActifs: number): "soi" | "dernier_admin" | null {
  if (cible.id === acteurId) return "soi";
  if (cible.role === "admin" && cible.etat === "actif" && adminsActifs <= 1) return "dernier_admin";
  return null;
}

export type Acces = { url: string; cle: string };

/** Mot de passe de 64 caractères tiré au hasard, jamais affiché ni gardé : le compte choisit le sien à la première connexion. */
function motDePasseAleatoire() {
  const octets = new Uint8Array(32);
  globalThis.crypto.getRandomValues(octets);
  return Array.from(octets, (o) => o.toString(16).padStart(2, "0")).join("");
}

/** Crée le compte Supabase Auth (adresse confirmée, mot de passe aléatoire) puis le profil « invité ». « existe » si
 * l'adresse a déjà un profil ou un compte : rien n'est créé. Si le profil est refusé, le compte Auth tout juste créé est
 * retiré : rien ne reste à moitié fait. */
export async function creerInvite(a: Acces, v: Invitation): Promise<{ id: string } | "existe" | "panne"> {
  const entetes = { apikey: a.cle, "content-type": "application/json" };
  try {
    const deja = await fetch(`${a.url}/rest/v1/equipe_profils?select=id&email=eq.${encodeURIComponent(v.email)}&limit=1`, { headers: entetes, cache: "no-store" });
    if (!deja.ok) return "panne";
    if (((await deja.json()) as unknown[]).length) return "existe";

    const cree = await fetch(`${a.url}/auth/v1/admin/users`, { method: "POST", headers: entetes, body: JSON.stringify({ email: v.email, password: motDePasseAleatoire(), email_confirm: true }), cache: "no-store" });
    const compte = (await cree.json().catch(() => ({}))) as { id?: unknown; error_code?: unknown };
    if (cree.status === 422 && compte.error_code === "email_exists") return "existe";
    if (!cree.ok || typeof compte.id !== "string") return "panne";

    const profil = await fetch(`${a.url}/rest/v1/equipe_profils`, {
      method: "POST",
      headers: { ...entetes, prefer: "return=minimal" },
      body: JSON.stringify({ id: compte.id, role: v.role, prenom: v.prenom, nom: v.nom, email: v.email, telephone: v.telephone, langues: v.langues, droits: v.droits, etat: "invite" }),
      cache: "no-store",
    });
    if (!profil.ok) {
      await fetch(`${a.url}/auth/v1/admin/users/${encodeURIComponent(compte.id)}`, { method: "DELETE", headers: entetes, cache: "no-store" }).catch(() => null);
      return profil.status === 409 ? "existe" : "panne";
    }
    return { id: compte.id };
  } catch {
    return "panne";
  }
}
