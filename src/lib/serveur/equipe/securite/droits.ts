import "server-only";
import type { Role } from "@/content/equipe";
import { espace as T } from "@/content/espace";
import { type Droit, DROITS } from "../partage";
import { exigerRole, type Session } from "../session";

// Droits d'un agent (equipe_profils.droits), appliqués côté serveur partout (lot « securite ») : chaque écran et chaque
// action des demandes, liens de paiement, billets et commandes boutique appelle exigerDroit. Un admin a tous les droits.
// Droit absent du profil : la valeur cochée d'avance à l'invitation (content/espace.ts, equipe.droits), la même que
// l'écran « Rôles et droits » affiche ; un droit enregistré, vrai ou faux, l'emporte toujours. Les droits sont relus en
// base à chaque requête, avec la session (même requête que lireSession, session.ts) : un droit retiré vaut dès l'appel
// suivant, sans aller-retour de plus.

const DEFAUT = Object.fromEntries(T.equipe.droits.map(([k, , oui]) => [k, oui])) as Record<Droit, boolean>;

/** Droits effectifs d'un profil d'après sa colonne droits. */
export const droitsEffectifs = (brut: unknown): Record<Droit, boolean> => {
  const d = brut && typeof brut === "object" && !Array.isArray(brut) ? (brut as Record<string, unknown>) : {};
  return Object.fromEntries(DROITS.map((k) => [k, typeof d[k] === "boolean" ? d[k] : DEFAUT[k]])) as Record<Droit, boolean>;
};

/** Session de l'espace (`page`, agents par défaut) si ce droit lui est ouvert ; sinon null, comme sans session. */
export async function exigerDroit(droit: Droit, page: Role = "agents"): Promise<Session | null> {
  const s = await exigerRole(page);
  if (!s || s.role === "admin") return s;
  return droitsEffectifs(s.droits)[droit] === true ? s : null;
}
