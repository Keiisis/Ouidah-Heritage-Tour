"use client";
import { adresseLangue } from "@/lib/adresses-langues";

import Image from "next/image";
import Link from "@/components/ui/LienPublic";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent as ClavierReact, type ReactNode } from "react";
import { boutique as BOUTIQUE } from "@/content/boutique";
import { useContenu, useLangue } from "@/components/ui/ContenuSite";
import type { Catalogue, ChoixOptions, Produit } from "@/lib/boutique-types";
import { useDevise } from "@/lib/devise";
import { ajouterAuPanier, lirePanier, nbArticles, usePanier } from "@/lib/panier";
import { Icon } from "@/components/ui/Icon";
import { Chariot, Picto } from "./Pictos";
import { Roule } from "./Roule";
import { AjoutRapide, TiroirPanier } from "./Tiroirs";
import { boutiqueHref, cherche, ficheHref, mots, norm, prix, resume } from "./outils";

// Enveloppe des pages /boutique : barre Océan collante sous l'en-tête du site (recherche, devise, panier, retrait),
// sous-navigation Nuit (tiroir « Tout », méga-menus), popover « Ajouté au panier », tiroirs (options, panier, commande).
// Le catalogue vient de l'admin (lireCatalogue) ; le panier vit sur l'appareil (lib/panier). Aucun envol vers le panier.

export type Filtre = { cat?: string; mat?: string; q?: string };
type Etape = "panier" | "commande";
type Pop = { p: Produit; n: number; o: ChoixOptions; refus: boolean };

type Boutique = {
  langue: ReturnType<typeof useLangue>;
  catalogue: Catalogue;
  produit: (slug: string) => Produit | undefined;
  nomCategorie: (slug: string) => string;
  nomMatiere: (slug: string) => string;
  devise: string;
  /** FCFA pour 1 $ (saisi par l'admin), null sans taux : à passer à prix(). */
  usd: number | null;
  /** Ajoute au panier, montre le popover et l'annonce ; faux (avec un message) pour une pièce unique déjà prise. */
  ajouter: (p: Produit, n: number, o: ChoixOptions) => boolean;
  /** Tiroir d'ajout rapide ; `apres` est appelé si l'article a bien été ajouté (bouton « Ajouté » de la carte). */
  ouvrirOptions: (p: Produit, apres?: () => void) => void;
  ouvrirPanier: (etape?: Etape) => void;
  /** Filtre la grille de /boutique (ou y mène avec les paramètres depuis une autre page). */
  filtrer: (f: Filtre) => void;
  ecouterFiltres: (f: ((f: Filtre) => void) | null) => void;
};
const Contexte = createContext<Boutique | null>(null);
export function useBoutique() {
  const b = useContext(Contexte);
  if (!b) throw new Error("useBoutique hors de <Cadre>");
  return b;
}

// lu au moment du mouvement (comme calme() de la maquette)
export const calme = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// garde le focus clavier dans un tiroir ouvert (Tab et Maj+Tab bouclent)
export function pieger(e: ClavierReact, boite: HTMLElement | null) {
  if (e.key !== "Tab" || !boite) return;
  const f = [...boite.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([type=hidden]):not([tabindex='-1']), select, textarea, summary, [tabindex='0']")].filter((x) => x.offsetParent !== null);
  if (!f.length) return;
  const [premier, dernier] = [f[0], f[f.length - 1]];
  if (e.shiftKey && document.activeElement === premier) {
    e.preventDefault();
    dernier.focus();
  } else if (!e.shiftKey && document.activeElement === dernier) {
    e.preventDefault();
    premier.focus();
  }
}
// défilement de la page bloqué pendant qu'un tiroir est ouvert
export const bloquer = (oui: boolean) => (document.documentElement.style.overflow = oui ? "hidden" : "");

const APLATS = ["c-laterite", "c-ocean", "c-sun", "c-ochre"] as const;
export const aplat = (couleur: string, i: number) => (APLATS.includes(`c-${couleur}` as (typeof APLATS)[number]) ? `c-${couleur}` : APLATS[i % APLATS.length]);

export function Cadre({ catalogue, children }: { catalogue: Catalogue; children: ReactNode }) {
  const T = useContenu("boutique.boutique", BOUTIQUE);
  const router = useRouter();
  const langue = useLangue();
  const [devise, , , usd] = useDevise();
  const ecouteur = useRef<((f: Filtre) => void) | null>(null);
  const retour = useRef<HTMLElement | null>(null);
  const [rapide, setRapide] = useState<{ p: Produit; ouvert: boolean; n: number; apres?: () => void } | null>(null);
  const [panier, setPanier] = useState<{ ouvert: boolean; etape: Etape }>({ ouvert: false, etape: "panier" });
  const [pop, setPop] = useState<(Pop & { ouvert: boolean }) | null>(null);
  const [annonce, setAnnonce] = useState("");
  const [menu, setMenu] = useState(false);
  const minuterie = useRef<ReturnType<typeof setTimeout>>(undefined);

  const index = useMemo(() => new Map(catalogue.produits.map((p) => [p.slug, p])), [catalogue]);
  const cats = useMemo(() => new Map(catalogue.categories.map((c) => [c.slug, c.nom])), [catalogue]);
  const mats = useMemo(() => new Map(catalogue.matieres.map((m) => [m.slug, m.nom])), [catalogue]);

  // popover : se ferme seul après 4 s, sauf survol ou focus dedans
  const armer = useCallback(() => {
    clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => setPop((x) => x && { ...x, ouvert: false }), 4000);
  }, []);
  const fermerPop = useCallback(() => {
    clearTimeout(minuterie.current);
    setPop((x) => x && { ...x, ouvert: false });
  }, []);
  const suspendre = useCallback(() => clearTimeout(minuterie.current), []);

  const valeur = useMemo<Boutique>(() => {
    const ajouter = (p: Produit, n: number, o: ChoixOptions) => {
      const deja = lirePanier().filter((l) => l.slug === p.slug).reduce((q, l) => q + l.quantite, 0);
      if (p.stockDisponible != null && deja + (p.unique ? 1 : n) > p.stockDisponible) {
        setAnnonce(T.carte.stockInsuffisant);
        return false;
      }
      const ok = ajouterAuPanier(p.slug, n, o, p.unique);
      const q = p.unique ? 1 : n;
      setPop({ p, n: q, o, refus: !ok, ouvert: true });
      armer();
      setAnnonce(ok ? T.popover.annonce([p.nom, resume(o, T)].filter(Boolean).join(", "), q, nbArticles(lirePanier())) : T.popover.refusTexte(p.nom));
      return ok;
    };
    return {
      catalogue,
      produit: (slug) => index.get(slug),
      nomCategorie: (slug) => cats.get(slug) ?? "",
      nomMatiere: (slug) => mats.get(slug) ?? "",
      devise,
      usd,
      langue,
      ajouter,
      ouvrirOptions: (p, apres) => {
        retour.current = document.activeElement as HTMLElement | null;
        setRapide((x) => ({ p, ouvert: true, n: (x?.n ?? 0) + 1, apres }));
      },
      ouvrirPanier: (etape = "panier") => {
        fermerPop();
        if (!(document.activeElement as HTMLElement | null)?.closest?.(".tiroir")) retour.current = document.activeElement as HTMLElement | null;
        setPanier({ ouvert: true, etape });
      },
      filtrer: (f) => {
        setMenu(false);
        if (ecouteur.current) ecouteur.current(f);
        else router.push(adresseLangue(boutiqueHref(f), langue));
      },
      ecouterFiltres: (f) => {
        ecouteur.current = f;
      },
    };
  }, [catalogue, index, cats, mats, devise, usd, armer, fermerPop, router, T, langue]);

  const fermerRapide = (rendre = true) => {
    setRapide((x) => x && { ...x, ouvert: false });
    if (rendre) retour.current?.focus({ preventScroll: true });
  };
  const fermerPanier = () => {
    setPanier((x) => ({ ...x, ouvert: false }));
    retour.current?.focus({ preventScroll: true });
  };

  return (
    <Contexte.Provider value={valeur}>
      <div className="bq">
        <div aria-hidden="true" className="bq-bande" />
        <Entete pop={pop} fermerPop={fermerPop} armer={armer} suspendre={suspendre} menu={menu} setMenu={setMenu} />
        {children}
        <AjoutRapide etat={rapide} fermer={fermerRapide} />
        <TiroirPanier ouvert={panier.ouvert} etape={panier.etape} setEtape={(etape) => setPanier((x) => ({ ...x, etape }))} fermer={fermerPanier} />
        <p className="bq-invisible" aria-live="polite">
          {annonce}
        </p>
      </div>
    </Contexte.Provider>
  );
}

// ---------- barre Océan + sous-navigation Nuit ----------
function Entete({ pop, fermerPop, armer, suspendre, menu, setMenu }: { pop: (Pop & { ouvert: boolean }) | null; fermerPop: () => void; armer: () => void; suspendre: () => void; menu: boolean; setMenu: (o: boolean) => void }) {
  const T = useContenu("boutique.boutique", BOUTIQUE);
  const b = useBoutique();
  const [devise, setDevise, devises] = useDevise();
  const suivante = devises[(devises.findIndex((c) => c.code === devise) + 1) % devises.length].code;
  const lignes = usePanier();
  const n = nbArticles(lignes);
  const ouvreurMenu = useRef<HTMLElement | null>(null);
  const menuX = useRef<HTMLButtonElement>(null);
  const boiteMenu = useRef<HTMLDivElement>(null);

  const ouvrirMenu = (e: { currentTarget: HTMLElement }) => {
    ouvreurMenu.current = e.currentTarget;
    setMenu(true);
  };
  useEffect(() => {
    if (!menu) return;
    bloquer(true);
    const t = setTimeout(() => menuX.current?.focus(), 60);
    const echap = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenu(false);
      ouvreurMenu.current?.focus();
    };
    document.addEventListener("keydown", echap);
    return () => {
      clearTimeout(t);
      bloquer(false);
      document.removeEventListener("keydown", echap);
    };
  }, [menu, setMenu]);

  return (
    <>
      <div className="tete-boutique">
        <div className="tete" role="region" aria-label={T.barre.region}>
          <div className="container-oht tete-in">
            <button className="burger" type="button" aria-expanded={menu} aria-controls="bq-menu-tout" aria-label={T.nav.toutAria} onClick={ouvrirMenu}>
              <Icon name="menu" />
            </button>
            <Link className="bq-nom" href={T.barre.accueil.href}>
              {T.barre.accueil.label}
            </Link>
            <Recherche />
            <div className="tete-act">
              <button className="dev" type="button" aria-label={T.barre.devise(devise, suivante)} onClick={() => setDevise(suivante)}>
                {devises.map((c) => (
                  <span key={c.code} className={devise === c.code ? "on" : ""}>
                    {T.barre.symbole[c.code as keyof typeof T.barre.symbole]}
                  </span>
                ))}
              </button>
              <div className="panier-zone">
                <button className="panier-btn" id="bq-panier" type="button" aria-label={T.barre.panierAria(n)} onClick={() => b.ouvrirPanier()}>
                  <span className="panier-ico">
                    <Chariot />
                    <span className="panier-n" aria-hidden="true">
                      <Roule cle={String(n)} rendu={(c) => c} />
                    </span>
                  </span>
                  <span className="txt">{T.barre.panier}</span>
                </button>
                <Popover pop={pop} fermer={fermerPop} armer={armer} suspendre={suspendre} />
              </div>
              <p className="retrait">
                <Icon name="pin" />
                <span>
                  {T.barre.retrait[0]}
                  <b>{T.barre.retrait[1]}</b>
                </span>
              </p>
            </div>
          </div>
        </div>
        <SousNav ouvrirMenu={ouvrirMenu} menu={menu} />
      </div>

      {/* tiroir « Tout » : les catégories en accordéon (le méga-menu du mobile) */}
      <div className={`menu-tout ${menu ? "ouvert" : ""}`} id="bq-menu-tout" inert={!menu} data-lenis-prevent onClick={(e) => e.target === e.currentTarget && setMenu(false)}>
        <div ref={boiteMenu} className="menu-tout-in" role="dialog" aria-modal="true" aria-labelledby="bq-menu-titre" onKeyDown={(e) => pieger(e, boiteMenu.current)}>
          <div className="menu-tout-tete">
            <h2 id="bq-menu-titre">{T.nav.menuTitre}</h2>
            <button ref={menuX} className="menu-x" type="button" aria-label={T.nav.fermerMenu} onClick={() => (setMenu(false), ouvreurMenu.current?.focus())}>
              <Icon name="close" />
            </button>
          </div>
          {b.catalogue.categories.map((c) => (
            <details key={c.slug}>
              <summary>
                <span>
                  {c.nom}
                  <span className="n">{b.catalogue.produits.filter((p) => p.categorie === c.slug).length}</span>
                </span>
                <Picto nom="chevron" />
              </summary>
              <ul>
                <LiensMatieres cat={c.slug} />
              </ul>
            </details>
          ))}
          <ul className="menu-bas">
            <li>
              <button className="mega-lien fort" type="button" onClick={() => b.filtrer({})} aria-label={`${T.nav.touteLaBoutique}, ${T.pieces(b.catalogue.produits.length)}`}>
                {T.nav.touteLaBoutique}
                <span className="n">{b.catalogue.produits.length}</span>
              </button>
            </li>
            <li>
              <Link className="mega-lien" href="/boutique#reassurance" onClick={() => setMenu(false)}>
                {T.nav.retraitLien}
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}

// liens « matière (n) » d'une catégorie, puis « Tout voir (n) »
function LiensMatieres({ cat }: { cat: string }) {
  const T = useContenu("boutique.boutique", BOUTIQUE);
  const b = useBoutique();
  const pieces = b.catalogue.produits.filter((p) => p.categorie === cat);
  const lien = (mat: string, nom: string, n: number, fort = false) => (
    <li key={mat || "tout"}>
      <button className={`mega-lien ${fort ? "fort" : ""}`} type="button" aria-label={`${nom}, ${T.pieces(n)}`} onClick={() => b.filtrer({ cat, mat })}>
        {nom}
        <span className="n">{n}</span>
      </button>
    </li>
  );
  return (
    <>
      {b.catalogue.matieres.map((m) => ({ m, n: pieces.filter((p) => p.matiere === m.slug).length })).filter((x) => x.n).map(({ m, n }) => lien(m.slug, m.nom, n))}
      {lien("", T.nav.toutVoir, pieces.length, true)}
    </>
  );
}

// ---------- recherche : suggestions pendant la frappe (vignette, nom, prix), clavier, insensible aux accents ----------
function Recherche() {
  const T = useContenu("boutique.boutique", BOUTIQUE);
  const b = useBoutique();
  const router = useRouter();
  const langue = useLangue();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(-1);
  const v = q.trim();
  const tous = v ? b.catalogue.produits.filter((p) => (!cat || p.categorie === cat) && cherche(p, v, b.catalogue)) : [];
  const r = tous.slice(0, 6);
  const options = r.length ? r.length + 1 : 0; // + « Voir les n pièces »
  const montre = ouvert && !!v;

  const surligner = (nom: string) => {
    const w = mots(v)[0];
    const i = w ? norm(nom).indexOf(w) : -1;
    return i < 0 ? nom : (
      <>
        {nom.slice(0, i)}
        <mark>{nom.slice(i, i + w.length)}</mark>
        {nom.slice(i + w.length)}
      </>
    );
  };
  const choisir = (i: number) => {
    setOuvert(false);
    if (i < r.length) router.push(adresseLangue(ficheHref(r[i].slug), langue));
    else b.filtrer({ q: v, cat });
  };
  const clavier = (e: ClavierReact<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!options) return;
      e.preventDefault();
      setOuvert(true);
      setActif((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + options) % options);
    } else if (e.key === "Enter" && montre && actif >= 0) {
      e.preventDefault();
      choisir(actif);
    } else if (e.key === "Escape" && montre) {
      e.preventDefault(); // le champ « search » se viderait : Échap ferme seulement les suggestions
      e.stopPropagation();
      setOuvert(false);
    }
  };

  return (
    <form
      className="recherche"
      role="search"
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        setOuvert(false);
        b.filtrer({ q: v, cat });
      }}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOuvert(false)}
    >
      <div className="rech-cat">
        <label className="bq-invisible" htmlFor="bq-q-cat">
          {T.barre.chercherDans}
        </label>
        <select id="bq-q-cat" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">{T.barre.toutes}</option>
          {b.catalogue.categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.nom}
            </option>
          ))}
        </select>
        <Picto nom="chevron" />
      </div>
      <label className="bq-invisible" htmlFor="bq-q">
        {T.barre.champ}
      </label>
      <input
        id="bq-q"
        type="search"
        value={q}
        placeholder={T.barre.indice}
        role="combobox"
        aria-expanded={montre}
        aria-controls="bq-suggestions"
        aria-autocomplete="list"
        aria-activedescendant={montre && actif >= 0 ? `bq-sug-${actif}` : undefined}
        onChange={(e) => {
          setQ(e.target.value);
          setOuvert(true);
          setActif(-1);
        }}
        onFocus={() => setOuvert(true)}
        onClick={() => setOuvert(true)}
        onKeyDown={clavier}
      />
      <button className="rech-ok" type="submit" aria-label={T.barre.lancer}>
        <Icon name="search" />
      </button>
      {montre ? (
        <ul className="suggestions" id="bq-suggestions" role="listbox" aria-label={T.barre.suggestions} data-lenis-prevent onMouseDown={(e) => e.preventDefault()}>
          {r.length ? (
            <>
              {r.map((p, i) => (
                <li key={p.slug} id={`bq-sug-${i}`} role="option" aria-selected={actif === i} onClick={() => choisir(i)}>
                  <span className="sug-image">{p.photos[0] ? <Image src={p.photos[0].url} alt="" fill sizes="44px" /> : <span className="photo-vide" />}</span>
                  <span>
                    <span className="sug-nom">{surligner(p.nom)}</span>
                    <span className="sug-meta">
                      {b.nomCategorie(p.categorie)} · {b.nomMatiere(p.matiere)}
                    </span>
                  </span>
                  <span className="sug-prix">{prix(p.prixXof, b.devise, b.usd, b.langue)}</span>
                </li>
              ))}
              <li id={`bq-sug-${r.length}`} role="option" aria-selected={actif === r.length} className="sug-tout" onClick={() => choisir(r.length)}>
                {T.barre.voirTout(tous.length, v)}
              </li>
            </>
          ) : (
            <li className="sug-vide" role="option" aria-disabled="true" aria-selected="false">
              {T.barre.aucune(v)}
            </li>
          )}
        </ul>
      ) : null}
    </form>
  );
}

// ---------- sous-navigation : « Tout », catégories et méga-menus (survol avec intention, clavier, Échap) ----------
function SousNav({ ouvrirMenu, menu }: { ouvrirMenu: (e: { currentTarget: HTMLElement }) => void; menu: boolean }) {
  const T = useContenu("boutique.boutique", BOUTIQUE);
  const b = useBoutique();
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [vus, setVus] = useState<string[]>([]); // méga-menus déjà ouverts : leurs images ne chargent qu'à ce moment-là
  const [sortant, setSortant] = useState<string | null>(null); // menu qui s'efface (200 ms) après une fermeture
  const ouvertA = useRef(0);
  const minuterie = useRef<ReturnType<typeof setTimeout>>(undefined);
  const zone = useRef<HTMLElement>(null);

  // menu ouvert, aussi gardé hors du rendu pour les minuteries et les gestionnaires
  const courant = useRef<string | null>(null);
  const ouvrir = useCallback((id: string, focus = false) => {
    clearTimeout(minuterie.current);
    setVus((v) => (v.includes(id) ? v : [...v, id]));
    if (courant.current !== id) ouvertA.current = Date.now();
    courant.current = id;
    setOuvert(id);
    if (focus) setTimeout(() => document.querySelector<HTMLElement>(`#bq-mega-${id} :is(a, button)`)?.focus(), 30);
  }, []);
  const fermer = useCallback((rendre = false) => {
    clearTimeout(minuterie.current);
    const o = courant.current;
    if (!o) return;
    courant.current = null;
    setOuvert(null);
    if (rendre) document.querySelector<HTMLElement>(`[data-menu="${o}"]`)?.focus();
    if (calme()) return;
    // fondu de sortie : 200 ms, courbe de départ (MOTION-I 2.7) ; .sortie garde le menu affiché pendant ce temps
    setSortant(o);
    const a = document.getElementById(`bq-mega-${o}`)?.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-8px)" }], { duration: 200, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
    const fin = () => {
      flushSync(() => setSortant((x) => (x === o ? null : x)));
      a?.cancel();
    };
    if (a) a.finished.then(fin, fin);
    else fin();
  }, []);
  const plusTard = (f: () => void, ms: number) => {
    clearTimeout(minuterie.current);
    minuterie.current = setTimeout(f, ms);
  };

  useEffect(() => {
    if (!ouvert) return;
    const echap = (e: KeyboardEvent) => e.key === "Escape" && fermer(true);
    const dehors = (e: Event) => !(e.target as Element).closest?.(".sous-nav, .mega") && fermer();
    document.addEventListener("keydown", echap);
    document.addEventListener("pointerdown", dehors);
    document.addEventListener("focusin", dehors);
    return () => {
      document.removeEventListener("keydown", echap);
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("focusin", dehors);
    };
  }, [ouvert, fermer]);

  return (
    <nav ref={zone} className="sous-nav" aria-label={T.nav.label} onPointerLeave={(e) => e.pointerType === "mouse" && plusTard(() => fermer(), 220)}>
      <div className="container-oht sous-nav-in">
        <button className="tout-btn" type="button" aria-expanded={menu} aria-controls="bq-menu-tout" onClick={ouvrirMenu}>
          <Icon name="menu" />
          {T.nav.tout}
        </button>
        {b.catalogue.categories.map((c, i) => (
          <button
            key={c.slug}
            className="cat-b"
            type="button"
            data-menu={c.slug}
            aria-expanded={ouvert === c.slug}
            aria-controls={`bq-mega-${c.slug}`}
            onPointerEnter={(e) => e.pointerType === "mouse" && plusTard(() => ouvrir(c.slug), 110)}
            onClick={() => (ouvert === c.slug && Date.now() - ouvertA.current > 450 ? fermer() : ouvrir(c.slug))}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                ouvrir(c.slug, true);
              } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                const tous = [...(zone.current?.querySelectorAll<HTMLElement>(".cat-b") ?? [])];
                tous[(i + (e.key === "ArrowRight" ? 1 : -1) + tous.length) % tous.length]?.focus();
              }
            }}
          >
            {c.nom}
            <Picto nom="chevron" />
          </button>
        ))}
        <p className="vrai">{T.nav.vrai}</p>
      </div>
      <div className="megas" onPointerEnter={() => clearTimeout(minuterie.current)}>
        {b.catalogue.categories.map((c, i) => {
          const pieces = b.catalogue.produits.filter((p) => p.categorie === c.slug);
          const photo = T.nav.photos[i % T.nav.photos.length];
          return (
            <div key={c.slug} className={`mega ${ouvert === c.slug ? "ouvert" : sortant === c.slug ? "sortie" : ""}`} id={`bq-mega-${c.slug}`} role="region" aria-label={c.nom} inert={ouvert !== c.slug}>
              {vus.includes(c.slug) ? (
                <div className="container-oht mega-in">
                  <div>
                    <p className="mega-titre">{T.nav.matieres}</p>
                    <ul>
                      <LiensMatieres cat={c.slug} />
                    </ul>
                  </div>
                  <div>
                    <p className="mega-titre">{T.nav.lesPieces}</p>
                    <ul>
                      {pieces.map((p) => (
                        <li key={p.slug}>
                          <Link className="mega-lien" href={ficheHref(p.slug)} onClick={() => fermer()}>
                            {p.nom}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mega-titre">{T.nav.aDecouvrir}</p>
                    <div className="mega-vignettes">
                      {pieces.slice(0, 2).map((p) => (
                        <Link key={p.slug} className="mega-vignette" href={ficheHref(p.slug)} onClick={() => fermer()}>
                          <span className="mega-image">{p.photos[0] ? <Image src={p.photos[0].url} alt="" fill sizes="160px" /> : <span className="photo-vide" />}</span>
                          <span>{p.nom}</span>
                          <b>{prix(p.prixXof, b.devise, b.usd, b.langue)}</b>
                        </Link>
                      ))}
                    </div>
                  </div>
                  <figure className="mega-photo">
                    <Image src={photo.src} alt={photo.alt} fill sizes="30vw" />
                    <figcaption>{photo.legende}</figcaption>
                  </figure>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

// ---------- popover « Ajouté au panier » (ou refus d'une pièce unique déjà prise), sous le bouton panier ----------
function Popover({ pop, fermer, armer, suspendre }: { pop: (Pop & { ouvert: boolean }) | null; fermer: () => void; armer: () => void; suspendre: () => void }) {
  const T = useContenu("boutique.boutique", BOUTIQUE);
  const b = useBoutique();
  const boite = useRef<HTMLDivElement>(null);
  const ouvert = !!pop?.ouvert;
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => !(e.target as Element).closest?.(".popover-ajout, [data-ajouter], .tiroir") && fermer();
    const echap = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    document.addEventListener("pointerdown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert, fermer]);
  if (!pop) return null;
  const { p, n, o, refus } = pop;
  const extra = resume(o, T);
  return (
    <div
      ref={boite}
      className={`popover-ajout ${ouvert ? "ouvert" : ""}`}
      role="region"
      aria-label={refus ? T.popover.refus : T.popover.region}
      onPointerEnter={suspendre}
      onPointerLeave={() => ouvert && armer()}
      onFocus={suspendre}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && ouvert && armer()}
    >
      <p className={`ajoute-tete ${refus ? "refus" : ""}`}>
        <span className="rond">{refus ? <Icon name="info" /> : <Picto nom="coche" />}</span>
        {refus ? T.popover.refus : T.popover.titre}
      </p>
      <button className="ajoute-x" type="button" aria-label={T.popover.fermer} onClick={fermer}>
        <Icon name="close" />
      </button>
      <div className="ajoute-ligne">
        <span className="ajoute-image">{p.photos[0] ? <Image src={p.photos[0].url} alt="" fill sizes="64px" /> : <span className="photo-vide" />}</span>
        <div>
          <p className="ajoute-nom">{p.nom}</p>
          {refus ? <p className="ajoute-refus">{T.popover.refusTexte(p.nom)}</p> : null}
          {!refus && extra ? <p className="ajoute-extra">{extra}</p> : null}
          <p className="ajoute-prix">{prix(p.prixXof, b.devise, b.usd, b.langue)}</p>
          {!refus ? <p className="ajoute-qte">{T.popover.quantite(n)}</p> : null}
        </div>
      </div>
      <div className="ajoute-actions">
        <button className="btn-contour" type="button" onClick={() => b.ouvrirPanier()}>
          {T.popover.voirPanier}
        </button>
        <button className="btn-soleil" type="button" onClick={() => b.ouvrirPanier("commande")}>
          {T.popover.commander}
        </button>
      </div>
    </div>
  );
}
