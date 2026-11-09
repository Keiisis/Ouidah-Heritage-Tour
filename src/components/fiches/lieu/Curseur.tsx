"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { ficheLieu as FICHE_LIEU } from "@/content/fiche-lieu";
import { useContenu } from "@/components/ui/ContenuSite";

// Hier et aujourd'hui superposés, un curseur pour passer de l'un à l'autre : seulement quand l'admin a coché « même
// cadrage » (FICHES_LIEU.memeCadrage), sinon la fiche montre un diptyque fixe. Sans JavaScript : moitié, moitié.
// Le partage (--fl-x, de 0 à 1) ne pilote que des transform ; à l'ouverture, la CSS le fait glisser de 1 à 0,5.
export function Curseur({ hier, auj, marqueHier }: { hier: ReactNode; auj: ReactNode; marqueHier: string }) {
  const T = useContenu("fiche-lieu.ficheLieu", FICHE_LIEU);
  const [x, setX] = useState(50);
  return (
    <div className="fl-cadre" style={{ "--fl-x": x / 100 } as CSSProperties}>
      <div className="fl-couche">
        {hier}
        <span className="fl-marque">{marqueHier}</span>
      </div>
      <div className="fl-volet">
        <div className="fl-couche">
          {auj}
          <span className="fl-marque fl-marque-auj">{T.aujourdhui}</span>
        </div>
      </div>
      <input
        className="fl-curseur"
        type="range"
        min={0}
        max={100}
        value={x}
        aria-label={T.curseur}
        aria-valuetext={T.curseurValeur(100 - x)}
        onChange={(e) => setX(Number(e.currentTarget.value))}
      />
      <div className="fl-poignee" aria-hidden="true">
        <span className="fl-trait" />
        <span className="fl-prise">
          <svg viewBox="0 0 24 24">
            <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 6s-6 4.42-6 6s6 6 6 6m6-12s6 4.42 6 6s-6 6-6 6" />
          </svg>
        </span>
      </div>
    </div>
  );
}
