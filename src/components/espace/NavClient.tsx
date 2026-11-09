"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { Role } from "@/content/equipe";
import { espace as T } from "@/content/espace";
import { useMinute } from "./Cadre";
import { hm, lumiere, minutesOuidah, soleil, surArc } from "./outils";
import { Picto } from "./Picto";

// Parties vivantes de la navigation : le menu du téléphone (la carte des sections déployée au-dessus de la barre du
// bas), la petite course du soleil en tête de navigation, la déconnexion.

export function NavCadre({ bas, children }: { bas: ReactNode; children: ReactNode }) {
  const [ouvert, setOuvert] = useState(false);
  useEffect(() => {
    if (!ouvert) return;
    const echap = (e: KeyboardEvent) => e.key === "Escape" && setOuvert(false);
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [ouvert]);
  return (
    <nav className="esp-nav" data-ouvert={ouvert ? "" : undefined} aria-label={T.nav.navigation} onClickCapture={(e) => (e.target as Element).closest("a") && setOuvert(false)}>
      {children}
      <div className="esp-bas">
        {bas}
        <button type="button" className="bas" aria-expanded={ouvert} aria-controls="esp-groupes" onClick={() => setOuvert((o) => !o)}>
          <Picto nom={ouvert ? "fermer" : "menu"} />
          <span>{ouvert ? T.nav.fermer : T.nav.menu}</span>
        </button>
      </div>
    </nav>
  );
}

/** La course du soleil en petit : la même lumière sur tous les écrans. */
export function NavSoleil() {
  const minute = useMinute();
  const m = minutesOuidah(minute), s = soleil(minute), lum = lumiere(m, s);
  const W = 200, hz = 44, a = 34;
  const point = (mm: number) => {
    const p = surArc(mm, s);
    return `${(p.x * W).toFixed(1)} ${(hz - a * p.h).toFixed(1)}`;
  };
  const trace = (de: number, jusque: number) => {
    const pts: string[] = [];
    for (let mm = de; mm < jusque; mm += 15) pts.push(point(mm));
    pts.push(point(jusque));
    return `M${pts.join(" L")}`;
  };
  const p = surArc(m, s);
  // le disque reste entier au-dessus de l'horizon, même à l'aube et la nuit
  const [x, y] = lum === "nuit" ? [m < s.aube ? 0 : W, hz - 7] : [p.x * W, Math.min(hz - 7, hz - a * p.h)];
  return (
    <div className="esp-nav-soleil" data-lumiere={lum}>
      <svg viewBox={`0 -4 ${W} 54`} aria-hidden="true" focusable="false">
        <path className="arc" d={trace(s.aube, s.coucher)} />
        {m > s.aube && <path className="arc-p" d={trace(s.aube, Math.min(m, s.coucher))} />}
        <line className="hz" x1="0" x2={W} y1={hz} y2={hz} />
        <circle className="sol" cx={x.toFixed(1)} cy={y.toFixed(1)} r="6" style={{ "--dx": `${(-x).toFixed(1)}px`, "--dy": `${(hz + 8 - y).toFixed(1)}px` } as CSSProperties} />
      </svg>
      <p>
        <span>
          {T.ouidah.nom}, <b>{hm(m)}</b>
        </span>
        <span>{T.journee.lumieres[lum]}</span>
      </p>
    </div>
  );
}

/** Déconnexion : la session est révoquée côté serveur, puis la page est rechargée en entier (aucun rendu connecté ne
 * reste dans le cache du routeur). */
export function Deconnexion({ role }: { role: Role }) {
  const [sortie, setSortie] = useState(false);
  const sortir = async () => {
    if (sortie) return;
    setSortie(true);
    await fetch("/api/equipe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "deconnexion", role }) }).catch(() => null);
    window.location.reload(); // sans session, une section renvoie d'elle-même à l'entrée (connexion G)
  };
  return (
    <button type="button" id="deconnexion" onClick={sortir} aria-busy={sortie}>
      <Picto nom="sortie" />
      <span>{sortie ? T.sortie : T.deconnexion}</span>
    </button>
  );
}
