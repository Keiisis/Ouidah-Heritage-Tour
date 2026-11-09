"use server";
import { refresh } from "next/cache";
import { base } from "../base";
import { exigerDroit } from "../equipe/securite/droits";
import { effacerPersonne } from "../equipe/securite/actions";
import { exigerRole } from "../equipe/session";
import { lireCreneau, objet, texte, UUID_SERVICE } from "./regles";
export type RetourService = { ok: true } | { erreur: "panne" | "conflit" | "chevauchement" | "acces" | "champs" };
async function verdict(r: Response | null): Promise<RetourService> {
  if (!r?.ok) { const e = await r?.json().catch(() => ({})); return { erreur: e?.message === "chevauchement" ? "chevauchement" : "panne" }; }
  const lignes: unknown = await r.json();
  if (Array.isArray(lignes) && !lignes.length) return { erreur: "conflit" };
  refresh(); return { ok: true };
}
export async function ajouterCreneau(brut: unknown): Promise<RetourService> {
  const s = await exigerDroit("demandes"); if (!s) return { erreur: "acces" };
  const b=objet(brut),v = lireCreneau({ ...b, agent_id: s.role === "admin" ? b.agent_id : s.profilId }, Date.now()); if (!v) return { erreur: "champs" };
  return verdict(await base("rpc/creer_creneau_rdv", { method:"POST",corps:{p_agent:v.agent_id,p_debut:v.debut,p_fin:v.fin,p_mode:v.mode,p_lieu:v.lieu} }).catch(()=>null));
}
export async function changerCreneau(id: string, ouvert: boolean): Promise<RetourService> {
  const s = await exigerDroit("demandes"); if (!s) return { erreur: "acces" };
  if (!UUID_SERVICE.test(id) || typeof ouvert !== "boolean") return { erreur:"champs" };
  let agent=s.profilId;
  if(s.role==="admin") { const r=await base(`rdv_creneaux?id=eq.${id}&select=agent_id`).catch(()=>null);const x=r?.ok?(await r.json() as {agent_id:string}[])[0]:null;if(!x)return {erreur:"conflit"};agent=x.agent_id; }
  return verdict(await base("rpc/changer_creneau_rdv", { method:"POST",corps:{p_id:id,p_agent:agent,p_ouvert:ouvert} }).catch(()=>null));
}
export async function traiterRdv(id: string, statut: string): Promise<RetourService> {
  const s = await exigerDroit("demandes"); if (!s) return { erreur:"acces" };
  if (!UUID_SERVICE.test(id) || !["annule","termine"].includes(statut)) return { erreur:"champs" };
  const r = await base(`rendez_vous?select=creneau_id,creneau:rdv_creneaux!inner(agent_id,debut)&id=eq.${id}${s.role === "admin" ? "" : `&creneau.agent_id=eq.${s.profilId}`}&statut=eq.confirme`).catch(()=>null);
  const ligne = r?.ok ? (await r.json() as {creneau_id:string;creneau:{debut:string}}[])[0] : null;
  if (!ligne || (statut === "termine" && Date.parse(ligne.creneau.debut)>Date.now())) return { erreur:"conflit" };
  return verdict(await base(`rendez_vous?id=eq.${id}&creneau_id=eq.${ligne.creneau_id}&statut=eq.confirme&select=id`,{method:"PATCH",corps:{statut,traite_par:s.profilId,traite_le:new Date().toISOString()},prefer:"return=representation"}).catch(()=>null));
}
export async function traiterCandidature(brut: unknown): Promise<RetourService> {
  const s = await exigerRole("admins"); if (!s) return { erreur:"acces" };
  const b=objet(brut), id=texte(b.id), statut=texte(b.statut), avant=texte(b.avant), note=texte(b.note);
  if (!UUID_SERVICE.test(id) || !["nouvelle","en_etude","acceptee","refusee"].includes(statut) || !["nouvelle","en_etude","acceptee","refusee"].includes(avant) || note.length>2000) return {erreur:"champs"};
  const version=texte(b.version);if(version&&!Number.isFinite(Date.parse(version)))return {erreur:"champs"};
  return verdict(await base(`candidatures_partenaires?id=eq.${id}&statut=eq.${avant}&traite_le=${version?`eq.${encodeURIComponent(version)}`:"is.null"}&select=id`,{method:"PATCH",corps:{statut,note_equipe:note||null,traite_par:s.profilId,traite_le:new Date().toISOString()},prefer:"return=representation"}).catch(()=>null));
}
export async function traiterEffacement(brut: unknown): Promise<RetourService> {
  const s = await exigerRole("admins"); if (!s) return { erreur:"acces" };
  const b=objet(brut), id=texte(b.id), motif=texte(b.motif), action=texte(b.action);
  if (!UUID_SERVICE.test(id) || motif.length<3 || motif.length>2000 || !["traiter","refuser"].includes(action)) return {erreur:"champs"};
  const r=await base(`requetes_effacement?id=eq.${id}&statut=eq.a_traiter&select=email,cree_le`).catch(()=>null);
  const x=r?.ok?(await r.json() as {email:string;cree_le:string}[])[0]:null;
  if (!x) return {erreur:"conflit"};
  if(action==="traiter" && texte(b.confirmation).toLowerCase()!==x.email) return {erreur:"champs"};
  // Compare-and-set avant tout effacement : deux administrateurs ne traitent jamais la même requête en parallèle.
  const prise=await base(`requetes_effacement?id=eq.${id}&statut=eq.a_traiter&select=id`,{method:"PATCH",corps:{statut:"en_cours",traite_par:s.profilId,traite_le:new Date().toISOString()},prefer:"return=representation"}).catch(()=>null);
  if(!prise?.ok || !(await prise.json() as {id:string}[]).length)return {erreur:"conflit"};
  try {
    let resultat: unknown=null;
    if(action==="traiter") {
      const v=await effacerPersonne({email:x.email,confirmation:texte(b.confirmation),recue_le:x.cree_le.slice(0,10)});
      if (!("ok" in v)) return {erreur:"panne"};
      resultat=v;
    }
    const fin=await verdict(await base(`requetes_effacement?id=eq.${id}&statut=eq.en_cours&traite_par=eq.${s.profilId}&select=id`,{method:"PATCH",corps:{statut:action==="traiter"?"traitee":"refusee",...(action==="traiter"?{email:`efface-${id}@invalid.local`}:{}),motif,resultat,traite_le:new Date().toISOString()},prefer:"return=representation"}).catch(()=>null));
    return fin;
  } catch {return {erreur:"panne"};}
  // Une panne après le claim peut cacher une écriture encore exécutée côté base. Conserver en_cours : l'opérateur
  // vérifie la fin du traitement avant de rouvrir la requête. Aucun délai n'est pris pour une preuve d'arrêt.
}
