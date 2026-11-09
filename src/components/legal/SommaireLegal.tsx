"use client";

import { useEffect, useRef } from "react";
import { ouvrirChoix } from "@/lib/consentement";
import { legalUi as LEGAL_UI } from "@/content/legal-ui";
import { useContenu } from "@/components/ui/ContenuSite";

// Sommaire des pages légales : suit la lecture (la section dont le titre a passé le tiers haut de l'écran), curseur
// soleil déplacé en transform seulement. Rendu replié (aucun saut sur mobile) ; déplié dès l'hydratation à partir de 1024 px.
export function SommaireLegal({ sections }: { sections: { id: string; titre: string }[] }) {
  const T = useContenu("legal-ui.legalUi", LEGAL_UI);
  const boite = useRef<HTMLDetailsElement>(null), liste = useRef<HTMLOListElement>(null), curseur = useRef<HTMLElement>(null);

  useEffect(() => {
    const d = boite.current, ol = liste.current, c = curseur.current;
    if (!d || !ol || !c) return;
    if (matchMedia("(min-width: 1024px)").matches) d.open = true;
    const liens = [...ol.querySelectorAll("a")];
    const secs = sections.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e);
    let image = 0;
    const suivre = () => {
      let i = 0;
      secs.forEach((s, k) => {
        if (s.getBoundingClientRect().top < innerHeight * 0.33) i = k;
      });
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) i = secs.length - 1; // bas de page : la dernière
      liens.forEach((a, k) => a.classList.toggle("lg-actif", k === i));
      const a = liens[i];
      if (a) c.style.transform = `translateY(${a.offsetTop}px) scaleY(${a.offsetHeight / 100})`;
    };
    const auDefilement = () => {
      cancelAnimationFrame(image);
      image = requestAnimationFrame(suivre);
    };
    suivre();
    addEventListener("scroll", auDefilement, { passive: true });
    addEventListener("resize", auDefilement);
    return () => {
      cancelAnimationFrame(image);
      removeEventListener("scroll", auDefilement);
      removeEventListener("resize", auDefilement);
    };
  }, [sections]);

  return (
    <details ref={boite} className="lg-sommaire">
      <summary>{T.sommaire}</summary>
      <ol ref={liste}>
        {sections.map((s, i) => (
          <li key={s.id}>
            <a href={`#${s.id}`}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              {s.titre}
            </a>
          </li>
        ))}
        <i ref={curseur} className="lg-curseur" aria-hidden="true" />
      </ol>
    </details>
  );
}

/** Rouvre le bandeau « Vos choix sur ce site » (page Confidentialité et cookies). */
export function BoutonChoixCookies() {
  const T = useContenu("legal-ui.legalUi", LEGAL_UI);
  return (
    <button type="button" className="lg-bouton" onClick={ouvrirChoix}>
      {T.revoirChoix}
    </button>
  );
}
