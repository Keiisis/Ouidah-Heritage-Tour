"use client";

import Image from "next/image";
import Link from "@/components/ui/LienPublic";
import { useEffect, useId, useRef, useState, type FormEvent, type PointerEvent as PointeurReact, type ReactNode } from "react";
import { boutique as BOUTIQUE } from "@/content/boutique";
import { useContenu } from "@/components/ui/ContenuSite";
import type { Produit } from "@/lib/boutique-types";
import { basculerFavori, dansLePanier, QUANTITE_MAX, useFavoris, usePanier } from "@/lib/panier";
import { useEcranLarge } from "@/lib/mouvement";
import { Icon } from "@/components/ui/Icon";
import { calme, useBoutique } from "./Cadre";
import { Carte } from "./Carte";
import { ChampsOptions, choixVide, manque, phraseManque, Quantite, versOptions, type Choix } from "./Options";
import { Picto } from "./Pictos";
import { Roule } from "./Roule";
import { aChoisir, boutiqueHref, fabrication, prix, quantiteMax, resume } from "./outils";

// Fiche produit (b-i-fiche) : fil d'Ariane, galerie (vignettes, zoom au survol, agrandissement plein écran, balayage à
// points sur mobile), informations (étiquette, caractéristiques avec « à fournir », accordéons des seuls champs remplis),
// encadré d'achat collant selon le type d'article, « Vous aimerez aussi », barre d'achat collante sur mobile.

const Z = 2; // grossissement du zoom au survol
const mobile = () => window.matchMedia("(max-width: 700px)").matches;
const survolFin = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;

export function Fiche({ p }: { p: Produit }) {
  const T = useContenu("boutique.boutique", BOUTIQUE);
  const b = useBoutique();
  const id = useId();
  const lignes = usePanier();
  const favoris = useFavoris();
  const large = useEcranLarge();
  const [c, setC] = useState<Choix>(choixVide);
  const [alerte, setAlerte] = useState(false);
  const [ajoute, setAjoute] = useState(false);
  const [barreCachee, setBarreCachee] = useState(true);
  const minuterie = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ajout = useRef<HTMLButtonElement>(null);
  const formulaire = useRef<HTMLFormElement>(null);

  const cat = b.nomCategorie(p.categorie), mat = b.nomMatiere(p.matiere);
  const pris = p.unique && dansLePanier(lignes, p.slug);
  const m = aChoisir(p) ? manque(p, c) : [];
  const ok = !m.length || pris;
  const fav = favoris.includes(p.slug);
  const set = (x: Partial<Choix>) => {
    setC((v) => ({ ...v, ...x }));
    setAlerte(false);
  };

  useEffect(() => () => clearTimeout(minuterie.current), []);
  // barre collante (mobile) : cachée quand le bouton de l'encadré est à l'écran
  useEffect(() => {
    const el = ajout.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setBarreCachee(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const signaler = () => {
    setAlerte(true);
    const champ = document.getElementById(`${id}-${m[0]}`);
    const cible = champ?.querySelector<HTMLElement>("input") ?? champ;
    cible?.focus({ preventScroll: true });
    (champ?.closest("fieldset, .champ") ?? champ)?.scrollIntoView({ block: "center", behavior: calme() ? "auto" : "smooth" });
  };
  const ajouter = () => {
    if (p.stockDisponible === 0) return false;
    if (pris) return b.ajouter(p, 1, {}); // refus expliqué dans le popover
    if (m.length) {
      signaler();
      return false;
    }
    const fait = b.ajouter(p, p.unique ? 1 : c.qte, versOptions(p, c, T));
    if (fait && !p.unique) {
      setAjoute(true);
      clearTimeout(minuterie.current);
      minuterie.current = setTimeout(() => setAjoute(false), 1500);
    }
    return fait;
  };
  const envoyer = (e: FormEvent) => {
    e.preventDefault();
    ajouter();
  };
  const maintenant = () => {
    if (pris || ajouter()) b.ouvrirPanier("commande");
  };

  const libelle = (e: string) =>
    e === "pris" || e === "ajoute" ? (
      <>
        <Picto nom="coche" />
        <span>{e === "pris" ? T.carte.pris : T.carte.ajoute}</span>
      </>
    ) : (
      <>
        <Picto nom={e === "options" ? "reglages" : "sac"} />
        <span>{e === "options" ? T.carte.options : e === "barre" ? T.carte.ajouter : T.options.ajouter}</span>
      </>
    );
  const etat = pris ? "pris" : ajoute ? "ajoute" : "ajouter";
  const etatBarre = pris ? "pris" : ajoute ? "ajoute" : m.length ? "options" : "barre";

  // caractéristiques : « à fournir » quand l'admin n'a rien saisi
  const afournir = (v: string | null) => (v ? v : <span className="afournir">{T.fiche.afournir}</span>);
  const L = T.fiche.lignes;
  const tailles = [...(p.options?.tailles ?? []), ...(p.options?.surMesure ? [T.options.surMesure] : [])];
  const carac: [string, ReactNode][] = [
    [L.matiere, mat],
    [L.categorie, cat],
    [L.lieu, afournir(p.lieu)],
    [L.artisan, afournir(p.artisan)],
    [L.dimensions, afournir(p.dimensions)],
    ...(tailles.length ? [[L.tailles, tailles.join(", ")] as [string, string]] : []),
    ...(p.coloris.length ? [[L.couleurs, p.coloris.map((x) => x.nom).join(", ")] as [string, string]] : []),
  ];
  const notes = [tailles.length && (p.options?.surMesure ? T.fiche.notes.tailleMesure : T.fiche.notes.taille), p.options?.broderie && T.fiche.notes.broderie].filter(Boolean).join(" ");
  // « Vous aimerez aussi » : même catégorie d'abord, puis même matière, puis le reste (ordre de l'admin)
  const rang = (q: Produit) => (q.categorie === p.categorie ? 0 : q.matiere === p.matiere ? 1 : 2);
  const aimerez = b.catalogue.produits.filter((q) => q.slug !== p.slug).map((q, i) => ({ q, i })).sort((x, y) => rang(x.q) - rang(y.q) || x.i - y.i).slice(0, 4).map((x) => x.q);

  return (
    <div className="container-oht fiche-page">
      <nav className="ariane" aria-label={T.fiche.ariane}>
        <ol>
          <li>
            <Link href={T.fiche.boutique.href}>{T.fiche.boutique.label}</Link>
          </li>
          <li>
            <Link href={boutiqueHref({ cat: p.categorie })}>{cat}</Link>
          </li>
          <li aria-current="page">{p.nom}</li>
        </ol>
      </nav>

      <div className="fiche">
        <Galerie p={p} />

        <div className="tete-fiche">
          <h1 className="titre">{p.nom}</h1>
          <p className="liens-meta">
            <span>{T.fiche.categorie}</span>
            <Link href={boutiqueHref({ cat: p.categorie })}>{cat}</Link>
            <span aria-hidden="true">·</span>
            <span>{T.fiche.matiere}</span>
            <Link href={boutiqueHref({ mat: p.matiere })}>{mat}</Link>
          </p>
          <hr className="filet" />
          <p className="prix-grand">{prix(p.prixXof, b.devise, b.usd, b.langue)}</p>
          <p className="prix-note">{T.fiche.prixNote}</p>
          {fabrication(p, T) ? <p className="prix-note">{fabrication(p, T)}</p> : null}
          {p.unique ? (
            <p className="etiquette">
              <b>{T.carte.unique}</b>
              <span>{T.fiche.uniqueNote}</span>
            </p>
          ) : p.personnalisable ? (
            <p className="etiquette">
              <b>{T.carte.personnalisable}</b>
              {notes ? <span>{notes}</span> : null}
            </p>
          ) : null}
        </div>

        <aside className="achat" aria-label={T.fiche.achat}>
          <p className="achat-prix">{prix(p.prixXof, b.devise, b.usd, b.langue)}</p>
          <p className="achat-ligne">
            <Icon name="pin" />
            <span>{T.fiche.retrait}</span>
          </p>
          <form ref={formulaire} className="achat-form" noValidate onSubmit={envoyer}>
            {aChoisir(p) ? <ChampsOptions p={p} c={c} set={set} id={id} msg={`${id}-msg`} erreurs={alerte ? m : []} /> : null}
            {p.unique ? null : (
              <div>
                <span className="lib-qte">{T.options.quantite}</span>
                <Quantite n={c.qte} set={(qte) => set({ qte })} label={T.options.quantite} className="qte-c qte-achat" max={quantiteMax(p, QUANTITE_MAX)} />
              </div>
            )}
            <p className={`achat-msg ${alerte && m.length ? "alerte" : ""}`} id={`${id}-msg`} role={alerte ? "alert" : undefined}>
              {m.length ? phraseManque(m, T) : p.personnalisable && !pris && resume(versOptions(p, c, T), T) ? T.options.choix(resume(versOptions(p, c, T), T)) : ""}
            </p>
            <button ref={ajout} className={`ajouter ${pris ? "pris" : ""}`} type="submit" disabled={p.stockDisponible === 0} aria-disabled={!ok || undefined}>
              {p.stockDisponible === 0 ? T.carte.indisponible : <Roule className="lib" cle={etat} rendu={libelle} />}
            </button>
            <button className="b-ocean" type="button" disabled={p.stockDisponible === 0} onClick={maintenant}>
              {T.fiche.maintenant}
            </button>
          </form>
          <ul className="achat-info">
            {T.fiche.info.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <hr className="filet" />
          <button className="b-fav" type="button" aria-pressed={fav} onClick={() => basculerFavori(p.slug)}>
            <Picto nom="coeur" />
            <span>{T.fiche.favori(fav)}</span>
          </button>
        </aside>

        <div className="corps">
          <section className="carac" aria-labelledby={`${id}-carac`}>
            <h2 id={`${id}-carac`}>{T.fiche.carac}</h2>
            <table className="tab">
              <tbody>
                {carac.map(([k, v]) => (
                  <tr key={k}>
                    <th scope="row">{k}</th>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <div className="blocs">
            {p.description ? <Bloc titre={T.fiche.description} textes={[p.description]} ouvert={large} /> : null}
            {p.entretien ? <Bloc titre={T.fiche.entretien} textes={[p.entretien]} /> : null}
            <Bloc titre={T.fiche.retraitTitre} textes={T.fiche.retraitTexte} />
          </div>
        </div>
      </div>

      <section className="aimerez" aria-labelledby={`${id}-aim`}>
        <div className="aimerez-tete">
          <h2 id={`${id}-aim`}>{T.fiche.aimerez}</h2>
          <Link className="voir-tout" href={boutiqueHref({ cat: p.categorie })}>
            {T.fiche.toute(cat)}
            <Icon name="arrow-right" />
          </Link>
        </div>
        <ul className="grille">
          {aimerez.map((q) => (
            <Carte key={q.slug} p={q} />
          ))}
        </ul>
      </section>

      <div className={`barre ${barreCachee ? "cache" : ""}`} role="region" aria-label={T.fiche.barre} inert={barreCachee}>
        <div className="barre-in">
          <div className="barre-txt">
            <p className="barre-nom">{p.nom}</p>
            <p className="barre-prix">{prix(p.prixXof, b.devise, b.usd, b.langue)}</p>
          </div>
          <button className={`ajouter ${pris ? "pris" : ""}`} type="button" disabled={p.stockDisponible === 0} onClick={() => (m.length && !pris ? (formulaire.current?.scrollIntoView({ block: "center", behavior: calme() ? "auto" : "smooth" }), signaler()) : ajouter())}>
            {p.stockDisponible === 0 ? T.carte.indisponible : <Roule className="lib" cle={etatBarre} rendu={libelle} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function Bloc({ titre, textes, ouvert = false }: { titre: string; textes: string[]; ouvert?: boolean }) {
  return (
    <details className="bloc" open={ouvert || undefined}>
      <summary>
        {titre}
        <Picto nom="chevron" />
      </summary>
      <div className="bloc-txt">
        {textes.map((t) => (
          <p key={t}>{t}</p>
        ))}
      </div>
    </details>
  );
}

// ---------- galerie : vignettes, grande photo à zoom au survol, points et balayage (mobile), agrandissement plein écran ----------
function Galerie({ p }: { p: Produit }) {
  const T = useContenu("boutique.boutique", BOUTIQUE);
  const [vue, setVue] = useState(0);
  const [loupe, setLoupe] = useState(0);
  const piste = useRef<HTMLDivElement>(null);
  const dialogue = useRef<HTMLDialogElement>(null);
  const n = p.photos.length;
  const alt = (i: number) => p.photos[i]?.alt || `${p.nom}, ${T.fiche.vue(i + 1)}`;

  const montrer = (i: number, defiler = true) => {
    const k = (i + n) % n;
    setVue(k);
    if (defiler && mobile() && piste.current) piste.current.scrollTo({ left: k * piste.current.clientWidth, behavior: calme() ? "auto" : "smooth" });
  };
  // zoom : la photo grossit et suit le pointeur (transform seul, origine en haut à gauche)
  const zoomer = (e: PointeurReact<HTMLButtonElement>) => {
    const v = e.currentTarget, img = v.querySelector("img");
    if (e.pointerType !== "mouse" || !survolFin() || mobile() || !v.classList.contains("active") || !img) return;
    const r = v.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    img.style.transform = `translate(${(-(Z - 1) * px * r.width).toFixed(1)}px, ${(-(Z - 1) * py * r.height).toFixed(1)}px) scale(${Z})`;
    v.classList.add("zoom");
  };
  const dezoomer = (e: PointeurReact<HTMLButtonElement>) => {
    e.currentTarget.classList.remove("zoom");
    const img = e.currentTarget.querySelector("img");
    if (img) img.style.transform = "";
  };
  const ouvrir = (i: number) => {
    setLoupe(i);
    dialogue.current?.showModal();
  };
  const naviguer = (d: number) => {
    const k = (loupe + d + n) % n;
    setLoupe(k);
    montrer(k);
  };

  return (
    <section className={`galerie ${n > 1 ? "" : "seule"}`} aria-label={T.fiche.galerie}>
      {n > 1 ? (
        <div className="vignettes" role="group" aria-label={T.fiche.choisirPhoto}>
          {p.photos.map((ph, i) => (
            <button key={ph.url} className="vignette" type="button" aria-label={T.fiche.photo(i + 1, T.fiche.vue(i + 1))} aria-pressed={vue === i} onClick={() => montrer(i)} onPointerOver={(e) => e.pointerType === "mouse" && montrer(i)}>
              <Image src={ph.url} alt="" fill sizes="64px" />
            </button>
          ))}
        </div>
      ) : null}
      <div className="scene">
        <div
          className="piste"
          ref={piste}
          onScroll={(e) => {
            if (!mobile()) return;
            const i = Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth);
            if (i !== vue) montrer(i, false);
          }}
        >
          {n ? (
            p.photos.map((ph, i) => (
              <button key={ph.url} className={`vue ${vue === i ? "active" : ""}`} type="button" data-agrandir={i} onClick={() => ouvrir(i)} onPointerMove={zoomer} onPointerLeave={dezoomer}>
                <span className="bq-invisible">{T.fiche.agrandir(i + 1, n)}</span>
                <Image src={ph.url} alt={alt(i)} fill sizes="(max-width: 700px) 100vw, (max-width: 1199px) 50vw, 40vw" draggable={false} loading={i ? "lazy" : "eager"} fetchPriority={i ? undefined : "high"} />
              </button>
            ))
          ) : (
            <div className="vue active">
              <span className="photo-vide" aria-hidden="true" />
              <span className="bq-invisible">{T.fiche.sansPhoto}</span>
            </div>
          )}
        </div>
        {n > 1 ? (
          <div className="points" role="group" aria-label={T.fiche.galerie}>
            {p.photos.map((ph, i) => (
              <button key={ph.url} className="point" type="button" aria-label={T.fiche.photoSur(i + 1, n)} aria-pressed={vue === i} onClick={() => montrer(i)}>
                <span />
              </button>
            ))}
          </div>
        ) : null}
        {n ? (
          <p className="indice">
            <Picto nom="zoom" />
            {T.fiche.indice}
          </p>
        ) : null}
      </div>

      {/* agrandissement : <dialog> modal (Échap et piège du focus fournis par le navigateur) */}
      <dialog
        ref={dialogue}
        className="loupe"
        aria-labelledby="bq-loupe-titre"
        onClose={() => document.querySelector<HTMLElement>(".vue.active[data-agrandir]")?.focus({ preventScroll: true })}
        onClick={(e) => (e.target === e.currentTarget || (e.target as Element).classList.contains("loupe-scene")) && dialogue.current?.close()}
        onKeyDown={(e) => {
          if (n > 1 && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
            e.preventDefault();
            naviguer(e.key === "ArrowRight" ? 1 : -1);
          }
        }}
      >
        <div className="loupe-tete">
          <p className="loupe-titre" id="bq-loupe-titre">
            {T.fiche.loupeTitre(p.nom, loupe + 1, n)}
          </p>
          <button className="loupe-x" type="button" aria-label={T.fiche.fermerLoupe} onClick={() => dialogue.current?.close()}>
            <Icon name="close" />
          </button>
        </div>
        <div className="loupe-scene">
          {n ? (
            // photo à sa taille, réduite pour tenir dans l'écran (jamais agrandie au-delà)
            <Image src={p.photos[loupe].url} alt={alt(loupe)} width={p.photos[loupe].largeur || 800} height={p.photos[loupe].hauteur || 1000} sizes="100vw" />
          ) : null}
          {n > 1 ? (
            <>
              <button className="loupe-nav prec" type="button" aria-label={T.fiche.precedente} onClick={() => naviguer(-1)}>
                <Icon name="arrow-left" />
              </button>
              <button className="loupe-nav suiv" type="button" aria-label={T.fiche.suivante} onClick={() => naviguer(1)}>
                <Icon name="arrow-right" />
              </button>
            </>
          ) : null}
        </div>
      </dialog>
    </section>
  );
}
