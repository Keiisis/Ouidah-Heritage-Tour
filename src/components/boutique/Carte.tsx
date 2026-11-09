"use client";

import Image from "next/image";
import Link from "@/components/ui/LienPublic";
import { useEffect, useRef, useState, type CSSProperties, type Ref } from "react";
import { boutique as BOUTIQUE } from "@/content/boutique";
import { useContenu } from "@/components/ui/ContenuSite";
import type { Produit } from "@/lib/boutique-types";
import { basculerFavori, dansLePanier, useFavoris, usePanier } from "@/lib/panier";
import { useBoutique } from "./Cadre";
import { Quantite } from "./Options";
import { Picto } from "./Pictos";
import { Roule } from "./Roule";
import { aChoisir, ficheHref, prix } from "./outils";

// Carte produit photo (H) : deux vues superposées (la 2e en fondu au survol, pointeur fin seulement), étiquette, favori,
// nom, catégorie et matière, prix, couleurs. Trois variantes : article à composer → « Choisir les options » (tiroir) ;
// pièce unique → « Ajouter au panier » sans quantité ; sinon quantité −/+ et « Ajouter ». « Ajouté » 1,5 s après l'ajout.
export function Carte({ p, charge = "lazy", ref }: { p: Produit; charge?: "eager" | "lazy"; ref?: Ref<HTMLLIElement> }) {
  const T = useContenu("boutique.boutique", BOUTIQUE);
  const b = useBoutique();
  const favoris = useFavoris();
  const lignes = usePanier();
  const [qte, setQte] = useState(1);
  const [ajoute, setAjoute] = useState(false);
  const minuterie = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(minuterie.current), []);
  const confirmer = () => {
    setAjoute(true);
    clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => setAjoute(false), 1500);
  };

  const fav = favoris.includes(p.slug);
  const pris = p.unique && dansLePanier(lignes, p.slug);
  const options = aChoisir(p);
  const etat = ajoute ? "ajoute" : pris ? "pris" : options ? "options" : p.unique ? "unique" : "ajouter";
  const rendu = (e: string) =>
    e === "ajoute" || e === "pris" ? (
      <>
        <Picto nom="coche" />
        <span>{e === "ajoute" ? T.carte.ajoute : T.carte.pris}</span>
      </>
    ) : (
      <>
        <Picto nom={e === "options" ? "reglages" : "sac"} />
        <span>{e === "options" ? T.carte.options : e === "unique" ? T.carte.ajouterUnique : qte > 1 ? T.carte.ajouterN(qte) : T.carte.ajouter}</span>
      </>
    );
  const cliquer = () => {
    if (options && !pris) return b.ouvrirOptions(p, confirmer);
    if (b.ajouter(p, qte, {})) {
      confirmer();
      setQte(1);
    }
  };
  const [vue1, vue2] = p.photos;
  const meta = [b.nomCategorie(p.categorie), b.nomMatiere(p.matiere)].filter(Boolean).join(" · ");

  return (
    <li ref={ref} className="carte" data-carte={p.slug}>
      <div className="carte-media">
        <Link className="carte-image" href={ficheHref(p.slug)} tabIndex={-1} aria-hidden="true">
          {vue1 ? <Image src={vue1.url} alt="" fill sizes="(max-width: 700px) 50vw, (max-width: 1180px) 33vw, 25vw" loading={charge} /> : <span className="photo-vide" />}
          {vue2 ? <Image className="vue-2" src={vue2.url} alt="" fill sizes="(max-width: 700px) 50vw, (max-width: 1180px) 33vw, 25vw" /> : null}
        </Link>
        {p.unique ? <span className="carte-etiquette">{T.carte.unique}</span> : p.personnalisable ? <span className="carte-etiquette">{T.carte.personnalisable}</span> : null}
        <button className="coeur" type="button" aria-pressed={fav} aria-label={T.carte.favori(p.nom, fav)} onClick={() => basculerFavori(p.slug)}>
          <Picto nom="coeur" />
        </button>
      </div>
      <h3 className="carte-nom">
        <Link href={ficheHref(p.slug)}>{p.nom}</Link>
      </h3>
      <p className="carte-meta">{meta}</p>
      <div className="carte-ligne">
        <p className="carte-prix">{prix(p.prixXof, b.devise, b.usd, b.langue)}</p>
        {p.coloris.length ? (
          <ul className="couleurs" role="img" aria-label={T.carte.couleurs(p.coloris.map((c) => c.nom))}>
            {p.coloris.map((c) => (
              <li key={c.nom} style={{ "--c": c.hex } as CSSProperties} />
            ))}
          </ul>
        ) : null}
      </div>
      <div className={`ajout ${options || p.unique ? "seul" : ""}`}>
        {options || p.unique ? null : <Quantite n={qte} set={setQte} label={T.carte.quantite(p.nom)} />}
        <button
          className={`ajouter ${pris && !ajoute ? "pris" : ""}`}
          type="button"
          data-ajouter={p.slug}
          disabled={p.stockDisponible === 0}
          aria-haspopup={options && !pris ? "dialog" : undefined}
          aria-label={options || p.unique ? undefined : T.carte.ajouterAria(qte, p.nom)}
          onClick={cliquer}
        >
          {p.stockDisponible === 0 ? T.carte.indisponible : <Roule className="lib" cle={etat} rendu={rendu} />}
          {options || p.unique ? <span className="bq-invisible"> : {p.nom}</span> : null}
        </button>
      </div>
    </li>
  );
}
