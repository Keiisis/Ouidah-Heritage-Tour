"use server";

import { refresh } from "next/cache";
import { securite as S } from "@/content/espace-securite";
import { base } from "../../base";
import { effacer } from "../dossiers";
import { journaliser } from "../journal";
import { hmac, iso, selConfigure } from "../outils";
import { exigerRole, lireSession, type Session } from "../session";
import { empreinteDe, empreinteRequete } from "./ip";
import { type Apercu, apercu, chercher, effacerTout, exporter } from "./personne";
import { DUREES, lireBlocage, lireDroits, lireIncident, lirePersonne, lireTraitement, SUIVIS, UUID } from "./regles";

// Écritures du lot « securite » (vague 2) : blocages d'adresses, révocation de sessions, droits des agents, registre des
// traitements, incidents, demandes d'accès et d'effacement d'une personne. Actions serveur (contrôle d'origine de Next)
// joignables par une requête forgée : CHAQUE appel relit la session et exige le rôle admin (un agent est refusé et le
// refus va au journal), relit ses entrées avec les règles partagées (regles.ts) et ne renvoie que ce que l'écran affiche.
// Chaque écriture va au journal : jamais une adresse IP, une adresse e-mail ni un texte saisi. refresh() renvoie l'écran
// à jour dans la même réponse (doc Next 16 « Server Actions » › Choosing a cache update).

export type RefusSec = "refuse" | "champs" | "panne" | "soi" | "deja" | "etat" | "introuvable" | "confirmation" | "sel" | "incomplet";
export type RetourSec = { ok: true; nombre?: number; apercu?: Apercu; fichier?: string; nom?: string; efface?: number; garde?: number; complet?: boolean } | { erreur: RefusSec; champs?: string[] };

const maintenant = () => new Date().toISOString();

/** Session admin ; un agent connecté qui appelle quand même est refusé et inscrit au journal. */
async function admin(): Promise<Session | null> {
  const s = await exigerRole("admins");
  if (s) return s;
  const a = await lireSession();
  if (a) await journaliser("securite.refus", a.profilId, null, { motif: "role" });
  return null;
}

async function ecrire<R>(chemin: string, method: "POST" | "PATCH", corps: unknown): Promise<R[] | null> {
  try {
    const r = await base(chemin, { method, corps, prefer: "return=representation" });
    return r.ok ? ((await r.json()) as R[]) : null;
  } catch {
    return null;
  }
}

// ---------- adresses IP bloquées ----------

/** Bloque une empreinte relevée à l'écran, ou une adresse saisie (transformée en empreinte, jamais enregistrée). Jamais
 * l'adresse de l'admin qui agit : il s'enfermerait dehors. */
export async function bloquerIp(brut: unknown): Promise<RetourSec> {
  const s = await admin();
  if (!s) return { erreur: "refuse" };
  const lu = lireBlocage(brut);
  if (!lu.ok) return { erreur: "champs", champs: lu.champs };
  if (lu.v.ip && !process.env.EMPREINTE_SEL) return { erreur: "sel" }; // sans sel, l'empreinte d'une IPv4 se retrouve
  const ipH = lu.v.empreinte ?? empreinteDe(lu.v.ip ?? "");
  if (ipH === (await empreinteRequete())) return { erreur: "soi" };
  try {
    const deja = await base(`ip_bloquees?select=id&ip_hash=eq.${ipH}&leve_le=is.null&or=(expire_le.is.null,expire_le.gt.${encodeURIComponent(maintenant())})&limit=1`);
    if (!deja.ok) return { erreur: "panne" };
    if (((await deja.json()) as unknown[]).length) return { erreur: "deja" };
  } catch {
    return { erreur: "panne" };
  }
  const duree = DUREES[lu.v.duree];
  const r = await ecrire<{ id: string }>("ip_bloquees?select=id", "POST", { ip_hash: ipH, motif: lu.v.motif, expire_le: duree === null ? null : iso(Date.now() + duree), par: s.profilId });
  if (!r?.[0]) return { erreur: "panne" };
  await journaliser("ip.blocage", s.profilId, null, { cible: r[0].id, type: lu.v.duree });
  refresh();
  return { ok: true };
}

export async function leverBlocage(id: unknown): Promise<RetourSec> {
  const s = await admin();
  if (!s) return { erreur: "refuse" };
  if (typeof id !== "string" || !UUID.test(id)) return { erreur: "champs" };
  const r = await ecrire<{ id: string }>(`ip_bloquees?id=eq.${id}&leve_le=is.null&select=id`, "PATCH", { leve_le: maintenant(), leve_par: s.profilId });
  if (!r) return { erreur: "panne" };
  if (!r.length) return { erreur: "etat" };
  await journaliser("ip.deblocage", s.profilId, null, { cible: id });
  refresh();
  return { ok: true };
}

// ---------- sessions ----------

/** Révoque une session ouverte (un appareil). Pas celle de l'admin qui agit : « Se déconnecter » est fait pour cela. */
export async function revoquerSession(id: unknown): Promise<RetourSec> {
  const s = await admin();
  if (!s) return { erreur: "refuse" };
  if (typeof id !== "string" || !UUID.test(id)) return { erreur: "champs" };
  if (id === s.id) return { erreur: "soi" };
  const r = await ecrire<{ profil_id: string }>(`equipe_sessions?id=eq.${id}&revoque_le=is.null&select=profil_id`, "PATCH", { revoque_le: maintenant() });
  if (!r) return { erreur: "panne" };
  if (!r.length) return { erreur: "etat" };
  await journaliser("session.revocation", s.profilId, null, { cible: r[0].profil_id });
  refresh();
  return { ok: true };
}

/** Révoque toutes les sessions d'un membre ; pour soi-même, toutes sauf celle-ci. */
export async function revoquerSessionsDe(profilId: unknown): Promise<RetourSec> {
  const s = await admin();
  if (!s) return { erreur: "refuse" };
  if (typeof profilId !== "string" || !UUID.test(profilId)) return { erreur: "champs" };
  const sauf = profilId === s.profilId ? `&id=neq.${s.id}` : "";
  const r = await ecrire<{ id: string }>(`equipe_sessions?profil_id=eq.${profilId}&revoque_le=is.null${sauf}&select=id`, "PATCH", { revoque_le: maintenant() });
  if (!r) return { erreur: "panne" };
  await journaliser("sessions.revocation", s.profilId, null, { cible: profilId, nombre: r.length });
  refresh();
  return { ok: true, nombre: r.length };
}

// ---------- droits d'un agent ----------

/** Les 5 droits d'un agent, enregistrés tous (vrai ou faux). Un admin a tous les droits : son profil n'est pas touché. */
export async function changerDroits(id: unknown, brut: unknown): Promise<RetourSec> {
  const s = await admin();
  if (!s) return { erreur: "refuse" };
  if (typeof id !== "string" || !UUID.test(id)) return { erreur: "champs" };
  const lu = lireDroits(brut);
  if (!lu.ok) return { erreur: "champs", champs: lu.champs };
  const r = await ecrire<{ id: string }>(`equipe_profils?id=eq.${id}&role=eq.agent&select=id`, "PATCH", { droits: lu.v, modifie_le: maintenant() });
  if (!r) return { erreur: "panne" };
  if (!r.length) return { erreur: "introuvable" }; // inconnu, ou un admin
  const ouverts = Object.entries(lu.v).filter(([, v]) => v).map(([k]) => k);
  await journaliser("droits.modification", s.profilId, null, { cible: id, type: ouverts.join(",") || "aucun" });
  refresh();
  return { ok: true };
}

// ---------- registre des traitements ----------

export async function enregistrerTraitement(id: unknown, brut: unknown): Promise<RetourSec> {
  const s = await admin();
  if (!s) return { erreur: "refuse" };
  if (id !== null && (typeof id !== "string" || !UUID.test(id))) return { erreur: "champs" };
  const lu = lireTraitement(brut);
  if (!lu.ok) return { erreur: "champs", champs: lu.champs };
  const corps = { ...lu.v, modifie_le: maintenant(), modifie_par: s.profilId };
  const r = id ? await ecrire<{ id: string }>(`registre_traitements?id=eq.${id}&select=id`, "PATCH", corps) : await ecrire<{ id: string }>("registre_traitements?select=id", "POST", corps);
  if (!r) return { erreur: "panne" };
  if (!r[0]) return { erreur: "introuvable" };
  await journaliser(id ? "registre.modification" : "registre.ajout", s.profilId, null, { cible: r[0].id });
  refresh();
  return { ok: true };
}

export async function retirerTraitement(id: unknown): Promise<RetourSec> {
  const s = await admin();
  if (!s) return { erreur: "refuse" };
  if (typeof id !== "string" || !UUID.test(id)) return { erreur: "champs" };
  const r = await effacer<{ id: string }>(`registre_traitements?id=eq.${id}&select=id`);
  if (!r) return { erreur: "panne" };
  if (!r.length) return { erreur: "etat" };
  await journaliser("registre.retrait", s.profilId, null, { cible: id });
  refresh();
  return { ok: true };
}

// ---------- incidents ----------

export async function declarerIncident(brut: unknown): Promise<RetourSec> {
  const s = await admin();
  if (!s) return { erreur: "refuse" };
  const lu = lireIncident(brut, Date.now());
  if (!lu.ok) return { erreur: "champs", champs: lu.champs };
  const r = await ecrire<{ id: string }>("donnees_incidents?select=id", "POST", { ...lu.v, par: s.profilId, modifie_par: s.profilId });
  if (!r?.[0]) return { erreur: "panne" };
  await journaliser("incident.declaration", s.profilId, null, { cible: r[0].id });
  refresh();
  return { ok: true };
}

/** Pose la date d'une étape (APDP notifiée, personnes informées, clos) à maintenant, une seule fois. */
export async function marquerIncident(id: unknown, quoi: unknown): Promise<RetourSec> {
  const s = await admin();
  if (!s) return { erreur: "refuse" };
  if (typeof id !== "string" || !UUID.test(id) || typeof quoi !== "string" || !Object.hasOwn(SUIVIS, quoi)) return { erreur: "champs" };
  const col = SUIVIS[quoi as keyof typeof SUIVIS];
  const t = maintenant();
  const r = await ecrire<{ id: string }>(`donnees_incidents?id=eq.${id}&${col}=is.null&select=id`, "PATCH", { [col]: t, modifie_le: t, modifie_par: s.profilId });
  if (!r) return { erreur: "panne" };
  if (!r.length) return { erreur: "deja" };
  await journaliser("incident.suivi", s.profilId, null, { cible: id, etape: quoi });
  refresh();
  return { ok: true };
}

// ---------- demandes d'une personne (accès, effacement) ----------

/** Ce que la base garde de cette adresse, en nombres par catégorie (rien de la personne elle-même). */
export async function chercherPersonne(brut: unknown): Promise<RetourSec> {
  const s = await admin();
  if (!s) return { erreur: "refuse" };
  const lu = lirePersonne(brut, Date.now());
  if (!lu.ok) return { erreur: "champs", champs: lu.champs };
  const t = await chercher(lu.v.email);
  return t ? { ok: true, apercu: apercu(t) } : { erreur: "panne" };
}

/** Historique d'une demande traitée : l'adresse n'y est qu'en HMAC (EQUIPE_SEL), propre à cet usage. */
async function inscrire(s: Session, type: "acces" | "effacement", email: string, recue: string, resultat: Record<string, number | boolean>) {
  return ecrire("donnees_demandes?select=id", "POST", { type, recue_le: recue, email_hmac: hmac(`personne|${email}`), resultat, par: s.profilId });
}

/** Export de toutes ses données (droit d'accès), en JSON, renvoyé à l'écran qui le télécharge. */
export async function exporterPersonne(brut: unknown): Promise<RetourSec> {
  const s = await admin();
  if (!s) return { erreur: "refuse" };
  if (!selConfigure()) return { erreur: "sel" };
  const lu = lirePersonne(brut, Date.now());
  if (!lu.ok) return { erreur: "champs", champs: lu.champs };
  const t = await chercher(lu.v.email);
  if (!t) return { erreur: "panne" };
  const donnees = await exporter(lu.v.email, t);
  if (!donnees) return { erreur: "panne" };
  const nombre = Object.values(donnees).reduce((n, l) => n + l.length, 0);
  if (!(await inscrire(s, "acces", lu.v.email, lu.v.recue, { exporte: nombre }))) return { erreur: "panne" };
  await journaliser("donnees.acces", s.profilId, null, { nombre });
  refresh();
  const fichier = JSON.stringify({ responsable: S.personnes.responsable, personne: lu.v.email, demande_recue_le: lu.v.recue, exporte_le: maintenant(), note: S.personnes.noteExport, donnees }, null, 2);
  return { ok: true, nombre, fichier, nom: `oht-donnees-${lu.v.recue}.json` };
}

/** Effacement réel de ses données ; les écritures financières figées sont conservées (obligation comptable). L'adresse
 * doit être saisie deux fois. */
export async function effacerPersonne(brut: unknown): Promise<RetourSec> {
  const s = await admin();
  if (!s) return { erreur: "refuse" };
  if (!selConfigure()) return { erreur: "sel" };
  const lu = lirePersonne(brut, Date.now());
  if (!lu.ok) return { erreur: "champs", champs: lu.champs };
  if (lu.v.confirmation !== lu.v.email) {
    await journaliser("securite.refus", s.profilId, null, { motif: "confirmation" });
    return { erreur: "confirmation", champs: ["confirmation"] };
  }
  const t = await chercher(lu.v.email);
  if (!t) return { erreur: "panne" };
  const r = await effacerTout(t);
  if (!r) return { erreur: "panne" };
  if (r.complet) {
    // Même traitement depuis Sécurité et la file publique : l'échec du complément interdit un faux succès.
    const nouveaux = await base("rpc/anonymiser_services", { method: "POST", corps: { p_email: lu.v.email } }).catch(() => null);
    r.complet = nouveaux?.ok === true;
    if (r.complet) r.efface += t.rendez_vous.length + t.candidatures.length + t.courriels_recus.length;
  }
  if (!(await inscrire(s, "effacement", lu.v.email, lu.v.recue, { efface: r.efface, garde: r.garde, complet: r.complet }))) return { erreur: "panne" };
  await journaliser("donnees.effacement", s.profilId, null, { nombre: r.efface });
  refresh();
  return r.complet ? { ok: true, efface: r.efface, garde: r.garde, complet: true } : { erreur: "incomplet" };
}
