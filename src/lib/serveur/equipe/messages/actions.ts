"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { LIMITES_COURRIEL, type LangueMsg, msg, type Variable, RAISON_COURRIER } from "@/content/espace-messages";
import { base } from "../../base";
import { effacer } from "../dossiers";
import { journaliser } from "../journal";
import { exigerRole, type Session } from "../session";
import { apercuAuto } from "./auto";
import { emailDe, origine, partir, voie } from "./envoi";
import { type ClientCourrier, clientsChoisis } from "./lectures";
import { autoConnue, CLE, type CleAuto, estAuto, estLangue, jetonsInconnus, lireAdresses, lireTexte, remplir, uneLigne, UUID, type Valeurs, valeursApercu, valeursDe, variablesHors } from "./rendu";
import { composer } from "./composer";

// Écritures du lot « messages » : rédiger un e-mail (brouillon, test à soi-même, envoi), modèles d'e-mails (admin),
// notifications lues. Actions serveur (contrôle d'origine de Next) joignables par une requête forgée : CHAQUE appel relit
// la session et le rôle, puis les destinataires AVEC le filtre de l'agent (lireClients, lot L4) : un client qui n'est pas
// le sien est refusé et rien n'est écrit ni envoyé. Le navigateur n'envoie que l'objet et le message tapés ; les champs
// variables, les documents liés et la signature sont relus ici. Chaque envoi part par la voie commune (envoi.ts) avec une
// clé unique (Message-ID stable), et va au journal sans adresse ni texte. refresh() renvoie l'écran à jour.
// Mode « adresse » : adresse(s) saisie(s) à la main, sans fiche client (client_id null) : une seule pour un agent, au plus
// LIMITES_COURRIEL.adresses pour un admin ; seul {prénom} (saisi) y a une valeur, {dates} {lien} {référence} sont refusés.

export type RefusMessages = "refuse" | "champs" | "panne" | "smtp" | "envoi" | "variables" | "etat" | "confirmer";
export type RetourMessages =
  | { ok: true; id?: string; envoyes?: number; echecs?: number; a?: string; fini?: boolean; total?: number; sujet?: string; html?: string }
  | { erreur: RefusMessages; champs?: string[]; manque?: Variable[]; total?: number };

type Saisie = { mode: "un" | "groupe" | "adresse"; ids: string[]; adresses: string[]; prenom: string; langue: LangueMsg; modele: string | null; objet: string; corps: string; devis: boolean; brouillon: string | null };
const objet = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const maintenant = () => new Date().toISOString();

/** Saisie du composeur relue : destinataire(s), langue, modèle, objet, message, devis lié, brouillon repris. Sans
 * `destRequis` (test à soi-même), le destinataire peut manquer. */
function lireSaisie(brut: unknown, s: Session, objetRequis: boolean, destRequis = true): { ok: true; v: Saisie } | { ok: false; champs: string[]; refuse?: boolean } {
  const o = objet(brut);
  const mode = o.mode === "groupe" ? "groupe" : o.mode === "adresse" ? "adresse" : "un";
  if (mode === "groupe" && s.role !== "admin") return { ok: false, champs: [], refuse: true }; // le groupe est réservé à l'admin
  const ids = mode === "un" ? (typeof o.client === "string" && o.client ? [o.client] : []) : mode === "groupe" && Array.isArray(o.clients) ? [...new Set(o.clients)] : [];
  const champs: string[] = [];
  let adresses: string[] = [];
  if (mode === "adresse") {
    // une seule adresse pour un agent (comme « un client »), plusieurs pour un admin (comme « un groupe »)
    const vide = typeof o.adresses !== "string" || !o.adresses.trim();
    const l = vide ? null : lireAdresses(o.adresses, s.role === "admin" ? LIMITES_COURRIEL.adresses : 1);
    if (l) adresses = l;
    else if (destRequis || !vide) champs.push("adresses");
  } else if (!ids.length) {
    if (destRequis) champs.push(mode === "un" ? "dest" : "groupe");
  } else if (ids.length > LIMITES_COURRIEL.groupe || !ids.every((i) => typeof i === "string" && UUID.test(i))) champs.push(mode === "un" ? "dest" : "groupe");
  const prenom = mode === "adresse" ? uneLigne(o.prenom) : "";
  if (prenom.length > LIMITES_COURRIEL.prenom) champs.push("prenom");
  if (!estLangue(o.langue)) champs.push("langue");
  const modele = typeof o.modele === "string" && o.modele && o.modele !== "libre" ? o.modele : null;
  // une clé « auto-… » appartient aux e-mails automatiques du site : jamais un modèle du composeur
  if (modele !== null && (!CLE.test(modele) || estAuto(modele))) champs.push("modele");
  const t = lireTexte(o.objet, o.corps, objetRequis);
  champs.push(...t.champs);
  const devis = o.devis === true;
  if (devis && mode !== "un") champs.push("pieces");
  const brouillon = typeof o.brouillon === "string" && o.brouillon ? o.brouillon : null;
  if (brouillon !== null && !UUID.test(brouillon)) champs.push("brouillon");
  if (champs.length) return { ok: false, champs };
  return { ok: true, v: { mode, ids: ids as string[], adresses, prenom, langue: o.langue as LangueMsg, modele, objet: t.objet, corps: t.corps, devis, brouillon } };
}

/** L'e-mail d'un destinataire, rempli avec SES valeurs ; `manque` : champs variables sans valeur pour lui. */
function rendre(vals: Valeurs, devis: ClientCourrier["devis"], v: Pick<Saisie, "objet" | "corps" | "devis" | "langue">, s: Session, o: string) {
  const sujet = remplir(v.objet, vals), corps = remplir(v.corps, vals);
  const pieces = v.devis && devis ? [{ libelle: msg.courrier.pieceDevis(devis.numero), href: devis.url }] : [];
  const { html, texte } = composer({ langue: v.langue, origine: o, sujet: sujet.texte, corps: corps.texte, prenom: vals.prenom, pieces, signature: msg.signature(s.prenom, s.nom), raison: RAISON_COURRIER[v.langue] });
  return { sujet: sujet.texte, corps: corps.texte, html, texte, manque: [...new Set([...sujet.manque, ...corps.manque])], pieces: v.devis && devis ? [{ type: "devis", numero: devis.numero }] : [] };
}

/** Destinataire sans fiche client : seul le prénom saisi remplit un champ variable. */
const valeursAdresse = (prenom: string): Valeurs => ({ prenom: prenom || undefined });

async function ecrire<R>(chemin: string, method: "POST" | "PATCH", corps: unknown, prefer = "return=representation"): Promise<R[] | null> {
  try {
    const r = await base(chemin, { method, corps, prefer });
    return r.ok ? ((await r.json()) as R[]) : null;
  } catch {
    return null;
  }
}

// ---------- rédiger un e-mail ----------

/** Brouillon d'un e-mail à UN client (créé, ou mis à jour s'il est à cet auteur et encore brouillon). */
export async function enregistrerBrouillon(brut: unknown): Promise<RetourMessages> {
  const s = await exigerRole("agents");
  if (!s) return { erreur: "refuse" };
  const lu = lireSaisie(brut, s, false);
  if (!lu.ok) return lu.refuse ? { erreur: "refuse" } : { erreur: "champs", champs: lu.champs };
  if (lu.v.mode !== "un") return { erreur: "champs", champs: ["dest"] };
  const c = await clientsChoisis(s, lu.v.ids);
  if (c === "refuse") {
    await journaliser("courriel.refus", s.profilId, null, { motif: "champs" });
    return { erreur: "refuse" };
  }
  if (!c?.[0]) return { erreur: "panne" };
  const corps = { client_id: c[0].id, destinataire: c[0].email, modele: lu.v.modele, langue: lu.v.langue, objet: lu.v.objet, corps: lu.v.corps, pieces: lu.v.devis && c[0].devis ? [{ type: "devis", numero: c[0].devis.numero }] : [], modifie_le: maintenant() };
  const r = lu.v.brouillon
    ? await ecrire<{ id: string }>(`courriels_envoyes?id=eq.${lu.v.brouillon}&auteur_id=eq.${s.profilId}&statut=eq.brouillon&select=id`, "PATCH", corps)
    : await ecrire<{ id: string }>("courriels_envoyes?select=id", "POST", { ...corps, statut: "brouillon", auteur_id: s.profilId });
  if (!r) return { erreur: "panne" };
  if (!r[0]) return { erreur: "etat" }; // brouillon d'un autre auteur, ou déjà envoyé
  await journaliser("courriel.brouillon", s.profilId, null, { cible: c[0].id, langue: lu.v.langue, ...(lu.v.modele ? { modele: lu.v.modele } : {}) });
  refresh();
  return { ok: true, id: r[0].id };
}

/** Test à soi-même : l'e-mail tel que le (premier) destinataire le recevra, envoyé à l'adresse du compte connecté. Sans
 * destinataire choisi : les valeurs de l'aperçu des modèles (prénom du compte, repères entre crochets). */
export async function envoyerTest(brut: unknown): Promise<RetourMessages> {
  const s = await exigerRole("agents");
  if (!s) return { erreur: "refuse" };
  const lu = lireSaisie(brut, s, true, false);
  if (!lu.ok) return lu.refuse ? { erreur: "refuse" } : { erreur: "champs", champs: lu.champs };
  let vals = valeursApercu(s.prenom, lu.v.langue), devis: ClientCourrier["devis"] = null, cible: string | undefined;
  if (lu.v.adresses.length) vals = valeursAdresse(lu.v.prenom);
  else if (lu.v.ids.length) {
    const c = await clientsChoisis(s, lu.v.ids.slice(0, 1));
    if (c === "refuse") return { erreur: "refuse" };
    if (!c?.[0]) return { erreur: "panne" };
    [vals, devis, cible] = [valeursDe(c[0].faits, lu.v.langue), c[0].devis, c[0].id];
  }
  const e = rendre(vals, devis, lu.v, s, (await origine()) ?? "");
  if (e.manque.length) return { erreur: "variables", manque: e.manque };
  const [v, a] = await Promise.all([voie(), emailDe(s.profilId)]);
  if (!v) return { erreur: "smtp" };
  if (!a) return { erreur: "panne" };
  const parti = await partir({ a, sujet: `${msg.prefixeTest}${e.sujet}`, html: e.html, texte: e.texte, cle: `courrier-test-${randomUUID()}` }, v.boite);
  await journaliser("courriel.test", s.profilId, null, { ...(cible ? { cible } : {}), ...(lu.v.mode === "adresse" ? { mode: "adresse" } : {}), langue: lu.v.langue, ...(parti ? {} : { motif: "envoi" as const }) });
  return parti ? { ok: true, a } : { erreur: "envoi" };
}

/** Envoi à un client, à une ou plusieurs adresses saisies, ou à un groupe (admin) : un e-mail par destinataire, rempli
 * avec ses données, noté envoyé ou échec. */
export async function envoyerCourrier(brut: unknown): Promise<RetourMessages> {
  const s = await exigerRole("agents");
  if (!s) return { erreur: "refuse" };
  const lu = lireSaisie(brut, s, true);
  if (!lu.ok) return lu.refuse ? { erreur: "refuse" } : { erreur: "champs", champs: lu.champs };
  let dests: { id: string | null; email: string; vals: Valeurs; devis: ClientCourrier["devis"] }[];
  if (lu.v.mode === "adresse") dests = lu.v.adresses.map((a) => ({ id: null, email: a, vals: valeursAdresse(lu.v.prenom), devis: null }));
  else {
    const clients = await clientsChoisis(s, lu.v.ids);
    if (clients === "refuse") {
      await journaliser("courriel.refus", s.profilId, null, { motif: "champs" });
      return { erreur: "refuse" };
    }
    if (!clients) return { erreur: "panne" };
    dests = clients.map((c) => ({ id: c.id, email: c.email, vals: valeursDe(c.faits, lu.v.langue), devis: c.devis }));
  }
  if (lu.v.devis && !dests[0]?.devis) return { erreur: "champs", champs: ["pieces"] };
  const o = (await origine()) ?? "";
  const rendus = dests.map((c) => ({ c, e: rendre(c.vals, c.devis, lu.v, s, o) }));
  const manque = [...new Set(rendus.flatMap((r) => r.e.manque))];
  if (manque.length) return { erreur: "variables", manque };
  const v = await voie();
  if (!v) return { erreur: "smtp" };
  const seul = lu.v.mode !== "groupe" && dests.length === 1;
  const lot = seul ? null : randomUUID();
  let envoyes = 0, echecs = 0;
  for (const { c, e } of rendus) {
    // la ligne est posée avant l'envoi : sa clé donne le Message-ID, et rien ne part sans trace
    const ligne = { client_id: c.id, destinataire: c.email, modele: lu.v.modele, langue: lu.v.langue, objet: e.sujet, corps: e.corps, pieces: e.pieces, modifie_le: maintenant() };
    const r = lu.v.brouillon && lu.v.mode === "un"
      ? await ecrire<{ id: string }>(`courriels_envoyes?id=eq.${lu.v.brouillon}&auteur_id=eq.${s.profilId}&statut=eq.brouillon&select=id`, "PATCH", ligne)
      : await ecrire<{ id: string }>("courriels_envoyes?select=id", "POST", { ...ligne, statut: "brouillon", auteur_id: s.profilId, lot });
    if (!r) return { erreur: "panne" };
    if (!r[0]) return { erreur: "etat" };
    const parti = await partir({ a: c.email, sujet: e.sujet, html: e.html, texte: e.texte, cle: `courrier-${r[0].id}` }, v.boite);
    await ecrire(`courriels_envoyes?id=eq.${r[0].id}&select=id`, "PATCH", { statut: parti ? "envoye" : "echec", envoye_le: maintenant(), modifie_le: maintenant() });
    if (parti) envoyes++;
    else echecs++;
  }
  // journal sans adresse ni texte : la fiche visée (un client), ou le mode « adresse » et le nombre
  await journaliser("courriel.envoi", s.profilId, null, { ...(lu.v.mode === "un" && dests[0].id ? { cible: dests[0].id } : {}), ...(lu.v.mode === "adresse" ? { mode: "adresse" } : {}), langue: lu.v.langue, nombre: envoyes, ...(lu.v.modele ? { modele: lu.v.modele } : {}), ...(echecs ? { motif: "envoi" as const } : {}) });
  refresh();
  if (seul && echecs) return { erreur: "envoi" };
  return { ok: true, envoyes, echecs };
}

// ---------- modèles d'e-mails (admin) ----------

function lireModele(brut: unknown) {
  const o = objet(brut);
  const champs: string[] = [];
  const cle = typeof o.cle === "string" ? o.cle : "";
  // « auto-… » : seulement les clés réservées connues (AUTO_CLES), et seulement les quatre champs variables
  if (!CLE.test(cle) || (estAuto(cle) && !autoConnue(cle))) champs.push("cle");
  if (!estLangue(o.langue)) champs.push("langue");
  const t = lireTexte(o.sujet, o.corps, true);
  if (t.champs.includes("objet")) champs.push("sujet");
  if (t.champs.includes("corps") || !t.corps) champs.push("corps");
  if (estAuto(cle) && jetonsInconnus(`${t.objet} ${t.corps}`).length) champs.push("jetons");
  // un champ que cet e-mail ne remplit pas ferait repartir le texte par défaut sans bruit (courriels/commun.ts) : refusé
  if (autoConnue(cle) && variablesHors(cle, `${t.objet} ${t.corps}`).length) champs.push("variables");
  return champs.length ? ({ ok: false, champs } as const) : ({ ok: true, v: { cle, langue: o.langue as LangueMsg, sujet: t.objet, corps: t.corps } } as const);
}

export async function enregistrerModele(brut: unknown): Promise<RetourMessages> {
  const s = await exigerRole("admins");
  if (!s) return { erreur: "refuse" };
  const lu = lireModele(brut);
  if (!lu.ok) return { erreur: "champs", champs: [...lu.champs] };
  const r = await ecrire("modeles_courriels?on_conflict=cle,langue&select=id", "POST", { ...lu.v, modifie_le: maintenant(), modifie_par: s.profilId }, "resolution=merge-duplicates,return=representation");
  // POST avec fusion : la ligne (cle, langue) est créée ou remplacée
  if (!r) return { erreur: "panne" };
  await journaliser("modele.enregistre", s.profilId, null, { modele: lu.v.cle, langue: lu.v.langue });
  refresh();
  return { ok: true };
}

/** Retire le texte enregistré d'une langue : le texte de départ (s'il existe) reprend sa place. */
export async function retirerModele(cle: unknown, langue: unknown): Promise<RetourMessages> {
  const s = await exigerRole("admins");
  if (!s) return { erreur: "refuse" };
  if (typeof cle !== "string" || !CLE.test(cle) || (estAuto(cle) && !autoConnue(cle)) || !estLangue(langue)) return { erreur: "champs" };
  const parti = await effacer<{ id: string }>(`modeles_courriels?cle=eq.${cle}&langue=eq.${langue}`);
  if (!parti) return { erreur: "panne" };
  if (!parti.length) return { erreur: "etat" };
  await journaliser("modele.retire", s.profilId, null, { modele: cle, langue });
  refresh();
  return { ok: true };
}

/** Vrai rendu d'un e-mail automatique (gabarit « la lettre illustrée ») avec les données d'exemple ; null si impossible. */
async function rendreAuto(cle: CleAuto, langue: LangueMsg, modele: { sujet: string; corps: string } | null, s: Session) {
  try {
    return apercuAuto(cle, langue, modele, s.prenom, (await origine()) ?? "");
  } catch {
    return null;
  }
}

/** Aperçu réel d'un e-mail automatique pendant la saisie : le texte tapé s'il est valable, sinon le texte par défaut. */
export async function apercuModele(brut: unknown): Promise<RetourMessages> {
  const s = await exigerRole("admins");
  if (!s) return { erreur: "refuse" };
  const o = objet(brut);
  const cle = typeof o.cle === "string" ? o.cle : "";
  if (!autoConnue(cle) || !estLangue(o.langue)) return { erreur: "champs" };
  const t = lireTexte(o.sujet, o.corps, false), tout = `${t.objet} ${t.corps}`;
  const valable = !t.champs.length && t.objet && t.corps && !jetonsInconnus(tout).length && !variablesHors(cle, tout).length;
  const r = await rendreAuto(cle, o.langue, valable ? { sujet: t.objet, corps: t.corps } : null, s);
  return r ? { ok: true, sujet: r.sujet, html: r.html } : { erreur: "panne" };
}

export async function testerModele(brut: unknown): Promise<RetourMessages> {
  const s = await exigerRole("admins");
  if (!s) return { erreur: "refuse" };
  const lu = lireModele(brut);
  if (!lu.ok) return { erreur: "champs", champs: [...lu.champs] };
  let sujet: string, html: string, texte: string;
  if (autoConnue(lu.v.cle)) {
    // e-mail automatique : le vrai gabarit, tel que le client le recevra (données d'exemple)
    const r = await rendreAuto(lu.v.cle, lu.v.langue, { sujet: lu.v.sujet, corps: lu.v.corps }, s);
    if (!r) return { erreur: "panne" };
    ({ sujet, html, texte } = r);
  } else {
    const vals = valeursApercu(s.prenom, lu.v.langue);
    sujet = remplir(lu.v.sujet, vals).texte;
    ({ html, texte } = composer({ langue: lu.v.langue, origine: (await origine()) ?? "", sujet, prenom: vals.prenom, corps: remplir(lu.v.corps, vals).texte, signature: msg.signature(s.prenom, s.nom), raison: RAISON_COURRIER[lu.v.langue] }));
  }
  const [v, a] = await Promise.all([voie(), emailDe(s.profilId)]);
  if (!v) return { erreur: "smtp" };
  if (!a) return { erreur: "panne" };
  const parti = await partir({ a, sujet: `${msg.prefixeTest}${sujet}`, html, texte, cle: `modele-test-${randomUUID()}` }, v.boite);
  await journaliser("modele.test", s.profilId, null, { modele: lu.v.cle, langue: lu.v.langue, ...(parti ? {} : { motif: "envoi" as const }) });
  return parti ? { ok: true, a } : { erreur: "envoi" };
}

// ---------- notifications ----------

/** Marque lue une notification de CE membre (ou toutes les siennes) : celle d'un autre ne bouge pas. */
export async function marquerLue(id: unknown): Promise<RetourMessages> {
  const s = await exigerRole("agents");
  if (!s) return { erreur: "refuse" };
  if (id !== "toutes" && (typeof id !== "string" || !UUID.test(id))) return { erreur: "champs" };
  const r = await ecrire<{ id: string }>(`notifications?profil_id=eq.${s.profilId}&lu_le=is.null${id === "toutes" ? "" : `&id=eq.${id}`}&select=id`, "PATCH", { lu_le: maintenant() });
  if (!r) return { erreur: "panne" };
  refresh();
  return { ok: true, envoyes: r.length };
}
