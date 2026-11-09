"use client";

import Image from "next/image";
import Link from "@/components/ui/LienPublic";
import { motion, useMotionValue, useMotionValueEvent, useScroll, useSpring } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { tenIntro as TEN_INTRO, tenReasons as TEN_REASONS } from "@/content/fr";
import { useContenu } from "@/components/ui/ContenuSite";
import { useMouvementReduit } from "@/lib/mouvement";
import { modifierChemin } from "@/lib/chemin";
import { CLE_RAISONS, ecrireRaisons, lireRaisons } from "@/lib/raisons";

// Section 7 — planche contact et chapitres : en haut le tirage de la vue lue et son texte complet, qui s'allume au fil du défilement ;
// en bas la bande de film des vues (la progression), avec la loupe posée sur la vue lue. « Entourer » garde la raison
// et ajoute ses lieux à « Votre chemin ». Le nombre de vues suit le contenu (admin).
const EASE = [0.22, 1, 0.36, 1] as const;
const nn = (i: number) => String(i + 1).padStart(2, "0");
const borne = (x: number) => Math.min(1, Math.max(0, x));

// cercle au crayon gras : ellipse un peu irrégulière qui ne se referme pas tout à fait (même tracé pour une même vue)
function trace(k: number) {
  const pts: string[] = [];
  for (let a = -0.3; a <= Math.PI * 2 + 0.25; a += 0.18) {
    const j = 1 + 0.035 * Math.sin(a * 3 + k);
    pts.push(`${(50 + 47 * j * Math.cos(a)).toFixed(1)},${(50 + 44 * j * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join(" L")}`;
}

export function TenReasons() {
  const T = useContenu("fr.tenIntro", TEN_INTRO);
  const tenReasons = useContenu("fr.tenReasons", TEN_REASONS);
  const zone = useRef<HTMLElement>(null);
  const flux = useRef<HTMLDivElement>(null);
  const fenetre = useRef<HTMLDivElement>(null);
  const bande = useRef<HTMLDivElement>(null);
  const n = tenReasons.length;
  const reduit = useMouvementReduit();
  const [lue, setLue] = useState(0);
  const [lecture, setLecture] = useState(0); // part du texte de la vue lue déjà parcourue (0 à 1, au cinquantième)
  const [entourees, setEntourees] = useState<string[]>([]);
  const [lu, setLu] = useState(false); // raisons gardées déjà relues : avant, rien n'est écrit

  // position de la loupe et décalages, en valeurs animées (pas de rendu React à chaque image)
  const loupe = useMotionValue("5%");
  const decaleCible = useMotionValue(0);
  const decale = useSpring(decaleCible, { stiffness: 140, damping: 28 });
  const filmX = useMotionValue(0);

  const { scrollYProgress } = useScroll({ target: zone, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const x = Math.min(n - 1e-4, Math.max(0, p * n));
    const i = Math.floor(x);
    const f = x - i;
    setLue((a) => (a === i ? a : i));
    setLecture((l) => {
      const v = Math.round(borne((f - 0.04) / 0.72) * 50) / 50;
      return l === v ? l : v;
    });
    // la loupe reste sur la vue pendant la lecture, puis glisse vers la suivante juste avant le changement
    const g = i < n - 1 ? borne((f - 0.82) / 0.18) : 0;
    const pos = i + 0.5 + g * g * (3 - 2 * g);
    loupe.set(`${(pos / n) * 100}%`);
    // texte plus long que la place disponible : il remonte au fil de la lecture
    const fl = flux.current;
    if (fl) decaleCible.set(-Math.max(0, fl.scrollHeight - fl.clientHeight) * borne((f - 0.04) / 0.72));
    // téléphone : la bande défile pour garder la vue lue au centre
    const fe = fenetre.current;
    const b = bande.current;
    if (fe && b) filmX.set(Math.min(0, Math.max(fe.clientWidth - b.offsetWidth, fe.clientWidth / 2 - (pos / n) * b.offsetWidth)));
  });

  // raisons entourées, gardées sur l'appareil
  useEffect(() => {
    const lire = () => {
      try {
        setEntourees(lireRaisons(localStorage.getItem(CLE_RAISONS), tenReasons));
      } catch {
        /* stockage indisponible : rien d'entouré */
      }
      setLu(true);
    };
    lire();
  }, [tenReasons]);
  // tant que les raisons gardées ne sont pas relues, l'état initial vide n'est jamais écrit (il les effacerait)
  useEffect(() => {
    if (lu) ecrireRaisons(entourees);
  }, [entourees, lu]);

  const r = tenReasons[lue];
  const entouree = entourees.includes(r.slug);
  const basculer = () => {
    const autres = tenReasons.filter((x) => x.slug !== r.slug && entourees.includes(x.slug)).flatMap((x) => x.lieux);
    // retirer une raison ne retire que ses lieux qu'aucune autre raison entourée ne garde
    if (entouree) modifierChemin([], r.lieux.filter((l) => !autres.includes(l)));
    else modifierChemin(r.lieux, []);
    setEntourees((e) => (entouree ? e.filter((s) => s !== r.slug) : [...e, r.slug]));
  };
  const aller = (i: number) => {
    const el = zone.current;
    if (!el) return;
    const haut = el.getBoundingClientRect().top + window.scrollY;
    const course = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: haut + (course * (i + 0.12)) / n, behavior: reduit ? "auto" : "smooth" });
  };

  const mots = r.text.split(" ");
  const allumes = reduit ? mots.length : Math.round(mots.length * lecture);
  const voisins = [lue - 1, lue, lue + 1].filter((i) => i >= 0 && i < n);

  return (
    <section ref={zone} id="raisons" aria-labelledby="raisons-titre" className="relative z-[2] bg-white text-abyss" style={{ height: `${100 + n * 75}svh` }}>
      <div className="sticky top-0 h-[100svh] overflow-hidden pt-20 pb-4 lg:pt-28 lg:pb-8">
        <div className="mx-auto flex h-full max-w-[1320px] flex-col gap-3 px-4 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)_auto] lg:gap-x-12 lg:gap-y-6 lg:px-24">
          {/* tirage de la vue lue : il se développe (l'image monte du blanc) à chaque nouvelle vue */}
          <figure className="flex h-[26svh] shrink-0 flex-col bg-white p-2 pb-0 shadow-[0_1px_0_rgb(0_0_0/0.04),0_1.5rem_2.5rem_-1.75rem_rgb(20_24_40/0.45)] max-lg:order-2 lg:h-auto lg:min-h-0 lg:p-3 lg:pb-0">
            <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
              <motion.div
                key={r.slug}
                className="absolute inset-0"
                initial={reduit ? false : { opacity: 0, filter: "grayscale(0.7) contrast(0.6) brightness(1.5)" }}
                animate={{ opacity: 1, filter: "grayscale(0) contrast(1) brightness(1)" }}
                transition={{ duration: 0.9, ease: EASE }}
              >
                <Image src={r.image.src} alt={r.image.alt} fill sizes="(min-width: 1024px) 46vw, 100vw" className="object-cover" />
              </motion.div>
            </div>
            <figcaption className="flex items-center justify-between gap-4 py-2 text-xs text-ink-muted tabular-nums lg:py-3">
              <span>
                <b className="font-bold text-abyss">{nn(lue)}</b> · {r.title}
              </span>
              <span>{T.place}</span>
            </figcaption>
          </figure>

          <div className="flex min-h-0 flex-col max-lg:contents">
            <div className="max-lg:order-1">
              <h2 id="raisons-titre" className="font-display text-[1.625rem]/[1.05] font-semibold tracking-[-0.03em] text-balance lg:mt-3 lg:text-[2.375rem]/[1.02]">
                {T.title[0]} <span className="text-laterite">{T.title[1]}</span>
              </h2>
            </div>

            {/* chapitres : la vue précédente s'efface, la vue lue s'allume mot à mot, la suivante attend en gris */}
            <div ref={flux} className="relative min-h-0 flex-1 overflow-hidden [mask-image:linear-gradient(transparent,#000_8%,#000_86%,transparent)] max-lg:order-4 lg:mt-4">
              <motion.div style={{ y: reduit ? 0 : decale }} className="pt-3">
                {voisins.map((i) => {
                  const x = tenReasons[i];
                  const etat = i < lue ? "lue" : i > lue ? "suivante" : "actuelle";
                  return (
                    <motion.article
                      key={x.slug}
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: etat === "lue" ? 0.28 : 1, y: 0 }}
                      transition={{ duration: reduit ? 0 : 0.5, ease: EASE }}
                      className="border-abyss/10 py-4 not-first:border-t lg:py-5"
                    >
                      <p className="text-xs font-bold text-laterite tabular-nums">
                        ▸ {nn(i)} / {n} · {x.category}
                      </p>
                      <h3 className={`mt-1.5 font-display text-[1.375rem]/[1.1] font-semibold tracking-[-0.02em] lg:text-[2rem]/[1.05] ${etat === "suivante" ? "text-abyss/25" : ""}`}>{x.title}</h3>
                      {etat === "actuelle" ? (
                        <>
                          <p className="sr-only">{x.text}</p>
                          <p aria-hidden="true" className="mt-2.5 text-base/[1.6] font-semibold tracking-[-0.005em] lg:mt-3 lg:text-lg/[1.6]">
                            {mots.map((m, k) => (
                              <span key={k} className={`transition-colors duration-300 ${k < allumes ? "text-abyss" : "text-abyss/55"}`}>
                                {m}{" "}
                              </span>
                            ))}
                          </p>
                        </>
                      ) : etat === "lue" ? (
                        <p className="mt-2 text-base/[1.6] font-semibold lg:text-lg/[1.6]">{x.text.split(". ").at(-1)}</p>
                      ) : null}
                    </motion.article>
                  );
                })}
              </motion.div>
            </div>

            <div className="flex items-center gap-3 border-t border-abyss/10 pt-3 max-lg:order-5 lg:pt-4">
              {r.href ? (
                <Link href={r.href} className="hidden min-h-11 items-center rounded-full bg-abyss px-5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sun sm:inline-flex">
                  {T.discover}
                </Link>
              ) : null}
              <button
                type="button"
                aria-pressed={entouree}
                onClick={basculer}
                className={`min-h-11 rounded-full px-5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sun ${entouree ? "bg-pencil text-white" : "text-pencil shadow-[inset_0_0_0_1.5px_color-mix(in_oklab,var(--mark-pencil)_40%,transparent)]"}`}
              >
                {entouree ? T.circled : T.circle}
              </button>
              {entourees.length ? (
                <p className="ml-auto flex items-center gap-3 text-sm font-semibold">
                  <span className="text-pencil">{T.kept(entourees.length)}</span>
                  <Link
                    href={T.path.href}
                    onClick={() => modifierChemin([], [], true)}
                    className="inline-flex min-h-11 items-center rounded-full bg-sun px-4 text-sm font-semibold text-abyss focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-abyss"
                  >
                    {T.path.label}
                  </Link>
                </p>
              ) : null}
            </div>
          </div>

          {/* bande de film : une vue par raison ; la loupe se pose sur la vue lue ; les vues entourées gardent leur cercle rouge */}
          <nav aria-label={T.stripLabel} className="shrink-0 max-lg:order-3 max-lg:-mx-4 lg:col-span-2">
            <div ref={fenetre} className="relative overflow-hidden py-4 lg:overflow-visible lg:py-0">
              <motion.div style={{ x: filmX }} className="oht-pellicule w-[46rem] rounded-[3px] bg-film px-3 pt-5 pb-9 lg:w-auto">
                <div ref={bande} className="relative flex gap-1.5">
                  {tenReasons.map((x, i) => (
                    <button
                      key={x.slug}
                      type="button"
                      onClick={() => aller(i)}
                      aria-label={T.frame(nn(i), x.title)}
                      aria-current={i === lue ? "step" : undefined}
                      className="relative aspect-[3/2] min-w-0 flex-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sun"
                    >
                      <Image src={x.image.src} alt="" fill sizes="140px" className={`object-cover transition-[filter] duration-500 ${i > lue ? "brightness-[0.62] grayscale-[0.4]" : ""}`} />
                      <span className="absolute -bottom-[18px] left-0.5 font-mono text-[9px] font-bold whitespace-nowrap text-film-edge">
                        ▸ {i + 1}
                        {i % 2 ? "A" : ""}
                        <span className="max-lg:hidden"> {T.filmEdge}</span>
                      </span>
                      {entourees.includes(x.slug) ? (
                        <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute -inset-x-3 -inset-y-3.5 z-[2] overflow-visible">
                          <motion.path
                            d={trace(i)}
                            fill="none"
                            stroke="var(--mark-pencil)"
                            strokeWidth={3}
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                            initial={reduit ? false : { pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ duration: 0.6, ease: EASE }}
                          />
                        </svg>
                      ) : null}
                    </button>
                  ))}
                  <motion.div
                    aria-hidden="true"
                    style={{ left: loupe }}
                    className="pointer-events-none absolute top-1/2 z-[3] size-[6.5rem] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full shadow-[0_0_0_0.4375rem_#1c1c1f,0_0_0_0.5625rem_#5a5a61,0_0_0_0.625rem_#1c1c1f,0_1.5rem_2rem_-0.75rem_rgb(15_15_25/0.5)] lg:size-[9.5rem]"
                  >
                    <Image key={r.slug} src={r.image.src} alt="" fill sizes="160px" className="scale-110 object-cover" />
                    <span className="absolute inset-0 rounded-full bg-[radial-gradient(60%_45%_at_30%_22%,rgb(255_255_255/0.4),transparent_60%),radial-gradient(circle,transparent_62%,rgb(0_0_0/0.28)_100%)]" />
                  </motion.div>
                </div>
              </motion.div>
            </div>
          </nav>
        </div>
      </div>
    </section>
  );
}
