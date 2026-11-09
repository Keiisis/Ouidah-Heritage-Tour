"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { attendreOuverture } from "@/lib/ouverture";
import type { VueTicket } from "./format";
import { Papier } from "./Papier";
import { QrTicket } from "./QrTicket";
import { FIN, PRECHAUFFE, T0, preparerScene } from "./embarquement-scene";
import "./embarquement.css";

// Après un paiement de voyage confirmé (/suivi/<jeton>?bienvenue=1) : le ticket s'imprime, puis le film « Bienvenue au
// Bénin » (maquette experience.html validée, 10 plans), dans la langue du client, en 16:9 au bureau et 9:16 en portrait.
// Aucun bouton « Passer ». À la fin, le paramètre est retiré de l'adresse (pas de nouvelle lecture au rechargement) et la
// page de suivi apparaît. Mouvement réduit : image fixe du titre quelques secondes, puis la page. Le voile bleu nuit est
// rendu par le serveur (aucun éclair de la page avant le film) ; sans JavaScript, il s'efface seul (CSS, 4 s).
// Préchauffage mesuré sur la maquette : chaque plan rendu une fois, scène à 2 % d'opacité, avant de lancer l'horloge.
const piece = (n: string) => `/embarquement/${n}.webp`;
const suite = (nom: string, n: number) => Array.from({ length: n }, (_, i) => piece(`${nom}-${i + 1}`));
// recalage horizontal de chaque image du salut (part de la largeur), mesuré sur la maquette : le bras levé décentrait les cases
const RECALE_SALUT = [0, 36 / 458, 14 / 458, 36 / 458];
const TENUE = 1.2, FONDU = 0.6, IMAGE_FIXE = 4; // secondes

function Piece({ n, l, h, eb, style }: { n: string; l: number; h: number; eb?: string; style?: CSSProperties }) {
  return <Image src={piece(n)} width={l} height={h} alt="" unoptimized loading="eager" draggable={false} data-eb={eb} style={style} />;
}

function Pile({ eb, srcs, l, h, dx = [] }: { eb: string; srcs: string[]; l: number; h: number; dx?: number[] }) {
  return (
    <div className="eb-pile" data-eb={eb}>
      {srcs.map((s, i) => (
        <Image key={s} src={s} width={l} height={h} alt="" unoptimized loading="eager" draggable={false} style={dx[i] ? { transform: `translateX(${(dx[i] * 100).toFixed(2)}%)` } : undefined} />
      ))}
    </div>
  );
}

const image = () => new Promise<void>((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok())));

export function Embarquement({ vue, titre }: { vue: VueTicket; titre: readonly [string, string] }) {
  const cadre = useRef<HTMLDivElement>(null);
  const [fini, setFini] = useState(false);
  const id = useId();

  useEffect(() => {
    const el = cadre.current;
    if (!el) return;
    el.style.animation = "none"; // le JavaScript a la main : le filet CSS ne doit pas effacer le film
    let arret = false, boucle = 0, minuterie = 0;
    let ajuste = () => {};
    const terminer = () => {
      if (arret) return;
      const adresse = new URL(window.location.href);
      adresse.searchParams.delete("bienvenue");
      window.history.replaceState(null, "", adresse.pathname + adresse.search + adresse.hash);
      window.scrollTo(0, 0);
      setFini(true);
    };
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const portrait = window.innerHeight > window.innerWidth;

    (async () => {
      const images = Array.from(el.querySelectorAll("img"));
      await Promise.all([...images.map((i) => i.decode().catch(() => {})), document.fonts.ready, attendreOuverture()]);
      if (arret) return;
      const sc = preparerScene(el, portrait);
      ajuste = sc.ajuste;
      window.addEventListener("resize", ajuste);
      ajuste();
      sc.placer();
      if (reduit) {
        sc.render(FIN);
        sc.scene.style.opacity = "1";
        minuterie = window.setTimeout(terminer, IMAGE_FIXE * 1000);
        return;
      }
      // préchauffage : un rendu par plan et par effet nouveau, scène presque transparente (le GPU compile ici)
      sc.scene.style.opacity = "0.02";
      for (const x of PRECHAUFFE) {
        sc.render(T0 + x);
        await image();
        if (arret) return;
      }
      sc.render(0);
      await image();
      if (arret) return;
      sc.scene.style.opacity = "1";
      const t0 = performance.now();
      const pas = (n: number) => {
        if (arret) return;
        const t = (n - t0) / 1000;
        sc.render(Math.min(t, FIN));
        if (t < FIN + TENUE) boucle = requestAnimationFrame(pas);
        else {
          el.style.transition = `opacity ${FONDU}s ease`;
          el.style.opacity = "0";
          minuterie = window.setTimeout(terminer, FONDU * 1000);
        }
      };
      boucle = requestAnimationFrame(pas);
    })().catch(terminer);

    return () => {
      arret = true;
      cancelAnimationFrame(boucle);
      window.clearTimeout(minuterie);
      window.removeEventListener("resize", ajuste);
    };
  }, []);

  if (fini) return null;
  const [l1, l2] = titre;
  return (
    <div ref={cadre} className="eb-cadre" aria-hidden="true">
      <div className="eb-scene" data-eb="scene">
        {/* 1. Ticket : l'imprimante à gauche, le message et les actions à droite */}
        <div className="eb-couche eb-ticket" data-eb="ticket">
          <div className="eb-ticket-fond" data-eb="ticket-fond" />
          <div className="eb-imprimante" data-eb="imprimante">
            <div className="eb-fente" data-eb="t-fente" />
            <div className="eb-sortie" data-eb="t-sortie">
              <Papier vue={vue} qr={<QrTicket chemin={vue.qr.chemin} label={vue.qr.label} />} />
            </div>
          </div>
          <div className="eb-texte" data-eb="t-texte">
            <p className="eb-h1" data-eb="t-titre">
              {vue.titre}
            </p>
            <p className="eb-sous" data-eb="t-sous">
              {vue.sous}
            </p>
            <div className="eb-actions" data-eb="t-actions">
              {vue.actions.map((a) => (
                <a key={a.href} href={a.href} tabIndex={-1} className={a.primaire ? "is-primaire" : "is-secondaire"}>
                  {a.libelle}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* 2. Animation */}
        <div className="eb-couche eb-anim" data-eb="anim">
          {/* plans 1 et 3 : la maquette de l'aéroport, avec sa caméra */}
          <div className="eb-couche" data-eb="p-depart">
            <div className="eb-monde" data-eb="m-depart">
              <div data-eb="dock" style={{ position: "absolute", width: 1603, height: 598 }}>
                <Piece n="d2-avion-ferme" l={1394} h={520} style={{ left: 0, top: 0, width: "100%", height: "100%", transform: "scaleX(-1)" }} />
                <div className="eb-ouverture" data-eb="porte-dock" />
              </div>
              <Piece n="d1-depart-maquette" l={1920} h={1081} style={{ left: 0, top: 0, width: 1920 }} />
              <Piece n="billet-petit" l={160} h={160} eb="billet-comptoir" style={{ left: 0, top: 0, width: 62 }} />
              <div style={{ position: "absolute", left: 0, top: 0, width: 1525, height: 1080, overflow: "hidden" }}>
                <div className="eb-ombre" data-eb="ombre-perso" />
                <Pile eb="perso-comptoir" srcs={suite("c2-comptoir", 4)} l={232} h={320} dx={[0, 43 / 232, 45 / 232, 16 / 232]} />
                <Pile eb="perso-marche" srcs={suite("c1-marche", 8)} l={284} h={320} />
              </div>
            </div>
          </div>

          {/* plan 2 : le scan */}
          <div className="eb-couche" data-eb="p-scan">
            <Piece n="d9-porte-plan" l={1600} h={900} style={{ left: 0, top: 0, width: 1920, height: 1080 }} />
            <div className="eb-lueur" data-eb="lueur-scan" />
            <Piece n="c4-scan" l={899} h={820} eb="perso-scan" />
          </div>

          {/* plans 4 à 8 : le vol ; « vol » porte la poussée de caméra vers la porte à Cotonou */}
          <div className="eb-couche" data-eb="vol" style={{ transformOrigin: "0 0" }}>
            <div className="eb-couche" data-eb="p-decollage">
              <div className="eb-fond" style={{ background: "var(--eb-fond-depart)" }} />
              <Piece n="d5-piste-depart" l={1920} h={1081} eb="piste-depart" style={{ left: 0, top: 0, width: 1920, height: 1080 }} />
            </div>
            <div className="eb-couche" data-eb="p-globe">
              <Piece n="d11-globe" l={811} h={820} eb="globe" style={{ left: 0, top: 0, width: 811, transformOrigin: "0 0" }} />
              <svg className="eb-arc" viewBox="0 0 1920 1080" aria-hidden="true">
                <path data-eb="arc" d="" fill="none" stroke="#fdbf28" strokeWidth="9" strokeLinecap="round" />
              </svg>
              <Piece n="epingle" l={132} h={180} eb="epingle" style={{ width: 88 }} />
            </div>
            <div className="eb-couche" data-eb="p-approche">
              <div className="eb-fond" style={{ background: "var(--eb-fond-approche)" }} />
              <div data-eb="bande" style={{ position: "absolute", left: 0, top: 0, width: 2400, transformOrigin: "0 0" }}>
                <Piece n="d7-approche" l={1920} h={1081} style={{ left: 0, top: 0, width: 2400 }} />
                <div className="eb-mer" />
              </div>
              <Piece n="d8-nuages-1" l={345} h={180} eb="n1" style={{ left: 0, top: 160, width: 300 }} />
              <Piece n="d8-nuages-2" l={345} h={180} eb="n2" style={{ left: 0, top: 300, width: 260 }} />
            </div>
            <div className="eb-couche" data-eb="p-cotonou">
              <div className="eb-fond" style={{ background: "var(--eb-fond-cotonou)" }} />
              <Piece n="d4-piste-cotonou" l={1920} h={1081} style={{ left: 0, top: 0, width: 1920, height: 1080 }} />
            </div>
            <div data-eb="avion-vol" style={{ position: "absolute", left: 0, top: 0, width: 1394, height: 520, transformOrigin: "0 0" }}>
              <Piece n="d2-avion-ferme" l={1394} h={520} style={{ left: 0, top: 0, width: 1394, height: 520 }} />
              <div className="eb-ouverture" data-eb="porte" style={{ left: 1150, top: 244, width: 50, height: 102, transformOrigin: "0 50%" }} />
            </div>
            <Piece n="d6-escalier" l={449} h={300} eb="escalier" />
            <Pile eb="perso-porte" srcs={suite("c3-salut", 4)} l={458} h={640} dx={RECALE_SALUT} />
            <Piece n="d8-nuages-3" l={345} h={180} eb="n3" style={{ left: 0, top: 300, width: 420 }} />
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="eb-fumee" data-eb={`f${i}`} />
            ))}
          </div>

          {/* plan 9 : le seuil, il salue */}
          <div className="eb-couche" data-eb="p-seuil">
            <Piece n="d10-seuil-plan" l={1600} h={900} style={{ left: 0, top: 0, width: 1920, height: 1080 }} />
            <Pile eb="perso-salut" srcs={suite("c3-salut", 4)} l={458} h={640} dx={RECALE_SALUT} />
          </div>
        </div>

        {/* 3. Titre : le billet grandit au-dessus du dernier plan */}
        <div className="eb-couche eb-titre" data-eb="titre">
          <div className="eb-titre-fond" data-eb="titre-fond" />
          <div data-eb="titre-billet" style={{ position: "absolute", inset: 0 }}>
            <Piece n="billet-titre" l={1600} h={900} style={{ left: 0, top: 0, width: 1920, height: 1080 }} />
            <div className="eb-titre-texte">
              <p className="eb-l1" data-eb="l1">
                {l1}
              </p>
              <p className="eb-l2" data-eb="l2">
                {Array.from(l2).map((c, i) => (
                  <span key={i}>{c}</span>
                ))}
              </p>
              <div className="eb-feux" data-eb="feux">
                {Array.from({ length: 9 }, (_, i) => (
                  <i key={i} />
                ))}
              </div>
            </div>
            <svg className="eb-tampon" data-eb="tampon" viewBox="0 0 264 264" aria-hidden="true">
              <defs>
                <path id={`${id}h`} d="M 42 132 A 90 90 0 0 1 222 132" />
                <path id={`${id}b`} d="M 36 132 A 96 96 0 0 0 228 132" />
              </defs>
              <circle cx="132" cy="132" r="129" fill="#122460" />
              <circle cx="132" cy="132" r="126" fill="none" stroke="#fdbf28" strokeWidth="7" />
              <circle cx="132" cy="132" r="112" fill="none" stroke="#fdbf28" strokeWidth="2.5" />
              <text className="eb-tampon-arc">
                <textPath href={`#${id}h`} startOffset="50%" textAnchor="middle">
                  Ouidah Heritage Tour
                </textPath>
              </text>
              <text className="eb-tampon-arc">
                <textPath href={`#${id}b`} startOffset="50%" textAnchor="middle">
                  {l2}
                </textPath>
              </text>
              <text className="eb-tampon-sigle" x="132" y="155" textAnchor="middle">
                OHT
              </text>
            </svg>
          </div>
          <p className="eb-l1p" data-eb="l1p">
            {l1}
          </p>
        </div>
      </div>
    </div>
  );
}
