"use client";

import { useEffect, useRef } from "react";

// Filet de lecture : 3 px Soleil en haut de l'écran, qui suit la part lue du corps de l'article (élément `cible`).
// Seul `transform` change, une fois par image au plus ; c'est un retour d'état direct, gardé en mouvement réduit.
// Décoratif pour les lecteurs d'écran (la position de lecture leur est déjà donnée).
export function Progression({ cible }: { cible: string }) {
  const barre = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const corps = document.getElementById(cible);
    const b = barre.current;
    if (!corps || !b) return;
    let image = 0;
    const maj = () => {
      image = 0;
      const r = corps.getBoundingClientRect();
      const course = r.height - window.innerHeight * 0.6;
      const part = course > 0 ? Math.min(1, Math.max(0, (window.innerHeight * 0.4 - r.top) / course)) : 1;
      b.style.transform = `scaleX(${part})`;
    };
    const demande = () => {
      if (!image) image = requestAnimationFrame(maj);
    };
    maj();
    window.addEventListener("scroll", demande, { passive: true });
    window.addEventListener("resize", demande);
    return () => {
      cancelAnimationFrame(image);
      window.removeEventListener("scroll", demande);
      window.removeEventListener("resize", demande);
    };
  }, [cible]);

  return (
    <div className="jo-progression" aria-hidden="true">
      <div ref={barre} className="jo-progression-barre" />
    </div>
  );
}
