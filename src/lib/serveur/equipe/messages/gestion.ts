import "server-only";
import { randomUUID } from "node:crypto";
import { base } from "../../base";
import { envoyerCourriel } from "../../courriel";
import { messageGestion } from "../../courriels/lettre";
import { JOURS_GESTION, jetonGestion, jetonLettre } from "./envoi";

/**
 * Lien de gestion de la lettre de Ouidah envoyé à un abonné (par son identifiant, ou par son adresse quand le formulaire
 * public la soumet de nouveau), e-mail « Votre abonnement à la lettre de Ouidah ». L'envoi est noté dans
 * lettre_gestion_envois AVANT de partir : la base refuse « deja » si un e-mail de ce type est parti vers cet abonné dans
 * les 24 h, et « limite » au-delà de 5 par heure pour une même connexion (migration 20261201). Rien n'est écrit dans
 * l'abonnement. Langue : celle de l'abonné, jamais celle de la demande. Module serveur, jamais une action.
 */
export async function envoyerGestion(cible: { id: string } | { email: string }, ip: string, origine: string): Promise<"envoye" | "deja" | "erreur"> {
  const filtre = "id" in cible ? `id=eq.${cible.id}` : `email=eq.${encodeURIComponent(cible.email)}`;
  const r = await base(`abonnes_lettre?select=id,email,langue&${filtre}&limit=1`);
  const a = r.ok ? ((await r.json()) as { id: string; email: string; langue: string }[])[0] : undefined;
  const gestion = a ? jetonGestion(a.id) : null;
  if (!a || !gestion) return "erreur";
  const note = await base("lettre_gestion_envois", { method: "POST", corps: { abonne_id: a.id, ip_hash: ip }, prefer: "return=minimal" });
  if (!note.ok) return ((await note.json().catch(() => null)) as { message?: unknown } | null)?.message === "deja" ? "deja" : "erreur";
  const desinscription = jetonLettre(a.id);
  const m = messageGestion({ langue: a.langue, gestion: `${origine}/lettre/abonnement/${gestion}`, desinscription: desinscription ? `${origine}/lettre/desinscription/${desinscription}` : null, jours: JOURS_GESTION }, origine);
  const parti = await envoyerCourriel({ a: a.email, sujet: m.sujet, html: m.html, texte: m.texte, cle: `lettre-gestion-${randomUUID()}`, modele: "auto-lettre-gestion", repondreA: process.env.EMAIL_OHT || null });
  return parti ? "envoye" : "erreur";
}
