import "server-only";
import { notFound } from "next/navigation";
import { conciergerie as CONCIERGERIE, destinations as DESTINATIONS, tours as TOURS } from "@/content/fr";
import RELEVE from "@/content/lieux-ouidah.json";
import { lireContenu } from "@/lib/contenu";
import { iso, jourOuidah, minuitOuidah } from "@/lib/jours";
import { base } from "../base";
import { jetonSuivi } from "../documents/jeton";
import { type Etape, ligneCircuit, type TypeMoment, UUID } from "./dossiers-regles";
import type { Session } from "./session";

// Lectures des demandes et dossiers voyage (lot L4), par le serveur seulement avec la clé secrète. La clé contourne RLS :
// le cloisonnement des agents tient ICI. Un agent ne lit que les demandes dont il est l'agent (filtre agent_id posé dans
// la requête elle-même) ; un admin lit tout. Un dossier hors de portée donne notFound() (404), comme un identifiant mal
// formé : rien ne dit qu'il existe. Aucun « use cache » : tout est lu à la requête, après la session. Ne sort que ce que
// l'écran affiche.

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

// ---------- lieux (contenu du site, jamais saisis) ----------

export type Lieu = { id: string; nom: string; coords: [number, number] | null };
export function lieuDe(id: string, destinations = DESTINATIONS, releve = RELEVE): Lieu | null {
  const d = destinations.find((x) => x.slug === id);
  if (d) return { id: d.slug, nom: d.name, coords: d.coords };
  const l = id.startsWith("r:") ? releve.lieux.find((x) => x.slug === id.slice(2)) : null;
  return l ? { id, nom: l.nom, coords: l.coords.length === 2 ? l.coords as [number, number] : null } : null;
}
/** Lieux choisis par le client : arrêts du circuit, puis lieux du dossier, sans doublon, dans cet ordre. */
const lieuxDemande = (circuit: string | null, lieux: unknown, tours = TOURS, destinations = DESTINATIONS, releve = RELEVE) => {
  const arrets = tours.find((t) => t.slug === circuit)?.stops ?? [];
  const choisis = Array.isArray(lieux) ? lieux.filter((x): x is string => typeof x === "string") : [];
  return [...new Set([...arrets, ...choisis])].map((id) => lieuDe(id, destinations, releve)).filter((l): l is Lieu => l !== null);
};
/** Lieux qu'un moment peut porter : ceux du site, puis ceux du relevé choisis par le client. */
export const lieuxPossibles = (choisis: Lieu[], destinations = DESTINATIONS) => [...destinations.map((d) => ({ id: d.slug, nom: d.name, coords: d.coords })), ...choisis.filter((l) => !destinations.some((d) => d.slug === l.id))];

// ---------- équipe ----------

export type MembreActif = { id: string; prenom: string; nom: string; role: "agent" | "admin" };
/** Membres actifs (agents d'abord), pour l'attribution par un admin. */
export async function membresActifs(): Promise<MembreActif[] | null> {
  const l = await lire<MembreActif>("equipe_profils?select=id,prenom,nom,role&etat=eq.actif&order=role.desc,prenom.asc&limit=500");
  return l ? l.sort((a, b) => (a.role === b.role ? 0 : a.role === "agent" ? -1 : 1)) : null;
}

// ---------- liste des demandes ----------

export type LigneListe = {
  id: string;
  recue: string; // ISO
  intention: "voyage" | "question" | "groupe";
  nom: string;
  langue: string;
  pays: string | null;
  etape: Etape;
  agent: { id: string; prenom: string; nom: string } | null;
  voyageurs: number;
  devis: { statut: string; montant: number | null } | null;
};
type BrutListe = Omit<LigneListe, "recue" | "voyageurs" | "devis" | "nom"> & { cree_le: string; nom: string | null; reponses: { adultes?: number; enfants?: number } | null; devis: { statut: string; montant: number | null; cree_le: string }[] };

/** Demandes envoyées par /devis : celles de l'agent, ou toutes pour un admin. Les brouillons du site n'y sont jamais. */
export async function lireDemandes(s: Session): Promise<LigneListe[] | null> {
  const l = await lire<BrutListe>(`demandes?select=id,cree_le,intention,nom,langue,pays,etape,reponses,agent:equipe_profils(id,prenom,nom),devis(statut,montant,cree_le)&statut=eq.envoyee${filtreAgent(s)}&order=cree_le.desc&limit=500`);
  return l
    ? l.map(({ cree_le, reponses, devis, nom, ...x }) => {
        const d = devis.filter((v) => v.statut !== "annule").sort((a, b) => b.cree_le.localeCompare(a.cree_le))[0];
        return { ...x, nom: nom ?? "", recue: cree_le, voyageurs: (reponses?.adultes ?? 0) + (reponses?.enfants ?? 0), devis: d ? { statut: d.statut, montant: d.montant } : null };
      })
    : null;
}

// ---------- un dossier ----------

export type MomentDossier = { id: string; debut: number; fin: number; type: TypeMoment; lieu: Lieu | null; note: string | null; fait: boolean };
export type DevisDossier = { id: string; statut: "brouillon" | "pret" | "paye"; lignes: { libelle: string; quantite: number; prix_unitaire: number }[]; montant: number | null; note: string | null; valable: string | null; publie: string | null; numero: string | null; courriel: boolean };
export type Historique = { quand: string; action: string; qui: string; details: { cible?: string; etape?: string; type?: string; nombre?: number; motif?: string } };
export type VueDossier = {
  id: string;
  reference: string;
  recue: string;
  intention: "voyage" | "question" | "groupe";
  client: { nom: string; email: string; telephone: string | null; pays: string | null; langue: string };
  sejour: { arrivee: string; depart: string; jours: number } | null; // AAAA-MM-JJ
  voyageurs: { adultes: number; enfants: number };
  circuit: string | null;
  lieux: Lieu[];
  services: { nom: string; choix: string[] }[];
  message: string | null;
  etape: Etape;
  agent: { id: string; prenom: string; nom: string } | null;
  note: string | null;
  moments: MomentDossier[];
  lieuxPossibles: Lieu[];
  devis: DevisDossier | null;
  ligneCircuit: DevisDossier["lignes"][number] | null; // prix du circuit (sa fiche), proposé au premier devis
  historique: Historique[];
  lienClient: string | null; // page de suivi du client (/suivi/<jeton>), qui montre le devis une fois prêt
};

export type BrutDossier = {
  id: string;
  cree_le: string;
  intention: "voyage" | "question" | "groupe";
  circuit: string | null;
  langue: string;
  dossier: { sejour?: { arrivee: number; depart: number } | null; lieux?: unknown; services?: Record<string, unknown> } | null;
  reponses: { adultes?: number; enfants?: number } | null;
  nom: string | null;
  email: string | null;
  whatsapp: string | null;
  pays: string | null;
  message: string | null;
  etape: Etape;
  agent_id: string | null;
  note_equipe: string | null;
};
const CHAMPS = "id,cree_le,intention,circuit,langue,dossier,reponses,nom,email,whatsapp,pays,message,etape,agent_id,note_equipe";

/**
 * La demande d'un dossier, si cette session y a droit : un agent seulement sur les siennes (le filtre est dans la requête),
 * un admin sur toutes. Hors de portée ou identifiant mal formé : notFound() (404, à l'adresse comme dans une action).
 * La base qui ne répond pas : null (« données indisponibles »), jamais un 404 trompeur.
 */
export async function demandeAccessible(s: Session, id: unknown): Promise<BrutDossier | null> {
  if (typeof id !== "string" || !UUID.test(id)) notFound();
  const l = await lire<BrutDossier>(`demandes?select=${CHAMPS}&id=eq.${id}&statut=eq.envoyee${filtreAgent(s)}&limit=1`);
  if (!l) return null;
  if (!l[0]) notFound();
  return l[0];
}

type BrutMoment = { id: string; debut: string; fin: string; type: TypeMoment; lieu_id: string | null; note: string | null; fait_le: string | null };
type BrutDevis = { id: string; statut: "brouillon" | "pret" | "paye" | "annule"; lignes: DevisDossier["lignes"]; montant: number | null; note: string | null; valable_jusqu_au: string | null; publie_le: string | null; courriel_pret_pour: string | null; cree_le: string };
type BrutJournal = { cree_le: string; action: string; details: Historique["details"]; profil: { prenom: string; nom: string } | null };

const servicesDe = (sv: Record<string, unknown> | undefined, conciergerie = CONCIERGERIE) =>
  conciergerie.flatMap((q) => {
    const v = sv?.[q.id];
    const choix = Array.isArray(v) ? v.filter((l): l is string => typeof l === "string" && q.options.some((o) => o.label === l && !o.passe)) : [];
    return choix.length ? [{ nom: q.court, choix }] : [];
  });

export async function lireDossier(s: Session, id: unknown): Promise<VueDossier | null> {
  const d = await demandeAccessible(s, id);
  if (!d) return null;
  const [moments, devis, journal, agent, tours, destinations, releve, conciergerie] = await Promise.all([
    lire<BrutMoment>(`dossier_moments?select=id,debut,fin,type,lieu_id,note,fait_le&demande_id=eq.${d.id}&order=debut.asc,ordre.asc&limit=200`),
    lire<BrutDevis>(`devis?select=id,statut,lignes,montant,note,valable_jusqu_au,publie_le,courriel_pret_pour,cree_le&demande_id=eq.${d.id}&statut=neq.annule&order=cree_le.desc&limit=1`),
    lire<BrutJournal>(`equipe_journal?select=cree_le,action,details,profil:equipe_profils(prenom,nom)&details->>dossier=eq.${d.id}&order=id.desc&limit=40`),
    d.agent_id ? lire<{ id: string; prenom: string; nom: string }>(`equipe_profils?select=id,prenom,nom&id=eq.${d.agent_id}&limit=1`) : Promise.resolve([]),
    lireContenu("fr.tours"), lireContenu("fr.destinations"), lireContenu("lieux-ouidah"), lireContenu("fr.conciergerie"),
  ]);
  if (!moments || !devis || !journal || !agent) return null;
  // l'historique nomme l'agent attribué (le journal ne garde que son identifiant)
  const cibles = [...new Set(journal.filter((j) => j.action === "dossier.attribution" && j.details.cible && UUID.test(j.details.cible)).map((j) => j.details.cible as string))];
  const noms = new Map((cibles.length ? ((await lire<{ id: string; prenom: string; nom: string }>(`equipe_profils?select=id,prenom,nom&id=in.(${cibles.join(",")})`)) ?? []) : []).map((p) => [p.id, `${p.prenom} ${p.nom}`]));
  const v = devis[0];
  // numéro D-… : déjà émis à la publication (emettre, idempotent) ; lu ici sans en émettre un nouveau
  const numero = v && v.statut !== "brouillon" ? ((await lire<{ numero: string }>(`documents?select=numero&type=eq.D&source=eq.devis&source_id=eq.${v.id}&limit=1`))?.[0]?.numero ?? null) : null;
  const sejour = d.dossier?.sejour ?? null;
  const lieux = lieuxDemande(d.circuit, d.dossier?.lieux, tours, destinations, releve);
  const jeton = jetonSuivi("d", d.id);
  const voyageurs = { adultes: d.reponses?.adultes ?? 0, enfants: d.reponses?.enfants ?? 0 };
  const tour = d.circuit ? tours.find((t) => t.slug === d.circuit) : undefined;
  return {
    id: d.id,
    reference: `DEM-${d.id.slice(0, 6).toUpperCase()}`,
    recue: d.cree_le,
    intention: d.intention,
    client: { nom: d.nom ?? "", email: d.email ?? "", telephone: d.whatsapp || null, pays: d.pays, langue: d.langue },
    sejour: sejour ? { arrivee: iso(sejour.arrivee), depart: iso(sejour.depart), jours: sejour.depart - sejour.arrivee + 1 } : null,
    voyageurs,
    circuit: tour?.title ?? null,
    lieux,
    services: servicesDe(d.dossier?.services, conciergerie),
    message: d.message || null,
    etape: d.etape,
    agent: agent[0] ?? null,
    note: d.note_equipe,
    moments: moments.map((m) => ({ id: m.id, debut: Date.parse(m.debut), fin: Date.parse(m.fin), type: m.type, lieu: m.lieu_id ? lieuDe(m.lieu_id, destinations, releve) : null, note: m.note, fait: Boolean(m.fait_le) })),
    lieuxPossibles: lieuxPossibles(lieux, destinations),
    devis: v && v.statut !== "annule" ? { id: v.id, statut: v.statut, lignes: v.lignes, montant: v.montant, note: v.note, valable: v.valable_jusqu_au, publie: v.publie_le, numero, courriel: Boolean(v.publie_le && v.courriel_pret_pour && Date.parse(v.courriel_pret_pour) === Date.parse(v.publie_le)) } : null,
    ligneCircuit: ligneCircuit(tour, voyageurs.adultes + voyageurs.enfants),
    historique: journal.map((j) => ({ quand: j.cree_le, action: j.action, qui: j.profil ? `${j.profil.prenom} ${j.profil.nom}` : "", details: { ...j.details, cible: j.details.cible ? (noms.get(j.details.cible) ?? undefined) : undefined } })),
    lienClient: jeton ? `/suivi/${jeton}` : null,
  };
}

// ---------- moments du jour (arc du soleil des accueils) ----------

export type MomentJour = { id: string; debut: number; fin: number; type: TypeMoment; fait: boolean; dossier: string; client: string; lieu: string | null; agent: { id: string; prenom: string } | null };
type BrutJour = { id: string; demande_id: string; debut: string; fin: string; type: TypeMoment; lieu_id: string | null; fait_le: string | null; demande: { nom: string | null } | null; agent: { id: string; prenom: string } | null };

/** Moments du jour à Ouidah : ceux de l'agent (moi), ou de toute l'équipe (admin). `ms` : l'heure de la requête. */
export async function momentsDuJour(s: Session, ms: number, equipe: boolean): Promise<MomentJour[] | null> {
  const [destinations, releve] = await Promise.all([lireContenu("fr.destinations"), lireContenu("lieux-ouidah")]);
  const jour = jourOuidah(ms);
  const de = new Date(minuitOuidah(jour)).toISOString(), a = new Date(minuitOuidah(jour + 1)).toISOString();
  const qui = equipe && voitTout(s) ? "" : `&agent_id=eq.${s.profilId}`;
  const l = await lire<BrutJour>(`dossier_moments?select=id,demande_id,debut,fin,type,lieu_id,fait_le,demande:demandes(nom),agent:equipe_profils(id,prenom)&debut=gte.${encodeURIComponent(de)}&debut=lt.${encodeURIComponent(a)}${qui}&order=debut.asc&limit=200`);
  return l
    ? l.map((m) => ({ id: m.id, debut: Date.parse(m.debut), fin: Date.parse(m.fin), type: m.type, fait: Boolean(m.fait_le), dossier: m.demande_id, client: m.demande?.nom ?? "", lieu: m.lieu_id ? (lieuDe(m.lieu_id, destinations, releve)?.nom ?? null) : null, agent: m.agent }))
    : null;
}

// ---------- clients ----------

export type FicheClient = { id: string; nom: string; email: string; pays: string | null; langue: string; telephone: string | null; notes: string | null; dossiers: { id: string; recue: string; etape: Etape; intention: string }[] };
type BrutClient = Omit<FicheClient, "dossiers">;

/** Fiches clients : toutes (admin), ou celles des dossiers de l'agent, avec leurs dossiers liés (par adresse e-mail). */
export async function lireClients(s: Session): Promise<FicheClient[] | null> {
  const demandes = await lire<{ id: string; cree_le: string; email: string | null; etape: Etape; intention: string }>(`demandes?select=id,cree_le,email,etape,intention&statut=eq.envoyee${filtreAgent(s)}&order=cree_le.desc&limit=2000`);
  if (!demandes) return null;
  const parEmail = new Map<string, FicheClient["dossiers"]>();
  for (const d of demandes) {
    if (!d.email) continue;
    const k = d.email.toLowerCase();
    parEmail.set(k, [...(parEmail.get(k) ?? []), { id: d.id, recue: d.cree_le, etape: d.etape, intention: d.intention }]);
  }
  if (!voitTout(s) && parEmail.size === 0) return [];
  const emails = [...parEmail.keys()];
  // adresses citées entre guillemets doubles dans le filtre in.() (PostgREST) ; une adresse avec un guillemet est écartée
  const filtre = voitTout(s) ? "" : `&email=in.(${emails.filter((e) => !/["\\]/.test(e)).map((e) => `"${encodeURIComponent(e)}"`).join(",")})`;
  const clients = await lire<BrutClient>(`clients?select=id,nom,email,pays,langue,telephone,notes${filtre}&order=nom.asc&limit=2000`);
  return clients ? clients.map((c) => ({ ...c, dossiers: parEmail.get(c.email.toLowerCase()) ?? [] })) : null;
}

/** Une fiche client si cette session y a droit (admin : toutes ; agent : celles de ses dossiers), sinon notFound(). */
export async function clientAccessible(s: Session, id: unknown): Promise<BrutClient | null> {
  if (typeof id !== "string" || !UUID.test(id)) notFound();
  const c = await lire<BrutClient>(`clients?select=id,nom,email,pays,langue,telephone,notes&id=eq.${id}&limit=1`);
  if (!c) return null;
  if (!c[0]) notFound();
  if (voitTout(s)) return c[0];
  // adresses des dossiers de l'agent comparées en minuscules ici (aucun motif « like » à échapper)
  const lies = await lire<{ email: string | null }>(`demandes?select=email&statut=eq.envoyee&agent_id=eq.${s.profilId}&limit=2000`);
  if (!lies) return null;
  if (!lies.some((d) => d.email?.toLowerCase() === c[0].email)) notFound();
  return c[0];
}

/** Lieux du client (circuit et dossier) et identifiants qu'un moment de ce dossier peut porter. */
export async function lieuxDuDossier(d: BrutDossier) {
  const [tours, destinations, releve] = await Promise.all([lireContenu("fr.tours"), lireContenu("fr.destinations"), lireContenu("lieux-ouidah")]);
  const choisis = lieuxDemande(d.circuit, d.dossier?.lieux, tours, destinations, releve);
  return { choisis, possibles: new Set(lieuxPossibles(choisis, destinations).map((l) => l.id)) };
}

/** Suppression (PostgREST DELETE ; base() ne fait que GET, POST et PATCH), clé secrète en en-tête « apikey ». Renvoie les
 * lignes supprimées, ou null si la base ne répond pas. */
export async function effacer<T>(chemin: string): Promise<T[] | null> {
  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${chemin}`, { method: "DELETE", headers: { apikey: process.env.SUPABASE_SECRET_KEY ?? "", prefer: "return=representation" }, cache: "no-store" });
    return r.ok ? ((await r.json()) as T[]) : null;
  } catch {
    return null;
  }
}
