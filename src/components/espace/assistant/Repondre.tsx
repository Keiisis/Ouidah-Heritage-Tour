"use client";

import { type FormEvent, useId, useState, useTransition } from "react";
import { assistantEquipe } from "@/content/assistant";
import { repondreConversation, transformerConversation } from "@/lib/serveur/assistant/actions";

// Réponse d'un agent à une conversation du site, et sa transformation en demande. Le serveur revérifie session, droit
// « Demandes » et conversation à chaque appel.
const B = assistantEquipe.boite;
const E = assistantEquipe.erreurs;

export function Repondre({ id, transformable }: { id: string; transformable: boolean }) {
  const uid = useId();
  const [texte, setTexte] = useState("");
  const [etat, setEtat] = useState("");
  const [occupe, demarrer] = useTransition();

  const envoyer = (ev: FormEvent) => {
    ev.preventDefault();
    demarrer(async () => {
      const r = await repondreConversation({ id, texte });
      if ("ok" in r) setTexte("");
      setEtat("ok" in r ? (r.courriel ? B.envoyeeCourriel : B.envoyee) : (E[r.erreur] ?? E.panne));
    });
  };
  const transformer = () =>
    demarrer(async () => {
      const r = await transformerConversation({ id });
      setEtat("ok" in r ? B.transformee : (E[r.erreur] ?? E.panne));
    });

  return (
    <form className="repondre" onSubmit={envoyer} data-repondre-conversation={id}>
      <div className="champ large">
        <label htmlFor={`${uid}-t`}>{B.reponse}</label>
        <textarea id={`${uid}-t`} name="texte" rows={3} maxLength={4000} value={texte} required onChange={(e) => setTexte(e.target.value)} />
      </div>
      <div className="groupe-outils">
        <button type="submit" className="bouton-2 bouton-petit" disabled={occupe || !texte.trim()}>
          {B.envoyer}
        </button>
        {transformable && (
          <button type="button" className="lien" onClick={transformer} disabled={occupe} data-transformer={id}>
            {B.transformerDemande}
          </button>
        )}
      </div>
      <p className="aide" role="status" aria-live="polite">
        {etat}
      </p>
    </form>
  );
}
