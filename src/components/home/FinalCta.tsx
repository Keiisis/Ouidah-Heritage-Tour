"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { finalCta as FINAL_CTA, finalMask as FINAL_MASK, nav as NAV } from "@/content/fr";
import { useContenu } from "@/components/ui/ContenuSite";
import { MaskedLines } from "@/components/ui/MaskedLines";
import { ButtonPrimary, LinkLine, whatsappHref } from "@/components/ui/Buttons";

// Section 13 — appel final : la photo de la plage de Ouidah vue à travers les lettres géantes « OUIDAH », qui glissent au défilement.
export function FinalCta() {
  const finalCta = useContenu("fr.finalCta", FINAL_CTA);
  const finalMask = useContenu("fr.finalMask", FINAL_MASK);
  const nav = useContenu("fr.nav", NAV);
  const zone = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: zone, offset: ["start end", "end start"] });
  const fond = useTransform(scrollYProgress, [0, 1], ["30% 20%", "70% 80%"]);
  const wa = whatsappHref(nav.whatsapp.number, nav.whatsapp.message);
  return (
    <section ref={zone} className="overflow-hidden bg-night py-20 text-center text-ivory lg:py-30">
      <motion.p
        aria-hidden="true"
        className="font-display text-[24vw] leading-[0.82] tracking-[-0.04em] text-transparent select-none"
        style={{ backgroundImage: `url(${finalMask.image.src})`, backgroundSize: "cover", backgroundPosition: fond, WebkitBackgroundClip: "text", backgroundClip: "text" }}
      >
        {finalMask.word}
      </motion.p>
      <div className="container-oht mt-12 flex flex-col items-center">
        <MaskedLines lines={finalCta.title} className="text-[40px]/[48px] tracking-[-1px] md:text-h1" />
        <p className="mt-6 max-w-[44ch] text-[18px]/[28px] text-ivory/80">{finalCta.sub}</p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:gap-8">
          <ButtonPrimary href={finalCta.primary.href}>{finalCta.primary.label}</ButtonPrimary>
          {wa ? (
            <LinkLine href={wa} external className="text-ivory">
              {finalCta.whatsapp}
            </LinkLine>
          ) : null}
        </div>
      </div>
    </section>
  );
}
