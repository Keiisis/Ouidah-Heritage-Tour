import "server-only";
import { type CategorieWiki, type EtatWiki, MOIS_STATS, type Priorite, PRIORITES, type TypeDocument } from "@/content/espace-pilotage";
import { iso, jourOuidah, minuitOuidah } from "@/lib/jours";
import { compter } from "../../base";
import { lire, lireToutes } from "../finances/lectures";
import { bornesMois, decaler, enXof, moisCourant } from "../finances/regles";
import type { Etape } from "../dossiers-regles";
import type { Session } from "../session";
import { samediEcoule, type Mime, UUID } from "./regles";

// Lectures du lot « pilotage », par le serveur seulement avec la clé secrète. La clé contourne RLS : le cloisonnement tient
// ICI. Un agent ne lit que ses dossiers (agent_id posé dans la requête) et ses propres chiffres ; un admin lit tout.
// Aucun « use cache » : tout est lu à la requête, après la session. Une lecture qui échoue rend null (« données
// indisponibles »), jamais un chiffre inventé. Les écrans admin (statistiques, direct, rapport, perfs par agent) vérifient
// le rôle avant d'appeler.

const JOUR = 86_400_000;
const voitTout = (s: Session) => s.role === "admin";
const filtreAgent = (s: Session) => (voitTout(s) ? "" : `&agent_id=eq.${s.profilId}`);
const enc = encodeURIComponent;
/** Relation un-à-un de PostgREST : objet, tableau d'un élément ou null ; toujours ramenée à objet ou null. */
const un = <T>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));
const moisOuidah = (instant: string) => iso(jourOuidah(Date.parse(instant))).slice(0, 7);

// ---------- encaissements (même définition que calculerMois de finances/lectures.ts) ----------
// Passerelles (réservations payées, montant reçu sinon montant), liens de paiement payés, paiements manuels confirmés
// (en FCFA au taux fixe ; une écriture inverse est négative). `agent` : l'agent du dossier, quand il y en a un.

export type Encaissement = { mois: string; montant: number; agent: string | null };
type Agent = { agent_id: string | null } | null;

export async function encaissements(debut: string, fin: string): Promise<Encaissement[] | null> {
  const jd = iso(jourOuidah(Date.parse(debut))), jf = iso(jourOuidah(Date.parse(fin)));
  const [resas, liens, manuels] = await Promise.all([
    lireToutes<{ montant: number; montant_recu: number | null; paye_le: string }>(`reservations?select=montant,montant_recu,paye_le&statut=eq.paye&reglement_manuel=is.false&paye_le=gte.${enc(debut)}&paye_le=lt.${enc(fin)}`),
    lireToutes<{ montant: number; paye_le: string; demande: Agent | Agent[] }>(`liens_paiement?select=montant,paye_le,demande:demandes(agent_id)&paye_le=gte.${enc(debut)}&paye_le=lt.${enc(fin)}`),
    lireToutes<{ montant: number; devise: string; recu_le: string; devis: { demande: Agent | Agent[] } | null; facture: { demande: Agent | Agent[] } | null }>(
      `paiements_manuels?select=montant,devise,recu_le,devis:devis!paiements_manuels_devis_id_fkey(demande:demandes(agent_id)),facture:factures!paiements_manuels_facture_id_fkey(demande:demandes(agent_id))&etat=eq.confirme&recu_le=gte.${jd}&recu_le=lt.${jf}&limit=10000`,
    ),
  ]);
  if (!resas || !liens || !manuels) return null;
  return [
    ...resas.map((r) => ({ mois: moisOuidah(r.paye_le), montant: r.montant_recu ?? r.montant, agent: null })),
    ...liens.map((l) => ({ mois: moisOuidah(l.paye_le), montant: l.montant, agent: un(l.demande)?.agent_id ?? null })),
    ...manuels.map((p) => ({ mois: p.recu_le.slice(0, 7), montant: enXof(p.montant, p.devise), agent: un(p.devis?.demande)?.agent_id ?? un(p.facture?.demande)?.agent_id ?? null })),
  ];
}
const somme = (l: Encaissement[]) => l.reduce((t, e) => t + e.montant, 0);

// ---------- statistiques (admin) ----------

export type MoisStats = { mois: string; demandes: number; devis: number; encaisse: number; billets: number };
export type Statistiques = { mois: MoisStats[]; conversion: { recues: number; payees: number }; pays: [string | null, number][]; langues: [string, number][] };
const PAYEES: readonly Etape[] = ["payee", "en_voyage", "terminee"];
const compte = <K>(l: K[]) => [...l.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<K, number>())].sort((a, b) => b[1] - a[1]);

/** Les MOIS_STATS derniers mois (mois en cours compris), à l'heure de la requête `ms`. */
export async function statistiques(ms: number): Promise<Statistiques | null> {
  const courant = moisCourant(ms);
  const liste = Array.from({ length: MOIS_STATS }, (_, i) => decaler(courant, i - (MOIS_STATS - 1)));
  const debut = bornesMois(liste[0]).debut, fin = bornesMois(courant).fin;
  const [demandes, devis, billets, argent] = await Promise.all([
    lireToutes<{ cree_le: string; pays: string | null; langue: string; etape: Etape; devis: { statut: string }[] }>(`demandes?select=cree_le,pays,langue,etape,devis(statut)&statut=eq.envoyee&cree_le=gte.${enc(debut)}&cree_le=lt.${enc(fin)}`),
    lireToutes<{ publie_le: string }>(`devis?select=publie_le&statut=neq.brouillon&publie_le=gte.${enc(debut)}&publie_le=lt.${enc(fin)}`),
    lireToutes<{ quantite: number; paye_le: string }>(`reservations?select=quantite,paye_le&statut=eq.paye&paye_le=gte.${enc(debut)}&paye_le=lt.${enc(fin)}`),
    encaissements(debut, fin),
  ]);
  if (!demandes || !devis || !billets || !argent) return null;
  return {
    mois: liste.map((m) => ({
      mois: m,
      demandes: demandes.filter((d) => moisOuidah(d.cree_le) === m).length,
      devis: devis.filter((d) => moisOuidah(d.publie_le) === m).length,
      encaisse: somme(argent.filter((e) => e.mois === m)),
      billets: billets.filter((b) => moisOuidah(b.paye_le) === m).reduce((t, b) => t + b.quantite, 0),
    })),
    conversion: { recues: demandes.length, payees: demandes.filter((d) => PAYEES.includes(d.etape) || d.devis.some((v) => v.statut === "paye")).length },
    pays: compte(demandes.map((d) => d.pays || null)),
    langues: compte(demandes.map((d) => d.langue)),
  };
}

// ---------- en direct (admin) ----------

export type LigneJournal = { id: number; quand: string; action: string; qui: string | null };
export type Connecte = { id: string; nom: string; role: "agent" | "admin"; vu: string; appareils: number };
export type Direct = { journal: LigneJournal[]; connectes: Connecte[] };

export async function direct(ms: number): Promise<Direct | null> {
  const maintenant = enc(new Date(ms).toISOString());
  const [journal, sessions] = await Promise.all([
    lire<{ id: number; cree_le: string; action: string; profil: { prenom: string; nom: string } | null }>("equipe_journal?select=id,cree_le,action,profil:equipe_profils(prenom,nom)&order=id.desc&limit=30"),
    lire<{ profil_id: string; vu_le: string; profil: { prenom: string; nom: string; role: "agent" | "admin" } }>(`equipe_sessions?select=profil_id,vu_le,profil:equipe_profils!inner(prenom,nom,role,etat)&revoque_le=is.null&expire_le=gt.${maintenant}&fin_max=gt.${maintenant}&profil.etat=eq.actif&order=vu_le.desc&limit=500`),
  ]);
  if (!journal || !sessions) return null;
  const parMembre = new Map<string, Connecte>();
  for (const x of sessions) {
    const c = parMembre.get(x.profil_id);
    if (c) c.appareils++;
    else parMembre.set(x.profil_id, { id: x.profil_id, nom: `${x.profil.prenom} ${x.profil.nom}`, role: x.profil.role, vu: x.vu_le, appareils: 1 });
  }
  return {
    journal: journal.map((j) => ({ id: j.id, quand: j.cree_le, action: j.action, qui: j.profil ? `${j.profil.prenom} ${j.profil.nom}` : null })),
    connectes: [...parMembre.values()],
  };
}

// ---------- rapport hebdomadaire (admin) ----------

export type Rapport = {
  debut: string; // AAAA-MM-JJ, samedi
  fin: string; // vendredi
  demandes: number;
  devis: number;
  paiements: number;
  encaisse: number;
  billets: number;
  aConfirmer: number;
  nonAttribuees: number;
  dernierEnvoi: { quand: string; nombre: number } | null;
};

/** Rapport de la période écoulée (samedi → vendredi à Ouidah) pour l'heure `ms`. */
export async function rapport(ms: number): Promise<Rapport | null> {
  const samedi = samediEcoule(ms);
  const debut = new Date(minuitOuidah(samedi)).toISOString(), fin = new Date(minuitOuidah(samedi + 7)).toISOString();
  const [demandes, devis, argent, billets, aConfirmer, nonAttribuees, envoi] = await Promise.all([
    compter("demandes", `statut=eq.envoyee&cree_le=gte.${enc(debut)}&cree_le=lt.${enc(fin)}`),
    compter("devis", `statut=neq.brouillon&publie_le=gte.${enc(debut)}&publie_le=lt.${enc(fin)}`),
    encaissements(debut, fin),
    lireToutes<{ quantite: number }>(`reservations?select=quantite&statut=eq.paye&paye_le=gte.${enc(debut)}&paye_le=lt.${enc(fin)}`),
    compter("paiements_manuels", "etat=eq.a_confirmer"),
    compter("demandes", "statut=eq.envoyee&etape=eq.nouvelle&agent_id=is.null"),
    lire<{ cree_le: string; details: { nombre?: number } }>(`equipe_journal?select=cree_le,details&action=eq.rapport.envoi&details->>semaine=eq.${iso(samedi)}&order=id.desc&limit=1`),
  ]);
  if (demandes === null || devis === null || !argent || !billets || aConfirmer === null || nonAttribuees === null || !envoi) return null;
  return {
    debut: iso(samedi),
    fin: iso(samedi + 6),
    demandes,
    devis,
    paiements: argent.length,
    encaisse: somme(argent),
    billets: billets.reduce((t, b) => t + b.quantite, 0),
    aConfirmer,
    nonAttribuees,
    dernierEnvoi: envoi[0] ? { quand: envoi[0].cree_le, nombre: envoi[0].details.nombre ?? 0 } : null,
  };
}

/** Adresses des admins actifs (destinataires du rapport). */
export async function adressesAdmins(): Promise<string[] | null> {
  const l = await lire<{ email: string }>("equipe_profils?select=email&role=eq.admin&etat=eq.actif&limit=100");
  return l ? l.map((x) => x.email).filter(Boolean) : null;
}

// ---------- performances (admin : chaque agent ; agent : les siennes) ----------

export type Perf = { id: string; nom: string; attribues: number; traites: number; delaiMoyen: number | null; reponses: number; devis: number; encaisse: number };

/** Chiffres des `jours` derniers jours : de tous les agents actifs (admin, `moi` null) ou d'un seul membre (`moi`). */
export async function performances(jours: number, ms: number, moi: Session | null): Promise<Perf[] | null> {
  const membres = moi ? [{ id: moi.profilId, prenom: moi.prenom, nom: moi.nom }] : await lire<{ id: string; prenom: string; nom: string }>("equipe_profils?select=id,prenom,nom&role=eq.agent&etat=eq.actif&order=prenom.asc,nom.asc&limit=500");
  if (!membres) return null;
  if (!membres.length) return [];
  const ids = membres.map((m) => m.id).filter((i) => UUID.test(i));
  const debut = new Date(ms - jours * JOUR).toISOString(), fin = new Date(ms + 60_000).toISOString();
  const qui = `in.(${ids.join(",")})`;
  const [demandes, devis, argent] = await Promise.all([
    lireToutes<{ id: string; cree_le: string; email: string | null; etape: Etape; agent_id: string; devis: { publie_le: string | null }[] }>(`demandes?select=id,cree_le,email,etape,agent_id,devis(publie_le)&statut=eq.envoyee&agent_id=${qui}&attribuee_le=gte.${enc(debut)}`),
    lireToutes<{ demande: { agent_id: string } }>(`devis?select=demande:demandes!inner(agent_id)&statut=neq.brouillon&publie_le=gte.${enc(debut)}&demande.agent_id=${qui}`),
    encaissements(debut, fin),
  ]);
  if (!demandes || !devis || !argent) return null;
  const plusAncienne = demandes.reduce((m, d) => (d.cree_le < m ? d.cree_le : m), new Date(ms).toISOString());
  const courriels = demandes.length
    ? await lireToutes<{ auteur_id: string | null; destinataire: string; envoye_le: string }>(`courriels_envoyes?select=auteur_id,destinataire,envoye_le&statut=eq.envoye&auteur_id=${qui}&envoye_le=gte.${enc(plusAncienne)}&order=envoye_le.asc`)
    : [];
  if (!courriels) return null;
  return membres.map((m) => {
    const siennes = demandes.filter((d) => d.agent_id === m.id);
    // première réponse : premier e-mail de l'agent au client, ou premier devis publié, après la réception
    const delais = siennes.flatMap((d) => {
      const recue = Date.parse(d.cree_le);
      const email = d.email?.toLowerCase();
      const temps = [
        ...courriels.filter((c) => c.auteur_id === m.id && email && c.destinataire.toLowerCase() === email).map((c) => Date.parse(c.envoye_le)),
        ...d.devis.map((v) => (v.publie_le ? Date.parse(v.publie_le) : NaN)),
      ].filter((t) => t >= recue);
      return temps.length ? [Math.min(...temps) - recue] : [];
    });
    return {
      id: m.id,
      nom: `${m.prenom} ${m.nom}`,
      attribues: siennes.length,
      traites: siennes.filter((d) => d.etape !== "nouvelle").length,
      delaiMoyen: delais.length ? delais.reduce((t, x) => t + x, 0) / delais.length : null,
      reponses: delais.length,
      devis: devis.filter((v) => v.demande.agent_id === m.id).length,
      encaisse: somme(argent.filter((e) => e.agent === m.id)),
    };
  });
}

// ---------- wiki ----------

export type PageWiki = { id: string; categorie: CategorieWiki; titre: string; corps: string; etat: EtatWiki; auteur: string | null; auteurId: string | null; modifie: string; publie: string | null; motif: string | null };
type BrutPage = { id: string; categorie: CategorieWiki; titre: string; corps: string; etat: EtatWiki; auteur_id: string | null; modifie_le: string; publie_le: string | null; motif_refus: string | null; auteur: { prenom: string; nom: string } | null };

/** Admin : toutes les pages. Agent : les pages publiées et ses propres propositions. */
export async function lireWiki(s: Session): Promise<PageWiki[] | null> {
  const filtre = voitTout(s) ? "" : `&or=(etat.eq.publie,auteur_id.eq.${s.profilId})`;
  const l = await lire<BrutPage>(`wiki_pages?select=id,categorie,titre,corps,etat,auteur_id,modifie_le,publie_le,motif_refus,auteur:equipe_profils!wiki_pages_auteur_id_fkey(prenom,nom)${filtre}&order=titre.asc&limit=1000`);
  return l ? l.map((p) => ({ id: p.id, categorie: p.categorie, titre: p.titre, corps: p.corps, etat: p.etat, auteur: p.auteur ? `${p.auteur.prenom} ${p.auteur.nom}` : null, auteurId: p.auteur_id, modifie: p.modifie_le, publie: p.publie_le, motif: p.motif_refus })) : null;
}

// ---------- pistes (agent ; admin : toutes) ----------

export type Piste = {
  id: string;
  nom: string;
  recue: string;
  motif: "sans_reponse" | "devis_ouvert" | "rappel";
  depuis: number; // jours depuis le dernier contact (sans réponse) ou depuis l'envoi du devis
  dernierContact: string | null; // dernier e-mail envoyé depuis l'espace
  priorite: Priorite;
  rappel: string | null; // AAAA-MM-JJ
  rappelDu: boolean; // rappel échu ou du jour
};
type BrutPiste = { id: string; cree_le: string; nom: string | null; email: string | null; etape: Etape; devis: { statut: string; publie_le: string | null }[]; suivi: { priorite: Priorite; rappel_le: string | null } | { priorite: Priorite; rappel_le: string | null }[] | null };

/** Demandes à relancer : sans réponse depuis `jours` jours (étape « nouvelle »), devis envoyé non payé depuis `jours`
 * jours, ou rappel échu. */
export async function pistes(s: Session, jours: number, ms: number): Promise<Piste[] | null> {
  const l = await lire<BrutPiste>(`demandes?select=id,cree_le,nom,email,etape,devis(statut,publie_le),suivi:pistes_suivi(priorite,rappel_le)&statut=eq.envoyee&etape=in.(nouvelle,devis_envoye)${filtreAgent(s)}&order=cree_le.asc&limit=1000`);
  if (!l) return null;
  const plusAncienne = l[0]?.cree_le;
  const courriels = plusAncienne ? await lire<{ destinataire: string; envoye_le: string }>(`courriels_envoyes?select=destinataire,envoye_le&statut=eq.envoye&envoye_le=gte.${enc(plusAncienne)}&order=envoye_le.desc&limit=10000`) : [];
  if (!courriels) return null;
  const dernier = new Map<string, string>();
  for (const c of courriels) {
    const k = c.destinataire.toLowerCase();
    if (!dernier.has(k)) dernier.set(k, c.envoye_le);
  }
  const aujourdhui = iso(jourOuidah(ms));
  const age = (t: number) => Math.floor((ms - t) / JOUR);
  const rang = (p: Priorite) => PRIORITES.indexOf(p);
  return l
    .flatMap((d): Piste[] => {
      const suivi = un(d.suivi);
      const contact = d.email ? (dernier.get(d.email.toLowerCase()) ?? null) : null;
      const devis = d.devis.filter((v) => v.statut === "pret" && v.publie_le).sort((a, b) => (b.publie_le ?? "").localeCompare(a.publie_le ?? ""))[0];
      const rappel = suivi?.rappel_le ?? null;
      const rappelDu = rappel !== null && rappel <= aujourdhui;
      const base = { id: d.id, nom: d.nom ?? "", recue: d.cree_le, dernierContact: contact, priorite: suivi?.priorite ?? "normale", rappel, rappelDu };
      if (devis) {
        const ref = Math.max(Date.parse(devis.publie_le as string), contact ? Date.parse(contact) : 0);
        if (age(ref) >= jours) return [{ ...base, motif: "devis_ouvert", depuis: age(Date.parse(devis.publie_le as string)) }];
      } else if (d.etape === "nouvelle") {
        const ref = Math.max(Date.parse(d.cree_le), contact ? Date.parse(contact) : 0);
        if (age(ref) >= jours) return [{ ...base, motif: "sans_reponse", depuis: age(ref) }];
      }
      return rappelDu ? [{ ...base, motif: "rappel", depuis: 0 }] : [];
    })
    .sort((a, b) => Number(b.rappelDu) - Number(a.rappelDu) || rang(a.priorite) - rang(b.priorite) || a.recue.localeCompare(b.recue));
}

/** La demande, si elle est ouverte à cette session (agent : la sienne ; admin : toutes) ; « non » sinon, null en panne. */
export async function demandeOuverte(s: Session, id: unknown): Promise<{ id: string; depart: number | null } | "non" | null> {
  if (typeof id !== "string" || !UUID.test(id)) return "non";
  const l = await lire<{ id: string; dossier: { sejour?: { depart?: number } | null } | null }>(`demandes?select=id,dossier&id=eq.${id}&statut=eq.envoyee${filtreAgent(s)}&limit=1`);
  if (!l) return null;
  if (!l[0]) return "non";
  const depart = l[0].dossier?.sejour?.depart;
  return { id: l[0].id, depart: typeof depart === "number" && Number.isInteger(depart) ? depart : null };
}

// ---------- documents des clients ----------

export type DossierDocuments = { id: string; nom: string; reference: string };
export type DocumentClient = { id: string; cree: string; dossier: DossierDocuments; type: TypeDocument; nom: string; mime: Mime; taille: number; conserver: string; depose: string | null; deposeParMoi: boolean };
type BrutDoc = { id: string; cree_le: string; demande_id: string; type: TypeDocument; nom: string; type_mime: Mime; taille: number; conserver_jusqu_au: string; depose_par: string | null; depose: { prenom: string; nom: string } | null; demande: { nom: string | null } };
const reference = (id: string) => `DEM-${id.slice(0, 6).toUpperCase()}`;

/** Dossiers où cette session peut déposer, et documents de ces dossiers (agent : les siens ; admin : tous). */
export async function lireDocuments(s: Session): Promise<{ dossiers: DossierDocuments[]; documents: DocumentClient[] } | null> {
  const agent = voitTout(s) ? "" : `&demande.agent_id=eq.${s.profilId}`;
  const [dossiers, docs] = await Promise.all([
    lire<{ id: string; nom: string | null }>(`demandes?select=id,nom&statut=eq.envoyee${filtreAgent(s)}&order=cree_le.desc&limit=500`),
    lire<BrutDoc>(`equipe_documents?select=id,cree_le,demande_id,type,nom,type_mime,taille,conserver_jusqu_au,depose_par,depose:equipe_profils(prenom,nom),demande:demandes!inner(nom,agent_id)${agent}&order=cree_le.desc&limit=1000`),
  ]);
  if (!dossiers || !docs) return null;
  return {
    dossiers: dossiers.map((d) => ({ id: d.id, nom: d.nom ?? "", reference: reference(d.id) })),
    documents: docs.map((d) => ({
      id: d.id,
      cree: d.cree_le,
      dossier: { id: d.demande_id, nom: d.demande.nom ?? "", reference: reference(d.demande_id) },
      type: d.type,
      nom: d.nom,
      mime: d.type_mime,
      taille: d.taille,
      conserver: d.conserver_jusqu_au,
      depose: d.depose ? `${d.depose.prenom} ${d.depose.nom}` : null,
      deposeParMoi: d.depose_par === s.profilId,
    })),
  };
}

/** Un document si cette session a son dossier (agent : demande attribuée ; admin : tous) ; « non » sinon, null en panne. */
export async function documentAccessible(s: Session, id: unknown): Promise<{ id: string; chemin: string; demande: string } | "non" | null> {
  if (typeof id !== "string" || !UUID.test(id)) return "non";
  const agent = voitTout(s) ? "" : `&demande.agent_id=eq.${s.profilId}`;
  const l = await lire<{ id: string; chemin: string; demande_id: string }>(`equipe_documents?select=id,chemin,demande_id,demande:demandes!inner(agent_id)&id=eq.${id}${agent}&limit=1`);
  if (!l) return null;
  return l[0] ? { id: l[0].id, chemin: l[0].chemin, demande: l[0].demande_id } : "non";
}
