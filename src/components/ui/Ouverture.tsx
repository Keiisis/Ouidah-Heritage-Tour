"use client";

import { useEffect, useRef, useState } from "react";
import { finirOuverture } from "@/lib/ouverture";
import { preparerOuverture, type LogoOuverture } from "./ouverture-scene";
import "./ouverture.css";

export const CLE_OUVERTURE = "oht-intro";
const LOGO = "/ouverture/logo.json", VECTEUR = "/ouverture/logo-vecteur.svg";

// Script de <head> : avant le premier affichage, marque l'ouverture comme déjà vue (session, mouvement réduit, pages de
// connexion de l'équipe) pour
// qu'aucun aplat ne clignote, et sinon précharge le logo. Lu par la règle html[data-ouverture="vue"] de ouverture.css.
export const scriptOuverture = `try{var c=location.pathname;if(["/agents","/admins"].some(function(p){return c===p||c.indexOf(p+"/")===0})||sessionStorage.getItem("${CLE_OUVERTURE}")==="1"||matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.dataset.ouverture="vue";else for(const h of["${LOGO}","${VECTEUR}"]){const l=document.createElement("link");l.rel="preload";l.as="fetch";l.href=h;l.crossOrigin="anonymous";document.head.appendChild(l)}}catch(e){document.documentElement.dataset.ouverture="vue"}`;

// Ouverture « Dangbé » (Kevin, 29/10/2026), une fois par session, sans bouton. Aplat soleil dès le rendu serveur ; si le
// logo manque ou tarde (1,5 s), elle s'efface ; ultime filet en CSS à 6 s, même sans JavaScript.
export function Ouverture() {
  const [finie, setFinie] = useState(false);
  const voile = useRef<HTMLDivElement>(null), scene = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const fermer = () => {
      setFinie(true);
      finirOuverture();
    };
    if (document.documentElement.dataset.ouverture === "vue") return fermer();
    try {
      sessionStorage.setItem(CLE_OUVERTURE, "1");
    } catch {
      // stockage bloqué : l'ouverture rejouera à la prochaine page, sans gêner
    }
    let arret = false, image = 0;
    const secours = window.setTimeout(fermer, 1500);
    (async () => {
      const [j, v] = await Promise.all([fetch(LOGO), fetch(VECTEUR)]);
      if (!j.ok || !v.ok) throw new Error("logo");
      const logo = (await j.json()) as LogoOuverture;
      const vec = new DOMParser().parseFromString(await v.text(), "image/svg+xml");
      if (arret || !scene.current || !voile.current) return;
      const { fin, rendre } = preparerOuverture(scene.current, logo, vec, window.innerWidth, window.innerHeight);
      window.clearTimeout(secours);
      rendre(0);
      const ov = voile.current;
      ov.style.background = "transparent"; // la SVG peint le soleil ; le trou de l'œil doit donner sur le site
      ov.style.animation = "none"; // le JavaScript a la main : le filet CSS de 6 s ne doit pas couper l'animation
      // l'image 0 tient le temps que la page finisse de s'hydrer : départ au premier temps libre, 600 ms au plus
      await new Promise<void>((pret) => {
        if (window.requestIdleCallback) window.requestIdleCallback(() => pret(), { timeout: 600 });
        else window.setTimeout(pret, 120);
      });
      if (arret) return;
      ov.dataset.etat = "joue";
      // horloge à pas bornés (50 ms au plus par image) : juste jusqu'à 20 images/s ; un arrêt plus long fige l'animation
      // au lieu de la faire sauter
      let t = 0, avant = 0;
      const pas = (now: number) => {
        if (arret) return;
        if (avant) t += Math.min(now - avant, 50);
        avant = now;
        if (t >= fin) return fermer();
        rendre(t);
        image = requestAnimationFrame(pas);
      };
      image = requestAnimationFrame(pas);
    })().catch(() => {
      window.clearTimeout(secours);
      fermer();
    });
    return () => {
      arret = true;
      window.clearTimeout(secours);
      cancelAnimationFrame(image);
    };
  }, []);

  if (finie) return null;
  return (
    <div ref={voile} className="ov" aria-hidden="true">
      <svg ref={scene} className="ov-scene" />
    </div>
  );
}
