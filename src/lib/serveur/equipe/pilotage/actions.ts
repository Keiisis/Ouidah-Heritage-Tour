"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { base, baseConfiguree } from "../../base";
import { effacer } from "../dossiers";
import { lire } from "../finances/lectures";
import { journaliser } from "../journal";
import { exigerDroit } from "../securite/droits";
import { exigerRole } from "../session";
import { demandeOuverte, documentAccessible } from "./lectures";
import { traiterRapport } from "./rapport-envoi";
import { champsDe, conservation, estMime, estTypeDocument, lireMotif, lirePage, lireSuivi, nomFichier, signatureValide, TAILLE_MAX, UUID } from "./regles";
import { debutObjet, effacerObjets, urlDepot } from "./stockage";

// Écritures du lot « pilotage » : wiki, pistes, rapport hebdomadaire, documents des clients. Actions serveur joignables par
// une requête forgée : CHAQUE appel relit la session et le rôle (exigerRole), revalide ses entrées et ne touche que ce qui
// revient à ce membre (un agent : ses dossiers ; l'admin : tout). Chaque écriture va au journal, sans texte saisi, nom de
// fichier ni adresse. refresh() renvoie l'écran à jour dans la même réponse (doc Next 16 « Server Actions »).

export type RefusPil = "refuse" | "admin" | "champs" | "panne" | "introuvable" | "etat" | "smtp" | "envoi" | "type" | "taille" | "fichier" | "contenu" | "stockage";
export type RetourPil = { ok: true; n?: number; url?: string; objet?: string } | { erreur: RefusPil; champs?: string[] };

const maintenant = () => new Date().toISOString();
const uuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** Écriture PostgREST ; les lignes touchées (return=representation), ou null si la base ne répond pas. */
async function ecrire<R>(chemin: string, method: "POST" | "PATCH", corps: unknown, prefer = "return=representation"): Promise<R[] | null> {
  try {
    const r = await base(chemin, { method, corps, prefer });
    if (!r.ok) return null;
    return prefer.includes("return=representation") ? ((await r.json()) as R[]) : [];
  } catch {
    return null;
  }
}

// ---------- wiki ----------

/** Admin : nouvelle page (brouillon) si `id` est vide, sinon modification. Une page refusée reprise par l'admin redevient
 * un brouillon. */
export async function enregistrerPage(id: unknown, brut: unknown): Promise<RetourPil> {
  const s = await exigerRole("admins");
  if (!s) return { erreur: "admin" };
  const lu = lirePage(brut);
  if (!lu.ok) return { erreur: "champs", champs: lu.champs };
  if (!baseConfiguree()) return { erreur: "panne" };
  let page: string;
  if (id === null || id === undefined || id === "") {
    const l = await ecrire<{ id: string }>("wiki_pages?select=id", "POST", { ...lu.v, etat: "brouillon", auteur_id: s.profilId, modifie_par: s.profilId });
    if (!l?.[0]) return { erreur: "panne" };
    page = l[0].id;
  } else {
    if (!uuid(id)) return { erreur: "introuvable" };
    const lu_ = await lire<{ etat: string }>(`wiki_pages?select=etat&id=eq.${id}&limit=1`);
    if (!lu_) return { erreur: "panne" };
    const avant = lu_[0];
    if (!avant) return { erreur: "introuvable" };
    const refusee = avant.etat === "refuse";
    const l = await ecrire<{ id: string }>(`wiki_pages?id=eq.${id}&etat=eq.${avant.etat}&select=id`, "PATCH", { ...lu.v, modifie_par: s.profilId, modifie_le: maintenant(), ...(refusee ? { etat: "brouillon", motif_refus: null } : {}) });
    if (!l) return { erreur: "panne" };
    if (!l[0]) return { erreur: "etat" };
    page = id;
  }
  await journaliser("wiki.enregistre", s.profilId, null, { page });
  refresh();
  return { ok: true };
}

/** Admin : publier, retirer (publiée → brouillon) ou refuser une proposition (avec motif). L'état lu est exigé dans la
 * requête : deux admins au même instant, un seul l'emporte. */
export async function changerPage(id: unknown, quoi: unknown, motif?: unknown): Promise<RetourPil> {
  const s = await exigerRole("admins");
  if (!s) return { erreur: "admin" };
  if (!uuid(id) || (quoi !== "publier" && quoi !== "retirer" && quoi !== "refuser")) return { erreur: "champs" };
  const m = quoi === "refuser" ? lireMotif(champsDe(motif).motif ?? motif) : null;
  if (quoi === "refuser" && !m) return { erreur: "champs", champs: ["motif"] };
  const t = maintenant();
  const [de, corps, action] =
    quoi === "publier"
      ? (["in.(brouillon,propose)", { etat: "publie", publie_le: t, publie_par: s.profilId, motif_refus: null, modifie_le: t }, "wiki.publie"] as const)
      : quoi === "retirer"
        ? (["eq.publie", { etat: "brouillon", modifie_le: t, modifie_par: s.profilId }, "wiki.retire"] as const)
        : (["eq.propose", { etat: "refuse", motif_refus: m, modifie_le: t, modifie_par: s.profilId }, "wiki.refuse"] as const);
  const l = await ecrire<{ id: string }>(`wiki_pages?id=eq.${id}&etat=${de}&select=id`, "PATCH", corps);
  if (!l) return { erreur: "panne" };
  if (!l[0]) return { erreur: "etat" };
  await journaliser(action, s.profilId, null, { page: id });
  refresh();
  return { ok: true };
}

/** Tout membre connecté : proposer une page, publiée seulement après validation d'un admin. */
export async function proposerPage(brut: unknown): Promise<RetourPil> {
  const s = await exigerRole("agents");
  if (!s) return { erreur: "refuse" };
  const lu = lirePage(brut);
  if (!lu.ok) return { erreur: "champs", champs: lu.champs };
  if (!baseConfiguree()) return { erreur: "panne" };
  const l = await ecrire<{ id: string }>("wiki_pages?select=id", "POST", { ...lu.v, etat: "propose", auteur_id: s.profilId, modifie_par: s.profilId });
  if (!l?.[0]) return { erreur: "panne" };
  await journaliser("wiki.propose", s.profilId, null, { page: l[0].id });
  refresh();
  return { ok: true };
}

// ---------- pistes ----------

/** Priorité et rappel d'une demande : par l'agent du dossier, ou un admin. */
export async function suivrePiste(dossier: unknown, brut: unknown): Promise<RetourPil> {
  const s = await exigerRole("agents");
  if (!s) return { erreur: "refuse" };
  const lu = lireSuivi(brut, Date.now());
  if (!lu.ok) return { erreur: "champs", champs: lu.champs };
  const d = await demandeOuverte(s, dossier);
  if (d === null) return { erreur: "panne" };
  if (d === "non") return { erreur: "introuvable" };
  const l = await ecrire("pistes_suivi", "POST", { demande_id: d.id, priorite: lu.v.priorite, rappel_le: lu.v.rappel, modifie_par: s.profilId, modifie_le: maintenant() }, "resolution=merge-duplicates,return=minimal");
  if (!l) return { erreur: "panne" };
  await journaliser("piste.suivi", s.profilId, null, { dossier: d.id });
  refresh();
  return { ok: true };
}

// ---------- rapport hebdomadaire ----------

/** Admin : le rapport de la semaine écoulée, à soi-même (test) ou à tous les admins actifs. */
export async function envoyerRapport(test: unknown): Promise<RetourPil> {
  const s = await exigerRole("admins");
  if (!s) return { erreur: "admin" };
  const essai = test === true || test === "test";
  const r = await traiterRapport(s.profilId, essai);
  refresh();
  return r;
}

// ---------- documents des clients ----------

/** Étape 1 du dépôt : le serveur vérifie le dossier, le type et la taille annoncés, puis donne une URL de dépôt signée
 * pour un chemin neuf <dossier>/<objet>. Le fichier part ensuite du navigateur directement vers le stockage privé. */
export async function preparerDepot(brut: unknown): Promise<RetourPil> {
  const s = await exigerDroit("demandes"); // documents rattachés aux dossiers : droit « Demandes et devis » (lot « securite »)
  if (!s) return { erreur: "refuse" };
  const c = champsDe(brut);
  const champs = [...(estTypeDocument(c.type) ? [] : ["type"]), ...(uuid(c.dossier) ? [] : ["dossier"])];
  if (champs.length) return { erreur: "champs", champs };
  if (!estMime(c.mime)) return { erreur: "type" };
  const taille = Number(c.taille);
  if (!Number.isInteger(taille) || taille < 1 || taille > TAILLE_MAX) return { erreur: "taille" };
  const d = await demandeOuverte(s, c.dossier);
  if (d === null) return { erreur: "panne" };
  if (d === "non") return { erreur: "introuvable" };
  const objet = randomUUID();
  const url = await urlDepot(`${d.id}/${objet}`);
  return url ? { ok: true, url, objet } : { erreur: "stockage" };
}

/** Étape 2 : le serveur relit le fichier déposé (type et taille vus par le stockage, premiers octets), le refuse et
 * l'efface s'il ne correspond pas, sinon enregistre sa fiche et sa date de fin de conservation. */
export async function confirmerDepot(brut: unknown): Promise<RetourPil> {
  const s = await exigerDroit("demandes");
  if (!s) return { erreur: "refuse" };
  const c = champsDe(brut);
  if (!estTypeDocument(c.type) || !uuid(c.dossier) || !uuid(c.objet)) return { erreur: "champs", champs: ["type"] };
  const d = await demandeOuverte(s, c.dossier);
  if (d === null) return { erreur: "panne" };
  if (d === "non") return { erreur: "introuvable" };
  const chemin = `${d.id}/${c.objet}`;
  const o = await debutObjet(chemin);
  if (o === null) return { erreur: "stockage" };
  if (o === "absent") return { erreur: "fichier" };
  const mime = o.type.split(";")[0].trim().toLowerCase();
  if (!estMime(mime) || o.taille > TAILLE_MAX || !signatureValide(o.octets, mime)) {
    await effacerObjets([chemin]);
    await journaliser("document.refus", s.profilId, null, { dossier: d.id, type: c.type, motif: o.taille > TAILLE_MAX ? "taille" : "contenu" });
    return { erreur: o.taille > TAILLE_MAX ? "taille" : "contenu" };
  }
  try {
    const r = await base("equipe_documents?select=id", {
      method: "POST",
      corps: { demande_id: d.id, type: c.type, nom: nomFichier(c.nom), type_mime: mime, taille: o.taille, chemin, depose_par: s.profilId, conserver_jusqu_au: conservation(d.depart, Date.now()) },
      prefer: "return=representation",
    });
    if (r.status === 409) return { erreur: "etat" }; // déjà enregistré (double envoi)
    const id = r.ok ? ((await r.json()) as { id: string }[])[0]?.id : undefined;
    if (!id) {
      await effacerObjets([chemin]); // jamais de fichier sans fiche
      return { erreur: "panne" };
    }
    await journaliser("document.depot", s.profilId, null, { dossier: d.id, document: id, type: c.type });
  } catch {
    await effacerObjets([chemin]);
    return { erreur: "panne" };
  }
  refresh();
  return { ok: true };
}

/** Supprimer un document : l'agent du dossier ou un admin. Le fichier est effacé du stockage, puis la fiche. */
export async function supprimerDocument(id: unknown): Promise<RetourPil> {
  const s = await exigerDroit("demandes");
  if (!s) return { erreur: "refuse" };
  const doc = await documentAccessible(s, id);
  if (doc === null) return { erreur: "panne" };
  if (doc === "non") return { erreur: "introuvable" };
  if (!(await effacerObjets([doc.chemin]))) return { erreur: "stockage" };
  const l = await effacer<{ id: string }>(`equipe_documents?id=eq.${doc.id}&select=id`);
  if (!l) return { erreur: "panne" };
  await journaliser("document.suppression", s.profilId, null, { dossier: doc.demande, document: doc.id });
  refresh();
  return { ok: true };
}
