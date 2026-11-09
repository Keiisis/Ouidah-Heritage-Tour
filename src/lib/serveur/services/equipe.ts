import "server-only";
import { base } from "../base";
import type { Session } from "../equipe/session";
export type CreneauEquipe = { id: string; agent_id: string; debut: string; fin: string; mode: string; lieu: string; ouvert: boolean; rendez_vous: RdvEquipe[] };
export type RdvEquipe = { id: string; nom: string; email: string; telephone: string | null; message: string | null; statut: string };
export type CandidatureEquipe = { id: string; nom: string; email: string; telephone: string | null; organisation: string; activite: string; ville: string; site: string | null; message: string | null; statut: string; note_equipe: string | null; cree_le: string; traite_le: string|null };
export type EffacementEquipe = { id: string; email: string; statut: string; cree_le: string; motif: string | null };
export async function lireServices(s: Session) {
  try {
    const [r, c, e, p] = await Promise.all([
      base(`rdv_creneaux?select=id,agent_id,debut,fin,mode,lieu,ouvert,rendez_vous(id,nom,email,telephone,message,statut)${s.role === "admin" ? "" : `&agent_id=eq.${s.profilId}`}&order=debut.desc&limit=200`),
      s.role === "admin" ? base("candidatures_partenaires?select=id,nom,email,telephone,organisation,activite,ville,site,message,statut,note_equipe,cree_le,traite_le&order=cree_le.desc&limit=200") : null,
      s.role === "admin" ? base("requetes_effacement?select=id,email,statut,cree_le,motif&order=cree_le.desc&limit=200") : null,
      s.role === "admin" ? base("equipe_profils?select=id,prenom,nom&etat=eq.actif&order=prenom&limit=200") : null,
    ]);
    if (!r.ok || (c && !c.ok) || (e && !e.ok) || (p && !p.ok)) return null;
    return { creneaux: await r.json() as CreneauEquipe[], candidatures: c ? await c.json() as CandidatureEquipe[] : [], effacements: e ? await e.json() as EffacementEquipe[] : [], profils: p ? await p.json() as {id:string;prenom:string;nom:string}[] : [] };
  } catch { return null; }
}
