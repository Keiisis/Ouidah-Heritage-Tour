import "server-only";
import { lireContenu } from "@/lib/contenu";
import { minuitOuidah } from "@/lib/jours";
import { base } from "../../base";
import { type Lieu, lieuDe, lieuxPossibles } from "../dossiers";
import type { TypeMoment } from "../dossiers-regles";
import type { Session } from "../session";

// Agenda de l'agent (lot terrain L5), construit sur les moments des dossiers (dossier_moments, lot L4). Lu par le serveur
// seulement, après la session : l'agent ne lit que SES moments (agent_id dans la requête) et ses dossiers ouverts. Les
// ajouts et déplacements passent par les actions du lot L4 (ajouterMoment, deplacerMoment), qui relisent la session et le
// dossier à chaque appel. null : la base ne répond pas.

export type MomentAgenda = { id: string; dossier: string; client: string; debut: number; fin: number; type: TypeMoment; lieu: string | null; note: string | null; fait: boolean };
export type DossierOuvert = { id: string; client: string };
export type Agenda = { moments: MomentAgenda[]; dossiers: DossierOuvert[]; lieux: Lieu[] };
type Brut = { id: string; demande_id: string; debut: string; fin: string; type: TypeMoment; lieu_id: string | null; note: string | null; fait_le: string | null; demande: { nom: string | null } | null };

async function lire<T>(chemin: string): Promise<T[] | null> {
  try {
    const r = await base(chemin);
    return r.ok ? ((await r.json()) as T[]) : null;
  } catch {
    return null;
  }
}

/** Moments de l'agent du jour `debut` (numéro de jour à Ouidah) sur `jours` jours, et ses dossiers ouverts. */
export async function lireAgenda(s: Session, debut: number, jours: number): Promise<Agenda | null> {
  const de = new Date(minuitOuidah(debut)).toISOString(), a = new Date(minuitOuidah(debut + jours)).toISOString();
  const [moments, dossiers, destinations, releve] = await Promise.all([
    lire<Brut>(`dossier_moments?select=id,demande_id,debut,fin,type,lieu_id,note,fait_le,demande:demandes(nom)&agent_id=eq.${s.profilId}&debut=gte.${encodeURIComponent(de)}&debut=lt.${encodeURIComponent(a)}&order=debut.asc,ordre.asc&limit=500`),
    lire<{ id: string; nom: string | null }>(`demandes?select=id,nom&statut=eq.envoyee&agent_id=eq.${s.profilId}&etape=not.in.(terminee,perdue)&order=cree_le.desc&limit=200`),
    lireContenu("fr.destinations"),
    lireContenu("lieux-ouidah"),
  ]);
  if (!moments || !dossiers) return null;
  return {
    moments: moments.map((m) => ({ id: m.id, dossier: m.demande_id, client: m.demande?.nom ?? "", debut: Date.parse(m.debut), fin: Date.parse(m.fin), type: m.type, lieu: m.lieu_id ? (lieuDe(m.lieu_id, destinations, releve)?.nom ?? null) : null, note: m.note, fait: Boolean(m.fait_le) })),
    dossiers: dossiers.map((d) => ({ id: d.id, client: d.nom ?? "" })),
    lieux: lieuxPossibles([], destinations),
  };
}
