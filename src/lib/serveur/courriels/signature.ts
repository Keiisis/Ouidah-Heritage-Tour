import { communs, copies } from "@/content/courriels";
import { copiesAuto } from "@/content/courriels-auto";
import { suivi } from "@/content/suivi";
import { lireContenu } from "@/lib/contenu";
import { base } from "../base";
import { envoyerAvis, envoyerCourriel } from "../courriel";
import { lireJeton } from "../documents/jeton";
import { avis, ligne, nomLangue } from "./avis";
import { cloture, dateLongue, debut, fcfa, heure, langueDe, lireModele, type Modele, prenomDe, textes } from "./commun";
import { boutons, courriel, notes, paragraphes, titre } from "./gabarit";

// Devis signé en ligne (/suivi/<jeton>/signer) : confirmation au client signataire, dans la langue enregistrée avec sa
// signature, et avis à l'équipe. Numéro D-, montant, signataire et date viennent du devis et de sa signature en base.
export type DonneesSignature = {
  nom: string; // client du dossier
  email: string;
  langue: string;
  signataire: string;
  signeLe: string;
  jeton: string; // suivi d-…
  numero: string; // D-…
  reference: string; // DEM-…
  montant: number;
  agent: string | null; // prénom du conseiller du dossier
};

export function messageSignature(d: DonneesSignature, origine: string, modele: Modele = null, textesSuivi = suivi) {
  const L = langueDe(d.langue), c = copies[L], a = copiesAuto[L].signature, T = textesSuivi[L];
  const prenom = prenomDe(d.nom), lien = `${origine}/suivi/${d.jeton}`, le = dateLongue(d.signeLe, L, false, textesSuivi);
  const t = textes(modele, { prenom: prenom || undefined, lien, reference: d.numero }, { sujet: a.sujet, corps: [a.corps] });
  return courriel({ langue: L, sujet: t.sujet, apercu: a.apercu(d.numero, le) }, [
    ...debut(origine, "porte", L),
    titre({ phrase: { prenom, avant: a.phrase[0], trait: a.phrase[1], apres: "." }, donnee: a.signeLe(le), montant: fcfa(d.montant, L, textesSuivi) }, L, origine),
    paragraphes(t.corps, L),
    boutons({ principal: { libelle: a.bouton, href: lien }, secondaire: { libelle: communs[L].pdf(T.actions.devis), href: `${lien}/document` } }, c.sep, "0px 24px 8px"),
    notes([{ libelle: a.signataire, valeur: d.signataire }], [`${T.numero.devis} ${d.numero}`, `${c.refDemande}${c.sep}${d.reference}`], L, c.sep),
    ...cloture(L, communs[L].question, a.raison),
  ]);
}

export function avisSignature(d: DonneesSignature, origine: string) {
  return avis(
    {
      sujet: `Devis signé · ${d.numero} · ${d.nom}`,
      apercu: `${d.signataire} a signé le devis ${d.numero} · ${fcfa(d.montant, "FR")}`,
      titre: `Devis signé par ${d.signataire}`,
      donnee: d.numero,
      bouton: { libelle: `Écrire à ${prenomDe(d.nom)}`, href: `mailto:${d.email}` },
      lignes: [
        ligne("Montant", fcfa(d.montant, "FR")),
        ligne("Signé le", `${dateLongue(d.signeLe, "FR")}, ${heure(d.signeLe, "FR")} (heure de Ouidah)`),
        ligne("Signataire", d.signataire),
        ligne("Client", d.nom),
        ligne("E-mail", d.email),
        ligne("Référence", d.reference),
        ligne("Conseiller", d.agent),
        ligne("Langue", nomLangue(langueDe(d.langue))),
      ],
      raison: "Avis interne envoyé à l’équipe pour chaque devis signé en ligne sur ouidahheritagetour.bj.",
    },
    origine,
  );
}

type Brut = { id: string; nom: string | null; email: string | null; agent: { prenom: string } | null; devis: { id: string; montant: number; signature: { nom: string; langue: string; cree_le: string } | { nom: string; langue: string; cree_le: string }[] | null }[] };
const un = <T>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));

/** Après une signature enregistrée : confirmation au client et avis à l'équipe (demande, devis et signature relus). */
export async function envoyerSignature(jeton: string, origine: string) {
  const j = lireJeton(jeton);
  if (!j || j.s !== "d") return { client: false, equipe: false };
  try {
    const r = await base(`demandes?select=id,nom,email,agent:equipe_profils(prenom),devis(id,montant,signature:devis_signatures(nom,langue,cree_le))&id=eq.${j.id}&devis.statut=eq.pret&limit=1`);
    const x = r.ok ? ((await r.json()) as Brut[])[0] : null;
    const v = x?.devis.find((y) => un(y.signature));
    const s = v ? un(v.signature) : null;
    if (!x?.email || !x.nom || !v || !s) return { client: false, equipe: false };
    const n = await base(`documents?select=numero&type=eq.D&source=eq.devis&source_id=eq.${v.id}&limit=1`);
    const numero = n.ok ? (((await n.json()) as { numero: string }[])[0]?.numero ?? null) : null;
    if (!numero) return { client: false, equipe: false };
    const d: DonneesSignature = { nom: x.nom, email: x.email, langue: s.langue, signataire: s.nom, signeLe: s.cree_le, jeton, numero, reference: `DEM-${x.id.slice(0, 6).toUpperCase()}`, montant: v.montant, agent: x.agent?.prenom ?? null };
    const L = langueDe(d.langue);
    const [modele, textesSuivi] = await Promise.all([lireModele("auto-signature", L), lireContenu("suivi.suivi")]);
    const m = messageSignature(d, origine, modele, textesSuivi), a = avisSignature(d, origine);
    const [client, equipe] = await Promise.all([
      envoyerCourriel({ a: d.email, sujet: m.sujet, html: m.html, texte: m.texte, repondreA: process.env.EMAIL_OHT || null, cle: `signature-${v.id}`, modele: "auto-signature" }),
      envoyerAvis({ sujet: a.sujet, html: a.html, texte: a.texte, repondreA: d.email, cle: `signature-${v.id}-avis`, modele: "avis-signature" }),
    ]);
    return { client, equipe };
  } catch {
    return { client: false, equipe: false };
  }
}
