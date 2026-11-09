"use client";

import { useState, useTransition } from "react";
import { relancesEquipe as R } from "@/content/relances";
import { relancerFactures } from "@/lib/serveur/equipe/finances/relances-actions";
import type { CandidateRelance, RetourRelance } from "@/lib/serveur/equipe/finances/relances";

export function Relances({ candidates }: { candidates: CandidateRelance[] }) {
  const [confirme, setConfirme] = useState(false);
  const [occupe, demarrer] = useTransition();
  const [retour, setRetour] = useState<RetourRelance | null>(null);
  return <form className="fin-form" onSubmit={(e) => {
    e.preventDefault();
    setRetour(null);
    demarrer(async () => {
      try { setRetour(await relancerFactures(candidates.map((c) => c.facture_id), confirme)); }
      catch { setRetour({ erreur: "panne" }); }
      setConfirme(false);
    });
  }}>
    <div className="tableau-defile"><table className="tableau"><thead><tr><th scope="col">{R.numero}</th><th scope="col">{R.client}</th></tr></thead><tbody>{candidates.map((c) => <tr key={c.facture_id}><td data-col={R.numero}>{c.numero}</td><td data-col={R.client}>{c.client}</td></tr>)}</tbody></table></div>
    <label className="mention"><input type="checkbox" checked={confirme} disabled={occupe} onChange={(e) => setConfirme(e.target.checked)} /> {R.confirmer}</label>
    <div className="fin-pied"><button type="submit" className="bouton-2" disabled={!confirme || occupe} aria-busy={occupe || undefined}>{occupe ? R.envoi : R.lancer}</button></div>
    {retour && <p className="fin-retour" data-ton={"erreur" in retour || retour.incertaines ? "erreur" : "ok"} role={"erreur" in retour || retour.incertaines ? "alert" : "status"}>{"erreur" in retour ? R.erreurs[retour.erreur] : R.resultat(retour.envoyees, retour.ignorees, retour.incertaines)}</p>}
  </form>;
}
