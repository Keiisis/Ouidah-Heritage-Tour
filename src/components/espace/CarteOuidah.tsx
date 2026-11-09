"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { espace as T } from "@/content/espace";
import { useMouvementReduit } from "@/lib/mouvement";
import { hm, type Soleil } from "./outils";

// Carte de Ouidah du dossier (maquette E, reprise de C) : la ville, ses rues, la lagune, la plage et l'océan, dessinés à
// plat ; les lieux réels (coordonnées OpenStreetMap du contenu, fr.ts et le relevé) projetés à 1 degré = 20 000 unités.
// L'itinéraire numéroté suit les moments du dossier dans l'ordre des heures : chaque étape se pose, puis le trajet
// suivant se trace jusqu'à elle (transform seulement), et un disque de soleil parcourt l'itinéraire une fois tracé ;
// rien ne bouge en mouvement réduit. Les autres lieux du site restent en points gris.
export type EtapeCarte = { cle: string; nom: string; coords: readonly [number, number] };
const vars = (v: Record<string, string | number>) => v as CSSProperties;
const projeter = ([lat, lon]: readonly [number, number]) => ({ x: 222 + (lon - 2.0901242) * 20000, y: 182 + (6.3588947 - lat) * 20000 });
/** Point dans le dessin de la carte (au-delà : hors de la carte de Ouidah). */
export const surCarte = (c: readonly [number, number]) => {
  const p = projeter(c);
  return p.x > -380 && p.x < 880 && p.y > -180 && p.y < 1180;
};
// libellé à droite du point, ou à gauche dans la moitié est de la ville
const ancre = (x: number) => (x > 300 ? "end" : "start");

/** La vue serre les étapes et laisse la place à leurs noms (rapport largeur / hauteur fixé) ; la ville reste toujours
 * dans le cadre, pour que l'itinéraire se lise dans Ouidah (même une seule étape). */
function vueAutour(etapes: EtapeCarte[], ratio: number) {
  if (!etapes.length) return "-70 24 580 926";
  const p = etapes.map((l) => projeter(l.coords));
  const g = Math.min(20, ...etapes.map((l, i) => p[i].x - (ancre(p[i].x) === "end" ? 13 * l.nom.length + 50 : 40)));
  const d = Math.max(400, ...etapes.map((l, i) => p[i].x + (ancre(p[i].x) === "start" ? 13 * l.nom.length + 50 : 40)));
  let x0 = g, w = d - g, y0 = Math.min(30, ...p.map((q) => q.y - 60)), h = Math.max(350, ...p.map((q) => q.y + 90)) - y0;
  if (w / h < ratio) {
    const n = h * ratio;
    x0 -= (n - w) / 2;
    w = n;
  } else {
    const n = w / ratio;
    y0 -= (n - h) / 2;
    h = n;
  }
  return `${x0.toFixed(0)} ${y0.toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}`;
}

export function CarteOuidah({ etapes, fonds }: { etapes: EtapeCarte[]; fonds: { cle: string; nom: string; coords: readonly [number, number] }[] }) {
  const C = T.carte;
  const reduit = useMouvementReduit();
  const disque = useRef<SVGCircleElement>(null);
  const pts = etapes.map((l) => projeter(l.coords));
  const cle = pts.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ");

  useEffect(() => {
    const c = disque.current;
    if (!c || reduit || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const kf = cle.split(" ").map((q) => {
      const [x, y] = q.split(",");
      return { transform: `translate(${x}px, ${y}px)` };
    });
    if (kf.length < 2) return;
    const a = c.animate(kf, { duration: (kf.length - 1) * 640, delay: 1000, easing: "linear", fill: "both" });
    return () => a.cancel();
  }, [cle, reduit]);

  const vus = new Set(etapes.map((e) => e.cle));
  return (
    <svg className="carte" viewBox={vueAutour(etapes, 0.82)} role="img" aria-label={etapes.length ? C.nom(etapes.map((l) => l.nom).join(C.puis)) : C.vide} data-etapes={etapes.length}>
      <rect className="terre" x="-400" y="-200" width="1300" height="1400" />
      <path className="ville" d="M44 118C62 64 150 40 250 46S384 40 394 104 372 254 304 296 160 338 96 312 26 178 44 118Z" />
      <path className="rue" d="M168 -200C172 150 162 250 174 420S204 620 208 760" />
      <path className="rue" d="M-400 206C120 178 262 188 900 160" />
      <path className="rue" d="M60 60C122 112 206 120 336 70" />
      <path className="lagune" d="M-400 772C-60 760 80 770 240 766S440 758 900 774L900 832C440 842 260 826 180 836S-60 842 -400 828Z" />
      <path className="plage" d="M-400 852C80 846 300 856 900 848L900 893 -400 895Z" />
      <path className="mer" d="M-400 893C140 889 300 897 900 891L900 1200 -400 1200Z" />
      <path className="route" d="M121 230 158 398 199 557 208 563 212 875" />
      <text className="eau-nom" x="430" y="806" textAnchor="end">
        {C.lagune}
      </text>
      <text className="mer-nom" x="220" y="940" textAnchor="middle">
        {C.ocean}
      </text>
      {fonds
        .filter((l) => !vus.has(l.cle) && surCarte(l.coords))
        .map((l) => {
          const p = projeter(l.coords);
          return (
            <g key={l.cle} className="lieu-fond" transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}>
              <title>{l.nom}</title>
              <circle r="5" />
            </g>
          );
        })}
      <g className="itineraire">
        {etapes.slice(1).map((l, i) => {
          const a = pts[i], b = pts[i + 1];
          const L = Math.hypot(b.x - a.x, b.y - a.y), t = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
          return (
            <g key={`${l.cle}-${i}`} transform={`translate(${a.x.toFixed(1)} ${a.y.toFixed(1)}) rotate(${t.toFixed(2)})`}>
              <rect className="seg" x="0" y="-2.5" width={L.toFixed(1)} height="5" rx="2.5" style={vars({ "--d": i })} />
            </g>
          );
        })}
      </g>
      {etapes.map((l, i) => {
        const p = pts[i], a = ancre(p.x);
        return (
          <g key={`${l.cle}-${i}`} className="etape" data-rang={i + 1} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`} style={vars({ "--d": i })}>
            <g className="pose">
              <circle className="rond" r="20" />
              <text className="rang" y="7">
                {i + 1}
              </text>
            </g>
            <text className="nom" x={a === "start" ? 30 : -30} y="8" textAnchor={a}>
              {l.nom}
            </text>
          </g>
        );
      })}
      {pts.length > 1 && <circle ref={disque} className="disque-carte" r="11" cx="0" cy="0" style={{ transform: `translate(${pts[0].x.toFixed(1)}px, ${pts[0].y.toFixed(1)}px)` }} />}
    </svg>
  );
}

/** Course du soleil du jour du voyage (maquette E, « Le parcours ») : lever et coucher de ce jour à Ouidah, et un point
 * numéroté par moment de ce jour, posé à son heure. */
export function ArcDuJour({ s, points, nom }: { s: Soleil; points: { rang: number | null; minute: number }[]; nom: string }) {
  const W = 260, hz = 46, a = 36, span = s.coucher - s.aube;
  const xy = (m: number) => {
    const t = Math.max(s.aube, Math.min(s.coucher, m));
    return [((t - s.aube) / span) * W, hz - a * Math.sin((Math.PI * (t - s.lever)) / (s.coucher - s.lever))];
  };
  const d: string[] = [];
  for (let m = s.aube; m <= s.coucher; m += 10) d.push(xy(m).map((v) => v.toFixed(1)).join(" "));
  return (
    <svg className="mini-arc parcours-arc" viewBox={`-10 -12 ${W + 20} ${hz + 34}`} role="img" aria-label={nom}>
      <path className="arc" d={`M${d.join(" L")}`} />
      <line className="hz" x1="0" x2={W} y1={hz} y2={hz} />
      {points.map((q, k) => {
        const [x, y] = xy(q.minute);
        return (
          <g key={k} className="pt-etape" data-minute={q.minute} style={vars({ "--k": k })}>
            <circle cx={x.toFixed(1)} cy={y.toFixed(1)} r={q.rang !== null ? 9 : 5} />
            {q.rang !== null && (
              <text x={x.toFixed(1)} y={(y + 4).toFixed(1)}>
                {q.rang}
              </text>
            )}
          </g>
        );
      })}
      <text className="hz-txt" x="0" y={hz + 18}>
        {hm(s.lever)}
      </text>
      <text className="hz-txt" x={W} y={hz + 18} textAnchor="end">
        {hm(s.coucher)}
      </text>
    </svg>
  );
}
