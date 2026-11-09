"use client";

import { useState } from "react";
import "./terrain.css";

// Compteur à volets (maquette E, repris de B) : chaque caractère est une palette. Quand le texte change, seule la palette
// dont le caractère change bascule (rotation en X, transform seul) ; les autres restent immobiles. Premier rendu posé
// d'emblée. Le texte entier est lu par les lecteurs d'écran (`libelle`), les palettes sont décoratives.
export function Volets({ texte, taille, libelle }: { texte: string; taille?: "grand" | "moyen"; libelle?: string }) {
  // texte précédent gardé dans l'état (doc React « Storing information from previous renders ») : pas de ref lue au rendu
  const [prec, setPrec] = useState(texte);
  const [tour, setTour] = useState(0);
  const [change, setChange] = useState<boolean[]>([]);
  if (prec !== texte) {
    setChange([...texte].map((c, i) => c !== prec[i]));
    setPrec(texte);
    setTour((n) => n + 1);
  }
  return (
    <span className={taille ? `volets ${taille}` : "volets"}>
      <span className="invisible">{libelle ?? texte}</span>
      {[...texte].map((c, i) => (
        // une palette qui change reçoit une nouvelle clé : elle se remonte et joue sa bascule, une seule fois
        <span
          key={change[i] ? `${i}-${c}-${tour}` : `${i}-${c}`}
          className={`v${c === " " ? " blanc" : ""}${change[i] ? " bascule" : ""}`}
          aria-hidden="true"
        >
          {c === " " ? "" : c}
        </span>
      ))}
    </span>
  );
}
