"use client";
import { useState, useTransition } from "react";
import { transversal as T } from "@/content/transversal";
import { reglerTache } from "@/lib/serveur/equipe/pilotage/taches-actions";

export function ReglageTache({ nom, actif, libelle }: { nom: "rapport_actif" | "imap_actif" | "purge_actif"; actif: boolean; libelle: string }) {
  const [occupe, lancer] = useTransition(), [message, setMessage] = useState("");
  return <form className="reglage-tache" action={(form) => lancer(async () => { setMessage(await reglerTache(nom, form.get(nom) === "on") ? T.rapport.enregistre : T.rapport.erreur); })}>
    <label className="choix"><input type="checkbox" name={nom} defaultChecked={actif} disabled={occupe} /> {libelle}</label>
    <button className="bouton-2" type="submit" disabled={occupe}>{T.rapport.enregistrer}</button>
    <p className="aide" role="status">{message}</p>
  </form>;
}
