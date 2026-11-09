import { espace as T } from "@/content/espace";
import type { Membre } from "@/lib/serveur/equipe/securite/lectures";

// Petits outils communs des écrans « securite » (composants serveur) : dates à l'heure de Ouidah, noms des membres.
const leMoment = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: T.ouidah.fuseau });
const leJour = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: T.ouidah.fuseau });
export const moment = (iso: string) => leMoment.format(Date.parse(iso));
export const jourFr = (v: string) => leJour.format(Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00Z` : v));
/** « Prénom Nom » de chaque membre, par identifiant. */
export const noms = (m: Membre[] | null) => new Map((m ?? []).map((x) => [x.id, `${x.prenom} ${x.nom}`]));
/** Identifiant court (8 caractères) d'un objet sans nom à l'écran. */
export const court = (id: string) => id.slice(0, 8);
