import { randomUUID } from "node:crypto";
import { contact } from "@/content/courriels";
import { copiesLettre } from "@/content/courriels-lettre";
import { newsletter as NEWSLETTER } from "@/content/fr";
import { lireContenu } from "@/lib/contenu";
import { envoyerCourriel } from "../courriel";
import { cloture, debut, langueDe, lireModele, type Modele, textes } from "./commun";
import { courriel, liste, paragraphes, titre } from "./gabarit";

// « Inscription à la lettre de Ouidah » : thèmes réellement cochés, langue de la lettre, désinscription. Lien personnel
// (/lettre/desinscription/<jeton>) quand le jeton existe ; sinon consigne « répondez désinscription ». Toujours l'en-tête
// List-Unsubscribe vers contact@ (sujet « desinscription »).
export type DonneesLettre = { langue: string; sujets: string[]; desinscription: string | null };

export function messageLettre(d: DonneesLettre, origine: string, modele: Modele = null, newsletter = NEWSLETTER) {
  const L = langueDe(d.langue), c = copiesLettre[L];
  const themes = d.sujets
    .map((id) => {
      const fr = newsletter.sujets.find((x) => x.id === id);
      const t = L === "FR" ? fr : (c.themes[id] ?? fr);
      // après « : », minuscule initiale, sauf nom propre en tête (« Vodun Days, … »)
      return t ? { fort: t.nom, texte: /^\S+\s+\p{Ll}/u.test(t.texte) ? t.texte.charAt(0).toLocaleLowerCase(L.toLowerCase()) + t.texte.slice(1) : t.texte } : null;
    })
    .filter((x): x is { fort: string; texte: string } => x !== null);
  const t = textes(modele, { lien: d.desinscription ?? undefined }, { sujet: c.sujet, corps: [c.intro(themes.length)] });
  const m = courriel({ langue: L, sujet: t.sujet, apercu: `${c.phrase[0]} ${c.phrase[1]}.` }, [
    ...debut(origine, "rue-basilique", L),
    titre({ phrase: { avant: c.phrase[0], trait: c.phrase[1], apres: "." } }, L, origine),
    paragraphes(t.corps, L, "0px 24px 16px"),
    liste(themes, L, L === "FR" || L === "GCF" ? " : " : ": "),
    paragraphes([c.langue], L, "0px 24px 0px"),
    ...cloture(L, null, c.raison, d.desinscription ? { lien: { libelle: c.lien, href: d.desinscription } } : { consigne: c.consigne }, "28px 24px 48px"),
  ]);
  const entetes = { "List-Unsubscribe": [d.desinscription && `<${d.desinscription}>`, `<mailto:${contact}?subject=desinscription>`].filter(Boolean).join(", ") };
  return { ...m, entetes };
}

/** Envoi après une inscription enregistrée (201) ; false si l'envoi n'est pas configuré ou échoue. */
export async function envoyerLettre(email: string, d: DonneesLettre, origine: string) {
  const [modele, newsletter] = await Promise.all([lireModele("auto-lettre", langueDe(d.langue)), lireContenu("fr.newsletter")]);
  const m = messageLettre(d, origine, modele, newsletter);
  return envoyerCourriel({ a: email, sujet: m.sujet, html: m.html, texte: m.texte, cle: `lettre-inscription-${randomUUID()}`, entetes: m.entetes, repondreA: process.env.EMAIL_OHT || null });
}
