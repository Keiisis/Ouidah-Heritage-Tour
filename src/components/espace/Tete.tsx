import Image from "next/image";
import type { ReactNode } from "react";
import { logos } from "@/content/espace";
import { BasculeTheme } from "./Cadre";
import { BoutonPalette } from "./Palette";

// En-tête de chaque écran : le titre se lève de sa ligne, la recherche (palette Ctrl K) et la bascule du thème. En 390,
// l'emblème remplace la navigation latérale, repliée dans la barre du bas.
export function Tete({ titre, sous }: { titre: ReactNode; sous: ReactNode }) {
  return (
    <header className="esp-tete">
      <Image className="esp-embleme" src={logos.enteteMobile.src} alt={logos.enteteMobile.alt} width={logos.enteteMobile.largeur} height={logos.enteteMobile.hauteur} sizes="40px" />
      <div className="titres">
        <h1>{titre}</h1>
        <p className="sous">{sous}</p>
      </div>
      <div className="outils">
        <BoutonPalette />
        <BasculeTheme />
      </div>
    </header>
  );
}
