"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { Role } from "@/content/equipe";
import { transversal as T } from "@/content/transversal";
import type { CourrielRecu } from "@/lib/serveur/equipe/messages/imap";
import { releverBoite, rattacherCourriel } from "@/lib/serveur/equipe/messages/imap-actions";
const I = T.imap;

export function ReleverBoite({ configure }: { configure: boolean }) {
  const [occupe, lancer] = useTransition(), [message, setMessage] = useState("");
  return <div><button className="bouton" disabled={occupe || !configure} onClick={() => lancer(async () => {
    const r = await releverBoite();
    setMessage("ok" in r ? `${I.succes} ${r.nombre}${r.suite ? " · " + I.suite : ""}` : r.erreur === "occupe" ? I.occupe : I.erreur);
  })}>{occupe ? I.enCours : I.synchroniser}</button><p role="status" className="aide">{message}</p></div>;
}
export function Reception({ messages, role, dossiers }: { messages: CourrielRecu[]; role: Role; dossiers: { id: string; nom: string }[] | null }) {
  const [occupe, lancer] = useTransition(), [retour, setRetour] = useState("");
  if (!messages.length) return <p className="mention">{I.vide}</p>;
  return <><ul className="liste">{messages.map((m) => <li key={m.id}><details className="message">
    <summary><strong>{m.objet || I.sansObjet}</strong><span className="meta">{m.nom || m.expediteur} · {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Porto-Novo" }).format(new Date(m.recu_le))}</span></summary>
    <p className="meta">{m.expediteur}</p>
    <div className="reception-texte">{m.volumineux ? I.tropGrand : m.texte}</div>
    {m.pieces.length > 0 && <><p className="aide">{I.pieces}</p><ul>{m.pieces.map((p, i) => <li key={i}>{p.nom} · {p.type}</li>)}</ul></>}
    {m.demande_id ? <Link className="lien" href={`/${role}/demandes/${m.demande_id}`}>{I.dossier}</Link> : <span className="aide">{I.nonAttribue}</span>}
    {dossiers && <form action={(f) => lancer(async () => { setRetour(await rattacherCourriel(m.id, f.get("dossier")) ? I.rattache : I.erreur); })}>
      <div className="champ"><label htmlFor={`dossier-${m.id}`}>{I.attribuer}</label><select id={`dossier-${m.id}`} name="dossier" defaultValue={m.demande_id ?? ""} required><option value="" disabled>{I.dossier}</option>{dossiers.map((d) => <option value={d.id} key={d.id}>{d.nom} · DEM-{d.id.slice(0, 6).toUpperCase()}</option>)}</select></div>
      <button className="bouton-2" disabled={occupe}>{I.enregistrer}</button>
    </form>}
  </details></li>)}</ul><p className="aide" role="status">{retour}</p></>;
}
