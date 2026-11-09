import "server-only";
import { securite as S } from "@/content/espace-securite";
import { base } from "../../base";
import type { Droit } from "../partage";
import { empreinteEmail, type RoleCompte, selConfigure } from "../outils";
import { exigerRole } from "../session";
import { droitsEffectifs } from "./droits";
import { empreinteRequete } from "./ip";
import { type Filtres, requeteJournal, TABLES } from "./regles";

// Lectures des écrans du lot « securite » (admin seulement) : journal, sessions ouvertes, essais refusés, blocages,
// sauvegardes, registre, demandes des personnes, incidents, consentements, droits des membres. Couche d'accès : chaque
// fonction relit la session et exige le rôle admin. Aucun « use cache » : tout est lu à la requête. Ne sort que ce que
// l'écran affiche, jamais une empreinte entière d'e-mail, un jeton ni un code ; null si refusé ou si la base ne répond pas.

const maintenant = () => new Date().toISOString();
export const PAGE = 1000;

async function lire<T>(chemin: string): Promise<T[] | null> {
  try {
    const r = await base(chemin);
    return r.ok ? ((await r.json()) as T[]) : null;
  } catch {
    return null;
  }
}
/** Lignes et total (en-tête content-range) d'une lecture. */
async function lireCompte<T>(chemin: string, range = "0-199"): Promise<{ lignes: T[]; total: number } | null> {
  try {
    const r = await base(chemin, { prefer: "count=exact", range });
    if (!r.ok) return null;
    const total = Number(r.headers.get("content-range")?.split("/")[1]);
    const lignes = (await r.json()) as T[];
    return { lignes, total: Number.isFinite(total) ? total : lignes.length };
  } catch {
    return null;
  }
}
/** Toutes les lignes d'une lecture ordonnée, par pages de 1 000, `max` au plus. */
export async function lireTout<T>(chemin: string, max: number): Promise<T[] | null> {
  const tout: T[] = [];
  for (let de = 0; de < max; de += PAGE) {
    const r = await lireCompte<T>(chemin, `${de}-${Math.min(de + PAGE, max) - 1}`);
    if (!r) return null;
    tout.push(...r.lignes);
    if (r.lignes.length < PAGE || tout.length >= r.total) break;
  }
  return tout;
}
const admin = () => exigerRole("admins");

// ---------- membres (noms du journal, droits, comptes visés) ----------
export type Membre = { id: string; prenom: string; nom: string; email: string; role: RoleCompte; etat: string; droits: Record<Droit, boolean> };
export async function lireMembres(): Promise<Membre[] | null> {
  if (!(await admin())) return null;
  const l = await lire<Omit<Membre, "droits"> & { droits: unknown }>("equipe_profils?select=id,prenom,nom,email,role,etat,droits&order=prenom.asc&limit=500");
  return l ? l.map((m) => ({ ...m, droits: droitsEffectifs(m.droits) })) : null;
}

// ---------- journal ----------
export type LigneJournal = { id: number; quand: string; profil: string | null; action: string; ip: string | null; details: Record<string, unknown> };
export async function lireJournal(f: Filtres, limite = 200): Promise<{ lignes: LigneJournal[]; total: number } | null> {
  if (!(await admin())) return null;
  const q = requeteJournal(f, S.journal.familles);
  const lignes: LigneJournal[] = [];
  let total = 0;
  // par pages de 1 000 : la base n'en rend jamais plus par requête (« max rows » de l'API Supabase)
  for (let de = 0; de < limite; de += PAGE) {
    const r = await lireCompte<{ id: number; cree_le: string; profil_id: string | null; action: string; ip_hash: string | null; details: Record<string, unknown> }>(
      `equipe_journal?select=id,cree_le,profil_id,action,ip_hash,details${q ? `&${q}` : ""}&order=id.desc`,
      `${de}-${Math.min(de + PAGE, limite) - 1}`,
    );
    if (!r) return null;
    total = r.total;
    lignes.push(...r.lignes.map((x) => ({ id: x.id, quand: x.cree_le, profil: x.profil_id, action: x.action, ip: x.ip_hash, details: x.details ?? {} })));
    if (r.lignes.length < PAGE || lignes.length >= total) break;
  }
  return { lignes, total };
}

// ---------- sessions ouvertes ----------
export type SessionOuverte = { id: string; profil: string; ouverte: string; vue: string; expire: string; ip: string; moi: boolean };
export async function lireSessions(): Promise<SessionOuverte[] | null> {
  const s = await admin();
  if (!s) return null;
  const t = encodeURIComponent(maintenant());
  const l = await lire<{ id: string; profil_id: string; cree_le: string; vu_le: string; expire_le: string; ip_hash: string }>(`equipe_sessions?select=id,profil_id,cree_le,vu_le,expire_le,ip_hash&revoque_le=is.null&expire_le=gt.${t}&fin_max=gt.${t}&order=vu_le.desc&limit=500`);
  return l ? l.map((x) => ({ id: x.id, profil: x.profil_id, ouverte: x.cree_le, vue: x.vu_le, expire: x.expire_le, ip: x.ip_hash, moi: x.id === s.id })) : null;
}

// ---------- essais refusés des dernières 24 h, par adresse ----------
export type EssaisIp = { ip: string; echecs: number; types: string[]; comptes: string[]; inconnus: number; dernier: string };
export async function lireEssais(): Promise<EssaisIp[] | null> {
  if (!(await admin())) return null;
  const depuis = encodeURIComponent(new Date(Date.now() - 86_400_000).toISOString());
  const [l, membres] = await Promise.all([
    lireTout<{ type: string; email_hash: string; ip_hash: string; cree_le: string }>(`equipe_essais?select=type,email_hash,ip_hash,cree_le&reussi=is.false&cree_le=gte.${depuis}&order=id.desc`, 20_000),
    lireMembres(),
  ]);
  if (!l || !membres) return null;
  // comptes visés : l'empreinte de l'adresse comparée à celle de chaque membre (EQUIPE_SEL) ; jamais d'adresse en clair
  const parEmpreinte = new Map(selConfigure() ? membres.map((m) => [empreinteEmail(m.email), m.id]) : []);
  const ips = new Map<string, { echecs: number; types: Set<string>; comptes: Set<string>; inconnus: Set<string>; dernier: string }>();
  for (const e of l) {
    const x = ips.get(e.ip_hash) ?? { echecs: 0, types: new Set<string>(), comptes: new Set<string>(), inconnus: new Set<string>(), dernier: e.cree_le };
    x.echecs++;
    x.types.add(e.type);
    const id = parEmpreinte.get(e.email_hash);
    if (id) x.comptes.add(id);
    else x.inconnus.add(e.email_hash);
    if (e.cree_le > x.dernier) x.dernier = e.cree_le;
    ips.set(e.ip_hash, x);
  }
  return [...ips].map(([ip, x]) => ({ ip, echecs: x.echecs, types: [...x.types], comptes: [...x.comptes], inconnus: x.inconnus.size, dernier: x.dernier })).sort((a, b) => b.echecs - a.echecs || b.dernier.localeCompare(a.dernier));
}

// ---------- blocages actifs ----------
export type Blocage = { id: string; cree: string; ip: string; motif: string; expire: string | null; par: string | null };
export async function lireBlocages(): Promise<{ blocages: Blocage[]; moi: string } | null> {
  if (!(await admin())) return null;
  const l = await lire<{ id: string; cree_le: string; ip_hash: string; motif: string; expire_le: string | null; par: string | null }>(`ip_bloquees?select=id,cree_le,ip_hash,motif,expire_le,par&leve_le=is.null&or=(expire_le.is.null,expire_le.gt.${encodeURIComponent(maintenant())})&order=cree_le.desc&limit=500`);
  return l ? { blocages: l.map((b) => ({ id: b.id, cree: b.cree_le, ip: b.ip_hash, motif: b.motif, expire: b.expire_le, par: b.par })), moi: await empreinteRequete() } : null;
}

// ---------- sauvegardes : lignes par table, dernier export ----------
export type TableSauvegarde = { table: string; lignes: number | null; dernier: { quand: string; par: string | null; format: string } | null };
export async function lireSauvegardes(): Promise<TableSauvegarde[] | null> {
  if (!(await admin())) return null;
  const tables = Object.keys(TABLES);
  const [comptes, exports] = await Promise.all([
    // une seule petite colonne par table (la première de son ordre) : le total vient de l'en-tête content-range
    Promise.all(tables.map((t) => lireCompte<unknown>(`${t}?select=${TABLES[t].split(",")[0]}`, "0-0"))),
    lire<{ cree_le: string; profil_id: string | null; details: { type?: string; mode?: string } }>("equipe_journal?select=cree_le,profil_id,details&action=eq.sauvegarde.export&order=id.desc&limit=1000"),
  ]);
  if (!exports) return null;
  const dernier = new Map<string, TableSauvegarde["dernier"]>();
  for (const e of exports) if (e.details.type && !dernier.has(e.details.type)) dernier.set(e.details.type, { quand: e.cree_le, par: e.profil_id, format: e.details.mode ?? "" });
  return tables.map((t, i) => ({ table: t, lignes: comptes[i]?.total ?? null, dernier: dernier.get(t) ?? null }));
}

// ---------- registre des traitements ----------
export type LigneRegistre = { id: string; nom: string; finalite: string; base_legale: string; personnes: string; donnees: string; destinataires: string; transferts: string | null; duree: string; mesures: string | null; modifie_le: string };
export async function lireRegistre(): Promise<LigneRegistre[] | null> {
  if (!(await admin())) return null;
  return lire<LigneRegistre>("registre_traitements?select=id,nom,finalite,base_legale,personnes,donnees,destinataires,transferts,duree,mesures,modifie_le&order=nom.asc&limit=200");
}

// ---------- demandes des personnes traitées ----------
export type DemandeDonnees = { id: string; cree: string; recue: string; type: "acces" | "effacement"; resultat: { efface?: number; garde?: number; exporte?: number }; par: string | null };
export async function lireDemandesDonnees(): Promise<DemandeDonnees[] | null> {
  if (!(await admin())) return null;
  const l = await lire<{ id: string; cree_le: string; recue_le: string; type: "acces" | "effacement"; resultat: DemandeDonnees["resultat"]; par: string | null }>("donnees_demandes?select=id,cree_le,recue_le,type,resultat,par&order=cree_le.desc&limit=100");
  return l ? l.map((d) => ({ id: d.id, cree: d.cree_le, recue: d.recue_le, type: d.type, resultat: d.resultat ?? {}, par: d.par })) : null;
}

// ---------- incidents ----------
export type LigneIncident = { id: string; decouvert: string; nature: string; donnees: string; personnes: string | null; mesures: string | null; apdp: string | null; informees: string | null; clos: string | null; par: string | null };
export async function lireIncidents(): Promise<LigneIncident[] | null> {
  if (!(await admin())) return null;
  const l = await lire<{ id: string; decouvert_le: string; nature: string; donnees: string; personnes: string | null; mesures: string | null; apdp_le: string | null; informees_le: string | null; clos_le: string | null; par: string | null }>(
    "donnees_incidents?select=id,decouvert_le,nature,donnees,personnes,mesures,apdp_le,informees_le,clos_le,par&order=decouvert_le.desc&limit=100",
  );
  return l ? l.map((i) => ({ id: i.id, decouvert: i.decouvert_le, nature: i.nature, donnees: i.donnees, personnes: i.personnes, mesures: i.mesures, apdp: i.apdp_le, informees: i.informees_le, clos: i.clos_le, par: i.par })) : null;
}

// ---------- consentements enregistrés par le serveur ----------
export type Consentement = { cle: string; n: number; dernier: string | null };
export async function lireConsentements(): Promise<Consentement[] | null> {
  if (!(await admin())) return null;
  const sources: [string, string, string][] = [
    ["demandes", "demandes?select=consentement_le&statut=eq.envoyee&consentement_le=not.is.null&order=consentement_le.desc", "consentement_le"],
    ["reservations", "reservations?select=consentement_le&consentement_le=not.is.null&order=consentement_le.desc", "consentement_le"],
    ["lettre", "abonnes_lettre?select=consentement_le&desinscrit_le=is.null&order=consentement_le.desc", "consentement_le"],
    ["desinscrits", "abonnes_lettre?select=desinscrit_le&desinscrit_le=not.is.null&order=desinscrit_le.desc", "desinscrit_le"],
  ];
  const r = await Promise.all(sources.map(([, chemin]) => lireCompte<Record<string, string | null>>(chemin, "0-0")));
  if (r.some((x) => !x)) return null;
  return sources.map(([cle, , col], i) => ({ cle, n: r[i]!.total, dernier: r[i]!.lignes[0]?.[col] ?? null }));
}
