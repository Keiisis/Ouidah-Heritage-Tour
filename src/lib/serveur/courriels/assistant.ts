import { copiesAuto } from "@/content/courriels-auto";
import { suivi } from "@/content/suivi";
import { lireContenu } from "@/lib/contenu";
import { base } from "../base";
import { envoyerAvis, envoyerCourriel } from "../courriel";
import { avis, ligne, nomLangue } from "./avis";
import { cloture, dateLongue, debut, heure, langueDe, lireModele, type Modele, prenomDe, textes } from "./commun";
import { courriel, paragraphes, titre } from "./gabarit";

// Conversation de l'assistant passée à l'équipe alors que personne n'est en ligne : avis à l'équipe (résumé, contact),
// et accusé au visiteur dans la langue de sa conversation dès qu'il a laissé son e-mail (« l'équipe vous répond par
// e-mail »). Tout est relu dans la conversation en base.
export type DonneesConversation = { id: string; langue: string; passage: string; resume: string | null; nom: string | null; email: string | null; whatsapp: string | null };

export function messageAccuse(d: DonneesConversation, origine: string, modele: Modele = null, textesSuivi = suivi) {
  const L = langueDe(d.langue), a = copiesAuto[L].assistant, prenom = d.nom ? prenomDe(d.nom) : "";
  const t = textes(modele, { prenom: prenom || undefined }, { sujet: a.sujet, corps: [a.corps] });
  return courriel({ langue: L, sujet: t.sujet, apercu: a.apercu }, [
    ...debut(origine, null, L),
    titre({ phrase: { prenom: prenom || null, avant: a.phrase[0], trait: a.phrase[1], apres: "." }, donnee: a.date(dateLongue(d.passage, L, false, textesSuivi)) }, L, origine),
    paragraphes(t.corps, L),
    ...cloture(L, null, a.raison),
  ]);
}

export function avisConversation(d: DonneesConversation, origine: string) {
  const quand = `${dateLongue(d.passage, "FR")}, ${heure(d.passage, "FR")}`;
  return avis(
    {
      sujet: `Conversation à reprendre · personne en ligne · ${quand}`,
      apercu: `Une conversation de l’assistant attend l’équipe depuis ${quand} (heure de Ouidah).`,
      titre: "Une conversation attend l’équipe",
      donnee: `${quand} (heure de Ouidah)`,
      bouton: d.email ? { libelle: `Écrire à ${d.nom ? prenomDe(d.nom) : d.email}`, href: `mailto:${d.email}` } : { libelle: "Ouvrir la boîte de l’équipe", href: `${origine}/agents/boite` },
      lignes: [ligne("Langue", nomLangue(langueDe(d.langue))), ligne("Nom", d.nom), ligne("E-mail", d.email), ligne("WhatsApp", d.whatsapp), ligne("Coordonnées", d.email || d.whatsapp ? null : "pas encore laissées")],
      mot: d.resume ? { texte: d.resume, auteur: "Résumé de la conversation" } : null,
      raison: "Avis interne envoyé à l’équipe quand une conversation lui est passée alors que personne n’est en ligne.",
    },
    origine,
  );
}

type Ligne = { id: string; langue: string; passage_le: string | null; resume: string | null; contact_nom: string | null; contact_email: string | null; contact_whatsapp: string | null };

/** Conversation passée à l'équipe hors ligne (mode agent, hors_ligne), null sinon. */
async function lire(id: string): Promise<DonneesConversation | null> {
  try {
    const r = await base(`conversations?select=id,langue,passage_le,resume,contact_nom,contact_email,contact_whatsapp&id=eq.${id}&mode=eq.agent&hors_ligne=is.true&limit=1`);
    const x = r.ok ? ((await r.json()) as Ligne[])[0] : null;
    return x?.passage_le ? { id: x.id, langue: x.langue, passage: x.passage_le, resume: x.resume, nom: x.contact_nom, email: x.contact_email, whatsapp: x.contact_whatsapp } : null;
  } catch {
    return null;
  }
}

/** Passage à l'équipe sans agent en ligne : avis à l'équipe. */
export async function envoyerAvisConversation(id: string, origine: string) {
  const d = await lire(id);
  if (!d) return false;
  const a = avisConversation(d, origine);
  return envoyerAvis({ sujet: a.sujet, html: a.html, texte: a.texte, repondreA: d.email, cle: `conversation-${d.id}-${Date.parse(d.passage)}-avis`, modele: "avis-assistant" });
}

/** Adresse laissée par le visiteur d'une conversation passée hors ligne : accusé dans sa langue. */
export async function envoyerAccuse(id: string, origine: string) {
  const d = await lire(id);
  if (!d?.email) return false;
  const L = langueDe(d.langue);
  const [modele, textesSuivi] = await Promise.all([lireModele("auto-assistant", L), lireContenu("suivi.suivi")]);
  const m = messageAccuse(d, origine, modele, textesSuivi);
  return envoyerCourriel({ a: d.email, sujet: m.sujet, html: m.html, texte: m.texte, repondreA: process.env.EMAIL_OHT || null, cle: `conversation-${d.id}-accuse`, modele: "auto-assistant" });
}
