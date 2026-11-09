"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { welcomeStatement as WELCOME_STATEMENT } from "@/content/fr";
import { useContenu } from "@/components/ui/ContenuSite";
import { fadeUp, inView } from "@/lib/motion";

// Section 2 — bienvenue, composition fournie par l'utilisateur : fond blanc, grande phrase marine
// avec des photos rondes cerclées posées dans la ligne, filet fin, puis trois colonnes numérotées.
export function Welcome() {
  const welcomeStatement = useContenu("fr.welcomeStatement", WELCOME_STATEMENT);
  const phrase = welcomeStatement.segments.flatMap((s) => ("text" in s ? [s.text] : [])).join(" ");
  return (
    <section id="bienvenue" aria-labelledby="bienvenue-titre" className="relative z-[2] bg-white py-24 text-abyss lg:py-28">
      <div className="mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-24">
        <h2 id="bienvenue-titre" className="max-w-[64rem] font-display text-[32px] leading-[1.3] font-semibold tracking-[-0.01em] sm:text-[40px] lg:text-[50px]">
          <span className="sr-only">{phrase}</span>
          <span aria-hidden="true">
            {welcomeStatement.segments.map((s, i) =>
              "text" in s ? (
                <span key={i}>{s.text} </span>
              ) : (
                <motion.span
                  key={i}
                  className={`relative mx-[0.12em] inline-block size-[1.25em] overflow-hidden rounded-full border-2 align-[-0.3em] shadow-[0_4px_10px_-2px_color-mix(in_oklab,var(--surface-abyss)_35%,transparent)] ${s.ring === "sun" ? "border-sun" : "border-abyss"}`}
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1, transition: { duration: 0.5, ease: [0.6, 0, 0.5, 1], delay: 0.15 + i * 0.08 } }}
                  viewport={{ once: true, amount: 0.8 }}
                >
                  <Image src={s.image.src} alt={s.image.alt} fill sizes="80px" className="object-cover" />
                </motion.span>
              )
            )}
          </span>
        </h2>

        <motion.div className="mt-16 grid gap-10 border-t border-abyss/10 pt-10 md:grid-cols-3 md:gap-12" {...inView}>
          {welcomeStatement.columns.map((c, i) => (
            <motion.div key={c.title} variants={fadeUp} custom={i}>
              <h3 className="font-display text-base font-semibold">
                {String(i + 1).padStart(2, "0")}. {c.title}
              </h3>
              <p className="mt-4 text-base leading-[1.65] text-abyss/70">{c.text}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
