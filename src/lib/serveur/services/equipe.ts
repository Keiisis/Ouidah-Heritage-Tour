import "server-only";
import { base } from "../base";
import type { Session } from "../equipe/session";
export type CreneauEquipe = { id: string; agent_id: string; debut: string; fin: string; mode: string; lieu: string; ouvert: boolean; rendez_vous: RdvEquipe[] };
export type RdvEquipe = { id: string; nom: string; email: string; telephone: string | null; message: string | null; statut: string };
export type CandidatureEquipe = { id: string; nom: string; email: string; telephone: string | null; organisation: string; activite: string; ville: string; site: string | null; message: string | null; statut: string; note_equipe: string | null; cree_le: string; traite_le: string|null };
export type EffacementEquipe = { id: string; email: string; statut: string; cree_le: string; motif: string | null };
export async function lireServices(s: Session) {
  try {
    const [r, c, p] = await Promise.all([
      base(`rdv_creneaux?select=id,agent_id,debut,fin,mode,lieu,ouvert,rendez_vous(id,nom,email,telephone,message,statut)${s.role === "admin" ? "" : `&agent_id=eq.${s.profilId}`}&order=debut.desc&limit=200`),
      s.role === "admin" ? base("candidatures_partenaires?select=id,nom,email,telephone,organisation,activite,ville,site,message,statut,note_equipe,cree_le,traite_le&order=cree_le.desc&limit=200") : null,
      s.role === "admin" ? base("equipe_profils?select=id,prenom,nom&etat=eq.actif&order=prenom&limit=200") : null,
    ]);
    if (!r.ok || (c && !c.ok) || (p && !p.ok)) return null;
    return { creneaux: await r.json() as CreneauEquipe[], candidatures: c ? await c.json() as CandidatureEquipe[] : [], profils: p ? await p.json() as {id:string;prenom:string;nom:string}[] : [] };
  } catch { return null; }
}
/** File des demandes d'effacement envoyées depuis /mes-donnees (écran Protection des données, admin seulement). */
export async function lireEffacements(s: Session): Promise<EffacementEquipe[] | null> {
  if (s.role !== "admin") return null;
  try {
    const e = await base("requetes_effacement?select=id,email,statut,cree_le,motif&order=cree_le.desc&limit=200");
    return e.ok ? await e.json() as EffacementEquipe[] : null;
  } catch { return null; }
}
