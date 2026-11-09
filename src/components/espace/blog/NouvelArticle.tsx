"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState, useTransition } from "react";
import { espace as T } from "@/content/espace";
import { blog as B } from "@/content/espace-blog";
import { creerArticle } from "@/lib/serveur/blog/actions";
import { LANGUES_BLOG, LIMITES_BLOG } from "@/lib/serveur/blog/regles";

// « Nouvel article » : langue et titre, puis le brouillon s'ouvre dans l'éditeur (?id=). Le serveur relit tout.
export function NouvelArticle({ base }: { base: string }) {
  const id = useId();
  const router = useRouter();
  const [langue, setLangue] = useState<string>("FR");
  const [titre, setTitre] = useState("");
  const [erreur, setErreur] = useState("");
  const [n, setN] = useState(0);
  const [occupe, demarrer] = useTransition();
  const vide = !titre.trim();

  const creer = (e: FormEvent) => {
    e.preventDefault();
    setErreur("");
    setN((x) => x + 1);
    if (vide) return setErreur(B.erreurs.champs);
    demarrer(async () => {
      try {
        const r = await creerArticle({ langue, titre });
        if ("ok" in r && r.id) router.push(`${base}?id=${r.id}`);
        else setErreur("erreur" in r ? B.erreurs[r.erreur] : B.erreurs.panne);
      } catch {
        setErreur(B.erreurs.reseau);
      }
    });
  };

  return (
    <section className="bl-nouveau" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`}>{B.nouveau.titre}</h2>
      <form onSubmit={creer} noValidate className="bl-ligne-form">
        <div className="bl-champ">
          <label htmlFor={`${id}-l`}>{B.nouveau.langue}</label>
          <select id={`${id}-l`} value={langue} onChange={(e) => setLangue(e.target.value)}>
            {LANGUES_BLOG.map((l) => (
              <option key={l} value={l}>
                {T.langues[l] ?? l}
              </option>
            ))}
          </select>
        </div>
        <div className="bl-champ large">
          <label htmlFor={`${id}-ti`}>{B.nouveau.titreArticle}</label>
          <input id={`${id}-ti`} type="text" value={titre} maxLength={LIMITES_BLOG.titre} onChange={(e) => setTitre(e.target.value)} aria-describedby={`${id}-a`} aria-invalid={erreur && vide ? true : undefined} required />
          <p className="bl-aide" id={`${id}-a`}>
            {B.nouveau.aide}
          </p>
        </div>
        <button type="submit" className="bouton" disabled={occupe} aria-busy={occupe || undefined} data-action="creer">
          {B.nouveau.creer}
        </button>
      </form>
      <p className="bl-message" role="alert" data-ton="erreur" data-envoi={n}>
        {erreur}
      </p>
    </section>
  );
}
