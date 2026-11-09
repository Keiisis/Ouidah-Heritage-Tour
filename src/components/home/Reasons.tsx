"use client";

import Image from "next/image";
import { AnimatePresence, LayoutGroup, motion, useMotionValueEvent, useScroll } from "motion/react";
import { useMouvementReduit } from "@/lib/mouvement";
import { useEffect, useRef, useState } from "react";
import { reasons as REASONS, reasonsIntro as REASONS_INTRO } from "@/content/fr";
import { useContenu } from "@/components/ui/ContenuSite";

const EASE = [0.77, 0, 0.18, 1] as const;
const FOND = { sun: "bg-sun text-abyss", abyss: "bg-abyss text-white", laterite: "bg-laterite text-white" } as const;
// voile sous le texte des tuiles photo, à la hauteur du texte : marine 85 % en bas, 60 % encore au haut du texte (blanc lisible
// même sur une photo claire), puis fondu sur 6rem ; le haut de la photo reste net
const VOILE =
  "isolate before:absolute before:-inset-x-6 before:-bottom-6 before:-top-24 before:-z-10 before:bg-[linear-gradient(to_top,color-mix(in_oklab,var(--color-abyss)_85%,transparent),color-mix(in_oklab,var(--color-abyss)_60%,transparent)_calc(100%_-_6rem),transparent)]";

// Ouverture en volet : la tuile s'ouvre du bas vers le haut, la photo se dézoome, le texte monte en dernier.
const volet = {
  cache: { clipPath: "inset(100% 0% 0% 0% round 28px)" },
  vu: (k: number) => ({ clipPath: "inset(0% 0% 0% 0% round 28px)", transition: { duration: 1.1, ease: EASE, delay: 0.15 + k * 0.11 } }),
};
const photo = { cache: { scale: 1.22 }, vu: (k: number) => ({ scale: 1, transition: { duration: 1.8, ease: EASE, delay: 0.15 + k * 0.11 } }) };
const texte = { cache: { opacity: 0, y: 24 }, vu: (k: number) => ({ opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE, delay: 0.65 + k * 0.11 } }) };

function Tuile({ i, grand, k, onChoisir }: { i: number; grand: boolean; k: number; onChoisir?: () => void }) {
  const reasons = useContenu("fr.reasons", REASONS);
  const r = reasons[i];
  const fond = r.image ? "text-white" : FOND[r.couleur ?? "sun"];
  return (
    <motion.li
      layout
      transition={{ layout: { duration: 0.9, ease: EASE } }}
      variants={volet}
      custom={k}
      onClick={onChoisir}
      className={`relative overflow-hidden rounded-[28px] ${fond} ${grand ? "lg:col-span-2 lg:row-span-2" : ""} ${onChoisir ? "cursor-pointer" : ""} min-h-[260px] lg:min-h-0`}
    >
      {r.image ? (
        <motion.div layout className="absolute inset-0" variants={photo} custom={k}>
          <Image src={r.image.src} alt={r.image.alt} fill sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover" />
        </motion.div>
      ) : null}
      <motion.div layout="position" variants={texte} custom={k} className={`absolute right-6 bottom-6 left-6 ${grand ? "lg:right-10 lg:bottom-10 lg:left-10" : ""} ${r.image ? VOILE : ""} ${r.image && grand ? "lg:before:-inset-x-10 lg:before:-bottom-10" : ""}`}>
        <p className="font-display text-sm font-semibold opacity-75 tabular-nums">{String(i + 1).padStart(2, "0")}</p>
        <h3 className={`mt-1 font-display leading-[1.12] font-semibold ${grand ? "text-[26px] lg:text-[44px]" : "text-[22px] lg:text-[19px] xl:text-[21px]"}`}>{r.title}</h3>
        <p className={`mt-2 leading-[1.55] opacity-90 ${grand ? "text-[15px] lg:max-w-md lg:text-[17px]" : "text-[15px] lg:hidden xl:block xl:text-[13.5px]"}`}>{r.text}</p>
      </motion.div>
    </motion.li>
  );
}

// Section 4 — sept engagements en mosaïque (photos et tuiles de couleur). À l'arrivée, les tuiles s'ouvrent en volets
// l'une après l'autre ; sur grand écran la section reste à l'écran et, au défilement, la mosaïque se recompose :
// l'engagement suivant prend la grande place, un compteur géant indique où l'on en est. Clic sur une tuile = y aller.
export function Reasons() {
  const reasons = useContenu("fr.reasons", REASONS);
  const reasonsIntro = useContenu("fr.reasonsIntro", REASONS_INTRO);
  const zone = useRef<HTMLElement>(null);
  const [actif, setActif] = useState(0);
  const [large, setLarge] = useState(false);
  const reduit = useMouvementReduit();
  const n = reasons.length;
  // position mesurée en direct (la page s'allonge quand la carte du dessus finit de charger)
  const { scrollY } = useScroll();

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const maj = () => setLarge(mq.matches);
    maj();
    mq.addEventListener("change", maj);
    return () => mq.removeEventListener("change", maj);
  }, []);

  const recompose = large && !reduit;
  useMotionValueEvent(scrollY, "change", () => {
    const el = zone.current;
    if (!recompose || !el) return;
    const r = el.getBoundingClientRect();
    const p = -r.top / Math.max(1, r.height - window.innerHeight);
    const i = Math.min(n - 1, Math.max(0, Math.floor(p * n)));
    setActif((a) => (a === i ? a : i));
  });
  const aller = (i: number) => {
    const el = zone.current;
    if (!el) return;
    const haut = el.getBoundingClientRect().top + window.scrollY;
    const course = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: haut + (course * (i + 0.5)) / n, behavior: "smooth" });
  };

  // la tuile active passe en tête de la grille (placement dense) : les autres gardent leur ordre
  const ordre = recompose ? [actif, ...reasons.map((_, i) => i).filter((i) => i !== actif)] : reasons.map((_, i) => i);

  return (
    <section ref={zone} id="engagements" aria-labelledby="engagements-titre" className={`relative z-[2] bg-white text-abyss ${recompose ? "h-[420vh]" : ""}`}>
      <div className={recompose ? "sticky top-0 flex h-[100svh] flex-col pt-28 pb-10" : "py-24"}>
        <div className="mx-auto flex w-full max-w-[1320px] items-end justify-between gap-8 px-4 sm:px-6 lg:px-24">
          <div>
            <h2 id="engagements-titre" className="max-w-3xl font-display text-[32px] leading-[1.12] font-semibold tracking-[-0.01em] sm:text-[40px] lg:text-[46px]">
              {reasonsIntro.title}
            </h2>
          </div>
          {recompose ? (
            <p className="flex shrink-0 items-end gap-3" aria-live="polite">
              <span className="relative block h-24 w-38 overflow-hidden">
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.span
                    key={actif}
                    className="absolute inset-0 text-right font-display text-[110px] leading-[0.85] font-semibold text-sun tabular-nums"
                    initial={{ y: "100%" }}
                    animate={{ y: "0%", transition: { duration: 0.7, ease: EASE } }}
                    exit={{ y: "-100%", transition: { duration: 0.7, ease: EASE } }}
                  >
                    {String(actif + 1).padStart(2, "0")}
                  </motion.span>
                </AnimatePresence>
              </span>
              <span className="pb-2 text-sm font-semibold text-abyss/60">
                {reasonsIntro.of} {String(n).padStart(2, "0")}
              </span>
            </p>
          ) : (
            <p className="hidden max-w-xs text-base leading-[1.65] text-abyss/70 md:block">{reasonsIntro.intro}</p>
          )}
        </div>

        <LayoutGroup>
          <motion.ol
            className={`mx-auto mt-10 grid w-full max-w-[1320px] gap-4 px-4 sm:grid-cols-2 sm:px-6 lg:mt-8 lg:min-h-0 lg:flex-1 lg:grid-flow-dense lg:grid-cols-5 lg:grid-rows-2 lg:gap-5 lg:px-24`}
            initial={reduit ? false : "cache"}
            whileInView="vu"
            viewport={{ once: true, amount: 0.25 }}
          >
            {ordre.map((i, k) => (
              <Tuile key={i} i={i} k={k} grand={recompose ? i === actif : false} onChoisir={recompose ? () => aller(i) : undefined} />
            ))}
          </motion.ol>
        </LayoutGroup>
      </div>
    </section>
  );
}
