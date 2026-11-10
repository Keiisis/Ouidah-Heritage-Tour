import "server-only";
import { communs, contact, copies, type PhotoCourriel } from "@/content/courriels";
import type { LangueMsg } from "@/content/espace-messages";
import { debut } from "../../courriels/commun";
import { boutons, courriel, fin, type Lien, paragraphes as blocsTexte, pied, titre } from "../../courriels/gabarit";
import { paragraphes } from "./rendu";

// Module serveur à part : rendu.ts est aussi lu par des écrans client (Lettre.tsx) et ne doit pas tirer le gabarit.
/** E-mail complet (HTML et texte) du corps déjà rempli, au gabarit « la lettre illustrée » des e-mails du site (en-tête,
 * photo, paragraphes, document lié en bouton, signature, pied navy) : un e-mail écrit par l'équipe a la même allure que
 * les e-mails automatiques. `raison` : pourquoi cet e-mail arrive (pied). */
export function composer(m: { langue: LangueMsg; origine: string; sujet: string; corps: string; prenom?: string | null; pieces?: Lien[]; signature?: string | null; raison: string; lien?: Lien | null; photo?: PhotoCourriel | null }) {
  const L = m.langue, c = copies[L], blocs = paragraphes(m.corps);
  // phrase titre Fraunces du gabarit validé (maquette E) : l'objet, ses deux derniers mots soulignés du trait Soleil
  const mots = m.sujet.replace(/[.!?…]+$/, "").split(" ");
  const coupe = mots.length > 3 ? mots.length - 2 : mots.length;
  return courriel({ langue: L, sujet: m.sujet, apercu: blocs[0]?.slice(0, 140) ?? m.sujet }, [
    ...debut(m.origine, m.photo === undefined ? "porte" : m.photo, L),
    titre({ phrase: { prenom: m.prenom || null, avant: m.prenom ? mots.slice(0, coupe).join(" ").replace(/^\p{Lu}(?!\p{Lu})/u, (x) => x.toLocaleLowerCase(L.toLowerCase())) : mots.slice(0, coupe).join(" "), trait: mots.slice(coupe).join(" ") || null, apres: mots.length ? "." : "" } }, L, m.origine),
    blocsTexte(blocs, L),
    boutons({ principal: m.pieces?.[0] ?? null, secondaire: m.pieces?.[1] ?? null }, c.sep, "0px 24px 8px"),
    fin({ phrase: null, salutation: communs[L].salutation, equipe: m.signature || communs[L].equipe }, L),
    pied({ adresse: c.signature, email: contact, raison: m.raison, ...(m.lien ? { lien: m.lien } : {}) }, L, c.sep),
  ]);
}
