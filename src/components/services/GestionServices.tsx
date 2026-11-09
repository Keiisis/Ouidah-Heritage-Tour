"use client";
import { useState, useTransition, type FormEvent } from "react";
import type { servicesEquipe } from "@/content/services";
import type { lireServices } from "@/lib/serveur/services/equipe";
import { ajouterCreneau, changerCreneau, traiterCandidature, traiterEffacement, traiterRdv, type RetourService } from "@/lib/serveur/services/actions";
import "./services.css";

type Donnees=NonNullable<Awaited<ReturnType<typeof lireServices>>>;
export function GestionServices({donnees,T,admin,profilId}:{donnees:Donnees;T:typeof servicesEquipe;admin:boolean;profilId:string}) {
  const [attente,lancer]=useTransition(),[retour,setRetour]=useState("");
  const format=new Intl.DateTimeFormat("fr",{dateStyle:"medium",timeStyle:"short",timeZone:"Africa/Porto-Novo"});
  const etat=(x:string)=>x==="en_cours"?T.traitementEnCours:T.etats[x as keyof typeof T.etats]??x;
  const agir=(f:()=>Promise<RetourService>)=>lancer(async()=>{setRetour("");try{const r=await f();setRetour("ok" in r?T.succes:r.erreur==="chevauchement"?T.chevauchement:r.erreur==="conflit"?T.conflit:T.panne);}catch{setRetour(T.panne);}});
  function creer(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));agir(()=>ajouterCreneau({...f,debut:`${f.debut}:00+01:00`,fin:`${f.fin}:00+01:00`}));}
  function candidature(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));agir(()=>traiterCandidature(f));}
  function effacement(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));agir(()=>traiterEffacement(f));}
  return <div className="services-equipe">
    <p role="status" aria-live="polite">{retour}</p>
    <section><h2>{T.disponibilites}</h2><p>{T.horaires}</p><form onSubmit={creer}>
      {admin?<label>{T.agent}<select name="agent_id" defaultValue={profilId} required>{donnees.profils.map(p=><option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}</select></label>:null}
      <div className="services-ligne"><label>{T.debut}<input type="datetime-local" name="debut" required/></label><label>{T.fin}<input type="datetime-local" name="fin" required/></label></div>
      <label>{T.mode}<select name="mode"><option value="telephone">{T.telephone}</option><option value="sur_place">{T.surPlace}</option></select></label>
      <label>{T.lieu}<input name="lieu" maxLength={280} required/></label><button className="services-bouton" disabled={attente}>{T.ajouter}</button>
    </form></section>
    <section><h2>{T.rendezVous}</h2>{!donnees.creneaux.length?<p>{T.vide}</p>:donnees.creneaux.map(c=><article key={c.id}>
      <h3>{format.format(new Date(c.debut))}</h3><p>{c.lieu}</p>{admin?<p>{donnees.profils.find(p=>p.id===c.agent_id)?.prenom}</p>:null}
      <button className="services-bouton secondaire" disabled={attente} onClick={()=>agir(()=>changerCreneau(c.id,!c.ouvert))}>{c.ouvert?T.fermer:T.rouvrir}</button>
      {c.rendez_vous.map(r=><div key={r.id}><p><strong>{r.nom}</strong> · {etat(r.statut)}</p><p><a href={`mailto:${r.email}`}>{r.email}</a>{r.telephone?` · ${r.telephone}`:""}</p>{r.message?<p>{r.message}</p>:null}{r.statut==="confirme"?<div className="services-ligne"><button className="services-bouton secondaire" disabled={attente} onClick={()=>agir(()=>traiterRdv(r.id,"termine"))}>{T.termine}</button><form onSubmit={e=>{e.preventDefault();agir(()=>traiterRdv(r.id,"annule"));}}><label className="services-case"><input type="checkbox" required/><span>{T.confirmationRdv}</span></label><button className="services-bouton secondaire" disabled={attente}>{T.annuler}</button></form></div>:null}</div>)}
    </article>)}</section>
    {admin?<><section><h2>{T.candidatures}</h2>{!donnees.candidatures.length?<p>{T.vide}</p>:donnees.candidatures.map(c=><article key={c.id}><h3>{c.organisation}</h3><p>{c.activite} · {c.ville}</p><p>{c.nom} · <a href={`mailto:${c.email}`}>{c.email}</a></p>{c.telephone?<p>{c.telephone}</p>:null}{c.site?<p><a href={c.site} target="_blank" rel="noreferrer noopener">{c.site}</a></p>:null}{c.message?<p>{c.message}</p>:null}<form onSubmit={candidature}><input type="hidden" name="id" value={c.id}/><input type="hidden" name="avant" value={c.statut}/><input type="hidden" name="version" value={c.traite_le??""}/><label>{T.statut}<select name="statut" defaultValue={c.statut}>{["nouvelle","en_etude","acceptee","refusee"].map(e=><option key={e} value={e}>{etat(e)}</option>)}</select></label><label>{T.note}<textarea name="note" defaultValue={c.note_equipe??""} maxLength={2000}/></label><button className="services-bouton" disabled={attente}>{T.enregistrer}</button></form></article>)}</section>
    <section><h2>{T.donnees}</h2><p>{T.conservation} {T.conservationServices}</p>{!donnees.effacements.length?<p>{T.vide}</p>:donnees.effacements.map(e=><article key={e.id}><h3>{e.email}</h3><p>{format.format(new Date(e.cree_le))} · {etat(e.statut)}</p>{e.motif?<p>{e.motif}</p>:null}{e.statut==="a_traiter"?<><form onSubmit={effacement}><input type="hidden" name="id" value={e.id}/><input type="hidden" name="action" value="traiter"/><label>{T.confirmation}<input type="email" name="confirmation" required autoComplete="off"/></label><label>{T.motifEffacement}<textarea name="motif" minLength={3} maxLength={2000} required/></label><button className="services-bouton" disabled={attente}>{T.traiter}</button></form><form onSubmit={effacement}><input type="hidden" name="id" value={e.id}/><input type="hidden" name="action" value="refuser"/><label>{T.motifRefus}<textarea name="motif" minLength={3} maxLength={2000} required/></label><button className="services-bouton secondaire" disabled={attente}>{T.refuser}</button></form></>:null}</article>)}</section></>:null}
  </div>;
}
