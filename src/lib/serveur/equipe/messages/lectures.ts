import "server-only";
import { CLES_DEPART, LANGUES_MSG, type LangueMsg, MODELES_DEPART, msg } from "@/content/espace-messages";
import { lireContenu } from "@/lib/contenu";
import { iso } from "@/lib/jours";
import { base } from "../../base";
import { jetonSuivi } from "../../documents/jeton";
import { type FicheClient, lireClients } from "../dossiers";
import type { Session } from "../session";
import { defautAuto } from "./auto";
import { origine } from "./envoi";
import { AUTO_CLES, autoConnue, estAuto, type Faits } from "./rendu";
import type { StatutCourriel, StatutNumero } from "./regles";

// Lectures du lot « messages », par le serveur seulement avec la clé secrète (elle contourne RLS : le cloisonnement tient
// ICI). Un agent ne lit que les clients de ses dossiers (lireClients, lot L4), ses propres e-mails, les questions de ses
// dossiers et ses notifications ; un admin lit tout. null = la base ne répond pas (l'écran le dit).

const voitTout = (s: Session) => s.role === "admin";
const filtreAgent = (s: Session) => (voitTout(s) ? "" : `&agent_id=eq.${s.profilId}`);

async function lire<T>(chemin: string): Promise<T[] | null> {
  try {
    const r = await base(chemin);
    return r.ok ? ((await r.json()) as T[]) : null;
  } catch {
    return null;
  }
}

// ---------- clients du composeur : fiche + faits du dernier dossier ----------

export type ClientCourrier = { id: string; nom: string; email: string; langue: LangueMsg; faits: Faits; devis: { numero: string; url: string; valable: string | null } | null };
type BrutDemande = { id: string; cree_le: string; email: string | null; sejour: { arrivee?: number; depart?: number } | null; devis: { id: string; statut: string; cree_le: string; valable_jusqu_au: string | null }[] };

const langueSure = (l: string): LangueMsg => ((LANGUES_MSG as readonly string[]).includes(l) ? (l as LangueMsg) : "FR");

/** Faits de chaque fiche (prénom, séjour, référence, lien de suivi, devis publié), d'après le dernier dossier que la
 * session peut voir pour cette adresse. */
async function faitsDes(s: Session, fiches: FicheClient[]): Promise<ClientCourrier[] | null> {
  if (!fiches.length) return [];
  const d = await lire<BrutDemande>(`demandes?select=id,cree_le,email,sejour:dossier->sejour,devis(id,statut,cree_le,valable_jusqu_au)&statut=eq.envoyee${filtreAgent(s)}&order=cree_le.desc&limit=2000`);
  if (!d) return null;
  const parEmail = new Map<string, BrutDemande[]>();
  for (const x of d) if (x.email) parEmail.set(x.email.toLowerCase(), [...(parEmail.get(x.email.toLowerCase()) ?? []), x]);
  const devisPublies = d.flatMap((x) => x.devis.filter((v) => v.statut === "pret" || v.statut === "paye").map((v) => v.id));
  const numeros = devisPublies.length ? await lire<{ numero: string; source_id: string }>(`documents?select=numero,source_id&type=eq.D&source=eq.devis&source_id=in.(${devisPublies.join(",")})`) : [];
  if (!numeros) return null;
  const numero = new Map(numeros.map((n) => [n.source_id, n.numero]));
  const o = await origine();
  return fiches.map((c) => {
    const liste = parEmail.get(c.email.toLowerCase()) ?? [];
    // UN seul dossier donne tous les faits (dates, référence, lien, devis), jamais un mélange de deux : le plus récent qui
    // a des dates de séjour, sinon le plus récent (une question posée après coup n'efface pas le voyage préparé)
    const d = liste.find((x) => Number.isInteger(x.sejour?.arrivee) && Number.isInteger(x.sejour?.depart)) ?? liste[0];
    const v = d?.devis.filter((x) => x.statut === "pret" || x.statut === "paye").sort((a, b) => b.cree_le.localeCompare(a.cree_le))[0];
    const n = v ? numero.get(v.id) : undefined;
    const jeton = d ? jetonSuivi("d", d.id) : null;
    const lien = jeton && o ? `${o}/suivi/${jeton}` : null;
    return {
      id: c.id,
      nom: c.nom,
      email: c.email,
      langue: langueSure(c.langue),
      faits: {
        prenom: c.nom.trim().split(/\s+/)[0] ?? "",
        sejour: Number.isInteger(d?.sejour?.arrivee) && Number.isInteger(d?.sejour?.depart) ? { arrivee: iso(d!.sejour!.arrivee!), depart: iso(d!.sejour!.depart!) } : null,
        reference: n ?? (d ? `DEM-${d.id.slice(0, 6).toUpperCase()}` : null),
        lien,
      },
      devis: n && lien ? { numero: n, url: `${lien}/document`, valable: v?.valable_jusqu_au ?? null } : null,
    };
  });
}

export async function clientsCourrier(s: Session): Promise<ClientCourrier[] | null> {
  const fiches = await lireClients(s);
  return fiches ? faitsDes(s, fiches) : null;
}

/** Les clients donnés, s'ils sont tous visibles de cette session (sinon null : refus). */
export async function clientsChoisis(s: Session, ids: string[]): Promise<ClientCourrier[] | "refuse" | null> {
  const fiches = await lireClients(s);
  if (!fiches) return null;
  const choisis = ids.map((id) => fiches.find((f) => f.id === id));
  if (choisis.some((f) => !f)) return "refuse";
  return faitsDes(s, choisis as FicheClient[]);
}

// ---------- e-mails rédigés ----------

export type Envoi = { id: string; statut: StatutCourriel; client: { id: string; nom: string } | null; destinataire: string; modele: string | null; langue: LangueMsg; objet: string; corps: string; pieces: string[]; quand: string; auteur: string; mien: boolean };
type BrutEnvoi = { id: string; statut: Envoi["statut"]; auteur_id: string | null; client_id: string | null; destinataire: string; modele: string | null; langue: LangueMsg; objet: string; corps: string; pieces: { type: string }[]; cree_le: string; envoye_le: string | null; client: { nom: string } | null; auteur: { prenom: string; nom: string } | null };

export async function envoisRecents(s: Session): Promise<Envoi[] | null> {
  const qui = voitTout(s) ? "" : `&auteur_id=eq.${s.profilId}`;
  const l = await lire<BrutEnvoi>(`courriels_envoyes?select=id,statut,auteur_id,client_id,destinataire,modele,langue,objet,corps,pieces,cree_le,envoye_le,client:clients(nom),auteur:equipe_profils(prenom,nom)${qui}&order=cree_le.desc&limit=40`);
  return l
    ? l.map((x) => ({
        id: x.id,
        statut: x.statut,
        client: x.client_id && x.client ? { id: x.client_id, nom: x.client.nom } : null,
        destinataire: x.destinataire,
        modele: x.modele,
        langue: x.langue,
        objet: x.objet,
        // seul le brouillon de son auteur revient au composeur
        corps: x.statut === "brouillon" && x.auteur_id === s.profilId ? x.corps : "",
        pieces: x.pieces.map((p) => p.type),
        quand: x.envoye_le ?? x.cree_le,
        auteur: x.auteur ? `${x.auteur.prenom} ${x.auteur.nom}` : "",
        mien: x.auteur_id === s.profilId,
      }))
    : null;
}

// ---------- modèles ----------

export type TexteModele = { sujet: string; corps: string; source: "base" | "depart" | "defaut" };
/** `defauts` : textes par défaut du site d'un e-mail automatique (repris quand l'admin retire son texte). */
export type Modele = { cle: string; nom: string; depart: boolean; auto: boolean; textes: Partial<Record<LangueMsg, TexteModele>>; defauts?: Partial<Record<LangueMsg, { sujet: string; corps: string }>> };
type LigneModele = { cle: string; langue: LangueMsg; sujet: string; corps: string };

/**
 * Modèles en deux groupes, d'après les lignes lues en base. `equipe` : ceux du composeur (textes enregistrés par un admin,
 * sinon les textes de départ de content/espace-messages.ts) ; aucune clé « auto-… » n'y entre. `auto` : les clés réservées
 * aux e-mails automatiques du site (AUTO_CLES), toujours listées ; une langue sans texte en base montre le texte par défaut
 * que le site envoie (auto.ts, source « defaut »). Une autre clé « auto-… » trouvée en base n'est montrée nulle part.
 */
function grouper(l: LigneModele[]): { equipe: Modele[]; auto: Modele[] } {
  const textes = (cle: string) => {
    const d = MODELES_DEPART[cle as keyof typeof MODELES_DEPART];
    const t: Modele["textes"] = {};
    for (const langue of LANGUES_MSG) {
      const b = l.find((x) => x.cle === cle && x.langue === langue);
      if (b) t[langue] = { sujet: b.sujet, corps: b.corps, source: "base" };
      else if (d) t[langue] = { sujet: d.sujet[langue], corps: d.corps[langue], source: "depart" };
      else if (autoConnue(cle)) t[langue] = { ...defautAuto(cle, langue), source: "defaut" };
    }
    return t;
  };
  const cles = [...new Set([...CLES_DEPART, ...l.map((x) => x.cle)])].filter((c) => !estAuto(c));
  return {
    equipe: cles.map((cle) => ({ cle, nom: MODELES_DEPART[cle as keyof typeof MODELES_DEPART]?.nom ?? cle, depart: cle in MODELES_DEPART, auto: false, textes: textes(cle) })),
    auto: AUTO_CLES.map((cle) => ({ cle, nom: msg.modeles.autoNoms[cle], depart: false, auto: true, textes: textes(cle), defauts: Object.fromEntries(LANGUES_MSG.map((g) => [g, defautAuto(cle, g)])) })),
  };
}

/** Modèles lus en base ; null = la base ne répond pas (l'écran se replie alors sur modelesDeDepart). */
export async function lireModeles(): Promise<{ equipe: Modele[]; auto: Modele[] } | null> {
  const l = await lire<LigneModele>("modeles_courriels?select=cle,langue,sujet,corps&order=cle.asc&limit=1000");
  return l ? grouper(l) : null;
}

/** Les mêmes groupes sans aucune ligne en base : textes de départ et textes par défaut du site. */
export const modelesDeDepart = () => grouper([]);

// ---------- boîte de réception (source 1 : questions posées sur le site) ----------

export type Message = { id: string; recu: string; nom: string; email: string; langue: LangueMsg; texte: string; clientId: string | null; agent: string | null };
type BrutQuestion = { id: string; cree_le: string; nom: string | null; email: string | null; langue: string; message: string | null; agent: { prenom: string; nom: string } | null };

export async function lireBoite(s: Session): Promise<Message[] | null> {
  const q = await lire<BrutQuestion>(`demandes?select=id,cree_le,nom,email,langue,message,agent:equipe_profils(prenom,nom)&statut=eq.envoyee&intention=eq.question${filtreAgent(s)}&order=cree_le.desc&limit=200`);
  if (!q) return null;
  const emails = [...new Set(q.flatMap((x) => (x.email && !/["\\]/.test(x.email) ? [x.email.toLowerCase()] : [])))];
  const fiches = emails.length ? await lire<{ id: string; email: string }>(`clients?select=id,email&email=in.(${emails.map((e) => `"${encodeURIComponent(e)}"`).join(",")})&limit=500`) : [];
  if (!fiches) return null;
  const fiche = new Map(fiches.map((f) => [f.email.toLowerCase(), f.id]));
  return q.map((x) => ({
    id: x.id,
    recu: x.cree_le,
    nom: x.nom ?? "",
    email: x.email ?? "",
    langue: langueSure(x.langue),
    texte: x.message ?? "",
    clientId: x.email ? (fiche.get(x.email.toLowerCase()) ?? null) : null,
    agent: x.agent ? `${x.agent.prenom} ${x.agent.nom}` : null,
  }));
}

// ---------- notifications de l'agent ----------

export type Notification = { id: string; type: string; quand: string; lue: boolean; dossier: string; client: string | null; accessible: boolean };

/**
 * Pose (une seule fois chacune : unicité profil + type + objet) les notifications tirées des faits déjà en base pour ce
 * membre : dossiers qu'on lui a attribués (journal de l'équipe) et questions venues du site sur ses dossiers. Les lots
 * finances (paiement reçu) et documents (devis ouvert) écrivent directement la même forme de ligne.
 */
async function poserNotifications(s: Session) {
  const [attributions, questions] = await Promise.all([
    lire<{ cree_le: string; details: { dossier?: string } }>(`equipe_journal?select=cree_le,details&action=eq.dossier.attribution&details->>cible=eq.${s.profilId}&order=id.desc&limit=200`),
    lire<{ id: string; cree_le: string }>(`demandes?select=id,cree_le&statut=eq.envoyee&intention=eq.question&agent_id=eq.${s.profilId}&order=cree_le.desc&limit=200`),
  ]);
  const lignes = [
    ...(attributions ?? []).filter((a) => typeof a.details.dossier === "string" && /^[0-9a-f-]{36}$/.test(a.details.dossier)).map((a) => ({ profil_id: s.profilId, type: "dossier_attribue", objet_id: a.details.dossier, quand: a.cree_le })),
    ...(questions ?? []).map((q) => ({ profil_id: s.profilId, type: "message_recu", objet_id: q.id, quand: q.cree_le })),
  ];
  if (!lignes.length) return;
  await base("notifications?on_conflict=profil_id,type,objet_id", { method: "POST", corps: lignes, prefer: "resolution=ignore-duplicates,return=minimal" }).catch(() => null);
}

export async function lireNotifications(s: Session): Promise<Notification[] | null> {
  await poserNotifications(s);
  const l = await lire<{ id: string; type: string; quand: string; lu_le: string | null; objet_id: string }>(`notifications?select=id,type,quand,lu_le,objet_id&profil_id=eq.${s.profilId}&order=quand.desc&limit=100`);
  if (!l) return null;
  const ids = [...new Set(l.map((n) => n.objet_id))];
  // le nom du client et le lien ne sont donnés que pour les dossiers encore accessibles à cette session
  const d = ids.length ? await lire<{ id: string; nom: string | null }>(`demandes?select=id,nom&id=in.(${ids.join(",")})&statut=eq.envoyee${filtreAgent(s)}`) : [];
  if (!d) return null;
  const noms = new Map(d.map((x) => [x.id, x.nom]));
  return l.map((n) => ({ id: n.id, type: n.type, quand: n.quand, lue: Boolean(n.lu_le), dossier: n.objet_id, client: noms.get(n.objet_id) ?? null, accessible: noms.has(n.objet_id) }));
}

// ---------- La lettre de Ouidah ----------

export type Repartition = { cle: string; langue: LangueMsg; sujets: string[]; n: number };
export type Abonnes = { actifs: number; desinscrits: number; parTheme: { id: string; nom: string; n: number }[]; parLangue: Record<LangueMsg, number>; repartition: Repartition[] };

/** Abonnés réels, comptés ici (aucune adresse ne sort) ; `repartition` : nombre par langue et combinaison de thèmes, pour
 * que l'écran annonce la cible d'un numéro avant l'envoi (le serveur la recompte à l'envoi). */
export async function lireAbonnes(): Promise<Abonnes | null> {
  const newsletter = await lireContenu("fr.newsletter");
  const l = await lire<{ langue: LangueMsg; sujets: unknown; desinscrit_le: string | null }>("abonnes_lettre?select=langue,sujets,desinscrit_le&limit=50000");
  if (!l) return null;
  const actifs = l.filter((x) => !x.desinscrit_le);
  const sujetsDe = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").sort() : []);
  const rep = new Map<string, Repartition>();
  for (const a of actifs) {
    const sj = sujetsDe(a.sujets), cle = `${a.langue}|${sj.join(",")}`;
    const r = rep.get(cle) ?? { cle, langue: langueSure(a.langue), sujets: sj, n: 0 };
    r.n += 1;
    rep.set(cle, r);
  }
  return {
    actifs: actifs.length,
    desinscrits: l.length - actifs.length,
    parTheme: newsletter.sujets.map((t) => ({ id: t.id, nom: t.nom, n: actifs.filter((a) => sujetsDe(a.sujets).includes(t.id)).length })),
    parLangue: Object.fromEntries(LANGUES_MSG.map((g) => [g, actifs.filter((a) => a.langue === g).length])) as Record<LangueMsg, number>,
    repartition: [...rep.values()],
  };
}

export type Numero = { id: string; langue: LangueMsg; sujets: string[]; objet: string; corps: string; statut: StatutNumero; quand: string; envoyes: number };

export async function lireNumeros(): Promise<Numero[] | null> {
  const l = await lire<{ id: string; langue: LangueMsg; sujets: string[]; objet: string; corps: string; statut: Numero["statut"]; modifie_le: string; envoye_le: string | null }>("lettre_numeros?select=id,langue,sujets,objet,corps,statut,modifie_le,envoye_le&order=modifie_le.desc&limit=30");
  if (!l) return null;
  const e = l.length ? await lire<{ numero_id: string }>(`lettre_envois?select=numero_id&statut=eq.envoye&numero_id=in.(${l.map((x) => x.id).join(",")})&limit=50000`) : [];
  if (!e) return null;
  return l.map((x) => ({ id: x.id, langue: x.langue, sujets: x.sujets, objet: x.objet, corps: x.corps, statut: x.statut, quand: x.envoye_le ?? x.modifie_le, envoyes: e.filter((y) => y.numero_id === x.id).length }));
}

/** L'abonné d'un lien de désinscription (adresse, langue, déjà désinscrit ou non), ou null. */
export async function lireAbonne(id: string): Promise<{ email: string; langue: LangueMsg; desinscrit: boolean } | null> {
  const l = await lire<{ email: string; langue: string; desinscrit_le: string | null }>(`abonnes_lettre?select=email,langue,desinscrit_le&id=eq.${id}&limit=1`);
  const a = l?.[0];
  return a ? { email: a.email, langue: langueSure(a.langue), desinscrit: Boolean(a.desinscrit_le) } : null;
}
