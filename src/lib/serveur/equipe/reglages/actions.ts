"use server";

import { randomUUID } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { refresh, updateTag } from "next/cache";
import { headers } from "next/headers";
import { expediteurEquipe } from "@/content/courriels-equipe";
import { reglages as R } from "@/content/espace-reglages";
import { base } from "../../base";
import { actualiserTauxAutomatique, modifierTaux } from "../../taux";
import { courrielConfigure, echapper, envoyerCourriel } from "../../courriel";
import { empreinteIp } from "../../garde";
import { passerelle } from "../../paiement";
import { chargerCles, ecrireCle, effacerCleBase, estChamp, estPorteur, lireValeur, saisiePossible } from "../../paiement/cles";
import { PASSERELLES, type NomPasserelle } from "../../paiement/types";
import { champsDe } from "../finances/regles";
import { changerMotDePasse, lireProfil as lireCompte, verifierMotDePasse } from "../comptes";
import { essaiReussi, noterEssai } from "../essais";
import { journaliser } from "../journal";
import { modeLocal } from "../mode";
import { empreinteEmail, selConfigure } from "../outils";
import { exigerRole, type Session } from "../session";
import { TAG_MAINTENANCE } from "./maintenance-cache";
import { cleAssistant, oublierTauxPublics } from "./public";
import { lireImage, lireMaintenance, lireMentions, lireModeEco, lireMotDePasse, lireNim, lireProfil, lireTauxUsd, versBytea } from "./regles";

// Écritures du lot « reglages ». Actions serveur (contrôle d'origine de Next) joignables par une requête forgée : CHAQUE
// appel relit la session et le rôle, relit ses entrées avec les règles partagées (regles.ts) et ne renvoie que ce que
// l'écran affiche (doc Next 16 « Data Security » › Mutating data). Réglages : admin seulement. Profil : le compte connecté
// seulement, jamais un identifiant de compte lu du navigateur. Chaque écriture va au journal (objet touché, jamais une clé,
// un mot de passe ni le texte saisi). refresh() renvoie l'écran à jour dans la même réponse.

export type RefusReg = "refuse" | "admin" | "champs" | "panne" | "cles" | "cle" | "smtp" | "envoi" | "trop_tot" | "ancien" | "verrou" | "image" | "message" | "courant" | "introuvable" | "taux_perime" | "sel";
export type RetourReg = { ok: true; n?: number } | { erreur: RefusReg; champs?: string[] };

const maintenant = () => new Date().toISOString();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** PATCH qui rend les lignes touchées (null si la base ne répond pas). */
async function modifier(chemin: string, corps: Record<string, unknown>): Promise<unknown[] | null> {
  try {
    const r = await base(chemin, { method: "PATCH", corps, prefer: "return=representation" });
    return r.ok ? ((await r.json()) as unknown[]) : null;
  } catch {
    return null;
  }
}
async function lire<L>(chemin: string): Promise<L[] | null> {
  try {
    const r = await base(chemin);
    return r.ok ? ((await r.json()) as L[]) : null;
  } catch {
    return null;
  }
}

/** Session admin, ou le refus à renvoyer (personne : « refuse » ; agent : « admin », noté au journal). */
async function admin(): Promise<Session | { erreur: RefusReg }> {
  const s = await exigerRole("agents");
  if (!s) return { erreur: "refuse" };
  if (s.role !== "admin") {
    await journaliser("reglages.refus", s.profilId, null, { motif: "role" });
    return { erreur: "admin" };
  }
  return s;
}
const fin = (ok: boolean): RetourReg => {
  if (!ok) return { erreur: "panne" };
  refresh();
  return { ok: true };
};

// ---------- passerelles ----------

export async function basculerPasserelle(nom: unknown, active: unknown): Promise<RetourReg> {
  const s = await admin();
  if ("erreur" in s) return s;
  if (typeof nom !== "string" || !(PASSERELLES as readonly string[]).includes(nom) || typeof active !== "boolean") return { erreur: "champs" };
  // une passerelle sans ses clés (saisies ici ou variables du serveur) ne s'active pas (même par une requête forgée)
  if (active) await chargerCles(true);
  if (active && !passerelle(nom as NomPasserelle).disponible()) {
    await journaliser("reglages.refus", s.profilId, null, { passerelle: nom, motif: "cles" });
    return { erreur: "cles" };
  }
  const r = await modifier(`passerelles_paiement?nom=eq.${nom}&select=nom`, { active, modifie_le: maintenant() });
  if (r?.length) await journaliser("reglages.passerelle", s.profilId, null, { passerelle: nom, actif: active });
  return fin(Boolean(r?.length));
}

/** Monte ou descend une passerelle d'un rang ; l'ordre est réécrit de 1 à 5 sans trou. */
export async function deplacerPasserelle(nom: unknown, sens: unknown): Promise<RetourReg> {
  const s = await admin();
  if ("erreur" in s) return s;
  if (typeof nom !== "string" || !(PASSERELLES as readonly string[]).includes(nom) || (sens !== "haut" && sens !== "bas")) return { erreur: "champs" };
  const l = await lire<{ nom: string; ordre: number }>("passerelles_paiement?select=nom,ordre&order=ordre.asc,nom.asc");
  if (!l) return { erreur: "panne" };
  const noms = l.map((x) => x.nom);
  const i = noms.indexOf(nom), j = sens === "haut" ? i - 1 : i + 1;
  if (i < 0) return { erreur: "panne" };
  if (j >= 0 && j < noms.length) [noms[i], noms[j]] = [noms[j], noms[i]];
  const avant = new Map(l.map((x) => [x.nom, x.ordre]));
  for (const [k, n] of noms.entries()) {
    if (avant.get(n) === k + 1) continue;
    if (!(await modifier(`passerelles_paiement?nom=eq.${n}&select=nom`, { ordre: k + 1, modifie_le: maintenant() }))?.length) return { erreur: "panne" };
  }
  await journaliser("reglages.ordre", s.profilId, null, { passerelle: nom, nombre: noms.indexOf(nom) + 1 });
  return fin(true);
}

// ---------- clés des passerelles et jeton e-MECeF (chiffrés en base, jamais relus vers le navigateur) ----------

/** Pose ou remplace une clé d'une passerelle (ou du connecteur « emcf »). La valeur n'est ni renvoyée, ni journalisée,
 * ni placée dans une erreur : le journal note la passerelle et le nom du champ. */
export async function enregistrerCle(porteur: unknown, champ: unknown, brut: unknown): Promise<RetourReg> {
  const s = await admin();
  if ("erreur" in s) return s;
  if (!estPorteur(porteur) || !estChamp(porteur, champ)) return { erreur: "champs" };
  const valeur = lireValeur(champ, champsDe(brut).valeur);
  if (valeur === null) return { erreur: "champs", champs: ["valeur"] };
  if (!saisiePossible()) return { erreur: "sel" };
  if (!(await ecrireCle(porteur, champ, valeur, s.profilId))) return { erreur: "panne" };
  await journaliser(porteur === "emcf" ? "reglages.emcf" : "reglages.passerelle", s.profilId, null, { passerelle: porteur, cible: champ, mode: "saisie" });
  updateTag("boutique"); // le catalogue mis en cache garde la présence d'une passerelle utilisable (lib/boutique.ts)
  return fin(true);
}

/** Efface une clé saisie ici : la variable du serveur du même nom reprend la main (si elle existe). */
export async function effacerCle(porteur: unknown, champ: unknown): Promise<RetourReg> {
  const s = await admin();
  if ("erreur" in s) return s;
  if (!estPorteur(porteur) || !estChamp(porteur, champ)) return { erreur: "champs" };
  if (!(await effacerCleBase(porteur, champ))) return { erreur: "panne" };
  await journaliser(porteur === "emcf" ? "reglages.emcf" : "reglages.passerelle", s.profilId, null, { passerelle: porteur, cible: champ, mode: "effacement" });
  updateTag("boutique");
  return fin(true);
}

// ---------- e-mail d'envoi : test vers l'admin lui-même ----------

export async function envoyerTest(): Promise<RetourReg> {
  const s = await admin();
  if ("erreur" in s) return s;
  const boite = modeLocal(process.env, (await headers()).get("host"), process.cwd()).boite;
  if (!boite && !courrielConfigure()) return { erreur: "smtp" };
  // un test par minute et par admin (compté au journal)
  const dernier = await lire<{ cree_le: string }>(`equipe_journal?select=cree_le&action=eq.envoi.test&profil_id=eq.${s.profilId}&order=cree_le.desc&limit=1`);
  if (!dernier) return { erreur: "panne" };
  if (dernier[0] && Date.now() - Date.parse(dernier[0].cree_le) < 60_000) return { erreur: "trop_tot" };
  const p = await lireCompte({ id: s.profilId });
  if (!p) return { erreur: "panne" };
  const sujet = R.envoiCourriel.sujetTest;
  const lignes = R.envoiCourriel.corpsTest(p.prenom);
  const parti = boite
    ? await appendFile(boite, `${JSON.stringify({ a: p.email, sujet, type: "envoi.test", le: maintenant() })}\n`, "utf8").then(() => true, () => false)
    : await envoyerCourriel({
        a: p.email,
        sujet,
        html: `<!doctype html><html><body style="margin:0;padding:24px;background:#ffffff"><div style="max-width:520px;margin:0 auto">${lignes.map((t) => `<p style="margin:0 0 12px;font:15px/1.55 Arial,sans-serif;color:#0f162d">${echapper(t)}</p>`).join("")}</div></body></html>`,
        texte: lignes.join("\n\n"),
        cle: `envoi-test-${randomUUID()}`,
        nom: expediteurEquipe,
      });
  await journaliser("envoi.test", s.profilId, null, parti ? {} : { motif: "envoi" });
  if (!parti) return { erreur: "envoi" };
  refresh();
  return { ok: true };
}

// ---------- mentions des documents ----------

export async function enregistrerDocuments(brut: unknown): Promise<RetourReg> {
  const s = await admin();
  if ("erreur" in s) return s;
  const lu = lireMentions(brut);
  const o = champsDe(brut);
  const [signature, cachet] = await Promise.all([lireImage(o.signature), lireImage(o.cachet)]);
  const champs = [...(lu.ok ? [] : lu.champs), ...(signature === "invalide" ? ["signature"] : []), ...(cachet === "invalide" ? ["cachet"] : [])];
  if (!lu.ok || champs.length) return { erreur: signature === "invalide" || cachet === "invalide" ? "image" : "champs", champs };
  const image = (cle: "signature" | "cachet", x: typeof signature, retirer: boolean | undefined) =>
    typeof x === "object" ? { [cle]: versBytea(x.octets), [`${cle}_type`]: x.type } : retirer ? { [cle]: null, [`${cle}_type`]: null } : {};
  const r = await modifier("reglages_documents?id=eq.true&select=id", {
    ...lu.v,
    ...image("signature", signature, lu.retirer?.signature),
    ...image("cachet", cachet, lu.retirer?.cachet),
    modifie_le: maintenant(),
    modifie_par: s.profilId,
  });
  if (r?.length) await journaliser("reglages.documents", s.profilId, null);
  return fin(Boolean(r?.length));
}

// ---------- dollar d'affichage (rien n'est encaissé ni compté en dollars) ----------

export async function enregistrerTauxUsd(brut: unknown): Promise<RetourReg> {
  const s = await exigerRole("agents");
  if (!s) return { erreur: "refuse" };
  const lu = lireTauxUsd(brut);
  if (!lu.ok) return { erreur: "champs", champs: lu.champs };
  const r = await modifierTaux("manuel", s.profilId, lu.v);
  if ("erreur" in r) return r;
  oublierTauxPublics();
  await journaliser("reglages.devises", s.profilId, null, { actif: lu.v !== null, mode: "manuel" });
  return fin(true);
}

export async function revenirTauxAuto(): Promise<RetourReg> {
  const s = await exigerRole("agents");
  if (!s) return { erreur: "refuse" };
  const r = await modifierTaux("auto", s.profilId);
  if ("erreur" in r) return r;
  await actualiserTauxAutomatique();
  oublierTauxPublics();
  await journaliser("reglages.devises", s.profilId, null, { mode: "auto" });
  return fin(true);
}

export async function validerTauxBce(brut: unknown): Promise<RetourReg> {
  const s = await admin();
  if ("erreur" in s) return s;
  const lu = lireTauxUsd(brut), date = champsDe(brut).date;
  if (!lu.ok || lu.v === null || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { erreur: "champs" };
  const r = await modifierTaux("valider", s.profilId, lu.v, date);
  if ("erreur" in r) return r;
  oublierTauxPublics();
  await journaliser("reglages.devises", s.profilId, null, { mode: "validation" });
  return fin(true);
}

// ---------- e-MECeF : le NIM seulement (aucun appel à la DGI, interrupteur figé par la base) ----------

export async function enregistrerNim(brut: unknown): Promise<RetourReg> {
  const s = await admin();
  if ("erreur" in s) return s;
  const lu = lireNim(brut);
  if (!lu.ok) return { erreur: "champs", champs: lu.champs };
  const r = await modifier("reglages_site?id=eq.true&select=id", { emcf_nim: lu.v, modifie_le: maintenant(), modifie_par: s.profilId });
  if (r?.length) await journaliser("reglages.emcf", s.profilId, null);
  return fin(Boolean(r?.length));
}

// ---------- assistant d'écriture ----------

export async function basculerAssistant(actif: unknown): Promise<RetourReg> {
  const s = await admin();
  if ("erreur" in s) return s;
  if (typeof actif !== "boolean") return { erreur: "champs" };
  if (actif && !cleAssistant()) {
    await journaliser("reglages.refus", s.profilId, null, { motif: "cles" });
    return { erreur: "cle" };
  }
  const r = await modifier("reglages_site?id=eq.true&select=id", { assistant_actif: actif, modifie_le: maintenant(), modifie_par: s.profilId });
  if (r?.length) await journaliser("reglages.assistant", s.profilId, null, { actif });
  return fin(Boolean(r?.length));
}

/** Activation publique et limites partagées : aucune clé ni requête fournisseur dans ce formulaire. */
export async function reglerAssistantPublic(brut: unknown): Promise<RetourReg> {
  const s = await admin();
  if ("erreur" in s) return s;
  const o = champsDe(brut);
  const modele = typeof o.modele === "string" ? o.modele.trim() : "";
  if (!["string", "number"].includes(typeof o.plafond_reponse) || !["string", "number"].includes(typeof o.budget_jour)) return { erreur: "champs" };
  const plafond = Number(o.plafond_reponse), budget = Number(o.budget_jour);
  if (![undefined, false, true, "on"].includes(o.public_actif as undefined | boolean | string)
    || !/^[a-z0-9][a-z0-9._/-]{1,79}$/.test(modele)
    || !Number.isInteger(plafond) || plafond < 100 || plafond > 4000
    || !Number.isInteger(budget) || budget < 1000 || budget > 5_000_000) return { erreur: "champs" };
  const actif = o.public_actif === true || o.public_actif === "on";
  if (actif && !cleAssistant()) return { erreur: "cle" };
  const r = await modifier("assistant_reglages?id=eq.true&select=id", { public_actif: actif, modele, plafond_reponse: plafond, budget_jour: budget, modifie_le: maintenant(), modifie_par: s.profilId });
  if (r?.length === 1) await journaliser("reglages.assistant", s.profilId, null, { actif, mode: "public" });
  return fin(r?.length === 1);
}

// ---------- maintenance ----------

export async function enregistrerMaintenance(brut: unknown): Promise<RetourReg> {
  const s = await admin();
  if ("erreur" in s) return s;
  const lu = lireMaintenance(brut);
  if (!lu.ok) return { erreur: lu.champs.includes("message_FR") ? "message" : "champs", champs: lu.champs };
  const r = await modifier("reglages_maintenance?id=eq.true&select=id", { actif: lu.v.actif, message: lu.v.message, modifie_le: maintenant(), modifie_par: s.profilId });
  if (r?.length) {
    await journaliser("reglages.maintenance", s.profilId, null, { actif: lu.v.actif });
    updateTag(TAG_MAINTENANCE); // le layout du site public relit l'état (maintenance-cache.ts)
  }
  return fin(Boolean(r?.length));
}

// ---------- mode économie ----------

export async function enregistrerModeEco(brut: unknown): Promise<RetourReg> {
  const s = await admin();
  if ("erreur" in s) return s;
  const lu = lireModeEco(brut);
  if (!lu.ok) return { erreur: "champs", champs: lu.champs };
  const r = await modifier("reglages_site?id=eq.true&select=id", { mode_eco: lu.v.mode, plafond_vues_mois: lu.v.plafond, modifie_le: maintenant(), modifie_par: s.profilId });
  if (r?.length) await journaliser("reglages.eco", s.profilId, null, { mode: lu.v.mode, nombre: lu.v.plafond ?? undefined });
  return fin(Boolean(r?.length));
}

// ---------- profil du compte connecté ----------

export async function enregistrerProfil(brut: unknown): Promise<RetourReg> {
  const s = await exigerRole("agents");
  if (!s) return { erreur: "refuse" };
  const lu = lireProfil(brut);
  if (!lu.ok) return { erreur: "champs", champs: lu.champs };
  const r = await modifier(`equipe_profils?id=eq.${s.profilId}&select=id`, { ...lu.v, modifie_le: maintenant() });
  if (r?.length) await journaliser("profil.modification", s.profilId, null, { role: s.role });
  return fin(Boolean(r?.length));
}

/** Ferme les autres sessions du compte (celle de cet appareil reste ouverte) ; nombre fermé, ou null si la base ne répond pas. */
async function fermerAutres(s: Session) {
  const r = await modifier(`equipe_sessions?profil_id=eq.${s.profilId}&id=neq.${s.id}&revoque_le=is.null&select=id`, { revoque_le: maintenant() });
  return r ? r.length : null;
}

/** Nouveau mot de passe : l'actuel est vérifié par Supabase Auth (essai compté avec ceux de la connexion : 5 échecs en
 * 15 min verrouillent), puis les autres sessions du compte sont fermées. Aucun mot de passe n'est renvoyé ni journalisé. */
export async function changerMotDePasseProfil(brut: unknown): Promise<RetourReg> {
  const s = await exigerRole("agents");
  if (!s) return { erreur: "refuse" };
  const p = await lireCompte({ id: s.profilId });
  if (!p) return { erreur: "panne" };
  const lu = lireMotDePasse(brut, p.email);
  if (!lu.ok) return { erreur: "champs", champs: lu.champs };
  if (!selConfigure()) return { erreur: "panne" };
  const ipH = empreinteIp(new Request("http://espace.local/", { headers: await headers() }));
  const essai = await noterEssai("connexion", empreinteEmail(p.email), ipH);
  if (!essai) return { erreur: "panne" };
  if (essai.etat !== "libre") {
    await journaliser("profil.refus", s.profilId, ipH, { motif: "verrou" });
    return { erreur: "verrou" };
  }
  if ((await verifierMotDePasse(p.email, lu.v.ancien)) !== s.profilId) {
    await journaliser("profil.refus", s.profilId, ipH, { motif: "ancien" });
    return { erreur: "ancien", champs: ["ancien"] };
  }
  await essaiReussi(essai.id);
  if (!(await changerMotDePasse(s.profilId, lu.v.nouveau))) return { erreur: "panne" };
  const n = await fermerAutres(s);
  await journaliser("mot_de_passe.change", s.profilId, ipH, { role: s.role, nombre: n ?? 0 });
  refresh();
  return { ok: true, n: n ?? 0 };
}

/** Ferme une autre session du compte connecté (jamais celle d'un autre compte : le filtre profil_id est posé ici). */
export async function fermerSessionProfil(id: unknown): Promise<RetourReg> {
  const s = await exigerRole("agents");
  if (!s) return { erreur: "refuse" };
  if (typeof id !== "string" || !UUID.test(id)) return { erreur: "champs" };
  if (id === s.id) return { erreur: "courant" };
  const r = await modifier(`equipe_sessions?id=eq.${id}&profil_id=eq.${s.profilId}&revoque_le=is.null&select=id`, { revoque_le: maintenant() });
  if (!r) return { erreur: "panne" };
  if (!r.length) return { erreur: "introuvable" };
  await journaliser("profil.session", s.profilId, null, { nombre: 1 });
  refresh();
  return { ok: true, n: 1 };
}

export async function fermerAutresSessions(): Promise<RetourReg> {
  const s = await exigerRole("agents");
  if (!s) return { erreur: "refuse" };
  const n = await fermerAutres(s);
  if (n === null) return { erreur: "panne" };
  if (n) await journaliser("profil.session", s.profilId, null, { nombre: n });
  refresh();
  return { ok: true, n };
}
