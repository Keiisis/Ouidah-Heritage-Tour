"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { dessinerCarte, type TextesCarte } from "./carte";
import type { DonneesCarte } from "./sejour";

// En-tête du devis (maquette E) : la carte du séjour, nord en haut, redessinée à la taille réelle du cadre (une fois les
// polices chargées, puis à chaque changement de largeur) ; le cartouche (titre, numéro, client) reste posé dans la terre.
// Le SVG n'a pas d'enfants React : il est rempli à la main.
export function CarteSejour({ donnees, textes, aria, children }: { donnees: DonneesCarte; textes: TextesCarte; aria: string; children: ReactNode }) {
  const cadre = useRef<HTMLElement>(null), svg = useRef<SVGSVGElement>(null), cartouche = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const c = cadre.current, s = svg.current, ct = cartouche.current;
    if (!c || !s || !ct) return;
    let largeur = 0, premiere = true, fini = false;
    let ro: ResizeObserver | null = null;
    const dessiner = () => {
      const W = Math.round(c.clientWidth), H = Math.round(c.clientHeight);
      if (!W || W === largeur) return;
      largeur = W;
      const cr = ct.getBoundingClientRect(), fr = c.getBoundingClientRect();
      const droite = cr.right - fr.left;
      const reserve: [number, number, number, number][] = [[0, 0, droite + 12, cr.bottom - fr.top + 10]];
      s.classList.remove("sg-anime");
      if (W < 560) dessinerCarte(s, donnees, textes, { W, H, mer: 74, haut: 36, xEst: W - 122, xOuest: droite + 16, police: 12.5, marge: 16, deuxRangs: true, reserve });
      else dessinerCarte(s, donnees, textes, { W, H, mer: 56, haut: 40, xEst: W - 194, xOuest: droite + 24, police: 14, marge: 32, deuxRangs: false, reserve });
      if (premiere && !matchMedia("(prefers-reduced-motion: reduce)").matches) s.classList.add("sg-anime");
      premiere = false;
    };
    document.fonts.ready.then(() => {
      if (fini) return;
      dessiner();
      ro = new ResizeObserver(dessiner);
      ro.observe(c);
    });
    return () => {
      fini = true;
      ro?.disconnect();
    };
  }, [donnees, textes]);

  return (
    <figure ref={cadre} className="sg-carte-ecran">
      <svg ref={svg} className="sg-carte" role="img" aria-label={aria} />
      <div ref={cartouche} className="sg-cartouche">
        {children}
      </div>
    </figure>
  );
}
