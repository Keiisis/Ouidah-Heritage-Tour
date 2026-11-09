"use client";

import Image from "next/image";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef } from "react";
import { collage as COLLAGE } from "@/content/fr";
import { useContenu } from "@/components/ui/ContenuSite";
import { MaskedLines } from "@/components/ui/MaskedLines";

// Position finale de chaque photo (centre, en % de l'écran) : toutes en périphérie, le centre reste au titre.
const PLACES = [
  { cx: 12, cy: 24, w: "15vw", r: "4/5", rot: -6 },
  { cx: 86, cy: 22, w: "17vw", r: "3/4", rot: 5 },
  { cx: 30, cy: 82, w: "13vw", r: "1/1", rot: 3 },
  { cx: 88, cy: 76, w: "14vw", r: "4/5", rot: -4 },
  { cx: 50, cy: 13, w: "10vw", r: "3/4", rot: 2 },
  { cx: 10, cy: 72, w: "13vw", r: "3/2", rot: 4 },
  { cx: 66, cy: 86, w: "11vw", r: "4/5", rot: -3 },
];

// Chaque photo part du centre, petite et inclinée, et rejoint sa place au défilement (section figée).
function Photo({ i, progres }: { i: number; progres: MotionValue<number> }) {
  const collage = useContenu("fr.collage", COLLAGE);
  const p = PLACES[i];
  const m = collage.images[i];
  const debut = i * 0.05;
  const x = useTransform(progres, [debut, debut + 0.55], [`${50 - p.cx}vw`, "0vw"]);
  const y = useTransform(progres, [debut, debut + 0.55], [`${50 - p.cy}vh`, "0vh"]);
  const scale = useTransform(progres, [debut, debut + 0.55], [0.4, 1]);
  const rotate = useTransform(progres, [debut, debut + 0.55], [p.rot * 3, p.rot]);
  const opacity = useTransform(progres, [debut, debut + 0.15], [0, 1]);
  return (
    <motion.div
      className="frame absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${p.cx}%`, top: `${p.cy}%`, width: p.w, aspectRatio: p.r, x, y, scale, rotate, opacity }}
    >
      <Image src={m.src} alt={m.alt} fill sizes="18vw" className="object-cover" />
    </motion.div>
  );
}

// Section 9 — collage sur fond latérite : la section se fige, les photos (personnes d'abord) jaillissent du centre
// et s'ouvrent en couronne autour de la phrase.
export function Strip() {
  const collage = useContenu("fr.collage", COLLAGE);
  const zone = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: zone, offset: ["start start", "end end"] });
  return (
    <section ref={zone} className="on-dark relative bg-laterite text-ivory md:h-[240vh]" aria-label={collage.label}>
      <div className="relative overflow-hidden md:sticky md:top-0 md:h-[100svh]">
        <div aria-hidden="true" className="absolute inset-0 hidden md:block">
          {collage.images.map((_, i) => (
            <Photo key={i} i={i} progres={scrollYProgress} />
          ))}
        </div>
        <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 py-30 text-center md:py-0">
          <p className="label text-ivory/80">{collage.label}</p>
          <MaskedLines lines={collage.title} className="mt-6 text-[56px]/[56px] tracking-[-0.03em] md:text-[9vw]/[0.95]" />
        </div>
      </div>
      <ul className="flex gap-2 overflow-x-auto px-6 pb-12 md:hidden">
        {collage.images.map((m) => (
          <li key={m.src} className="frame relative h-[260px] w-[200px] shrink-0">
            <Image src={m.src} alt={m.alt} fill sizes="200px" className="object-cover" />
          </li>
        ))}
      </ul>
    </section>
  );
}
