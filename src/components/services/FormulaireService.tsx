"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import type { CopieServices } from "@/content/services";
import type { LangueService } from "@/lib/serveur/services/regles";
import type { CreneauPublic } from "@/lib/serveur/services/public";
import { useFormatsSite } from "@/lib/formats-site";
import "./services.css";

const abonnement = (f: () => void) => { window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); };
const jetonFragment = () => new URLSearchParams(window.location.hash.slice(1)).get("acces") ?? "";
export function FormulaireService({ type, T, langue, creneaux = [], indisponible = false }: { type:"rendez-vous"|"partenaires"|"mes-donnees";T:CopieServices;langue:LangueService;creneaux?:CreneauPublic[];indisponible?:boolean }) {
  const debut=useRef<number|null>(null), [occupe,setOccupe]=useState(false),[erreur,setErreur]=useState(""),[recu,setRecu]=useState(""),[reference,setReference]=useState(""),[choisi,setChoisi]=useState("");
  // Le remplissage automatique peut précéder le premier focus React ; le délai commence aussi au montage.
  useEffect(()=>{debut.current??=Date.now();},[]);
  const jeton=useSyncExternalStore(abonnement,jetonFragment,()=>"");
  const { date } = useFormatsSite();
  const format = date({ day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Africa/Porto-Novo" });
  const creneau=creneaux.find(c=>c.id===choisi);
  const erreurDe = (e:unknown) => typeof e==="string" && ["indisponible","jeton","limite"].includes(e)?T[e as "indisponible"|"jeton"|"limite"]:T.erreur;
  async function envoyer(e:FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f=e.currentTarget, donnees=Object.fromEntries(new FormData(f)); setOccupe(true);setErreur("");
    try {
      const r=await fetch(`/api/${type}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...donnees,langue,consentement:donnees.consentement==="on",duree:Date.now()-(debut.current??Date.now())})});
      const b=await r.json(); if(!r.ok){setErreur(erreurDe(b.erreur));return;}
      setRecu(type==="rendez-vous"?T.rdvRecu:type==="partenaires"?T.candidatureRecue:T.lienEnvoye);setReference(typeof b.id==="string"?b.id:"");
    } catch {setErreur(T.erreur);} finally {setOccupe(false);}
  }
  async function acces(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();const f=new FormData(e.currentTarget), action=f.get("action");setOccupe(true);setErreur("");
    try {
      const r=await fetch("/api/mes-donnees/acces",{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${jeton}`},body:JSON.stringify({action,confirmation:f.get("confirmation")==="on"})});
      if(!r.ok){const b=await r.json();setErreur(erreurDe(b.erreur));return;}
      if(action==="export") { const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="oht-mes-donnees.json";a.click();URL.revokeObjectURL(url);setRecu(T.exporter); }
      else setRecu(T.effacementRecu);
      window.history.replaceState(null,"",window.location.pathname);window.dispatchEvent(new Event("hashchange"));
    } catch {setErreur(T.erreur);} finally {setOccupe(false);}
  }
  const champ = (nom:string,label:string,options:{type?:string;required?:boolean;max?:number;auto?:string}={}) => <label>{label}{options.required===false?<small>{T.facultatif}</small>:null}<input name={nom} type={options.type??"text"} required={options.required!==false} maxLength={options.max??120} autoComplete={options.auto} /></label>;
  const consentement=<label className="services-case"><input name="consentement" type="checkbox" required /> <span>{T.consentement}</span></label>;
  if(recu) return <div className="services-recu" role="status"><p>{recu}</p>{reference?<p>{T.reference}<br/><strong>{reference}</strong></p>:null}{type==="rendez-vous"&&creneau?<p>{format.format(new Date(creneau.debut))}<br/>{creneau.lieu}</p>:null}<a href={langue==="FR"?"/":`/${langue.toLowerCase()}`}>{T.retour}</a></div>;
  if(type==="mes-donnees"&&jeton) return <div className="services-acces"><form onSubmit={acces}><input type="hidden" name="action" value="export"/><button className="services-bouton" disabled={occupe}>{occupe?T.enCours:T.exporter}</button></form><form onSubmit={acces}><input type="hidden" name="action" value="effacement"/><p>{T.effacementNotice}</p><label className="services-case"><input type="checkbox" name="confirmation" required/><span>{T.confirmerEffacement}</span></label><button className="services-bouton secondaire" disabled={occupe}>{T.effacer}</button></form>{erreur?<p role="alert">{erreur}</p>:null}<a href={langue==="FR"?"/mes-donnees":`/${langue.toLowerCase()}/mes-donnees`}>{T.nouveauLien}</a></div>;
  if(type==="rendez-vous"&&(!creneaux.length||indisponible)) return <p className="services-vide">{indisponible?T.erreur:T.aucun}</p>;
  return <form className="services-form" onSubmit={envoyer} onFocusCapture={()=>{debut.current??=Date.now();}}>
    <div className="services-piege" aria-hidden="true"><label>Website<input name="piege" tabIndex={-1} autoComplete="off" /></label></div>
    {type==="rendez-vous"?<label>{T.creneau}<select name="creneau" required value={choisi} onChange={e=>setChoisi(e.target.value)}><option value="">{T.choisir}</option>{creneaux.map(c=><option key={c.id} value={c.id}>{format.format(new Date(c.debut))}</option>)}</select>{creneau?<small>{creneau.mode==="telephone"?T.telephoneMode:T.surPlace} : {creneau.lieu}</small>:null}</label>:null}
    {type!=="mes-donnees"?champ("nom",T.nom,{auto:"name"}):null}
    {champ("email",T.email,{type:"email",max:254,auto:"email"})}
    {type!=="mes-donnees"?champ("telephone",T.telephone,{type:"tel",required:creneau?.mode==="telephone",max:32,auto:"tel"}):null}
    {type==="partenaires"?<>{champ("organisation",T.organisation,{max:160,auto:"organization"})}{champ("activite",T.activite)}{champ("ville",T.ville,{auto:"address-level2"})}{champ("site",T.site,{type:"url",required:false,max:500,auto:"url"})}</>:null}
    {type!=="mes-donnees"?<label>{T.message}<small>{T.facultatif}</small><textarea name="message" maxLength={2000} rows={4}/></label>:null}
    {consentement}
    {erreur?<p role="alert" className="services-erreur">{erreur}</p>:null}
    <button className="services-bouton" disabled={occupe}>{occupe?T.enCours:type==="rendez-vous"?T.reserver:type==="partenaires"?T.candidature:T.envoyerLien}</button>
  </form>;
}
