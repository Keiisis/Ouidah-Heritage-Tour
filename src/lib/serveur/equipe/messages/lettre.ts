"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { LIMITES_COURRIEL, type LangueMsg, msg, RAISON_LETTRE } from "@/content/espace-messages";
import { lireContenu } from "@/lib/contenu";
import { base, compter } from "../../base";
import { journaliser } from "../journal";
import { exigerRole } from "../session";
import { emailDe, jetonLettre, origine, partir, voie } from "./envoi";
import type { RetourMessages } from "./actions";
import { composer } from "./composer";
import { estLangue, lireTexte, UUID } from "./rendu";
import { peutPasser } from "../../machines";
import { type StatutNumero, TRANSITIONS_ENVOI_LETTRE, TRANSITIONS_NUMERO } from "./regles";

// La lettre de Ouidah (admin) : brouillon d'un numéro, test à soi-même, envoi par lots aux abonnés réels. Chaque appel
// relit la session et exige le rôle admin. L'envoi réel demande le nombre de destinataires annoncé à l'écran (recompté
// ici : s'il a changé, rien ne part) ; chaque abonné est d'abord « réservé » dans lettre_envois (unicité numéro + abonné),
// puis l'e-mail part avec SON lien de désinscription : un numéro ne part jamais deux fois à la même adresse, même si deux
// appels se croisent. Les désinscrits ne reçoivent rien (relu à chaque lot).

const LOT = LIMITES_COURRIEL.lot; // e-mails par appel
const PAGE = 400; // abonnés examinés par appel

type Numero = { langue: LangueMsg; sujets: string[]; objet: string; corps: string };
type Ligne = Numero & { id: string; statut: StatutNumero; curseur: string | null };
type Abonne = { id: string; email: string; sujets: unknown };

const objet = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const maintenant = () => new Date().toISOString();
const vise = (a: { sujets: unknown }, sujets: string[]) => Array.isArray(a.sujets) && a.sujets.some((x) => sujets.includes(x as string));

async function lireNumero(brut: unknown): Promise<{ ok: true; v: Numero; id: string | null } | { ok: false; champs: string[] }> {
  const newsletter = await lireContenu("fr.newsletter");
  const o = objet(brut);
  const champs: string[] = [];
  if (!estLangue(o.langue)) champs.push("langue");
  const sujets = Array.isArray(o.sujets) ? [...new Set(o.sujets)].filter((x): x is string => newsletter.sujets.some((t) => t.id === x)) : [];
  if (!sujets.length || !Array.isArray(o.sujets) || sujets.length !== new Set(o.sujets).size) champs.push("themes");
  const t = lireTexte(o.objet, o.corps, true);
  champs.push(...t.champs);
  if (!t.corps && !champs.includes("corps")) champs.push("corps");
  const id = typeof o.id === "string" && o.id ? o.id : null;
  if (id !== null && !UUID.test(id)) champs.push("id");
  return champs.length ? { ok: false, champs } : { ok: true, v: { langue: o.langue as LangueMsg, sujets, objet: t.objet, corps: t.corps }, id };
}

async function ecrire<R>(chemin: string, method: "POST" | "PATCH", corps: unknown, prefer = "return=representation"): Promise<R[] | null> {
  try {
    const r = await base(chemin, { method, corps, prefer });
    return r.ok ? ((await r.json()) as R[]) : null;
  } catch {
    return null;
  }
}
async function lire<T>(chemin: string): Promise<T[] | null> {
  try {
    const r = await base(chemin);
    return r.ok ? ((await r.json()) as T[]) : null;
  } catch {
    return null;
  }
}

// même gabarit que les autres e-mails (photo de la rue de la Basilique, comme la confirmation d'inscription) ; lien de
// désinscription propre à l'abonné dans le pied
const rendre = (n: Numero, lien: string, o: string) => composer({ langue: n.langue, origine: o, sujet: n.objet, corps: n.corps, raison: RAISON_LETTRE[n.langue].raison, desinscription: { libelle: RAISON_LETTRE[n.langue].lien, href: lien } });

/** Abonnés actifs de la langue qui ont choisi un des thèmes (nombre seulement). */
async function cible(n: Numero): Promise<number | null> {
  const l = await lire<{ sujets: unknown }>(`abonnes_lettre?select=sujets&langue=eq.${n.langue}&desinscrit_le=is.null&limit=50000`);
  return l ? l.filter((a) => vise(a, n.sujets)).length : null;
}

export async function enregistrerNumero(brut: unknown): Promise<RetourMessages> {
  const s = await exigerRole("admins");
  if (!s) return { erreur: "refuse" };
  const lu = await lireNumero(brut);
  if (!lu.ok) return { erreur: "champs", champs: lu.champs };
  const r = lu.id
    ? await ecrire<{ id: string }>(`lettre_numeros?id=eq.${lu.id}&statut=eq.brouillon&select=id`, "PATCH", { ...lu.v, modifie_le: maintenant() })
    : await ecrire<{ id: string }>("lettre_numeros?select=id", "POST", { ...lu.v, auteur_id: s.profilId, statut: "brouillon" });
  if (!r) return { erreur: "panne" };
  if (!r[0]) return { erreur: "etat" }; // déjà parti
  await journaliser("lettre.brouillon", s.profilId, null, { numero: r[0].id, langue: lu.v.langue });
  refresh();
  return { ok: true, id: r[0].id };
}

/** Le numéro tel qu'un abonné le recevra, envoyé à l'adresse de l'admin connecté SEULEMENT (aucun abonné). */
export async function testerNumero(brut: unknown): Promise<RetourMessages> {
  const s = await exigerRole("admins");
  if (!s) return { erreur: "refuse" };
  const lu = await lireNumero(brut);
  if (!lu.ok) return { erreur: "champs", champs: lu.champs };
  const [v, a] = await Promise.all([voie(), emailDe(s.profilId)]);
  if (!v) return { erreur: "smtp" };
  if (!a) return { erreur: "panne" };
  const e = rendre(lu.v, msg.lettre.lienExemple, (await origine()) ?? "");
  const parti = await partir({ a, sujet: `${msg.prefixeTest}${e.sujet}`, html: e.html, texte: e.texte, cle: `lettre-test-${randomUUID()}` }, v.boite);
  await journaliser("lettre.test", s.profilId, null, { langue: lu.v.langue, ...(lu.id ? { numero: lu.id } : {}), ...(parti ? {} : { motif: "envoi" as const }) });
  return parti ? { ok: true, a } : { erreur: "envoi" };
}

/**
 * Envoi réel d'un numéro enregistré, un lot par appel (l'écran rappelle jusqu'à `fini`). Premier appel : `attendu` doit
 * être le nombre de destinataires recompté ici, sinon « confirmer » (rien ne part) ; le numéro passe « en cours ». Les
 * appels suivants reprennent au curseur.
 */
export async function envoyerLettre(id: unknown, attendu: unknown): Promise<RetourMessages> {
  const s = await exigerRole("admins");
  if (!s) return { erreur: "refuse" };
  if (typeof id !== "string" || !UUID.test(id)) return { erreur: "champs" };
  const l = await lire<Ligne>(`lettre_numeros?select=id,langue,sujets,objet,corps,statut,curseur&id=eq.${id}&limit=1`);
  if (!l) return { erreur: "panne" };
  const n = l[0];
  if (!n || !TRANSITIONS_NUMERO[n.statut]?.length) return { erreur: "etat" }; // état final (envoyé) : rien ne repart
  const [v, o] = await Promise.all([voie(), origine()]);
  if (!v) return { erreur: "smtp" };
  if (!o || !jetonLettre(n.id)) return { erreur: "variables", manque: ["lien"] };

  if (n.statut === "brouillon") {
    const total = await cible(n);
    if (total === null) return { erreur: "panne" };
    if (attendu !== total || total === 0) return { erreur: "confirmer", total };
    if (!peutPasser(TRANSITIONS_NUMERO, "brouillon", "en_cours")) return { erreur: "etat" };
    const pris = await ecrire<{ id: string }>(`lettre_numeros?id=eq.${n.id}&statut=eq.brouillon&select=id`, "PATCH", { statut: "en_cours", modifie_le: maintenant() });
    if (!pris) return { erreur: "panne" };
    if (!pris.length) return { erreur: "etat" };
  }

  const page = await lire<Abonne>(`abonnes_lettre?select=id,email,sujets&langue=eq.${n.langue}&desinscrit_le=is.null${n.curseur ? `&id=gt.${n.curseur}` : ""}&order=id.asc&limit=${PAGE}`);
  if (!page) return { erreur: "panne" };
  let partis = 0, curseur = n.curseur, toutVu = true;
  for (const a of page) {
    if (partis >= LOT) {
      toutVu = false;
      break;
    }
    curseur = a.id;
    if (!vise(a, n.sujets)) continue;
    const reserve = await ecrire<{ id: number }>("lettre_envois?on_conflict=numero_id,abonne_id&select=id", "POST", { numero_id: n.id, abonne_id: a.id }, "resolution=ignore-duplicates,return=representation");
    if (!reserve) return { erreur: "panne" };
    if (!reserve.length) continue; // déjà envoyé à cette adresse
    const jeton = jetonLettre(a.id);
    const e = rendre(n, `${o}/lettre/desinscription/${jeton}`, o ?? "");
    const parti = await partir({ a: a.email, sujet: e.sujet, html: e.html, texte: e.texte, cle: `lettre-${n.id}-${a.id}` }, v.boite);
    const issue = parti ? "envoye" : "echec";
    if (peutPasser(TRANSITIONS_ENVOI_LETTRE, "envoi", issue)) await ecrire(`lettre_envois?id=eq.${reserve[0].id}&statut=eq.envoi&select=id`, "PATCH", { statut: issue });
    partis++;
  }
  const fini = toutVu && page.length < PAGE;
  // le numéro est « en cours » pendant tout l'envoi : curseur avancé dans cet état, puis en_cours → envoye au dernier lot
  await ecrire(`lettre_numeros?id=eq.${n.id}&statut=eq.en_cours&select=id`, "PATCH", { curseur, modifie_le: maintenant(), ...(fini && peutPasser(TRANSITIONS_NUMERO, "en_cours", "envoye") ? { statut: "envoye", envoye_le: maintenant() } : {}) });
  const [envoyes, echecs] = await Promise.all([compter("lettre_envois", `numero_id=eq.${n.id}&statut=eq.envoye`), compter("lettre_envois", `numero_id=eq.${n.id}&statut=eq.echec`)]);
  if (fini) {
    await journaliser("lettre.envoi", s.profilId, null, { numero: n.id, langue: n.langue, nombre: envoyes ?? 0 });
    refresh();
  }
  return { ok: true, fini, envoyes: envoyes ?? 0, echecs: echecs ?? 0 };
}
