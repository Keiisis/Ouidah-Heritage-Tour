"use client";

import { useEffect } from "react";
import { attendreOuverture } from "@/lib/ouverture";

// Mouvement signature de Qui sommes-nous : le rideau soleil (le cadre se découvre d'un coup, puis le nom monte de son
// masque, ligne par ligne). Le contenu est rendu visible par le serveur ; ce composant ne fait que rejouer l'entrée.
// - Haut de page : si l'ouverture « Dangbé » n'a pas été vue, l'entrée attend sa fin ; sinon la CSS la joue seule
//   (html[data-ouverture="vue"]), sans JavaScript.
// - Équipe : au premier défilement, seuls les membres encore sous l'écran prennent l'état d'attente, puis se lèvent à leur
//   entrée ; ce qui est déjà à l'écran ne clignote jamais.
// - Mouvement réduit : rien.
export function MouvementAgence() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let fini = false;
    const ouverture = document.querySelector<HTMLElement>(".qs-ouverture");
    if (ouverture && document.documentElement.dataset.ouverture !== "vue") {
      ouverture.classList.add("qs-attente");
      attendreOuverture().then(() => {
        if (fini) return;
        ouverture.classList.remove("qs-attente");
        ouverture.classList.add("qs-joue");
      });
    }

    const io = new IntersectionObserver(
      (entrees) =>
        entrees.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.remove("qs-avant");
          io.unobserve(e.target);
        }),
      { rootMargin: "0px 0px -20% 0px" },
    );
    const armer = () =>
      document.querySelectorAll<HTMLElement>("[data-qs-entree]").forEach((el) => {
        if (el.getBoundingClientRect().top <= window.innerHeight) return;
        el.classList.add("qs-avant", "qs-net");
        void el.offsetWidth; // l'état d'attente est posé sans transition, puis la transition revient pour l'entrée
        el.classList.remove("qs-net");
        io.observe(el);
      });
    window.addEventListener("scroll", armer, { once: true, passive: true });
    return () => {
      fini = true;
      window.removeEventListener("scroll", armer);
      io.disconnect();
      document.querySelectorAll(".qs-avant, .qs-attente").forEach((el) => el.classList.remove("qs-avant", "qs-attente"));
    };
  }, []);
  return null;
}
