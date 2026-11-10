import Image from "next/image";
import { ButtonPrimary, LinkLine } from "@/components/ui/Buttons";
import { EquivalentDevise } from "@/components/ui/EquivalentDevise";
import { lireContenuPage as lireContenu } from "@/lib/serveur/contenu-page";
import { CarteTrace } from "./CarteTrace";
import type { Fiche, Photo } from "./fiche";
import "./fiche-circuit.css";

// Fiche circuit, piste A « Le tracé » (Kevin, 30/10/2026) : bande photo pleine largeur, puis les récits des étapes à gauche
// et la carte du vrai tracé collée à droite (bandeau collant sous 1024 px), puis le bloc « Réserver » sur navy.
// Rendu serveur ; seul le mouvement de la carte (CarteTrace) est côté client. Une donnée vide n'est pas affichée.

async function Actions({ slug, clair = false }: { slug: string; clair?: boolean }) {
  const T = await lireContenu("fiche-circuit.ficheCircuit");
  return (
    <div className="fc-actions">
      <ButtonPrimary href={T.reserver.href(slug)} dark={clair}>
        {T.reserver.label}
      </ButtonPrimary>
      <LinkLine href={T.personnaliser.href(slug)}>{T.personnaliser.label}</LinkLine>
    </div>
  );
}

function Figure({ p }: { p: Photo }) {
  return (
    <figure className="fc-photo">
      <div className="fc-cadre" style={{ aspectRatio: p.largeur && p.hauteur ? `${p.largeur} / ${p.hauteur}` : "3 / 2" }}>
        <Image src={p.src} alt={p.alt} fill sizes="(min-width: 1024px) 50vw, 100vw" />
      </div>
      {p.legende ? (
        <figcaption>
          {p.legende}
          {p.annee ? <span className="fc-annee">{p.annee}</span> : null}
        </figcaption>
      ) : null}
    </figure>
  );
}

export async function FicheCircuit({ f }: { f: Fiche }) {
  const T = await lireContenu("fiche-circuit.ficheCircuit");
  const C = f.circuit;
  return (
    <div className="fc">
      <section className="fc-ouverture" aria-labelledby="fc-titre">
        <div className="fc-bande">
          {f.ouverture ? <Image src={f.ouverture.src} alt={f.ouverture.alt} fill preload sizes="100vw" /> : null}
          <div className="fc-voile" />
          <div className="container-oht fc-bande-texte">
            <h1 id="fc-titre">{C.title}</h1>
            <p className="fc-theme">{f.theme}</p>
          </div>
        </div>
        <div className="container-oht fc-intro">
          {f.chapo ? <p className="fc-chapo">{f.chapo}</p> : <div />}
          <div>
            <p className="fc-resume">{f.resume}</p>
            {f.trajet ? <p className="fc-trajet">{f.trajet}</p> : null}
            <p className="fc-conditions">
              {f.conditions}
              <EquivalentDevise xof={C.priceVisible ? C.price : null} />
            </p>
            <Actions slug={C.slug} />
          </div>
        </div>
      </section>

      <CarteTrace carte={f.carte} nord={T.carte.nord} aria={T.carte.aria}>
        <ol className="fc-etapes" aria-label={T.etapesAria}>
          {f.etapes.map((e) => (
            <li key={e.nom} className={`fc-etape fc-${e.type}`} data-fc-etape="">
              <div className="fc-tete">
                <span className="fc-num" aria-hidden="true">
                  {e.n ? String(e.n).padStart(2, "0") : null}
                </span>
                <div>
                  <h2>{e.nom}</h2>
                  {e.borne ? <p className="fc-borne">{e.borne}</p> : null}
                </div>
              </div>
              {e.photo ? <Figure p={e.photo} /> : null}
              {e.recit.length ? (
                <div className="fc-texte">
                  {e.recit.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                </div>
              ) : null}
              {e.lienLieu ? (
                <p className="fc-lieu">
                  <LinkLine href={e.lienLieu}>{T.voirLieu}</LinkLine>
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </CarteTrace>

      <section className="fc-reserver on-dark" aria-labelledby="fc-titre-reserver">
        <div className="container-oht fc-reserver-grille">
          <h2 id="fc-titre-reserver">{C.title}</h2>
          <div>
            <p className="fc-conditions">
              {f.conditions}
              <EquivalentDevise xof={C.priceVisible ? C.price : null} />
            </p>
            {f.marche ? <p className="fc-marche">{f.marche}</p> : null}
            <Actions slug={C.slug} clair />
            {f.chapitre ? (
              <p className="fc-chapitre">
                <LinkLine href={f.chapitre.href}>{f.chapitre.texte}</LinkLine>
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
