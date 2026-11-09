"use client";

import { useState, useTransition } from "react";
import { assistantEquipe } from "@/content/assistant";
import { proposerRedaction } from "@/lib/serveur/assistant/actions";

// « Proposer une rédaction » dans le composeur : l'IA propose un objet et un corps à partir du brouillon, le membre relit
// puis choisit « Utiliser » (le texte remplace son brouillon) ou « Ignorer ». Rien ne part sans son clic sur « Envoyer ».
// Monté seulement si assistantDisponible() (clé GROQ_API_KEYS + assistant allumé) ; le serveur le revérifie.
const R = assistantEquipe.redaction;
const E = assistantEquipe.erreurs;

export function Rediger({ objet, corps, langue, utiliser }: { objet: string; corps: string; langue: string; utiliser: (objet: string, corps: string) => void }) {
  const [proposition, setProposition] = useState<{ objet: string; corps: string } | null>(null);
  const [erreur, setErreur] = useState("");
  const [occupe, demarrer] = useTransition();
  const vide = !objet.trim() && !corps.trim();

  const proposer = () =>
    demarrer(async () => {
      setErreur("");
      const r = await proposerRedaction({ objet, corps, langue: langue || "FR" });
      if ("ok" in r) setProposition({ objet: r.objet, corps: r.corps });
      else setErreur(E[r.erreur] ?? E.panne);
    });

  return (
    <div className="redaction" data-redaction>
      <button type="button" className="bouton-2 bouton-petit" onClick={proposer} disabled={occupe || vide} aria-busy={occupe}>
        {occupe ? R.attente : R.proposer}
      </button>
      <p className="aide" role="status" aria-live="polite">
        {erreur}
      </p>
      {proposition && (
        <section className="proposition" aria-label={R.proposition} data-proposition>
          <p className="aide">{R.aide}</p>
          <p>
            <strong>{proposition.objet}</strong>
          </p>
          {proposition.corps.split("\n").map((l, i) => (
            <p key={i}>{l}</p>
          ))}
          <div className="groupe-outils">
            <button
              type="button"
              className="bouton-2 bouton-petit"
              onClick={() => {
                utiliser(proposition.objet, proposition.corps);
                setProposition(null);
              }}
            >
              {R.utiliser}
            </button>
            <button type="button" className="lien" onClick={() => setProposition(null)}>
              {R.ignorer}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
