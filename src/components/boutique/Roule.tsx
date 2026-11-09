"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useMouvementReduit } from "@/lib/mouvement";

// Bascule d'un libellé ou d'un chiffre (MOTION-I 2.3) : l'ancien contenu monte et s'efface (150 ms, courbe de départ),
// le nouveau entre par le bas (150 ms, courbe d'arrivée). La boîte parente coupe le débordement (overflow: clip).
// `rendu(cle)` dessine le contenu d'un état. Pas de mouvement pendant l'hydratation (le panier lu sur l'appareil
// remplace l'état vide du serveur) ni en mouvement réduit : le contenu change d'un coup.
const SORTIE = [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-.6em)" }];
const ENTREE = [{ opacity: 0, transform: "translateY(.6em)" }, { opacity: 1, transform: "none" }];

export function Roule({ cle, rendu, className = "" }: { cle: string; rendu: (cle: string) => ReactNode; className?: string }) {
  const boite = useRef<HTMLSpanElement>(null);
  const reduit = useMouvementReduit();
  const [vu, setVu] = useState(cle);
  const [anime, setAnime] = useState(false);
  // état précédent rattrapé pendant le rendu (modèle « informations des rendus précédents » de React)
  if (vu !== cle && (!anime || reduit)) setVu(cle);

  useEffect(() => {
    const t = setTimeout(() => setAnime(true), 400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const el = boite.current;
    if (!el || vu === cle || !anime || reduit) return;
    const sortie = el.animate(SORTIE, { duration: 150, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
    sortie.finished
      .then(() => {
        flushSync(() => setVu(cle));
        sortie.cancel();
        el.animate(ENTREE, { duration: 150, easing: "cubic-bezier(0,0,.3,1)" });
      })
      .catch(() => {
        /* annulée par un changement plus récent */
      });
    return () => sortie.cancel();
  }, [cle, vu, anime, reduit]);

  return (
    <span ref={boite} className={className}>
      {rendu(vu)}
    </span>
  );
}
