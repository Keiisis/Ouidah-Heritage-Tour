"use client";

import { MotionConfig } from "motion/react";
import Lenis from "lenis";
import { useEffect, type ReactNode } from "react";

// Défilement doux (Lenis) et respect de « réduire les animations » pour toutes les animations motion.
export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ autoRaf: true, duration: 1.2, easing: (t) => 1 - Math.pow(1 - t, 3) });
    return () => lenis.destroy();
  }, []);
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
