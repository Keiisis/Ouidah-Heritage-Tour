"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { espace as T } from "@/content/espace";
import "./onglets.css";

// Rubriques de l'accueil : sur ordinateur, une grille de blocs ; en 390, des onglets collants (un seul bloc à la fois,
// pour tenir la page courte). `autres` : blocs de la grille qui ne sont pas des onglets (masqués ou résumés en 390).
// Flèches gauche et droite, Début et Fin entre les onglets.
export type Onglet = { id: string; titre: string; contenu: ReactNode };

export function Onglets({ onglets, autres }: { onglets: Onglet[]; autres?: ReactNode }) {
  const [actif, setActif] = useState(onglets[0]?.id);
  const uid = useId().replace(/[^\w-]/g, "");
  // barre plus large que l'écran (5 onglets admin en 390) : elle défile, un fondu signale ce qui reste à droite,
  // et l'onglet choisi est ramené dans le champ
  const barre = useRef<HTMLDivElement>(null);
  const [suite, setSuite] = useState(false);
  useEffect(() => {
    const b = barre.current;
    if (!b) return;
    const mesurer = () => setSuite(b.scrollLeft + b.clientWidth < b.scrollWidth - 1);
    mesurer();
    b.addEventListener("scroll", mesurer, { passive: true });
    window.addEventListener("resize", mesurer);
    return () => {
      b.removeEventListener("scroll", mesurer);
      window.removeEventListener("resize", mesurer);
    };
  }, []);
  useEffect(() => {
    document.getElementById(`${uid}-${actif}`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [actif, uid]);
  const aller = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = onglets.findIndex((o) => o.id === actif);
    const j = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? onglets.length - 1 : null;
    if (j === null) return;
    e.preventDefault();
    const o = onglets[(j + onglets.length) % onglets.length];
    setActif(o.id);
    document.getElementById(`${uid}-${o.id}`)?.focus();
  };
  return (
    <div className="esp-onglets">
      <div ref={barre} className="onglets-barre" role="tablist" aria-label={T.onglets} onKeyDown={aller} data-suite={suite ? "" : undefined}>
        {onglets.map((o) => (
          <button key={o.id} type="button" role="tab" id={`${uid}-${o.id}`} aria-selected={o.id === actif} aria-controls={`${uid}-${o.id}-p`} tabIndex={o.id === actif ? 0 : -1} onClick={() => setActif(o.id)}>
            {o.titre}
          </button>
        ))}
      </div>
      <div className="esp-grille">
        {onglets.map((o) => (
          <div key={o.id} className="onglet" role="tabpanel" id={`${uid}-${o.id}-p`} aria-labelledby={`${uid}-${o.id}`} data-actif={o.id === actif ? "" : undefined}>
            {o.contenu}
          </div>
        ))}
        {autres}
      </div>
    </div>
  );
}
