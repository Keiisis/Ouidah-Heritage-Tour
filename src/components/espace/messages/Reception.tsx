"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { Role } from "@/content/equipe";
import { msg } from "@/content/espace-messages";
import { transversal as T } from "@/content/transversal";
import type { CourrielRecu } from "@/lib/serveur/equipe/messages/imap";
import { releverBoite, releverBoiteAuto, rattacherCourriel } from "@/lib/serveur/equipe/messages/imap-actions";
import { useMinute } from "../Cadre";
import { ilYa } from "../outils";
import { Picto } from "../Picto";
const I = T.imap;
const PERIODE = 3 * 60_000;
const ko = (n: number) => `${Math.max(1, Math.round(n / 1024)).toLocaleString("fr-FR")} Ko`;

export function ReleverBoite({ configure }: { configure: boolean }) {
  const [occupe, lancer] = useTransition(), [message, setMessage] = useState("");
  return <div><button className="bouton" disabled={occupe || !configure} onClick={() => lancer(async () => {
    const r = await releverBoite();
    setMessage("ok" in r ? `${I.succes} ${r.nombre}${r.suite ? " · " + I.suite : ""}` : r.erreur === "occupe" ? I.occupe : I.erreur);
  })}>{occupe ? I.enCours : I.synchroniser}</button><p role="status" className="aide">{message}</p></div>;
}

/** Relève automatique tant que l'écran boîte est visible : une demande toutes les 3 minutes, et au retour sur l'onglet si
 * la dernière a plus de 3 minutes. Le serveur refuse les relèves en cours ou trop rapprochées, d'où qu'elles viennent
 * (autres onglets, autres membres de l'équipe). Affiche l'heure de la dernière relève réussie. */
export function ReleveAuto({ releve }: { releve: string | null }) {
  const minute = useMinute();
  const [dernier, setDernier] = useState<string | null>(null);
  useEffect(() => {
    let tente = 0, enCours = false;
    const tenter = async () => {
      if (document.visibilityState !== "visible" || enCours || Date.now() - tente < PERIODE - 1000) return;
      enCours = true;
      tente = Date.now();
      try {
        const r = await releverBoiteAuto();
        if (r.releve) setDernier(r.releve);
      } catch {
        // réseau coupé : l'essai suivant reprendra
      } finally {
        enCours = false;
      }
    };
    void tenter();
    const minuterie = setInterval(tenter, PERIODE);
    document.addEventListener("visibilitychange", tenter);
    return () => {
      clearInterval(minuterie);
      document.removeEventListener("visibilitychange", tenter);
    };
  }, []);
  // la plus récente : celle de la page (relève manuelle puis rafraîchissement) ou celle rendue par la relève automatique
  const quand = [releve, dernier].filter((x): x is string => Boolean(x)).sort().at(-1);
  return quand ? <p className="aide" data-releve>{I.releve(ilYa(quand, minute))}</p> : null;
}

export function Reception({ messages, role, dossiers }: { messages: CourrielRecu[]; role: Role; dossiers: { id: string; nom: string }[] | null }) {
  const [occupe, lancer] = useTransition(), [retour, setRetour] = useState("");
  if (!messages.length) return <p className="mention">{I.vide}</p>;
  return <><ul className="liste">{messages.map((m) => <li key={m.id}><details className="message">
    <summary><strong>{m.objet || I.sansObjet}</strong>{!m.expediteur_verifie && <> <span className="etat" data-e="non-verifie">{I.nonVerifie}</span></>}<span className="meta">{m.nom || m.expediteur} · {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Porto-Novo" }).format(new Date(m.recu_le))}</span></summary>
    <p className="meta">{m.expediteur}</p>
    {!m.expediteur_verifie && <p className="aide" data-non-verifie={m.id}>{I.nonVerifieAide}</p>}
    {m.expediteur && <Link className="bouton-2 bouton-petit" href={`/${role}/courrier?reponse=${m.id}`} data-repondre-imap={m.id}><Picto nom="courrier" />{msg.boite.repondre}</Link>}
    <div className="reception-texte">{m.volumineux ? I.tropGrand : m.texte}</div>
    {m.pieces.length > 0 && <div className="reception-pieces"><p className="aide">{I.pieces}</p><ul>{m.pieces.map((p, i) => <li key={i}>
      {p.partie
        ? <a className="bouton-2 bouton-petit" href={`/agents/boite/piece/${m.id}/${i}`} download aria-label={I.telecharger(p.nom || I.pieces)} data-piece={i}><Picto nom="document" /><span>{p.nom || I.pieces}</span><span className="meta">{ko(p.taille)}</span></a>
        : <span>{p.nom} · {p.type} <span className="aide">{I.pieceAilleurs}</span></span>}
    </li>)}</ul>{m.pieces.some((p) => p.partie) && <p className="aide">{I.piecesAide}</p>}</div>}
    {m.demande_id ? <p><Link className="lien" href={`/${role}/demandes/${m.demande_id}`}>{I.dossier}</Link>{!m.expediteur_verifie && <span className="aide"> · {I.rattacheAdresse}</span>}</p> : <span className="aide">{I.nonAttribue}</span>}
    {dossiers && <form action={(f) => lancer(async () => { setRetour(await rattacherCourriel(m.id, f.get("dossier")) ? I.rattache : I.erreur); })}>
      <div className="champ"><label htmlFor={`dossier-${m.id}`}>{I.attribuer}</label><select id={`dossier-${m.id}`} name="dossier" defaultValue={m.demande_id ?? ""} required><option value="" disabled>{I.dossier}</option>{dossiers.map((d) => <option value={d.id} key={d.id}>{d.nom} · DEM-{d.id.slice(0, 6).toUpperCase()}</option>)}</select></div>
      <button className="bouton-2" disabled={occupe}>{I.enregistrer}</button>
    </form>}
  </details></li>)}</ul><p className="aide" role="status">{retour}</p></>;
}
