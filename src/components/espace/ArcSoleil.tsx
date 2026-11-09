"use client";

import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Role } from "@/content/equipe";
import { espace as T } from "@/content/espace";
import { etatMoment, type TypeMoment } from "@/lib/serveur/equipe/dossiers-regles";
import { useEspace, useMinute } from "./Cadre";
import { hm, lumiere, minutesOuidah, soleil, surArc, type Soleil } from "./outils";
import { Picto, PICTO_MOMENT } from "./Picto";
import "./journee.css";

// « La course du soleil » (maquette E) : l'arc réel du soleil sur Ouidah (6,36° N, 2,08° E), de l'aube civile au
// coucher, calculé à l'heure de la page ; quatre lumières (aube, plein jour, fin d'après-midi, nuit) ; sous l'horizon, un
// sol navy qui monte au coucher. Le serveur rend l'état final à l'heure de la requête ; à l'entrée, le soleil part de
// l'aube et son heure défile (WAAPI, fill « backwards »), jamais en mouvement réduit. Géométrie sans mesure : x en %
// de la scène (unités cqw), hauteur en part de --hz. Le disque reste toujours visible : jamais sous l'horizon, même à
// l'aube ou la nuit. Un changement de thème ou de lumière passe par un volet en clip-path limité au ciel (aucune
// transition de couleur). `ticks` : minutes des paiements du jour (admin), un trait par paiement sur l'horizon.
// `children` : ce qui est posé sous l'horizon (rendu par le serveur). `moments` (lot L4) : les moments du jour des
// dossiers ; ceux qui sont à venir ou en cours se posent sur l'arc à leur heure de Ouidah (un lien vers le dossier) et se
// lèvent de l'horizon à l'entrée ; ce qui est passé n'y est plus (MomentsSol le range sous l'horizon ou « À clore »).
// Deux repères trop proches, ou trop près du soleil, se posent un cran plus haut dans le ciel (quatre crans au plus) :
// près de l'aube ou du coucher, une course plus basse ne les séparerait pas.
const K = 0.76; // hauteur du zénith, en part de la scène
const X = (x: number) => 3 + 94 * x; // en % de la largeur (marges de 3 %)
const Y = (h: number) => 1 - K * h; // en part de la hauteur (1 = horizon)
const Y_DISQUE = 0.9; // le disque entier reste au-dessus de l'horizon
const vars = (v: Record<string, string | number>) => v as CSSProperties;
const ECART = 7.5; // en % de la largeur : en dessous, deux repères (ou un repère et le soleil) se touchent, en 390 aussi
const VOIE = 0.17; // une course de plus = un repère plus haut dans le ciel (part de --hz), jamais vers l'horizon

export type RepereArc = { id: string; debut: number; fin: number; type: TypeMoment; fait: boolean; quoi: string; agent: string | null; href: string };

/** Repères posés sur l'arc : à venir et en cours seulement, à leur minute de Ouidah, sur la première course libre. */
function poser(moments: RepereArc[], minute: number, s: Soleil, sx: number) {
  const t = minute * 60_000;
  const voies: number[][] = [[sx], [], [], []];
  return moments
    .map((r) => ({ r, etat: etatMoment(r, t), m: minutesOuidah(Math.floor(r.debut / 60_000)) }))
    .filter((x) => x.etat === "avenir" || x.etat === "encours")
    .sort((a, b) => a.m - b.m)
    .map((x, i) => {
      const p = surArc(x.m, s), mx = X(p.x);
      let v = voies.findIndex((l) => l.every((o) => Math.abs(o - mx) >= ECART));
      if (v < 0) v = 3;
      voies[v].push(mx);
      const my = Math.max(0.08, Math.min(0.94, 1 - K * Math.max(0.06, p.h)) - VOIE * v);
      return { ...x, i, mx, my };
    });
}

function trace(s: Soleil) {
  const pts: string[] = [];
  const point = (m: number) => {
    const p = surArc(m, s);
    pts.push(`${(X(p.x) * 10).toFixed(1)} ${(Y(p.h) * 1000).toFixed(1)}`);
  };
  for (let m = s.aube; m < s.coucher; m += 4) point(m);
  point(s.coucher);
  return `M${pts.join(" L")}`;
}

export function ArcSoleil({ role, ticks = [], moments = [], children }: { role: Role; ticks?: number[]; moments?: RepereArc[]; children: ReactNode }) {
  const minute = useMinute();
  const { theme, changer } = useEspace();
  const [annonce, setAnnonce] = useState("");
  const id = useId().replace(/[^\w-]/g, "");
  const scene = useRef<HTMLDivElement>(null);
  const disque = useRef<HTMLDivElement>(null);
  const passe = useRef<SVGSVGElement>(null);
  const heure = useRef<HTMLElement>(null);
  const ciel = useRef<HTMLElement>(null);
  const voletZone = useRef<HTMLDivElement>(null);
  const avant = useRef<{ cle: string; fond: string } | null>(null);

  const m = minutesOuidah(minute), s = soleil(minute), lum = lumiere(m, s), p = surArc(m, s);
  const nuit = lum === "nuit";
  const sx = nuit ? X(m < s.aube ? 0 : 1) : X(p.x);
  const sy = Math.min(Y_DISQUE, nuit ? 1 : Y(p.h));
  // le sol monte au coucher, redescend après l'aube (part de la scène)
  const haut = 0.32;
  const monte = nuit ? haut : lum === "soir" ? (haut * (m - (s.coucher - 150))) / 150 : lum === "aube" ? haut * Math.max(0, 1 - (m - s.aube) / (s.lever + 60 - s.aube)) : 0;
  const droit = m < s.aube ? 100 : 100 - sx; // le passé est coupé à droite du soleil
  const d = trace(s);
  const heures: number[] = [];
  for (let h = Math.ceil(s.aube / 60) * 60; h < s.coucher; h += 60) heures.push(h);
  const horsJour = m < s.aube ? ` ${T.journee.avant(hm(s.aube))}` : m >= s.coucher ? ` ${T.journee.apres(hm(s.coucher))}` : "";
  const reperes = poser(moments, minute, s, sx);

  useEffect(() => {
    // entrée : le soleil part de l'aube, son heure défile jusqu'à maintenant (une fois)
    const sc = scene.current, di = disque.current, pa = passe.current, b = heure.current;
    if (!sc || !di || !pa || !b || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const mn = Math.floor(Date.now() / 60_000), mm = minutesOuidah(mn), so = soleil(mn);
    if (lumiere(mm, so) === "nuit") return;
    const W = sc.clientWidth, H = sc.clientHeight;
    const fin = Math.max(so.aube, Math.min(so.coucher, mm));
    const pts = Array.from({ length: 29 }, (_, k) => {
      const q = surArc(so.aube + ((fin - so.aube) * k) / 28, so);
      return { transform: `translate(${((X(q.x) / 100) * W).toFixed(1)}px, ${(Math.min(Y_DISQUE, Y(q.h)) * H).toFixed(1)}px)` };
    });
    const temps = { duration: 1800, delay: 260, easing: "cubic-bezier(.625,.05,0,1)", fill: "backwards" as const };
    const course = di.animate(pts, temps);
    const trait = pa.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: `inset(0 ${(100 - X(surArc(fin, so).x)).toFixed(2)}% 0 0)` }], temps);
    let raf = 0;
    const defile = () => {
      const pr = course.effect?.getComputedTiming().progress;
      b.dataset.defile = hm(pr == null ? so.aube : so.aube + (fin - so.aube) * pr);
      if (course.playState === "running") raf = requestAnimationFrame(defile);
      else delete b.dataset.defile;
    };
    raf = requestAnimationFrame(defile);
    return () => {
      cancelAnimationFrame(raf);
      course.cancel();
      trait.cancel();
      delete b.dataset.defile;
    };
  }, []);

  // volet : la lumière (ou le thème) qui s'en va se retire vers le haut, la nouvelle est déjà dessous. Le volet vit dans
  // une zone que React ne remplit jamais ; la couleur d'avant est relevée après chaque rendu.
  useLayoutEffect(() => {
    const el = ciel.current, zone = voletZone.current;
    if (!el || !zone) return;
    const cle = `${theme}|${lum}`, fond = getComputedStyle(el).backgroundColor;
    const prec = avant.current;
    avant.current = { cle, fond };
    if (!prec || prec.cle === cle || prec.fond === fond || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const v = document.createElement("div");
    v.className = "volet-lumiere";
    v.style.background = prec.fond;
    zone.append(v);
    v.animate([{ clipPath: "inset(0 0 0 0)" }, { clipPath: "inset(0 0 100% 0)" }], { duration: 1100, easing: "cubic-bezier(.625,.05,0,1)", fill: "forwards" }).finished.then(
      () => v.remove(),
      () => v.remove(),
    );
  }, [theme, lum]);

  // en 390, une ligne : « Lever · Coucher · Lumière » (l'aube y est omise)
  const info: [string, string, string][] = [
    ["lumiere", T.journee.lumiere, T.journee.lumieres[lum]],
    ["aube", T.journee.aube, hm(s.aube)],
    ["lever", T.journee.lever, hm(s.lever)],
    ["coucher", T.journee.coucher, hm(s.coucher)],
  ];

  return (
    <section className="esp-journee construit" ref={ciel} data-lumiere={lum} style={vars({ "--i": 1, "--monte": monte.toFixed(3) })} aria-labelledby={`${id}-t`}>
      <div className="volet-zone" ref={voletZone} aria-hidden="true" />
      <div className="journee-tete">
        <div>
          <h2 id={`${id}-t`}>{T.journee.titre}</h2>
          <p className="sous">
            {role === "admins" ? T.journee.sousAdmin : T.journee.sousAgent}
            {horsJour}
          </p>
          {nuit && theme !== "sombre" && (
            <button
              type="button"
              className="proposer-sombre"
              onClick={() => {
                changer("sombre");
                setAnnonce(T.journee.sombreOk);
              }}
            >
              <Picto nom="lune" />
              <span>{T.journee.proposer}</span>
            </button>
          )}
        </div>
        <dl className="soleil-info">
          {info.map(([k, n, v]) => (
            <div key={k} data-info={k}>
              <dt>{n}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="ciel-scene" ref={scene} aria-hidden="true">
        <svg className="ciel-arc" viewBox="0 0 1000 1000" preserveAspectRatio="none" focusable="false">
          <defs>
            <clipPath id={`${id}-sol`} clipPathUnits="userSpaceOnUse">
              <rect x="-20" y={((1 - monte) * 1000).toFixed(1)} width="1040" height={(monte * 1000 + 80).toFixed(1)} />
            </clipPath>
          </defs>
          <path className="arc" d={d} vectorEffect="non-scaling-stroke" />
          <path className="arc-sol" d={d} clipPath={`url(#${id}-sol)`} vectorEffect="non-scaling-stroke" />
          {ticks.map((t, k) => {
            const x = (X(surArc(t, s).x) * 10).toFixed(1);
            return <line key={k} className="caisse-tick" x1={x} x2={x} y1="962" y2="996" vectorEffect="non-scaling-stroke" />;
          })}
        </svg>
        <svg className="ciel-passe" ref={passe} viewBox="0 0 1000 1000" preserveAspectRatio="none" focusable="false" style={{ clipPath: `inset(0 ${droit.toFixed(2)}% 0 0)` }}>
          <path className="arc" d={d} vectorEffect="non-scaling-stroke" />
          <path className="arc-sol" d={d} clipPath={`url(#${id}-sol)`} vectorEffect="non-scaling-stroke" />
        </svg>
        <div className={`disque${sx < 8 ? " bord-g" : sx > 92 ? " bord-d" : ""}`} ref={disque} style={vars({ "--sx": sx.toFixed(2), "--sy": sy.toFixed(4) })}>
          <i />
          <b ref={heure}>
            <span className="t">{hm(m)}</span>
          </b>
        </div>
      </div>
      {reperes.length > 0 && (
        <div className="ciel-reperes" role="group" aria-label={T.journee.arcNom}>
          {reperes.map(({ r, etat, m: mm, i, mx, my }) => {
            const type = T.moments.types[r.type];
            return (
              <Link
                key={r.id}
                href={r.href}
                className={`creneau${etat === "encours" ? " encours" : ""}${mx < 10 ? " bord-g" : mx > 90 ? " bord-d" : ""}`}
                data-moment={r.id}
                data-minute={mm}
                data-etat={etat}
                style={vars({ "--mx": mx.toFixed(2), "--my": my.toFixed(4), "--i": i })}
                aria-label={T.journee.repere(hm(mm), r.agent, type, r.quoi, T.journee.etats[etat])}
              >
                {r.agent ? <span className="ini" aria-hidden="true">{r.agent.slice(0, 1).toUpperCase()}</span> : <Picto nom={PICTO_MOMENT[r.type]} />}
                <span className="info-repere" aria-hidden="true">
                  <b>
                    {hm(mm)}
                    {r.agent ? ` · ${r.agent}` : ""}
                  </b>
                  <span>
                    {type} : {r.quoi}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
      <div className="sol">
        <div className="ciel-heures" aria-hidden="true">
          {heures.map((h, k) => (
            <span key={h} className={k % 3 ? "secondaire" : undefined} style={vars({ "--hx": X(surArc(h, s).x).toFixed(2) })}>
              {String(h / 60).padStart(2, "0")} h
            </span>
          ))}
        </div>
        {children}
      </div>
      <p className="invisible" aria-live="polite">
        {annonce}
      </p>
    </section>
  );
}
