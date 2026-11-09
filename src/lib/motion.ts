// Système de mouvement : durées et courbes mesurées sur la référence (300 / 500 ms, cubic-bezier(0.6, 0, 0.5, 1)).
import type { Variants } from "motion/react";

export const EASE = [0.6, 0, 0.5, 1] as const;
export const D = { fast: 0.3, base: 0.5, slow: 1.0, story: 1.5 };

export const lineMask: Variants = {
  hidden: { y: "110%" },
  show: (i: number = 0) => ({ y: "0%", transition: { duration: D.slow, ease: EASE, delay: 0.1 + i * 0.12 } }),
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 48 },
  show: (i: number = 0) => ({ opacity: 1, y: 0, transition: { duration: D.base * 1.6, ease: EASE, delay: i * 0.08 } }),
};

export const inView = { initial: "hidden", whileInView: "show", viewport: { once: true, amount: 0.3 } } as const;
