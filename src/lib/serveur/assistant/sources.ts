"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { LANGUES_ASSISTANT, type LangueAssistant } from "@/content/assistant";
import { LIMITES_BASE as L } from "@/content/assistant-base";
import { base, compter } from "../base";
import { effacer } from "../equipe/dossiers";
import { journaliser } from "../equipe/journal";
import { iso } from "../equipe/outils";
import { exigerRole, type Session } from "../equipe/session";
import { peutPasser } from "../machines";
import { EMAILS_PUBLICS } from "./connaissance";
import { type EtatSource, TRANSITIONS_SOURCE } from "./regles";
import { type Alerte, anonymiser, bloquants, controler, decouper, extraire, type GenreAlerte, type Morceau, nettoyer, nomDuFichier, normaliserQuestion, type RefusExtraction, retirerPassage, surligner, titreDuFichier } from "./extraction";

// Base de connaissances de l'assistant public, nourrie par l'admin : documents (le TEXTE extrait seul est gardé, jamais
// le fichier), notes, réponses aux questions sans réponse (l'assistant « apprend » : la réponse devient une fiche publiée,
// lue dès la question suivante par connaissance.ts) et argumentaire commercial. Actions serveur joignables par une requête
// forgée : CHAQUE appel relit la session et le rôle (admin seulement), relit ses entrées et passe le contrôle de
// confidentialité (extraction.ts) avant toute publication ; chaque écriture et chaque refus vont au journal (objet touché
// et nombre de morceaux, jamais un texte). Le texte d'un document reste une donnée : il n'entre dans l'invite que par les
// fiches publiées (section CONNAISSANCES), jamais comme consigne.

export type RefusBase = "refuse" | "admin" | "champs" | "panne" | RefusExtraction | "sensible" | "plein" | "etat" | "introuvable";
export type RetourBase = { ok: true; n?: number } | { erreur: RefusBase; champs?: string[]; alertes?: Alerte[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const uuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const maintenant = () => iso(Date.now());

async function lire<T>(chemin: string): Promise<T[] | null> {
  try {
    const r = await base(chemin);
    return r.ok ? ((await r.json()) as T[]) : null;
  } catch {
    return null;
  }
}
/** POST ou PATCH qui rend les lignes touchées (null si la base refuse ou ne répond pas). */
async function ecrire<T>(chemin: string, method: "POST" | "PATCH", corps: unknown): Promise<T[] | null> {
  try {
    const r = await base(chemin, { method, corps, prefer: "return=representation" });
    return r.ok ? ((await r.json()) as T[]) : null;
  } catch {
    return null;
  }
}

/** Session admin, ou le refus à renvoyer (personne : « refuse » ; agent : « admin », noté au journal). */
async function admin(): Promise<Session | { erreur: "refuse" | "admin" }> {
  const s = await exigerRole("agents");
  if (!s) return { erreur: "refuse" };
  if (s.role !== "admin") {
    await journaliser("reglages.refus", s.profilId, null, { motif: "role", type: "assistant.base" });
    return { erreur: "admin" };
  }
  return s;
}

const valeur = (fd: unknown, cle: string) => (typeof FormData !== "undefined" && fd instanceof FormData ? fd.get(cle) : null);
/** Passages que l'admin a confirmés publics (cases « confirme » du formulaire). */
const confirmes = (fd: unknown) =>
  typeof FormData !== "undefined" && fd instanceof FormData ? fd.getAll("confirme").filter((x): x is string => typeof x === "string" && x.length <= L.fiche).slice(0, 500) : [];
/** Texte saisi nettoyé : null s'il est vide, undefined s'il n'est pas une chaîne ou dépasse `max` caractères. */
function texte(v: unknown, max: number, uneLigne = false): string | null | undefined {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return undefined;
  const t = uneLigne ? nettoyer(v).replace(/\s+/g, " ") : nettoyer(v);
  if (!t) return null;
  return [...t].length > max ? undefined : t;
}

/** Contrôle de confidentialité : passages qui bloquent encore (jamais confirmables, ou pas confirmés par l'admin). */
const resteBloquant = (textes: string[], fd: unknown) => bloquants(controler(textes, EMAILS_PUBLICS), confirmes(fd));

/** connaissance.ts lit au plus L.fichesLues fiches publiées : vrai s'il reste la place pour `ajout` de plus. */
async function place(ajout: number): Promise<boolean | null> {
  const n = await compter("assistant_fiches", "publie=is.true");
  return n === null ? null : n + ajout <= L.fichesLues;
}

type Source = { titre: string; genre: "texte" | "pdf" | "docx" | "txt"; nom_fichier: string | null; taille: number | null; pages: number | null; etat: "brouillon" | "publie" };

/** Source et ses morceaux (fiches liées, dans l'ordre : cree_le croissant d'une milliseconde). Sans fiche écrite, la
 * source est effacée (jamais de source vide). Rend l'identifiant de la source et ceux des fiches. */
async function creer(s: Session, src: Source, morceaux: Morceau[]): Promise<{ id: string; fiches: string[] } | null> {
  const caracteres = morceaux.reduce((n, m) => n + m.texte.length, 0);
  const r = await ecrire<{ id: string }>("assistant_sources?select=id", "POST", { ...src, caracteres, ajoute_par: s.profilId });
  const id = r?.[0]?.id;
  if (!id) return null;
  const t = Date.now();
  const publie = src.etat === "publie";
  const f = await ecrire<{ id: string }>(
    "assistant_fiches?select=id",
    "POST",
    morceaux.map((m, i) => ({ titre: m.titre, texte: m.texte, publie, source_id: id, modifie_par: s.profilId, cree_le: iso(t + i), modifie_le: iso(t + i) })),
  );
  if (!f || f.length !== morceaux.length) {
    await effacer(`assistant_sources?id=eq.${id}&select=id`);
    return null;
  }
  return { id, fiches: f.map((x) => x.id) };
}

const refusSensible = async (s: Session, type: string, alertes: Alerte[], cible?: string): Promise<RetourBase> => {
  await journaliser("reglages.refus", s.profilId, null, { type, motif: "contenu", nombre: alertes.length, ...(cible ? { cible } : {}) });
  return { erreur: "sensible", alertes };
};

// ---------- documents ----------

/** Import d'un document (FormData : fichier, titre facultatif) : type vérifié par les octets, texte extrait, nettoyé et
 * découpé, gardé en BROUILLON (fiches non publiées) avec son aperçu. Le fichier n'est jamais écrit nulle part. */
export async function importerSource(fd: unknown): Promise<RetourBase> {
  const s = await admin();
  if ("erreur" in s) return s;
  const f = valeur(fd, "fichier");
  if (typeof File === "undefined" || !(f instanceof File) || f.size === 0) return { erreur: "champs", champs: ["fichier"] };
  const titre = texte(valeur(fd, "titre"), L.titre, true);
  if (titre === undefined) return { erreur: "champs", champs: ["titre"] };
  if (f.size > L.fichier) {
    await journaliser("reglages.refus", s.profilId, null, { type: "source.import", motif: "taille" });
    return { erreur: "taille" };
  }
  const x = await extraire(f.name, new Uint8Array(await f.arrayBuffer()));
  if (!x.ok) {
    await journaliser("reglages.refus", s.profilId, null, { type: "source.import", motif: x.erreur === "taille" ? "taille" : "contenu" });
    return { erreur: x.erreur };
  }
  const t = titre ?? titreDuFichier(f.name);
  const m = decouper(t, x.v.texte);
  if (m.length > L.morceaux) return { erreur: "long" };
  const c = await creer(s, { titre: t, genre: x.v.genre, nom_fichier: nomDuFichier(f.name), taille: f.size, pages: x.v.pages, etat: "brouillon" }, m);
  if (!c) return { erreur: "panne" };
  await journaliser("reglages.assistant", s.profilId, null, { type: "source.import", cible: c.id, nombre: m.length });
  refresh();
  return { ok: true, n: m.length };
}

/** Publication (ou republication) d'un brouillon ou d'une source retirée : contrôle passé (chaque passage sensible
 * retiré ou confirmé public), place libre parmi les fiches lues, puis ses morceaux deviennent des fiches publiées. */
export async function publierSource(id: unknown, fd: unknown): Promise<RetourBase> {
  const s = await admin();
  if ("erreur" in s) return s;
  if (!uuid(id)) return { erreur: "champs" };
  const [src, fiches] = await Promise.all([
    lire<{ etat: EtatSource }>(`assistant_sources?select=etat&id=eq.${id}`),
    lire<{ texte: string }>(`assistant_fiches?select=texte&source_id=eq.${id}&limit=${L.morceaux}`),
  ]);
  if (!src || !fiches) return { erreur: "panne" };
  if (!src[0]) return { erreur: "introuvable" };
  const de = src[0].etat;
  if (de === "publie" || !peutPasser(TRANSITIONS_SOURCE, de, "publie") || !fiches.length) return { erreur: "etat" };
  const reste = resteBloquant(fiches.map((f) => f.texte), fd);
  if (reste.length) return refusSensible(s, "source.publication", reste, id);
  const libre = await place(fiches.length);
  if (libre === null) return { erreur: "panne" };
  if (!libre) {
    await journaliser("reglages.refus", s.profilId, null, { type: "source.publication", cible: id, motif: "publie" });
    return { erreur: "plein" };
  }
  const t = maintenant();
  const f = await ecrire(`assistant_fiches?source_id=eq.${id}&select=id`, "PATCH", { publie: true, modifie_le: t, modifie_par: s.profilId });
  const r = f && (await ecrire(`assistant_sources?id=eq.${id}&etat=eq.${de}&select=id`, "PATCH", { etat: "publie", modifie_le: t }));
  if (!f || !r) return { erreur: "panne" };
  await journaliser("reglages.assistant", s.profilId, null, { type: "source.publication", cible: id, nombre: f.length });
  refresh();
  return { ok: true, n: f.length };
}

/** Retrait : la source reste (republiable), ses fiches ne sont plus lues par l'assistant. */
export async function retirerSource(id: unknown): Promise<RetourBase> {
  const s = await admin();
  if ("erreur" in s) return s;
  if (!uuid(id)) return { erreur: "champs" };
  if (!peutPasser(TRANSITIONS_SOURCE, "publie", "retire")) return { erreur: "etat" };
  const t = maintenant();
  const r = await ecrire(`assistant_sources?id=eq.${id}&etat=eq.publie&select=id`, "PATCH", { etat: "retire", modifie_le: t });
  if (!r) return { erreur: "panne" };
  if (!r.length) return { erreur: "etat" };
  const f = await ecrire(`assistant_fiches?source_id=eq.${id}&select=id`, "PATCH", { publie: false, modifie_le: t, modifie_par: s.profilId });
  if (!f) return { erreur: "panne" };
  await journaliser("reglages.assistant", s.profilId, null, { type: "source.retrait", cible: id, nombre: f.length });
  refresh();
  return { ok: true, n: f.length };
}

/** Suppression : la source et ses fiches (cascade) ; une question répondue par elle garde sa date, sans fiche. */
export async function supprimerSource(id: unknown): Promise<RetourBase> {
  const s = await admin();
  if ("erreur" in s) return s;
  if (!uuid(id)) return { erreur: "champs" };
  const r = await effacer<{ id: string }>(`assistant_sources?id=eq.${id}&select=id`);
  if (!r) return { erreur: "panne" };
  if (!r.length) return { erreur: "introuvable" };
  await journaliser("reglages.assistant", s.profilId, null, { type: "source.suppression", cible: id });
  refresh();
  return { ok: true };
}

/** Un passage sensible remplacé par [retiré] dans tous les morceaux d'un brouillon ou d'une source retirée (une source
 * publiée se retire d'abord : son texte ne change jamais pendant que l'assistant le lit). */
export async function retirerPassageSource(id: unknown, passage: unknown): Promise<RetourBase> {
  const s = await admin();
  if ("erreur" in s) return s;
  if (!uuid(id) || typeof passage !== "string" || !passage || passage.length > L.fiche) return { erreur: "champs" };
  const [src, fiches] = await Promise.all([
    lire<{ etat: string }>(`assistant_sources?select=etat&id=eq.${id}`),
    lire<{ id: string; texte: string }>(`assistant_fiches?select=id,texte&source_id=eq.${id}&limit=${L.morceaux}`),
  ]);
  if (!src || !fiches) return { erreur: "panne" };
  if (!src[0]) return { erreur: "introuvable" };
  if (src[0].etat === "publie") return { erreur: "etat" };
  const touchees = fiches.filter((f) => f.texte.includes(passage));
  if (!touchees.length) return { erreur: "introuvable" };
  const t = maintenant();
  for (const f of touchees) {
    const r = await ecrire(`assistant_fiches?id=eq.${f.id}&publie=is.false&select=id`, "PATCH", { texte: retirerPassage(f.texte, passage), modifie_le: t, modifie_par: s.profilId });
    if (!r?.length) return { erreur: "panne" };
  }
  const caracteres = fiches.reduce((n, f) => n + (touchees.includes(f) ? retirerPassage(f.texte, passage) : f.texte).length, 0);
  await ecrire(`assistant_sources?id=eq.${id}&select=id`, "PATCH", { caracteres, modifie_le: t });
  await journaliser("reglages.assistant", s.profilId, null, { type: "source.passage", cible: id, nombre: touchees.length });
  refresh();
  return { ok: true, n: touchees.length };
}

// ---------- notes (« des mots ») ----------

/** Note libre (FormData : titre, texte) : contrôlée, découpée, publiée d'emblée (aucun fichier à relire). */
export async function ajouterNote(fd: unknown): Promise<RetourBase> {
  const s = await admin();
  if ("erreur" in s) return s;
  const titre = texte(valeur(fd, "titre"), L.titre, true);
  const corps = texte(valeur(fd, "texte"), L.note);
  const champs = [...(titre ? [] : ["titre"]), ...(corps ? [] : ["texte"])];
  if (!titre || !corps) return { erreur: "champs", champs };
  const reste = resteBloquant([titre, corps], fd);
  if (reste.length) return refusSensible(s, "note.ajout", reste);
  const m = decouper(titre, corps);
  const libre = await place(m.length);
  if (libre === null) return { erreur: "panne" };
  if (!libre) return { erreur: "plein" };
  const c = await creer(s, { titre, genre: "texte", nom_fichier: null, taille: null, pages: null, etat: "publie" }, m);
  if (!c) return { erreur: "panne" };
  await journaliser("reglages.assistant", s.profilId, null, { type: "note.ajout", cible: c.id, nombre: m.length });
  refresh();
  return { ok: true, n: m.length };
}

// ---------- questions sans réponse : l'assistant apprend ----------

/** Réponse de l'admin à une question sans réponse (FormData : reponse) : une fiche publiée (titre = la question, texte =
 * la réponse), liée à une note pour rester visible dans la liste ; la question est marquée répondue. */
export async function repondreQuestion(id: unknown, fd: unknown): Promise<RetourBase> {
  const s = await admin();
  if ("erreur" in s) return s;
  if (!uuid(id)) return { erreur: "champs" };
  const reponse = texte(valeur(fd, "reponse"), L.reponse);
  if (!reponse) return { erreur: "champs", champs: ["reponse"] };
  const q = await lire<{ texte: string }>(`assistant_questions?select=texte&id=eq.${id}&repondue_le=is.null`);
  if (!q) return { erreur: "panne" };
  if (!q[0]) return { erreur: "introuvable" };
  const reste = resteBloquant([reponse], fd);
  if (reste.length) return refusSensible(s, "question.reponse", reste, id);
  const libre = await place(1);
  if (libre === null) return { erreur: "panne" };
  if (!libre) return { erreur: "plein" };
  const titre = [...q[0].texte].slice(0, L.titre).join("").trim();
  const c = await creer(s, { titre, genre: "texte", nom_fichier: null, taille: null, pages: null, etat: "publie" }, [{ titre, texte: reponse }]);
  if (!c) return { erreur: "panne" };
  const r = await ecrire(`assistant_questions?id=eq.${id}&select=id`, "PATCH", { repondue_le: maintenant(), fiche_id: c.fiches[0] });
  if (!r) return { erreur: "panne" };
  await journaliser("reglages.assistant", s.profilId, null, { type: "question.reponse", cible: id });
  refresh();
  return { ok: true };
}

/** La question sort de la liste ; posée de nouveau, elle reviendra (compte repris à 1). */
export async function ignorerQuestion(id: unknown): Promise<RetourBase> {
  const s = await admin();
  if ("erreur" in s) return s;
  if (!uuid(id)) return { erreur: "champs" };
  const r = await effacer<{ id: string }>(`assistant_questions?id=eq.${id}&select=id`);
  if (!r) return { erreur: "panne" };
  if (!r.length) return { erreur: "introuvable" };
  await journaliser("reglages.assistant", s.profilId, null, { type: "question.ignoree", cible: id });
  refresh();
  return { ok: true };
}

// vrai pour une requête d'action serveur (en-tête « next-action ») : noterQuestionSansReponse n'est pas une action
async function parAction() {
  try {
    return Boolean((await headers()).get("next-action"));
  } catch {
    return false;
  }
}

/** Question du visiteur que l'assistant n'a pas su traiter, notée ANONYMISÉE (e-mails, téléphones, numéros longs, nom
 * après « je m'appelle » → [retiré]) et normalisée, sans IP ni identifiant de conversation ; une de plus si elle est déjà
 * là (assistant_noter_question). Pour la route de l'assistant (serveur) ; refusée si on l'appelle comme action. Vrai si la
 * base l'a comptée. */
export async function noterQuestionSansReponse(texte: string, langue: LangueAssistant): Promise<boolean> {
  if (typeof texte !== "string" || !(LANGUES_ASSISTANT as readonly string[]).includes(langue) || (await parAction())) return false;
  const t = normaliserQuestion(anonymiser(texte.slice(0, 4000)));
  if (!t) return false;
  try {
    return (await base("rpc/assistant_noter_question", { method: "POST", corps: { p_texte: t, p_langue: langue }, prefer: "return=minimal" })).ok;
  } catch {
    return false;
  }
}

// ---------- argumentaire commercial ----------

/** Argumentaire (FormData : argumentaire ; vide = effacé), contrôlé comme une note : l'assistant peut le répéter. */
export async function enregistrerArgumentaire(fd: unknown): Promise<RetourBase> {
  const s = await admin();
  if ("erreur" in s) return s;
  const a = texte(valeur(fd, "argumentaire"), L.argumentaire);
  if (a === undefined) return { erreur: "champs", champs: ["argumentaire"] };
  const reste = a ? resteBloquant([a], fd) : [];
  if (reste.length) return refusSensible(s, "argumentaire", reste);
  const r = await ecrire("assistant_reglages?id=eq.true&select=id", "PATCH", { argumentaire: a ?? "", modifie_le: maintenant(), modifie_par: s.profilId });
  if (!r?.length) return { erreur: "panne" };
  await journaliser("reglages.assistant", s.profilId, null, { type: "argumentaire", nombre: a ? [...a].length : 0 });
  refresh();
  return { ok: true };
}

// ---------- lecture de l'écran (admin seulement) ----------

export type Segment = { t: string; g: GenreAlerte | null };
export type SourceVue = {
  id: string;
  titre: string;
  genre: string;
  nom_fichier: string | null;
  taille: number | null;
  pages: number | null;
  caracteres: number;
  etat: "brouillon" | "publie" | "retire";
  cree_le: string;
  auteur: string | null;
  morceaux: number;
  // brouillon et source retirée seulement : texte à relire avant (re)publication, passages sensibles repérés
  apercu: { titre: string; segments: Segment[] }[] | null;
  alertes: Alerte[];
};
export type QuestionVue = { id: string; texte: string; langue: string; nombre: number; derniere_le: string; deja: boolean };
export type VueBase = { sources: SourceVue[]; questions: QuestionVue[]; argumentaire: string; publiees: number | null };

type LigneSource = Omit<SourceVue, "auteur" | "morceaux" | "apercu" | "alertes"> & { auteur: { prenom: string; nom: string } | null; fiches: { count: number }[] };

/** Tout ce que la section affiche, ou null (pas admin, ou base muette). */
export async function lireBase(): Promise<VueBase | null> {
  const s = await exigerRole("admins");
  if (!s || s.role !== "admin") return null;
  const [sources, questions, reglages, publiees] = await Promise.all([
    lire<LigneSource>("assistant_sources?select=id,titre,genre,nom_fichier,taille,pages,caracteres,etat,cree_le,auteur:equipe_profils(prenom,nom),fiches:assistant_fiches(count)&order=cree_le.desc&limit=200"),
    lire<{ id: string; texte: string; langue: string; nombre: number; derniere_le: string; fiche_id: string | null }>(
      "assistant_questions?select=id,texte,langue,nombre,derniere_le,fiche_id&repondue_le=is.null&order=nombre.desc,derniere_le.desc&limit=50",
    ),
    lire<{ argumentaire: string }>("assistant_reglages?select=argumentaire&limit=1"),
    compter("assistant_fiches", "publie=is.true"),
  ]);
  if (!sources || !questions || !reglages) return null;
  // texte des brouillons et des sources retirées (à relire avant publication), une requête par source : L.morceaux
  // lignes au plus chacune, sous le plafond de lignes de l'API
  const relire = sources.filter((x) => x.etat !== "publie");
  const textes = await Promise.all(relire.map((x) => lire<{ titre: string; texte: string }>(`assistant_fiches?select=titre,texte&source_id=eq.${x.id}&order=cree_le.asc&limit=${L.morceaux}`)));
  if (textes.some((t) => !t)) return null;
  const parSource = new Map(relire.map((x, i) => [x.id, textes[i] ?? []]));
  return {
    sources: sources.map(({ auteur, fiches, ...x }) => {
      const t = parSource.get(x.id) ?? null;
      return {
        ...x,
        auteur: auteur ? `${auteur.prenom} ${auteur.nom}`.trim() : null,
        morceaux: fiches[0]?.count ?? 0,
        apercu: t && t.map((f) => ({ titre: f.titre, segments: surligner(f.texte, EMAILS_PUBLICS) })),
        alertes: t ? controler(t.map((f) => f.texte), EMAILS_PUBLICS) : [],
      };
    }),
    questions: questions.map(({ fiche_id, ...q }) => ({ ...q, deja: fiche_id !== null })),
    argumentaire: reglages[0]?.argumentaire ?? "",
    publiees,
  };
}
