import "server-only";
import { base } from "../base";
import type { Profil } from "./outils";

// Comptes de l'équipe. Les mots de passe restent dans Supabase Auth, appelée par fetch depuis le serveur seulement, avec
// la clé secrète (sb_secret_…) dans l'en-tête « apikey » et jamais en « Authorization: Bearer » : ces clés ne sont pas
// des JWT. Sources : doc Supabase « API keys » (supabase.com/docs/guides/api/api-keys) ; appels /auth/v1/admin/… avec le
// seul en-tête apikey : doc « Configure Passkey Authentication » (supabase.com/docs/guides/self-hosting/self-hosted-passkeys) ;
// points d'entrée POST /token?grant_type=password, PUT /admin/users/<id>, POST /logout : README de github.com/supabase/auth.
function auth(chemin: string, corps: unknown, init: { method?: "POST" | "PUT" | "DELETE"; jwt?: string } = {}) {
  const entetes: Record<string, string> = { apikey: process.env.SUPABASE_SECRET_KEY ?? "", "content-type": "application/json" };
  if (init.jwt) entetes.authorization = `Bearer ${init.jwt}`; // jeton d'accès de l'utilisateur (un vrai JWT), jamais la clé
  return fetch(`${process.env.SUPABASE_URL}/auth/v1/${chemin}`, { method: init.method ?? "POST", headers: entetes, body: JSON.stringify(corps), cache: "no-store" });
}

/** Identifiant du compte si le mot de passe est juste, sinon null. La session Supabase ouverte au passage est refermée
 * aussitôt : le site garde ses propres sessions (equipe_sessions). */
export async function verifierMotDePasse(email: string, mdp: string): Promise<string | null> {
  try {
    const r = await auth("token?grant_type=password", { email, password: mdp });
    if (!r.ok) return null;
    const j = (await r.json()) as { access_token?: string; user?: { id?: unknown } };
    if (j.access_token) await auth("logout", {}, { jwt: j.access_token }).catch(() => null);
    return typeof j.user?.id === "string" ? j.user.id : null;
  } catch {
    return null;
  }
}

export async function changerMotDePasse(id: string, mdp: string) {
  try {
    return (await auth(`admin/users/${encodeURIComponent(id)}`, { password: mdp }, { method: "PUT" })).ok;
  } catch {
    return false;
  }
}

/** Bannit le compte Supabase Auth (aucune connexion par mot de passe, aucun jeton renouvelé) ou lève le bannissement.
 * ban_duration : durée au format Go (« 876000h », environ 100 ans) ou « none » pour lever (source github.com/supabase/auth,
 * internal/api/admin.go adminUserUpdate et internal/models/user.go Ban, lue le 02/11/2026). */
export async function bannir(id: string, oui: boolean) {
  try {
    return (await auth(`admin/users/${encodeURIComponent(id)}`, { ban_duration: oui ? "876000h" : "none" }, { method: "PUT" })).ok;
  } catch {
    return false;
  }
}

/** Supprime le compte Supabase Auth en mode « soft delete » : adresse et téléphone rendus illisibles, mot de passe et
 * sessions Supabase effacés, la ligne auth.users gardée, donc aucune cascade vers equipe_profils. Vrai aussi si le compte
 * n'existe plus (404 « user_not_found ») : une suppression interrompue se reprend. Source github.com/supabase/auth, internal/api/admin.go
 * (adminUserDelete, should_soft_delete) et internal/models/user.go (SoftDeleteUser), lue le 09/11/2026. */
export async function supprimerAuth(id: string) {
  try {
    const r = await auth(`admin/users/${encodeURIComponent(id)}`, { should_soft_delete: true }, { method: "DELETE" });
    if (r.ok) return true;
    const j = (await r.json().catch(() => ({}))) as { error_code?: unknown };
    return r.status === 404 && j.error_code === "user_not_found";
  } catch {
    return false;
  }
}

const CHAMPS = "select=id,prenom,email,role,etat,langues";

/** Profil par identifiant ou par e-mail (déjà en minuscules) ; null s'il n'existe pas ou si la base ne répond pas. */
export async function lireProfil(cle: { id: string } | { email: string }): Promise<Profil | null> {
  const filtre = "id" in cle ? `id=eq.${encodeURIComponent(cle.id)}` : `email=eq.${encodeURIComponent(cle.email)}`;
  try {
    const r = await base(`equipe_profils?${CHAMPS}&${filtre}&limit=1`);
    if (!r.ok) return null;
    return ((await r.json()) as Profil[])[0] ?? null;
  } catch {
    return null;
  }
}

export async function modifierProfil(id: string, champs: Partial<{ etat: "actif"; derniere_connexion: string; modifie_le: string }>) {
  try {
    return (await base(`equipe_profils?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", corps: champs, prefer: "return=minimal" })).ok;
  } catch {
    return false;
  }
}
