"use client";

import { motion } from "motion/react";
import type { ElementType } from "react";
import { lineMask } from "@/lib/motion";

// Chaque ligne monte de derrière son masque ; la phrase entière reste lisible d'un bloc par les lecteurs d'écran.
export function MaskedLines({
  lines,
  as: Tag = "h2",
  className = "",
  animate,
  delay = 0,
  accent,
}: {
  lines: string[];
  as?: ElementType;
  className?: string;
  animate?: boolean; // true : joue au montage (ouverture) ; sinon à l'entrée dans l'écran
  delay?: number;
  accent?: string; // classe de la dernière ligne (ex. « text-sun »)
}) {
  const declencheur = animate
    ? { initial: "hidden", animate: "show" }
    : { initial: "hidden", whileInView: "show", viewport: { once: true, amount: 0.4 } };
  return (
    <Tag className={className}>
      <span className="sr-only">{lines.join(" ")}</span>
      <motion.span aria-hidden="true" className="block" {...declencheur}>
        {lines.map((line, i) => (
          <span key={i} className="block overflow-hidden pb-[0.08em]">
            <motion.span className={`block ${accent && i === lines.length - 1 ? accent : ""}`} variants={lineMask} custom={i + delay}>
              {line}
            </motion.span>
          </span>
        ))}
      </motion.span>
    </Tag>
  );
}
