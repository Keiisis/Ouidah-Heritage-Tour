"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useState, useTransition } from "react";
import { Objet3D, type NomObjet } from "@/components/ui/Objet3D";
import { logos } from "@/content/espace";
import type { LangueMsg } from "@/content/espace-messages";
import { ABONNEMENT } from "@/content/lettre-abonnement";
import { changerAbonnement, quitterLettre, reinscrire, type RetourAbonnement } from "@/lib/serveur/equipe/messages/abonnement";
import "./abonnement.css";

// Page publique « Votre abonnement à la lettre de Ouidah », dans la langue de l'abonné : la nuit navy de la page de
// désinscription, puis les cartes de thèmes de la section 12 (objet 3D, coche Soleil) et les langues en pastilles. Rien ne
// change à l'affichage, seulement aux boutons. Abonné actif : ses thèmes et sa langue, cochés tels qu'il les a choisis.
// Désinscrit : aucun thème coché d'avance, accord à cocher pour se réinscrire.
type Theme = { id: string; nom: string; texte: string; objet: NomObjet };
type Etat = "attente" | "enregistre" | "desinscrit" | "reinscrit" | "aucun" | "accord" | "etat" | "expire" | "erreur";
export function Abonnement(p: { jeton: string; langue: LangueMsg; email: string; inscrit: boolean; sujets: string[]; themes: Theme[]; langues: { code: string; nom: string }[]; expire: boolean; jours: number; accueil: string }) {
  const A = ABONNEMENT[p.langue];
  const [inscrit, setInscrit] = useState(p.inscrit);
  const [choix, setChoix] = useState<string[]>(p.inscrit ? p.sujets : []);
  const [langue, setLangue] = useState<string>(p.langue);
  const [accord, setAccord] = useState(false);
  const [etat, setEtat] = useState<Etat>(p.expire ? "expire" : "attente");
  const [occupe, demarrer] = useTransition();

  const issue = (r: RetourAbonnement, reussi: Etat) => (r === "fait" ? reussi : r === "incomplet" ? "aucun" : r);
  const lancer = (f: () => Promise<Etat>) =>
    demarrer(async () => {
      try {
        setEtat(await f());
      } catch {
        setEtat("erreur");
      }
    });
  const basculer = (id: string) => setChoix((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  function enregistrer(e: FormEvent) {
    e.preventDefault();
    if (!choix.length) return setEtat("aucun");
    if (!inscrit && !accord) return setEtat("accord");
    lancer(async () => {
      if (inscrit) return issue(await changerAbonnement(p.jeton, { langue, sujets: choix }), "enregistre");
      const r = issue(await reinscrire(p.jeton, { langue, sujets: choix }, true), "reinscrit");
      if (r === "reinscrit") setInscrit(true);
      return r;
    });
  }
  const quitter = () =>
    lancer(async () => {
      const r = issue(await quitterLettre(p.jeton), "desinscrit");
      if (r === "desinscrit") {
        setInscrit(false);
        setChoix([]);
        setAccord(false);
      }
      return r;
    });

  if (etat === "expire")
    return (
      <main className="lettre-abonnement" lang={p.langue.toLowerCase()}>
        <div className="colonne">
          <Image className="embleme" src={logos.enteteMobile.src} alt={logos.enteteMobile.alt} width={logos.enteteMobile.largeur} height={logos.enteteMobile.hauteur} sizes="64px" priority />
          <h1>{A.expireTitre}</h1>
          <p className="situation">{A.expireTexte(p.jours)}</p>
          <p className="situation">{A.expireDesinscription}</p>
          <div className="actions">
            <Link className="bouton principal" href={p.accueil}>{A.nouveauLien}</Link>
          </div>
        </div>
      </main>
    );

  const succes = etat === "enregistre" || etat === "desinscrit" || etat === "reinscrit";
  const faute = etat === "aucun" ? A.aucun : etat === "accord" ? A.accordManque : etat === "etat" ? A.etat : etat === "erreur" ? A.erreur : null;
  return (
    <main className="lettre-abonnement" lang={p.langue.toLowerCase()}>
      <div className="colonne">
        <Image className="embleme" src={logos.enteteMobile.src} alt={logos.enteteMobile.alt} width={logos.enteteMobile.largeur} height={logos.enteteMobile.hauteur} sizes="64px" priority />
        <h1>{A.titre}</h1>
        <p className="situation" data-inscrit={inscrit}>{inscrit ? A.recoit(p.email) : A.recoitPlus(p.email)}</p>
        <p className="confirme" role="status" data-etat={succes ? etat : undefined}>
          {etat === "enregistre" ? A.enregistre : etat === "desinscrit" ? A.desinscrit : etat === "reinscrit" ? A.reinscrit : ""}
        </p>

        <form onSubmit={enregistrer} noValidate aria-describedby="abonnement-faute">
          <fieldset>
            <legend>
              {A.themes} <span>({A.auMoinsUn})</span>
            </legend>
            <div className="themes">
              {p.themes.map((t) => {
                const on = choix.includes(t.id);
                return (
                  <label key={t.id} className="theme" data-on={on || undefined}>
                    <input type="checkbox" name="sujets" value={t.id} className="sr-only" checked={on} onChange={() => basculer(t.id)} aria-invalid={etat === "aucun" || undefined} />
                    <Objet3D nom={t.objet} taille={72} />
                    <span className="coche" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M6 12.5l4 4L18 8" pathLength={1} />
                      </svg>
                    </span>
                    <span className="nom">{t.nom}</span>
                    <span className="texte">{t.texte}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend>{A.langue}</legend>
            <div className="langues">
              {p.langues.map((l) => (
                <label key={l.code} className="langue" data-on={l.code === langue || undefined} lang={l.code.toLowerCase()}>
                  <input type="radio" name="langue" value={l.code} className="sr-only" checked={l.code === langue} onChange={() => setLangue(l.code)} />
                  {l.nom}
                </label>
              ))}
            </div>
          </fieldset>

          {!inscrit && (
            <label className="accord">
              <input type="checkbox" name="accord" checked={accord} onChange={(e) => setAccord(e.target.checked)} aria-invalid={etat === "accord" || undefined} />
              <span>{A.accord}</span>
            </label>
          )}

          <p id="abonnement-faute" className="faute" role="alert">{faute ?? ""}</p>
          <div className="actions">
            <button type="submit" id={inscrit ? "enregistrer" : "reinscrire"} className="principal" disabled={occupe} aria-busy={occupe}>
              {occupe ? A.envoi : inscrit ? A.enregistrer : A.reinscrire}
            </button>
          </div>
        </form>

        {inscrit && (
          <section className="quitter" aria-labelledby="abonnement-quitter">
            <h2 id="abonnement-quitter">{A.quitter}</h2>
            <button type="button" id="quitter" className="secondaire" disabled={occupe} onClick={quitter}>
              {A.desinscrire}
            </button>
          </section>
        )}
        <Link className="retour" href={p.accueil.replace(/#.*$/, "")}>{A.retour}</Link>
      </div>
    </main>
  );
}
