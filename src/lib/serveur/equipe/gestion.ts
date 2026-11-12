"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { base, baseConfiguree, compter } from "../base";
import type { EtatCompte } from "./agents";
import { emettreCode } from "./codes";
import { bannir, supprimerAuth } from "./comptes";
import { envoyerCode, smtpConfigure } from "./courriel";
import { journaliser } from "./journal";
import { modeLocal } from "./mode";
import { iso, type RoleCompte, selConfigure } from "./outils";
import { peutPasser } from "../machines";
import { type ChampInvalide, creerInvite, lireInvitation, refusRole, refusSuppression, refusSuspension, ROLES, TRANSITIONS_COMPTE } from "./partage";
import { exigerRole, revoquerSessions } from "./session";

// Écritures de l'écran Équipe (lot L3) : ajouter un compte, le suspendre, le réactiver, renvoyer l'invitation, le
// supprimer, changer son rôle. Actions
// serveur (contrôle d'origine de Next) joignables par une requête forgée : CHAQUE appel relit la session et exige le rôle
// admin, revalide ses entrées et ne renvoie que ce que l'écran affiche (doc Next 16 « Data Security » › Mutating data).
// Chaque action va au journal (auteur = l'admin, details.cible = le compte visé), jamais un code ni un mot de passe.
// refresh() renvoie la liste à jour dans la même réponse (doc Next 16 « Server Actions » › Choosing a cache update).

export type Refus = "refuse" | "champs" | "smtp" | "existe" | "envoi" | "panne" | "trop_tot" | "soi" | "dernier_admin" | "etat";
export type Retour = { ok: true; id: string } | { erreur: Refus; champs?: ChampInvalide[]; attente?: number; id?: string };
type Quoi = "suspendre" | "reactiver" | "reinviter";
type Cible = { id: string; prenom: string; email: string; role: RoleCompte; etat: EtatCompte | "supprime"; langues: string[]; derniere_connexion: string | null };

const QUOI: Quoi[] = ["suspendre", "reactiver", "reinviter"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RENVOI_MS = 60_000;

/** Voie d'envoi du code : le SMTP d'OHT, ou la boîte locale du test (mode.ts, jamais en production) ; null sans aucune. */
async function voieEnvoi() {
  const local = modeLocal(process.env, (await headers()).get("host"), process.cwd());
  return smtpConfigure() || local.boite ? { boite: local.boite } : null;
}

/** Nouveau code de première connexion (les précédents sont annulés), envoyé dans la première langue du compte. */
async function envoyerInvitation(p: { id: string; email: string; prenom: string; langues: string[] }, boite: string | null) {
  const code = await emettreCode(p.id);
  return code ? envoyerCode({ a: p.email, prenom: p.prenom, langue: p.langues[0], code, premiere: true, boite }) : false;
}

export async function ajouterAgent(brut: unknown): Promise<Retour> {
  const s = await exigerRole("admins");
  if (!s) return { erreur: "refuse" };
  const lu = lireInvitation(brut);
  if (!lu.ok) return { erreur: "champs", champs: lu.champs };
  if (!baseConfiguree() || !selConfigure()) return { erreur: "panne" };
  // sans voie d'envoi, rien n'est créé : un compte sans invitation resterait inutilisable
  const voie = await voieEnvoi();
  if (!voie) return { erreur: "smtp" };
  const cree = await creerInvite({ url: process.env.SUPABASE_URL ?? "", cle: process.env.SUPABASE_SECRET_KEY ?? "" }, lu.v);
  if (typeof cree === "string") return { erreur: cree };
  const envoye = await envoyerInvitation({ id: cree.id, ...lu.v }, voie.boite);
  await journaliser("equipe.ajout", s.profilId, null, { cible: cree.id, role: lu.v.role, etat: "invite", ...(envoye ? {} : { motif: "envoi" as const }) });
  refresh();
  return envoye ? { ok: true, id: cree.id } : { erreur: "envoi", id: cree.id };
}

async function lireCible(id: string): Promise<Cible | null> {
  try {
    const r = await base(`equipe_profils?select=id,prenom,email,role,etat,langues,derniere_connexion&id=eq.${id}&limit=1`);
    return r.ok ? (((await r.json()) as Cible[])[0] ?? null) : null;
  } catch {
    return null;
  }
}

/** Change l'état seulement si le compte est encore dans l'état lu : deux admins au même instant, un seul l'emporte. */
async function passer(id: string, de: EtatCompte | "supprime", vers: EtatCompte) {
  if (!peutPasser(TRANSITIONS_COMPTE, de, vers)) return false;
  try {
    const r = await base(`equipe_profils?id=eq.${id}&etat=eq.${de}&select=id`, { method: "PATCH", corps: { etat: vers, modifie_le: iso(Date.now()) }, prefer: "return=representation" });
    return r.ok && ((await r.json()) as unknown[]).length === 1;
  } catch {
    return false;
  }
}

/** Secondes à attendre avant un nouveau code (un code par compte et par minute, quelle que soit la voie), null si la base
 * ne répond pas. */
async function attenteRenvoi(id: string): Promise<number | null> {
  try {
    const r = await base(`equipe_codes?select=cree_le&profil_id=eq.${id}&order=cree_le.desc&limit=1`);
    if (!r.ok) return null;
    const d = ((await r.json()) as { cree_le: string }[])[0];
    return d ? Math.max(0, Math.ceil((Date.parse(d.cree_le) + RENVOI_MS - Date.now()) / 1000)) : 0;
  } catch {
    return null;
  }
}

const adminsActifs = () => compter("equipe_profils", "role=eq.admin&etat=eq.actif");

export async function changerAgent(id: unknown, quoi: unknown): Promise<Retour> {
  const s = await exigerRole("admins");
  if (!s) return { erreur: "refuse" };
  if (typeof id !== "string" || !UUID.test(id) || !QUOI.includes(quoi as Quoi)) return { erreur: "champs" };
  const c = await lireCible(id);
  if (!c) return { erreur: "panne" };

  switch (quoi as Quoi) {
    case "suspendre": {
      if (c.etat === "suspendu" || c.etat === "supprime") return { erreur: "etat" };
      const n = await adminsActifs();
      if (n === null) return { erreur: "panne" };
      const motif = refusSuspension(s.profilId, c, n);
      if (motif) {
        await journaliser("equipe.refus", s.profilId, null, { cible: id, role: c.role, etat: c.etat, motif });
        return { erreur: motif };
      }
      if (!(await passer(id, c.etat, "suspendu"))) return { erreur: "etat" };
      // jamais zéro admin actif, même si deux admins se suspendent l'un l'autre au même instant
      if (c.role === "admin" && c.etat === "actif" && (await adminsActifs()) === 0) {
        await passer(id, "suspendu", c.etat);
        return { erreur: "dernier_admin" };
      }
      // l'état « suspendu » ferme déjà toute session (lireSession) ; on les révoque en plus, puis Supabase Auth refuse
      // toute connexion par mot de passe
      await revoquerSessions(id);
      const banni = await bannir(id, true);
      await journaliser("equipe.suspension", s.profilId, null, { cible: id, role: c.role, etat: c.etat, ...(banni ? {} : { motif: "bannissement" as const }) });
      break;
    }
    case "reactiver": {
      if (c.etat !== "suspendu") return { erreur: "etat" };
      // bannissement levé d'abord : sinon le compte rouvert ne pourrait pas se connecter
      if (!(await bannir(id, false))) return { erreur: "panne" };
      const vers: EtatCompte = c.derniere_connexion ? "actif" : "invite"; // jamais connecté : il repart de l'invitation
      if (!(await passer(id, "suspendu", vers))) return { erreur: "etat" };
      await journaliser("equipe.reactivation", s.profilId, null, { cible: id, role: c.role, etat: vers });
      break;
    }
    case "reinviter": {
      if (c.etat !== "invite") return { erreur: "etat" };
      const voie = await voieEnvoi();
      if (!voie) return { erreur: "smtp" };
      const attente = await attenteRenvoi(id);
      if (attente === null) return { erreur: "panne" };
      if (attente > 0) return { erreur: "trop_tot", attente };
      const envoye = await envoyerInvitation(c, voie.boite);
      await journaliser("equipe.reinvitation", s.profilId, null, { cible: id, role: c.role, etat: c.etat, ...(envoye ? {} : { motif: "envoi" as const }) });
      if (!envoye) return { erreur: "envoi", id };
      break;
    }
  }
  refresh();
  return { ok: true, id };
}

/** Supprime un compte invité ou suspendu (un compte actif se suspend d'abord ; jamais soi-même). Le profil n'est jamais
 * effacé : des écritures de l'équipe le citent (taux, e-MECeF, rendez-vous, relances, journal). Il passe à l'état
 * « supprime », anonymisé, son adresse libérée pour une nouvelle invitation (migration 20261115_equipe_suppression.sql).
 * Ordre : le compte Supabase Auth d'abord (soft delete, reprenable) ; si la base refuse ensuite, le compte reste dans
 * son état et une nouvelle demande reprend là. Puis codes annulés, sessions révoquées, journal. */
export async function supprimerAgent(id: unknown): Promise<Retour> {
  const s = await exigerRole("admins");
  if (!s) return { erreur: "refuse" };
  if (typeof id !== "string" || !UUID.test(id)) return { erreur: "champs" };
  const c = await lireCible(id);
  if (!c) return { erreur: "panne" };
  const n = await adminsActifs();
  if (n === null) return { erreur: "panne" };
  const motif = refusSuppression(s.profilId, c, n);
  if (motif) {
    if (motif !== "etat") await journaliser("equipe.refus", s.profilId, null, { cible: id, role: c.role, motif });
    return { erreur: motif };
  }
  if (!(await supprimerAuth(id))) return { erreur: "panne" };
  const t = iso(Date.now());
  try {
    const r = await base(`equipe_profils?id=eq.${id}&etat=eq.${c.etat}&select=id`, {
      method: "PATCH",
      corps: { etat: "supprime", prenom: "Compte", nom: "supprimé", email: `supprime-${id}@compte.invalid`, telephone: null, droits: {}, modifie_le: t },
      prefer: "return=representation",
    });
    if (!r.ok) return { erreur: "panne" };
    if (((await r.json()) as unknown[]).length !== 1) return { erreur: "etat" };
  } catch {
    return { erreur: "panne" };
  }
  await base(`equipe_codes?profil_id=eq.${id}&consomme_le=is.null`, { method: "PATCH", corps: { consomme_le: t }, prefer: "return=minimal" }).catch(() => null);
  await revoquerSessions(id);
  await journaliser("equipe.suppression", s.profilId, null, { cible: id, role: c.role, etat: c.etat as EtatCompte });
  refresh();
  return { ok: true, id };
}

/** Passe un compte d'agent à admin ou l'inverse (droits remis à zéro : un admin les a tous, un agent repart des droits
 * par défaut, réglables dans « Rôles et droits »). Jamais soi-même, jamais le dernier admin actif ; ses sessions sont
 * révoquées pour qu'il revienne avec son nouveau rôle. */
export async function changerRole(id: unknown, vers: unknown): Promise<Retour> {
  const s = await exigerRole("admins");
  if (!s) return { erreur: "refuse" };
  if (typeof id !== "string" || !UUID.test(id) || !ROLES.includes(vers as RoleCompte)) return { erreur: "champs" };
  const role = vers as RoleCompte;
  const c = await lireCible(id);
  if (!c) return { erreur: "panne" };
  const n = await adminsActifs();
  if (n === null) return { erreur: "panne" };
  const motif = refusRole(s.profilId, c, role, n);
  if (motif) {
    if (motif !== "etat") await journaliser("equipe.refus", s.profilId, null, { cible: id, role: c.role, motif });
    return { erreur: motif };
  }
  const changer = async (de: RoleCompte, a: RoleCompte) => {
    try {
      const r = await base(`equipe_profils?id=eq.${id}&role=eq.${de}&etat=eq.${c.etat}&select=id`, { method: "PATCH", corps: { role: a, droits: {}, modifie_le: iso(Date.now()) }, prefer: "return=representation" });
      return r.ok && ((await r.json()) as unknown[]).length === 1;
    } catch {
      return false;
    }
  };
  if (!(await changer(c.role, role))) return { erreur: "etat" };
  // jamais zéro admin actif, même si deux admins se rétrogradent l'un l'autre au même instant
  if (role === "agent" && c.etat === "actif" && (await adminsActifs()) === 0) {
    await changer(role, c.role);
    return { erreur: "dernier_admin" };
  }
  await revoquerSessions(id);
  await journaliser("equipe.role", s.profilId, null, { cible: id, role, etat: c.etat as EtatCompte });
  refresh();
  return { ok: true, id };
}
