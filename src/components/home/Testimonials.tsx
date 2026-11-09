"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { testimonials as TESTIMONIALS } from "@/content/fr";
import { useContenu } from "@/components/ui/ContenuSite";
import { D, EASE } from "@/lib/motion";
import { Icon } from "@/components/ui/Icon";

// Section 11 — témoignages réels uniquement ; la section n'existe pas tant qu'aucun avis n'est saisi.
export function Testimonials() {
  const testimonials = useContenu("fr.testimonials", TESTIMONIALS);
  const [i, setI] = useState(0);
  if (testimonials.length === 0) return null;
  const t = testimonials[i];
  const aller = (pas: number) => setI((n) => (n + pas + testimonials.length) % testimonials.length);
  return (
    <section className="py-20 lg:py-30">
      <div className="container-oht">
        <AnimatePresence mode="wait">
          <motion.figure key={i} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: D.base, ease: EASE } }} exit={{ opacity: 0 }}>
            <blockquote className="max-w-[24ch] font-display text-h3">{t.quote}</blockquote>
            <figcaption className="mt-8 flex items-center gap-4">
              {t.photo ? <Image src={t.photo.src} alt="" width={56} height={56} className="size-14 rounded-full object-cover" /> : null}
              <span className="label">
                {t.name} · {t.country}
              </span>
            </figcaption>
          </motion.figure>
        </AnimatePresence>
        {testimonials.length > 1 ? (
          <div className="mt-8 flex gap-2">
            <button type="button" onClick={() => aller(-1)} aria-label="Précédent" className="grid size-11 place-items-center border border-hairline">
              <Icon name="arrow-left" />
            </button>
            <button type="button" onClick={() => aller(1)} aria-label="Suivant" className="grid size-11 place-items-center border border-hairline">
              <Icon name="arrow-right" />
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
