"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Carte, Etiquette } from "./fiche";

// Mouvement signature de la fiche circuit : le tracé se dessine au défilement (segments allumés à l'opacité) et l'étape lue
// s'allume sur la carte avec son nom. Au bureau, la carte reste collée à droite ; sous 1024 px, elle devient un bandeau
// collant dont la caméra suit la pointe du tracé (transform). Sans JavaScript, ou avec le mouvement réduit, le tracé est
// entier : rien n'est caché au repos, seules les classes posées ici (fc-lecture, fc-anime) changent l'état.
const ETROIT = "(max-width: 1023px)";
const REDUIT = "(prefers-reduced-motion: reduce)";

type Nom = Etiquette & { actif: boolean };

export function CarteTrace({ carte, nord, aria, children }: { carte: Carte; nord: string; aria: string; children: ReactNode }) {
  const racine = useRef<HTMLDivElement>(null);
  const [noms, setNoms] = useState<Nom[]>(() => carte.etiquettes[0].map((e) => ({ ...e, actif: false })));
  const [echelle, setEchelle] = useState<{ px: number; texte: string } | null>(null);
  const [k, setK] = useState(1); // échelle des pastilles et des noms : même taille à l'écran quand la caméra zoome

  useEffect(() => {
    const trouve = racine.current;
    if (!trouve) return;
    const el: HTMLElement = trouve; // non nul aussi dans les fonctions internes
    const aside = el.querySelector<HTMLElement>(".fc-carte")!, svg = aside.querySelector<SVGSVGElement>("svg")!, camera = svg.querySelector<SVGGElement>(".fc-camera")!;
    const segs = [...svg.querySelectorAll<SVGPathElement>(".fc-seg")], groupes = [...svg.querySelectorAll<SVGGElement>(".fc-groupe")];
    const blocs = [...el.querySelectorAll<HTMLElement>("[data-fc-etape]")];
    const etroit = matchMedia(ETROIT), reduit = matchMedia(REDUIT);
    const { w, h, points, cumul, km, groupes: G, groupeDe, pxParKm, paliers } = carte, L = cumul[cumul.length - 1] ?? 0;
    let s = 1, z = 1, ox = 0, oy = 0, bw = 0, bh = 0, allumes = -1, lu = -2, tx = 0, ty = 0, cote = -1, pose = "";
    const ecran = (x: number, y: number): [number, number] => [ox + s * (tx + z * x), oy + s * (ty + z * y)];

    // point du tracé projeté à la distance d (km) du départ
    const pointA = (d: number): [number, number] => {
      if (points.length < 2) return points[0];
      let i = 1;
      while (i < points.length - 1 && cumul[i] < d) i++;
      const [a, b] = [points[i - 1], points[i]], seg = cumul[i] - cumul[i - 1], t = seg ? Math.min(1, Math.max(0, (d - cumul[i - 1]) / seg)) : 0;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    };

    function mesurer() {
      const r = svg.getBoundingClientRect();
      [bw, bh] = [r.width, r.height];
      s = Math.min(bw / w, bh / h) || 1;
      [ox, oy] = [(bw - w * s) / 2, (bh - h * s) / 2];
      // bandeau : environ 1,2 km sur sa hauteur ; pastilles et noms gardent leur taille à l’écran (k)
      z = etroit.matches ? Math.min(4, Math.max(1, bh / 1.2 / (pxParKm * s))) : 1;
      setK(etroit.matches ? Math.round((1000 / (s * z))) / 1000 : 1);
      const pxKm = pxParKm * s * z, max = etroit.matches ? 120 : 150;
      const p = paliers.filter((x) => x.km * pxKm <= max).pop() ?? paliers[0];
      setEchelle({ px: Math.round(p.km * pxKm), texte: p.texte });
      allumes = -1;
      lu = -2;
      pose = "-";
    }

    // nom de l'étape lue dans le bandeau : à droite, à gauche, au-dessus ou au-dessous de sa pastille, du côté libre
    function nomBandeau(actif: number): Nom[] {
      if (actif < 0) return [];
      const j = groupeDe[actif], g = G[j], texte = carte.noms[actif];
      const [px, py] = ecran(g.x, g.y), l = texte.length * 15 * 0.6 + 6;
      // zones réservées : le nord en haut à droite, l'échelle en bas à gauche
      const libre = (x0: number, y: number) => x0 >= 8 && x0 + l <= bw - 8 && y - 11 >= 8 && y + 11 <= bh - 8 && !(x0 + l > bw - 56 && y - 11 < 56) && !(x0 < 150 && y + 11 > bh - 52);
      const centre = Math.min(bw - 8 - l, Math.max(8, px - l / 2));
      const essais: [number, number][] = [[px + g.demi + 8, py], [px - g.demi - 8 - l, py], [centre, py - 30], [centre, py + 30]];
      // le côté déjà pris est gardé tant qu'il tient : le nom ne saute pas d'un côté à l'autre pendant que la caméra bouge
      cote = [cote, 0, 1, 2, 3].find((c) => c >= 0 && libre(...essais[c])) ?? 2;
      const [x0, y] = essais[cote];
      return [{ j, texte, x: Math.round(x0 - px), y: Math.round(y - py), actif: true }];
    }

    function poser(d: number, actif: number) {
      const n = L ? Math.min(segs.length, Math.ceil((d / L) * segs.length - 1e-6)) : 0;
      if (n !== allumes) {
        segs.forEach((p, k) => p.classList.toggle("fc-on", k < n));
        allumes = n;
      }
      const ga = actif >= 0 ? groupeDe[actif] : -1;
      groupes.forEach((g, j) => {
        g.classList.toggle("fc-actif", j === ga);
        g.classList.toggle("fc-vu", j !== ga && d > 0 && km[G[j].membres[0]] <= d + 1e-3);
      });
      if (z > 1) {
        const [x, y] = pointA(d);
        [tx, ty] = [w / 2 - z * x, h / 2 - z * y];
        // la caméra suit la pointe du tracé sans perdre l'étape lue : sa pastille reste à 48 px du bord au moins
        if (ga >= 0) {
          const [sx, sy] = ecran(G[ga].x, G[ga].y);
          tx += (Math.max(48, Math.min(bw - 48, sx)) - sx) / s;
          ty += (Math.max(48, Math.min(bh - 48, sy)) - sy) / s;
        }
        camera.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${z.toFixed(3)})`;
      } else if (camera.style.transform) {
        [tx, ty] = [0, 0];
        camera.style.transform = "";
      }
      if (actif !== lu) {
        lu = actif;
        cote = -1;
        blocs.forEach((b, i) => b.classList.toggle("fc-actif", i === actif));
        if (!etroit.matches) setNoms(carte.etiquettes[actif + 1].map((e) => ({ ...e, actif: e.j === ga })));
      }
      if (etroit.matches) {
        // bandeau : le nom de l'étape lue est replacé quand la caméra le pousserait hors du cadre
        const n = nomBandeau(actif), cle = n.map((e) => `${e.j}:${e.x}:${e.y}:${e.texte}`).join();
        if (cle !== pose) {
          pose = cle;
          setNoms(n);
        }
      }
    }

    // l'étape dont le haut a passé le repère est lue ; le tracé avance entre elle et la suivante
    function lire() {
      const haut = etroit.matches ? aside.getBoundingClientRect().bottom : 0, repere = haut + (innerHeight - haut) * 0.45;
      const tops = blocs.map((b) => b.getBoundingClientRect().top);
      let actif = -1;
      tops.forEach((t, i) => { if (t < repere) actif = i; });
      if (reduit.matches) return poser(actif >= 0 ? km[actif] : 0, actif); // tracé entier, la caméra se pose sur l'étape lue
      let d = 0;
      if (actif >= 0) {
        const suivante = km[actif + 1];
        d = suivante == null ? km[actif] : km[actif] + Math.min(1, Math.max(0, (repere - tops[actif]) / (tops[actif + 1] - tops[actif]))) * (suivante - km[actif]);
      }
      poser(d, actif);
    }

    function installer() {
      el.classList.add("fc-lecture");
      el.classList.toggle("fc-anime", !reduit.matches);
      mesurer();
      lire();
    }
    let attente = false, minuterie = 0;
    const defiler = () => {
      if (attente) return;
      attente = true;
      requestAnimationFrame(() => { attente = false; lire(); });
    };
    const redimensionner = () => { clearTimeout(minuterie); minuterie = window.setTimeout(installer, 120); };
    installer();
    addEventListener("scroll", defiler, { passive: true });
    addEventListener("resize", redimensionner);
    etroit.addEventListener("change", installer);
    reduit.addEventListener("change", installer);
    return () => {
      removeEventListener("scroll", defiler);
      removeEventListener("resize", redimensionner);
      etroit.removeEventListener("change", installer);
      reduit.removeEventListener("change", installer);
      clearTimeout(minuterie);
      el.classList.remove("fc-lecture", "fc-anime");
    };
  }, [carte]);

  const parGroupe = new Map(noms.map((e) => [e.j, e]));
  return (
    <div className="fc-grille" ref={racine}>
      <aside className="fc-carte" aria-label={aria}>
        <svg viewBox={`0 0 ${carte.w} ${carte.h}`} role="img" aria-label={carte.image}>
          <g className="fc-camera">
            {carte.fond ? <path className="fc-m-fond" d={carte.fond} /> : null}
            <g>
              {carte.segments.map((d, k) => (
                <path key={k} className="fc-seg" d={d} />
              ))}
            </g>
            {carte.groupes.map((g, j) => {
              const nom = parGroupe.get(j);
              return (
                <g key={j} transform={`translate(${g.x} ${g.y}) scale(${k})`}>
                  <g className="fc-groupe">
                    <g className="fc-pastille">
                      {g.chemin ? (
                        <rect className="fc-forme fc-losange" x={-7} y={-7} width={14} height={14} transform="rotate(45)" />
                      ) : (
                        <>
                          <rect className="fc-forme" x={-g.demi} y={-14} width={2 * g.demi} height={28} rx={14} />
                          <text className="fc-m-num" dy={4.6}>
                            {g.label}
                          </text>
                        </>
                      )}
                    </g>
                    {nom ? (
                      <text className={`fc-m-nom${nom.actif ? " fc-m-nom-actif" : ""}`} x={nom.x} y={nom.y + 5}>
                        {nom.texte}
                      </text>
                    ) : null}
                  </g>
                </g>
              );
            })}
          </g>
        </svg>
        <div className="fc-nord" aria-hidden="true">
          {nord}
        </div>
        {echelle ? (
          <div className="fc-echelle" aria-hidden="true">
            <i style={{ width: echelle.px }} />
            <span>{echelle.texte}</span>
          </div>
        ) : null}
      </aside>
      {children}
    </div>
  );
}
