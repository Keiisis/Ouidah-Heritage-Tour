"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Objet3D } from "@/components/ui/Objet3D";
import COTE from "./cote-ouidah.json";
import type { Fiche } from "./Carnet";

// Carte du carnet (piste C) : Ouidah dessinée en SVG depuis les vraies coordonnées (lieux du contenu, relevé de la ville,
// côte relevée sur OpenStreetMap). Aucune tuile, aucune requête : rien ne part vers un tiers, la carte s'affiche sans
// l'accord « cartes » et ne coûte rien au serveur. Les épingles sont des boutons, dans l'ordre de la liste ; un lieu gardé
// porte son numéro dans le voyage ; un circuit gardé trace son chemin, un circuit survolé l'esquisse.
export type Trace = { slug: string; points: [number, number][]; etat: "on" | "apercu" };
type Props = {
  lieux: Fiche[]; // épingles (Ouidah et ses abords)
  loin: Fiche[]; // « Plus loin » : au bord de la carte, avec leur distance
  points: [number, number][]; // relevé de la ville : points discrets
  gardes: string[];
  traces: Trace[];
  allumes: string[]; // épingles mises en avant (lieu survolé, étapes d'un circuit survolé)
  onBasculer: (id: string) => void;
  onSurvol: (id: string | null) => void;
  textes: { carte: string; ocean: string; source: string; loin: string; km: (f: Fiche) => string; echelle: string };
};

// projection équirectangulaire locale : 1 unité = 0,001° (environ 111 m), juste à l'échelle d'une ville
const K = Math.cos((6.34 * Math.PI) / 180);
const pr = ([lat, lon]: readonly [number, number]) => [(lon - 2) * 1000 * K, (6.5 - lat) * 1000] as const;
const EPINGLE = 44;

export function CarteLieux({ lieux, loin, points, gardes, traces, allumes, onBasculer, onSurvol, textes }: Props) {
  const cadre = useRef<HTMLDivElement>(null);
  const [taille, setTaille] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = cadre.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTaille({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const vue = useMemo(() => {
    const { w, h } = taille;
    if (!w || !h || !lieux.length) return null;
    const xs = lieux.map((l) => pr(l.coords));
    const [x0, y0, x1, y1] = [Math.min(...xs.map((p) => p[0])), Math.min(...xs.map((p) => p[1])), Math.max(...xs.map((p) => p[0])), Math.max(...xs.map((p) => p[1]))];
    // marges en pixels : en haut et sur les côtés pour les épingles, en bas pour la mer, l'échelle et « Plus loin »
    // carte basse (téléphone couché) : moins de mer, la ville garde la hauteur
    // carte étroite : la ville commence sous la légende (source, échelle) posée en haut à gauche
    const etroite = w < 600;
    const mh = etroite ? 88 : 40, mc = 40, mb = h < 400 ? 64 : Math.max(120, h * 0.24);
    const s = Math.min((w - 2 * mc) / Math.max(x1 - x0, 1), (h - mh - mb) / Math.max(y1 - y0, 1));
    const ox = (x0 + x1) / 2 - w / 2 / s, oy = y0 - mh / s;
    const ecran = (c: readonly [number, number]) => {
      const [x, y] = pr(c);
      return [(x - ox) * s, (y - oy) * s] as [number, number];
    };
    const cote = COTE.cote.map((c) => ecran(c as [number, number]));
    const mer = `M${cote.map((p) => p.map((v) => v.toFixed(1)).join(" ")).join("L")}L${cote.at(-1)![0].toFixed(1)} ${h + 20}L${cote[0][0].toFixed(1)} ${h + 20}Z`;
    const releve = points.map(ecran).filter(([x, y]) => x > -4 && x < w + 4 && y > -4 && y < h + 4);
    // épingles écartées quand elles se chevauchent (le temple et la basilique sont à 70 m) ; un point garde le lieu exact
    const pos = lieux.map((l) => {
      const vrai = ecran(l.coords);
      return { l, vrai, xy: [...vrai] as [number, number] };
    });
    for (let k = 0; k < 160; k++)
      for (let i = 0; i < pos.length; i++)
        for (let j = i + 1; j < pos.length; j++) {
          const a = pos[i].xy, b = pos[j].xy;
          const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 0.01;
          if (d < EPINGLE + 8) {
            // carte basse : la hauteur manque, les épingles alignées s'écartent aussi de côté
            const cote = h < 400 ? (dx >= 0 ? 0.8 : -0.8) : 0;
            const vx = (dx / d || 1) + cote, vy = h < 400 ? (dy / d) * 0.4 : dy / d, n = Math.hypot(vx, vy) || 1;
            const e = (EPINGLE + 8 - d) / 2, ux = vx / n, uy = vy / n;
            a[0] -= ux * e;
            a[1] -= uy * e;
            b[0] += ux * e;
            b[1] += uy * e;
          }
        }
    const borne = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    for (const p of pos) p.xy = [borne(p.xy[0], EPINGLE / 2 + 4, w - EPINGLE / 2 - 4), borne(p.xy[1], etroite ? 64 + EPINGLE / 2 : EPINGLE / 2 + 4, h - EPINGLE / 2 - 4)];
    // mer libre sous la légende (bas gauche) : le nom de l'océan seulement s'il tient sur la mer, la carte assez large
    const yCote = (x: number) => {
      const i = cote.findIndex((p, k) => k > 0 && (cote[k - 1][0] - x) * (p[0] - x) <= 0);
      if (i < 1) return h;
      const [a, c] = [cote[i - 1], cote[i]];
      return a[1] + ((c[1] - a[1]) * (x - a[0])) / (c[0] - a[0] || 1);
    };
    const merGauche = h - Math.max(yCote(0), yCote(200));
    const ocean = merGauche >= 40 && w >= 300;
    const chemins = traces.map((t) => ({ ...t, d: `M${t.points.map((c) => ecran(c).map((v) => v.toFixed(1)).join(" ")).join("L")}` }));
    return { mer, cote, releve, pos, chemins, ocean, km: (1000 / 111.32) * s };
  }, [taille, lieux, points, traces]);

  return (
    <div ref={cadre} className="cn-plan" role="group" aria-label={textes.carte}>
      {vue ? (
        <>
          <svg className="cn-svg" width={taille.w} height={taille.h} aria-hidden="true" focusable="false">
            <path className="cn-mer" d={vue.mer} />
            <path className="cn-cote" d={`M${vue.cote.map((p) => p.map((v) => v.toFixed(1)).join(" ")).join("L")}`} />
            {vue.releve.map(([x, y], i) => (
              <circle key={i} className="cn-point" cx={x} cy={y} r={2} />
            ))}
            {vue.chemins.map((t) => (
              <path key={t.slug + t.etat} className={`cn-trace ${t.etat === "on" ? "cn-on" : ""}`} data-trace={t.slug} d={t.d} />
            ))}
            {vue.pos.map(({ l, vrai, xy }) =>
              Math.hypot(xy[0] - vrai[0], xy[1] - vrai[1]) > 8 ? <line key={l.id} className="cn-filet" x1={vrai[0]} y1={vrai[1]} x2={xy[0]} y2={xy[1]} /> : null,
            )}
            {vue.pos.map(({ l, vrai }) => (
              <circle key={l.id} className="cn-exact" cx={vrai[0]} cy={vrai[1]} r={3} />
            ))}
          </svg>
          {vue.pos.map(({ l, xy }) => {
            const n = gardes.indexOf(l.id) + 1;
            return (
              <button
                key={l.id}
                type="button"
                className={`cn-epingle ${allumes.includes(l.id) ? "cn-allume" : ""} ${l.image ? "" : "cn-objet"}`}
                data-id={l.id}
                aria-pressed={n > 0}
                aria-label={l.nom}
                style={{ left: xy[0], top: xy[1] }}
                onClick={() => onBasculer(l.id)}
                onPointerEnter={(e) => e.pointerType === "mouse" && onSurvol(l.id)}
                onPointerLeave={() => onSurvol(null)}
                onFocus={() => onSurvol(l.id)}
                onBlur={() => onSurvol(null)}
              >
                {l.image ? <Image src={l.image.src} alt="" width={EPINGLE} height={EPINGLE} /> : <Objet3D nom={l.objet} taille={28} />}
                {n ? <b aria-hidden="true">{n}</b> : null}
              </button>
            );
          })}
          <div className="cn-loin" role="group" aria-label={textes.loin}>
            {loin.map((l) => (
              <button key={l.id} type="button" className={`cn-ailleurs ${allumes.includes(l.id) ? "cn-allume" : ""}`} data-id={l.id} aria-pressed={gardes.includes(l.id)} onClick={() => onBasculer(l.id)} onFocus={() => onSurvol(l.id)} onBlur={() => onSurvol(null)}>
                <span className="cn-pastille">{l.image ? <Image src={l.image.src} alt="" width={32} height={32} /> : <Objet3D nom={l.objet} taille={24} />}</span>
                <span>
                  {l.nom}, {textes.km(l)}
                </span>
                {gardes.includes(l.id) ? <b aria-hidden="true">{gardes.indexOf(l.id) + 1}</b> : null}
              </button>
            ))}
          </div>
          {/* en haut à gauche, sur la terre : source des données (licence OpenStreetMap) et échelle ; le nom de l'océan sur
              la mer, en bas à gauche, s'il y tient */}
          <div className="cn-legende">
            <span className="cn-source">{textes.source}</span>
            <span className="cn-echelle" aria-hidden="true">
              <span>{textes.echelle}</span>
              <i style={{ width: vue.km }} />
            </span>
          </div>
          {vue.ocean ? <span className="cn-ocean">{textes.ocean}</span> : null}
        </>
      ) : null}
    </div>
  );
}
