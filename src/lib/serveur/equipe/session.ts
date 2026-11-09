import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Role } from "@/content/equipe";
import { base, baseConfiguree } from "../base";
import { autorise, COOKIE, iso, jetonValide, nouveauJeton, optionsCookie, type RoleCompte, SESSION_MAX_MS, SESSION_MS, sha256 } from "./outils";
import { requeteBloquee } from "./securite/ip";

// Sessions de l'équipe et couche d'accès (DAL, doc Next 16 « Authentication » › Creating a Data Access Layer) : la page et
// chaque route relisent la session en base, jamais une donnée du navigateur. Cookie __Host-oht_equipe : jeton de 32
// octets, httpOnly, Secure, SameSite=Lax ; en base, son empreinte SHA-256 seulement. 12 h glissantes, 7 jours au plus.
// Un compte suspendu (ou encore invité) n'a jamais de session valable.
export type Theme = "auto" | "clair" | "sombre";
// droits : colonne equipe_profils.droits telle quelle, lue avec la session (securite/droits.ts l'interprète) ; serveur seulement
export type Session = { id: string; profilId: string; prenom: string; nom: string; role: RoleCompte; theme: Theme; droits: unknown };
type Ligne = { id: string; profil_id: string; expire_le: string; fin_max: string; vu_le: string; profil: { prenom: string; nom: string; role: RoleCompte; etat: string; theme: Theme; droits: unknown } | null };

/** Ouvre une session (route handler seulement : le cookie ne peut être posé qu'ici). */
export async function ouvrirSession(profilId: string, ipH: string) {
  const jeton = nouveauJeton();
  const t = Date.now();
  try {
    const r = await base("equipe_sessions", {
      method: "POST",
      corps: { profil_id: profilId, jeton_hash: sha256(jeton), expire_le: iso(t + SESSION_MS), fin_max: iso(t + SESSION_MAX_MS), ip_hash: ipH },
      prefer: "return=minimal",
    });
    if (!r.ok) return false;
  } catch {
    return false;
  }
  (await cookies()).set(COOKIE, jeton, optionsCookie(SESSION_MAX_MS / 1000));
  return true;
}

/** Session valable de la requête, ou null. Mémorisée pendant un rendu (React cache). La lecture du cookie précède toute
 * lecture de l'heure : appelée sous <Suspense>, elle n'entre jamais dans le rendu statique. */
export const lireSession = cache(async (): Promise<Session | null> => {
  const jeton = (await cookies()).get(COOKIE)?.value;
  if (!jetonValide(jeton) || !baseConfiguree()) return null;
  // rendu à la requête avant de lire l'heure (doc Next 16 « Caching » › blocking-prerender-current-time) : un prérendu qui
  // dispose des cookies (rafraîchissement après une action, préchargement) ne fige jamais l'expiration de la session
  await connection();
  // adresse IP bloquée par un admin (lot « securite », ip_bloquees) : aucune session ne vaut depuis elle, ni page ni action
  try {
    // IP bloquée et session lues en même temps (un aller-retour au lieu de deux) ; une IP bloquée refuse toujours
    const [bloquee, r] = await Promise.all([requeteBloquee(), base(`equipe_sessions?select=id,profil_id,expire_le,fin_max,vu_le,profil:equipe_profils(prenom,nom,role,etat,theme,droits)&jeton_hash=eq.${sha256(jeton)}&revoque_le=is.null&limit=1`)]);
    if (bloquee) return null;
    const s = r.ok ? ((await r.json()) as Ligne[])[0] : undefined;
    const t = Date.now();
    const fin = s ? Date.parse(s.fin_max) : 0;
    if (!s || !s.profil || s.profil.etat !== "actif" || Date.parse(s.expire_le) <= t || fin <= t) return null;
    // 12 h glissantes : prolongée au plus toutes les 5 minutes, jamais au-delà de fin_max (aucun cookie touché ici)
    if (t - Date.parse(s.vu_le) > 5 * 60_000) {
      await base(`equipe_sessions?id=eq.${s.id}&revoque_le=is.null`, { method: "PATCH", corps: { vu_le: iso(t), expire_le: iso(Math.min(t + SESSION_MS, fin)) }, prefer: "return=minimal" }).catch(() => null);
    }
    return { id: s.id, profilId: s.profil_id, prenom: s.profil.prenom, nom: s.profil.nom, role: s.profil.role, theme: s.profil.theme, droits: s.profil.droits };
  } catch {
    return null;
  }
});

/** Session dont le rôle ouvre cette entrée (un agent est refusé sur /admins), sinon null. */
export async function exigerRole(page: Role): Promise<Session | null> {
  const s = await lireSession();
  return s && autorise(s.role, page) ? s : null;
}

/** Ferme la session de ce navigateur : révoquée en base, cookie effacé (route handler seulement). */
export async function fermerSession() {
  const store = await cookies();
  const jeton = store.get(COOKIE)?.value;
  if (jetonValide(jeton) && baseConfiguree()) {
    await base(`equipe_sessions?jeton_hash=eq.${sha256(jeton)}&revoque_le=is.null`, { method: "PATCH", corps: { revoque_le: iso(Date.now()) }, prefer: "return=minimal" }).catch(() => null);
  }
  store.set(COOKIE, "", optionsCookie(0));
}

/** Révoque toutes les sessions ouvertes d'un compte (après un nouveau mot de passe). */
export async function revoquerSessions(profilId: string) {
  try {
    return (await base(`equipe_sessions?profil_id=eq.${encodeURIComponent(profilId)}&revoque_le=is.null`, { method: "PATCH", corps: { revoque_le: iso(Date.now()) }, prefer: "return=minimal" })).ok;
  } catch {
    return false;
  }
}
