"use client";

import Image from "next/image";
import Link from "@/components/ui/LienPublic";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { boutique as BOUTIQUE } from "@/content/boutique";
import { useContenu } from "@/components/ui/ContenuSite";
import type { Produit } from "@/lib/boutique-types";
import { Icon } from "@/components/ui/Icon";
import { Objet3D } from "@/components/ui/Objet3D";
import { aplat, bloquer, calme, useBoutique, type Filtre } from "./Cadre";
import { Carte } from "./Carte";
import { Picto } from "./Pictos";
import { cherche } from "./outils";

// Page /boutique (maquette I) : hero photo de Ouidah au voile navy et titre par masque, catégories (photo puis bandeau de
// leur couleur), toute la boutique (filtres combinables catégorie / matière / couleur, puces, tri, compteur, grille de
// cartes en cascade), engagements. Les filtres demandés ailleurs (barre, méga-menu, ?categorie= &matiere= &q=) arrivent ici.

type Groupe = "cat" | "mat" | "coul";
type Filtres = Record<Groupe, string[]> & { q: string; tri: string };
const AUCUN: Filtres = { cat: [], mat: [], coul: [], q: "", tri: "admin" };
const MONTEE = [{ opacity: 0, transform: "translateY(20px)" }, { opacity: 1, transform: "none" }];

export function Boutique() {
  const T = useContenu("boutique.boutique", BOUTIQUE);
  const b = useBoutique();
  const { produits, categories, matieres } = b.catalogue;
  const [f, setF] = useState<Filtres>(AUCUN);
  const [deroule, setDeroule] = useState<Groupe | null>(null);
  const [panneau, setPanneau] = useState(false);
  const grille = useRef<HTMLUListElement>(null);
  const arreter = useRef<() => void>(() => {});
  const bFiltrer = useRef<HTMLButtonElement>(null);
  const pfX = useRef<HTMLButtonElement>(null);

  // couleurs proposées : celles des articles, une fois chacune (nom affiché, teinte en pastille)
  const couleurs = [...new Map(produits.flatMap((p) => p.coloris).map((c) => [c.nom, c])).values()];
  const GROUPES: { cle: Groupe; nom: string; options: { v: string; nom: string; c?: string }[]; test: (p: Produit, v: string) => boolean }[] = [
    { cle: "cat", nom: T.liste.groupes.cat, options: categories.map((c) => ({ v: c.slug, nom: c.nom })), test: (p, v) => p.categorie === v },
    { cle: "mat", nom: T.liste.groupes.mat, options: matieres.map((m) => ({ v: m.slug, nom: m.nom })), test: (p, v) => p.matiere === v },
    { cle: "coul", nom: T.liste.groupes.coul, options: couleurs.map((c) => ({ v: c.nom, nom: c.nom, c: c.hex })), test: (p, v) => p.coloris.some((c) => c.nom === v) },
  ];
  const correspond = (p: Produit, sauf?: Groupe) => GROUPES.every((g) => g.cle === sauf || !f[g.cle].length || f[g.cle].some((v) => g.test(p, v))) && (!f.q || cherche(p, f.q, b.catalogue));
  const ordreCat = new Map(categories.map((c, i) => [c.slug, i]));
  const TRIS: Record<string, (a: Produit, z: Produit) => number> = {
    admin: (a, z) => produits.indexOf(a) - produits.indexOf(z),
    az: (a, z) => a.nom.localeCompare(z.nom, "fr"),
    za: (a, z) => z.nom.localeCompare(a.nom, "fr"),
    cat: (a, z) => (ordreCat.get(a.categorie) ?? 0) - (ordreCat.get(z.categorie) ?? 0) || produits.indexOf(a) - produits.indexOf(z),
  };
  const vus = produits.filter((p) => correspond(p)).sort(TRIS[f.tri] ?? TRIS.admin);
  const actifs = f.cat.length + f.mat.length + f.coul.length;

  // un changement fait par le visiteur : la cascade s'arrête, les cartes s'affichent sans animation (MOTION-I 2.2)
  const changer = (x: Partial<Filtres> | ((v: Filtres) => Filtres)) => {
    arreter.current();
    setF((v) => (typeof x === "function" ? x(v) : { ...v, ...x }));
  };
  const allerBoutique = useCallback(() => {
    const el = document.getElementById("boutique");
    el?.scrollIntoView({ behavior: calme() ? "auto" : "smooth", block: "start" });
    el?.focus({ preventScroll: true });
  }, []);
  // filtre demandé : remplace les filtres (catégorie, matière, recherche), garde le tri
  const appliquer = useCallback((x: Filtre) => setF((v) => ({ ...AUCUN, tri: v.tri, cat: x.cat ? [x.cat] : [], mat: x.mat ? [x.mat] : [], q: x.q ?? "" })), []);
  useEffect(() => {
    b.ecouterFiltres((x) => {
      arreter.current();
      appliquer(x);
      allerBoutique();
    });
    return () => b.ecouterFiltres(null);
  }, [b, appliquer, allerBoutique]);

  // cascade de la grille (2.2) : une carte entre en fondu + 20 px la première fois qu'elle approche de l'écran ; les cartes
  // arrivées ensemble prennent 0, 75, 150, 225 ms de retard. L'état de repos est l'état final (une carte jamais atteinte
  // reste visible). Déclenchement 40 px avant le bas de l'écran.
  useEffect(() => {
    const cartes = [...(grille.current?.querySelectorAll<HTMLElement>(".carte") ?? [])];
    if (calme() || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (es) =>
        es
          .filter((e) => e.isIntersecting)
          .forEach((e, i) => {
            io.unobserve(e.target);
            e.target.animate(MONTEE, { duration: 600, easing: "cubic-bezier(0,0,.3,1)", fill: "backwards", delay: Math.min(i, 3) * 75 });
          }),
      { rootMargin: "0px 0px 40px 0px" },
    );
    cartes.forEach((c) => io.observe(c));
    arreter.current = () => {
      io.disconnect();
      cartes.forEach((c) => c.getAnimations().forEach((a) => a.finish()));
      arreter.current = () => {};
    };
    return () => io.disconnect();
  }, []);

  // panneau « Filtrer (n) » du mobile
  const ouvrirPanneau = () => {
    setPanneau(true);
    bloquer(true);
    setTimeout(() => pfX.current?.focus({ preventScroll: true }), 60);
  };
  const fermerPanneau = () => {
    setPanneau(false);
    bloquer(false);
    bFiltrer.current?.focus({ preventScroll: true });
  };

  // filtres déroulants : un seul ouvert ; clic ailleurs et Échap ferment (le focus revient au bouton)
  useEffect(() => {
    if (!deroule && !panneau) return;
    const dehors = (e: PointerEvent) => deroule && !(e.target as Element).closest?.(".filtre") && setDeroule(null);
    const echap = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (deroule) {
        document.querySelector<HTMLElement>(`[data-groupe="${deroule}"] .filtre-b`)?.focus();
        setDeroule(null);
      }
      if (panneau) fermerPanneau();
    };
    document.addEventListener("pointerdown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("keydown", echap);
    };
  });
  const basculer = (g: Groupe, v: string, oui: boolean) => changer((x) => ({ ...x, [g]: oui ? [...x[g], v] : x[g].filter((y) => y !== v) }));
  const toutEffacer = () => changer((x) => ({ ...AUCUN, tri: x.tri }));
  type Puce = { g: Groupe | "q"; v: string; nom: string; c?: string };
  const puces: Puce[] = [
    ...GROUPES.flatMap((g) => f[g.cle].map((v) => ({ g: g.cle, v, nom: g.options.find((o) => o.v === v)?.nom ?? v, c: g.options.find((o) => o.v === v)?.c }))),
    ...(f.q ? [{ g: "q" as const, v: f.q, nom: T.liste.recherche(f.q) }] : []),
  ];
  const retirer = (x: Puce) => {
    if (x.g === "q") changer({ q: "" });
    else basculer(x.g, x.v, false);
    document.getElementById("compteur")?.focus({ preventScroll: true });
  };
  const parCat = (slug: string) => produits.filter((p) => p.categorie === slug).length;
  const avant = produits.filter((p) => p.categorie === T.miseEnAvant.categorie);
  const matieresAvant = [...new Set(avant.map((p) => b.nomMatiere(p.matiere).toLowerCase()))].filter(Boolean);

  return (
    <>
      <Suspense fallback={null}>
        <DepuisUrl appliquer={appliquer} />
      </Suspense>

      <section className="hero" aria-labelledby="bq-hero-titre">
        <Image className="hero-photo" src={T.hero.photo.src} alt={T.hero.photo.alt} fill sizes="100vw" loading="eager" fetchPriority="high" />
        <div className="container-oht hero-in">
          <h1 id="bq-hero-titre">
            {T.hero.titre.map((l, i) => (
              <span key={l} className="titre-ligne" style={{ "--i": i } as CSSProperties}>
                <span>{l}</span>
              </span>
            ))}
          </h1>
          <p className="hero-phrase">{T.hero.phrase}</p>
          {/* catalogue vide : aucun bouton qui défilerait vers rien */}
          {produits.length ? (
          <a
            className="b-soleil hero-b"
            href="#boutique"
            onClick={(e) => {
              e.preventDefault();
              allerBoutique();
            }}
          >
            {T.hero.bouton}
            <Icon name="arrow-right" />
          </a>
          ) : null}
        </div>
      </section>

      {produits.length ? (
      <>
      <section className="section container-oht" aria-labelledby="bq-cat-titre">
        <div className="section-tete">
          <h2 id="bq-cat-titre">{T.categories.titre}</h2>
        </div>
        <div className="collections">
          {categories.map((c, i) => (
            <button key={c.slug} className="collection" type="button" style={{ "--i": i } as CSSProperties} aria-label={`${c.nom}, ${T.pieces(parCat(c.slug))}`} onClick={() => b.filtrer({ cat: c.slug })}>
              <span className="collection-photo">{c.photo ? <Image src={c.photo.url} alt="" fill sizes="(max-width: 960px) 50vw, 25vw" loading="eager" /> : <span className="photo-vide" />}</span>
              <span className={`collection-bas ${aplat(c.couleur, i)}`}>
                <span>
                  <span className="collection-nom">{c.nom}</span>
                  <span className="collection-n">{T.pieces(parCat(c.slug))}</span>
                </span>
                <span className="collection-fleche">
                  <Icon name="arrow-right" />
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="container-oht" id="boutique" aria-labelledby="bq-liste-titre" tabIndex={-1}>
        <div className="section-tete">
          <h2 id="bq-liste-titre">{T.liste.titre}</h2>
        </div>
        <div className="filtres">
          <button ref={bFiltrer} className="filtrer" type="button" aria-expanded={panneau} aria-controls="bq-panneau-filtres" onClick={ouvrirPanneau}>
            <Picto nom="reglages" />
            <span>
              {T.liste.filtrer} ({actifs})
            </span>
          </button>
          <div className={`panneau-filtres ${panneau ? "ouvert" : ""}`} id="bq-panneau-filtres" role="group" aria-label={T.liste.filtres} data-lenis-prevent>
            <div className="pf-tete">
              <p className="pf-titre">{T.liste.filtres}</p>
              <button ref={pfX} className="pf-x" type="button" aria-label={T.liste.fermerFiltres} onClick={fermerPanneau}>
                <Icon name="close" />
              </button>
            </div>
            <div className="pf-corps">
              {GROUPES.map((g) => {
                const n = f[g.cle].length;
                return (
                  <div key={g.cle} className={`filtre ${deroule === g.cle ? "ouvert" : ""}`} data-groupe={g.cle}>
                    <button className={`filtre-b ${n ? "actif" : ""}`} type="button" aria-expanded={deroule === g.cle} aria-controls={`bq-panneau-${g.cle}`} aria-label={`${g.nom}${n ? T.liste.choisis(n) : ""}`} onClick={() => setDeroule(deroule === g.cle ? null : g.cle)}>
                      {g.nom}
                      {n ? <span className="nb">{n}</span> : null}
                      <Picto nom="chevron" />
                    </button>
                    <div className="filtre-panneau" id={`bq-panneau-${g.cle}`}>
                      <fieldset>
                        <legend>{g.nom}</legend>
                        {g.options.map((o) => {
                          const compte = produits.filter((p) => correspond(p, g.cle) && g.test(p, o.v)).length;
                          return (
                            <label key={o.v} className={`option ${compte ? "" : "zero"}`}>
                              <input type="checkbox" value={o.v} checked={f[g.cle].includes(o.v)} onChange={(e) => basculer(g.cle, o.v, e.target.checked)} />
                              {o.c ? <span className="pastille-c" style={{ "--c": o.c } as CSSProperties} /> : null}
                              <span>{o.nom}</span>
                              <span className="n">{compte}</span>
                            </label>
                          );
                        })}
                      </fieldset>
                      <div className="panneau-pied">
                        <button className="lien-b" type="button" onClick={() => changer((x) => ({ ...x, [g.cle]: [] }))}>
                          {T.liste.effacer}
                        </button>
                        <button
                          className="lien-b"
                          type="button"
                          onClick={() => {
                            setDeroule(null);
                            document.querySelector<HTMLElement>(`[data-groupe="${g.cle}"] .filtre-b`)?.focus();
                          }}
                        >
                          {T.liste.fermer}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="pf-pied">
              <button className="lien-b" type="button" onClick={toutEffacer}>
                {T.liste.toutEffacer}
              </button>
              <button
                className="b-soleil"
                type="button"
                onClick={() => {
                  fermerPanneau();
                  allerBoutique();
                }}
              >
                {T.liste.voir(vus.length)}
              </button>
            </div>
          </div>
          <div className="filtres-droite">
            <p className="compteur" id="compteur" tabIndex={-1}>
              {T.pieces(vus.length)}
            </p>
            <label className="tri">
              <span className="tri-txt">{T.liste.trier}</span>
              <select value={f.tri} onChange={(e) => changer({ tri: e.target.value })}>
                {T.liste.tris.map((t) => (
                  <option key={t.v} value={t.v}>
                    {t.l}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {puces.length ? (
          <div className="puces">
            {puces.map((x) => (
              <button key={`${x.g}:${x.v}`} className="puce" type="button" aria-label={T.liste.retirerFiltre(x.nom)} onClick={() => retirer(x)}>
                {x.c ? <span className="rond-c" style={{ "--c": x.c } as CSSProperties} /> : null}
                {x.nom}
                <span className="x" aria-hidden="true">
                  <Icon name="close" />
                </span>
              </button>
            ))}
            <button className="lien-b" type="button" onClick={toutEffacer}>
              {T.liste.toutEffacer}
            </button>
          </div>
        ) : null}
        <p className="bq-invisible" aria-live="polite">
          {T.liste.annonce(vus.length)}
        </p>
        <ul className="grille" id="grille" ref={grille}>
          {vus.map((p) => (
            <Carte key={p.slug} p={p} />
          ))}
        </ul>
        {vus.length ? null : (
          <div className="vide">
            <p>{T.liste.vide}</p>
            <button className="b-soleil" type="button" onClick={toutEffacer}>
              {T.liste.toutEffacer}
            </button>
          </div>
        )}
      </section>
      </>
      ) : (
        <section className="section container-oht" id="boutique" aria-label={T.liste.titre}>
          <div className="vide">
            <p>{T.liste.catalogueVide}</p>
            <p className="vide-suites">
              <Link className="b-soleil" href={T.liste.catalogueVideLettre.href}>
                {T.liste.catalogueVideLettre.label}
                <Icon name="arrow-right" />
              </Link>
              <Link className="b-lien" href={T.liste.catalogueVideVoyage.href}>
                {T.liste.catalogueVideVoyage.label}
              </Link>
            </p>
          </div>
        </section>
      )}

      {avant.length ? (
        <section className="section container-oht mise" aria-labelledby="bq-mise-titre">
          <figure className="mise-photo">
            <Image src={T.miseEnAvant.photo.src} alt={T.miseEnAvant.photo.alt} fill sizes="(max-width: 960px) 100vw, 55vw" />
          </figure>
          <div className="mise-txt">
            <h2 id="bq-mise-titre">{T.miseEnAvant.titre}</h2>
            <p>{T.miseEnAvant.texte(avant.length, matieresAvant)}</p>
            <ul className="lignes">
              {avant.slice(0, 2).map((p) => (
                <Carte key={p.slug} p={p} />
              ))}
            </ul>
            <button className="lien-b lien-fleche" type="button" onClick={() => b.filtrer({ cat: T.miseEnAvant.categorie })}>
              {T.miseEnAvant.voir(avant.length)}
              <Icon name="arrow-right" />
            </button>
          </div>
        </section>
      ) : null}

      <section className="section reassurance" id="reassurance" aria-label={T.reassurance.label}>
        <ul className="container-oht">
          {T.reassurance.points.map((r) => (
            <li key={r.titre}>
              <Objet3D nom={r.objet} taille={96} />
              <h3>{r.titre}</h3>
              <p>{r.texte}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

// ?categorie= &matiere= &q= (liens de la fiche, de la recherche ou du méga-menu depuis une autre page)
function DepuisUrl({ appliquer }: { appliquer: (f: Filtre) => void }) {
  const u = useSearchParams();
  const cat = u.get("categorie") ?? "", mat = u.get("matiere") ?? "", q = u.get("q") ?? "";
  useEffect(() => {
    if (cat || mat || q) appliquer({ cat, mat, q });
  }, [cat, mat, q, appliquer]);
  return null;
}
