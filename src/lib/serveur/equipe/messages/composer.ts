import "server-only";
import { communs, contact, copies } from "@/content/courriels";
import { type LangueMsg, LANGUES_MSG, RAISON_LETTRE, SIGNATURE_EQUIPE } from "@/content/espace-messages";
import { suivi } from "@/content/suivi";
import { echapper } from "../../courriel";
import { dateLongue } from "../../courriels/commun";
import { type Bloc, courriel, IMG, type Lien, NUM, rang, SANS, SERIF, txt } from "../../courriels/gabarit";
import { paragraphes } from "./rendu";

// Module serveur à part : rendu.ts est aussi lu par des écrans client (Lettre.tsx) et ne doit pas tirer le gabarit.
// Gabarit B « la signature » des e-mails écrits par l'équipe (choisi par Kevin le 10/11/2026, maquettes
// Assets OHT/Emails/maquettes/equipe/b-*.html) : une lettre, pas une affiche. Petit en-tête (emblème rond et nom), le texte
// de l'agent tel qu'il l'a écrit (salutation et formule de fin comprises), le document lié en carte, puis la signature de
// la personne (initiales, nom souligné du trait Soleil, langues cochées dans sa fiche) et un pied sobre. Numéro de la
// lettre de Ouidah : même gabarit, l'objet en titre Fraunces, signé Ouidah Heritage Tour, lien de désinscription.
// Aucune photo de lieu. Le gabarit E des e-mails automatiques (courriels/gabarit.ts) n'en partage que les pièces.

export type Agent = { prenom: string; nom: string; langues: readonly string[] };
/** Devis lié : numéro, lien vers son PDF, date de validité (AAAA-MM-JJ) s'il en a une. */
export type DocumentLie = { numero: string; href: string; valable: string | null };

const ENCRE = "#0f162d", GRIS = "#3f4863", FILET = "#dde1ea", SOLEIL = "#fdbf28", OCEAN = "#122460";
const p = (contenu: string, style: string, cls = "t-encre") => `<p class="${cls}" style="margin:0;${style}">${contenu}</p>`;
const texte = (taille: number, interligne: number, couleur = ENCRE, poids = 400) => `font-family:${SANS};font-weight:${poids};font-size:${taille}px;line-height:${interligne}px;color:${couleur};`;
const gris = (contenu: string, marge = "0") => p(contenu, `margin:${marge};${texte(15, 22, GRIS)}`, "t-gris");
const lien = (l: Lien, style = texte(15, 22, OCEAN)) => `<a class="lien" href="${echapper(l.href)}" style="${style}text-decoration:underline;text-underline-offset:3px;">${echapper(l.libelle)}</a>`;
// chiffres en Manrope tabulaires dans un titre Fraunces (en secours Gmail, les chiffres de Georgia sont elzéviriens) ;
// jamais à l'intérieur d'une entité (&#39;)
const chiffres = (h: string) => h.replace(/(?<![&#\w])\d+(?:(?:&nbsp;|[.,])\d+)*/g, (n) => `<span style="font-family:${SANS};${NUM}">${n}</span>`);
const nomSouligne = (nom: string, langue: string) =>
  p(`<span class="trait-fin" style="border-bottom:3px solid ${SOLEIL};padding-bottom:2px;white-space:nowrap;">${txt(nom, langue)}</span>`, `font-family:${SERIF};font-weight:600;font-size:20px;line-height:30px;color:${ENCRE};`, "t-encre serif");
/** Le texte de l'agent, paragraphe par paragraphe (17 px sur ordinateur : classe .corps du gabarit). */
const blocsTexte = (liste: string[], langue: string, pad: string): Bloc =>
  !liste.length ? { h: "", t: "" } : { h: rang(liste.map((x, i) => p(txt(x, langue), `margin:0 0 ${i === liste.length - 1 ? 0 : 16}px;${texte(16, 26)}`, "t-encre corps")).join(""), pad), t: liste.join("\n\n") };
/** Apostrophe droite tapée par l'agent entre deux lettres : apostrophe typographique (« l’aéroport »). */
const apostrophes = (t: string) => t.replace(/(\p{L})'(?=\p{L})/gu, "$1’");
const langueSure = (l: string): l is LangueMsg => (LANGUES_MSG as readonly string[]).includes(l);

function entete(origine: string, nom: string, langue: string): Bloc {
  const img = origine
    ? `<td width="44" valign="middle" style="width:44px;padding:0 12px 0 0;"><img src="${echapper(origine)}/courriels/oht-embleme-medaillon-128.png" width="44" height="44" alt="" style="display:block;width:44px;height:44px;${IMG}"></td>`
    : "";
  return { h: rang(`<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${img}<td valign="middle">${p(txt(nom, langue), texte(15, 20, ENCRE, 600))}</td></tr></table>`, "28px 24px 0px"), t: "" };
}

function titre(sujet: string, langue: string): Bloc {
  return {
    h: rang(`<h1 class="objet t-encre" style="margin:0;font-family:${SERIF};font-weight:600;font-size:30px;line-height:38px;letter-spacing:-0.3px;color:${ENCRE};text-wrap:balance;overflow-wrap:break-word;mso-line-height-rule:exactly;">${chiffres(txt(sujet, langue))}</h1>`, "40px 24px 24px"),
    t: sujet,
  };
}

/** Carte du devis lié : type, numéro, validité, lien vers le PDF (dans la langue du destinataire). */
function carte(d: DocumentLie, L: LangueMsg, sep: string): Bloc {
  const S = suivi[L], valable = d.valable ? S.devis.valable(dateLongue(d.valable, L)) : null;
  const action: Lien = { libelle: S.actions.devis, href: d.href };
  const h = `<table role="presentation" class="boite" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ${FILET};border-radius:12px;border-collapse:separate;"><tr><td style="padding:16px 20px 8px;">${gris(txt(S.documents.devis, L))}${p(txt(d.numero, L), `${texte(17, 24, ENCRE, 600)}${NUM}`)}${valable ? gris(txt(valable, L), "4px 0 0") : ""}${lien(action, `display:inline-block;padding:12px 0;${texte(16, 22, OCEAN, 600)}`)}</td></tr></table>`;
  return { h: rang(h, "12px 24px 0px"), t: [`${S.documents.devis} ${d.numero}`, valable, `${action.libelle}${sep}${d.href}`].filter(Boolean).join("\n") };
}

/** Signature de l'agent : initiales en disque navy, nom souligné du trait Soleil, maison, langues de sa fiche. */
function signature(a: Agent, L: LangueMsg, pad: string): Bloc {
  const nom = `${a.prenom} ${a.nom}`.trim();
  const initiales = [a.prenom, a.nom].map((x) => x.trim().charAt(0)).join("").toLocaleUpperCase(L.toLowerCase());
  const noms = a.langues.filter(langueSure).map((x) => SIGNATURE_EQUIPE[L].langues[x]);
  const parle = noms.length ? SIGNATURE_EQUIPE[L].parle(noms.length > 1 ? `${noms.slice(0, -1).join(", ")}${communs[L].et}${noms.at(-1)}` : noms[0]) : null;
  const disque = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="disque" width="56" height="56" align="center" valign="middle" bgcolor="${ENCRE}" style="width:56px;height:56px;border-radius:28px;background:${ENCRE};font-family:${SERIF};font-weight:600;font-size:20px;line-height:56px;color:#f7f1e8;text-align:center;mso-line-height-rule:exactly;">${echapper(initiales)}</td></tr></table>`;
  const lignes = `${nomSouligne(nom, L)}${gris("Ouidah Heritage Tour", "8px 0 0")}${parle ? gris(txt(parle, L)) : ""}`;
  return {
    h: rang(`<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="56" valign="top" style="width:56px;">${disque}</td><td valign="top" style="padding:0 0 0 16px;">${lignes}</td></tr></table>`, pad),
    t: [nom, "Ouidah Heritage Tour", parle].filter(Boolean).join("\n"),
  };
}

/** Signature d'un numéro de la lettre : la maison, puis l'adresse du site. */
function signatureLettre(origine: string, L: LangueMsg, pad: string): Bloc {
  const site = origine.replace(/^https?:\/\//, "");
  return { h: rang(`${nomSouligne("Ouidah Heritage Tour", L)}${site ? p(lien({ libelle: site, href: origine }), `margin:8px 0 0;${texte(15, 22, GRIS)}`, "t-gris") : ""}`, pad), t: ["Ouidah Heritage Tour", site].filter(Boolean).join("\n") };
}

function pied(o: { adresse: string; raison: string; desinscription?: Lien | null }, L: LangueMsg, sep: string): Bloc {
  const h = `${gris(txt(o.adresse, L))}${gris(lien({ libelle: contact, href: `mailto:${contact}` }), "0 0 12px")}${gris(txt(o.raison, L))}${o.desinscription ? gris(lien(o.desinscription), "12px 0 0") : ""}`;
  return {
    h: rang(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td class="filet" style="border-top:1px solid ${FILET};padding:24px 0 0;">${h}</td></tr></table>`, "0px 24px 44px"),
    t: ["—", o.adresse, contact, o.raison, o.desinscription && `${o.desinscription.libelle}${sep}${o.desinscription.href}`].filter(Boolean).join("\n"),
  };
}

/** E-mail complet (HTML et texte) d'un agent (`agent`, devis lié facultatif) ou d'un numéro de la lettre de Ouidah
 * (`desinscription`). `raison` : pourquoi cet e-mail arrive (pied). Sans `origine` : aucune image. */
export function composer(m: { langue: LangueMsg; origine: string; sujet: string; corps: string; raison: string; agent?: Agent | null; document?: DocumentLie | null; desinscription?: Lien | null }) {
  const L = m.langue, c = copies[L], blocs = paragraphes(apostrophes(m.corps)), lettre = Boolean(m.desinscription);
  // formule de fin (« Je reste à votre écoute, ») : dernier paragraphe court, sur une ligne, qui finit par une virgule ;
  // avec un document lié, elle passe sous sa carte, juste avant la signature, comme dans une lettre
  const fin = blocs.at(-1) ?? "";
  const formule = m.document && blocs.length > 1 && /^[^\n]{1,60},$/.test(fin) ? fin : null;
  const corps = formule ? blocs.slice(0, -1) : blocs;
  return courriel({ langue: L, sujet: m.sujet, apercu: blocs[0]?.slice(0, 140) ?? m.sujet }, [
    entete(m.origine, lettre ? RAISON_LETTRE[L].nom : "Ouidah Heritage Tour", L),
    lettre ? titre(apostrophes(m.sujet), L) : { h: "", t: "" },
    blocsTexte(corps, L, lettre ? "0px 24px 0px" : "40px 24px 0px"),
    m.document ? carte(m.document, L, c.sep) : { h: "", t: "" },
    formule ? blocsTexte([formule], L, "28px 24px 0px") : { h: "", t: "" },
    m.agent ? signature(m.agent, L, formule ? "20px 24px 48px" : "32px 24px 48px") : signatureLettre(m.origine, L, "32px 24px 48px"),
    pied({ adresse: c.signature, raison: m.raison, desinscription: m.desinscription }, L, c.sep),
  ]);
}
