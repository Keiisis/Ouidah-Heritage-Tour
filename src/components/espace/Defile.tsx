"use client";

import { useEffect, useRef } from "react";
import { euro, euroDeFcfa, fcfa } from "./outils";

// Chiffre qui défile jusqu'à sa valeur. Le serveur rend toujours l'état final (texte complet).

const FORMATS = { fcfa, euro, euroDeFcfa, nombre: (n: number) => String(n) };

/** Chiffre qui défile de 0 à sa valeur au premier affichage (jamais en mouvement réduit). Le texte rendu par React
 * reste en place : le défilé passe par data-defile (::after), retiré à la fin. */
export function Defile({ valeur, format, rang = 0 }: { valeur: number; format: keyof typeof FORMATS; rang?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !valeur || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const f = FORMATS[format];
    const t0 = performance.now() + 360 + rang * 70, duree = 1100;
    let id = 0;
    const pas = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - t0) / duree));
      el.dataset.defile = f(Math.round(valeur * (1 - Math.pow(1 - p, 3))));
      if (p < 1) id = requestAnimationFrame(pas);
      else delete el.dataset.defile;
    };
    el.dataset.defile = f(0);
    id = requestAnimationFrame(pas);
    return () => {
      cancelAnimationFrame(id);
      delete el.dataset.defile;
    };
  }, [valeur, format, rang]);
  return (
    <span ref={ref}>
      <span className="t">{FORMATS[format](valeur)}</span>
    </span>
  );
}
