"use client";
import { useState, useTransition } from "react";
import type { traductionAuto } from "@/content/traduction-auto";
import type { ReglagesTraduction } from "@/lib/serveur/traduction-auto/reglages";
import { reglerTraductions, reprendreTraductions } from "@/lib/serveur/traduction-auto/actions";

export function ReglagesTraduction({ reg, textes: T }: { reg: ReglagesTraduction; textes: typeof traductionAuto }) {
  const [occupe, lancer] = useTransition(), [message, setMessage] = useState("");
  return <form className="tr-auto-form" action={form => lancer(async () => setMessage(await reglerTraductions(form) ? T.enregistre : T.erreur))}>
    <label className="tr-auto-choix"><input name="actif" type="checkbox" defaultChecked={reg.actif} disabled={occupe} />{T.actif}</label>
    <label>{T.modele}<input name="modele" defaultValue={reg.modele} maxLength={120} required disabled={occupe} /></label>
    <label>{T.budget}<input name="budget" type="number" min={1000} max={10_000_000} step={1} defaultValue={reg.budget_jour} required disabled={occupe} /></label>
    <label className="tr-auto-large">{T.glossaire}<textarea name="glossaire" rows={3} maxLength={8000} defaultValue={reg.glossaire} disabled={occupe} /><span className="aide">{T.aideGlossaire}</span></label>
    <div className="tr-auto-actions"><button type="submit" className="bouton" disabled={occupe}>{T.enregistrer}</button><button type="button" className="bouton-2" disabled={occupe} onClick={() => lancer(async () => setMessage(await reprendreTraductions() ? T.lance : T.erreur))}>{T.relancer}</button></div>
    <p className="aide tr-auto-large" role="status">{message}</p>
  </form>;
}
