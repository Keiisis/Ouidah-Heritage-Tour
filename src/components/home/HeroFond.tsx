"use client";

import Image from "next/image";
import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import type { Media } from "@/content/types";

// Fond du hero : les photos se relaient en fondu enchaîné toutes les 6 s, chacune avec son lent zoom (Ken Burns).
// Mouvement réduit : la première photo seule, immobile.
export function HeroFond({ images }: { images: Media[] }) {
  const [actif, setActif] = useState(0);
  const reduit = useReducedMotion();

  useEffect(() => {
    if (reduit || images.length < 2) return;
    const t = setInterval(() => setActif((i) => (i + 1) % images.length), 6000);
    return () => clearInterval(t);
  }, [reduit, images.length]);

  return (
    <div className="absolute inset-0 z-0 overflow-hidden">
      {images.map((img, i) => (
        <Image
          key={img.src}
          src={img.src}
          alt={i === actif ? img.alt : ""}
          aria-hidden={i !== actif}
          fill
          priority={i === 0}
          sizes="100vw"
          className={`ken-burns scale-105 object-cover object-center transition-opacity duration-[1500ms] ease-in-out ${i === actif ? "opacity-100" : "opacity-0"}`}
        />
      ))}
    </div>
  );
}
