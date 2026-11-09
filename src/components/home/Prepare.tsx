"use client";

import { useFormatsSite } from "@/lib/formats-site";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useMouvementReduit } from "@/lib/mouvement";
import { emergency as EMERGENCY, nav as NAV, prepare as PREPARE, preparer as PREPARER } from "@/content/fr";
import { useContenu } from "@/components/ui/ContenuSite";
import BENIN from "@/content/benin-carte.json";
import { EASE } from "@/lib/motion";
import { MaskedLines } from "@/components/ui/MaskedLines";
import { Objet3D, Objet3DSvg } from "@/components/ui/Objet3D";
import { ButtonPrimary, whatsappHref } from "@/components/ui/Buttons";

// Section 11 — préparer son voyage (maquette H2 « Carte en main ») : la vraie carte du Bénin, Ouidah en grand sur la côte ;
// « Arriver » resserre la carte sur la côte et trace la route depuis l'aéroport. À droite, un thème par onglet : un repère,
// de petits conseils, les numéros utiles. Le viewBox prend le format du cadre (mesuré), les textes sont tracés en pixels.
// Titre et onglets démarrent sous l'en-tête fixe du site (72 px).
const { minx, maxy, kx, ky } = BENIN.proj;
const P = ([lon, lat]: [number, number]) => [(lon - minx) * kx, (maxy - lat) * ky] as const;
const DEPS = Object.entries(BENIN.deps);
const ETIQUETTES = Object.entries(BENIN.etiquettes).map(([n, c]) => [n, P(c as [number, number])] as const);
const COTE_NOMS = [["Atlantique", P([2.2, 6.62])], ["Mono", P([1.82, 6.55])]] as const;

type Cadre = { w: number; h: number; k: number; fill: number; cx: number; cy: number };
type Vue = { x: number; y: number; w: number; h: number; s: number };
type Point = readonly [number, number];

function vues({ w, h, fill, cx, cy }: Cadre, OUIDAH: Point): Record<"benin" | "cote", Vue> {
  const s = (fill * h) / BENIN.H;
  const mx = Math.min(cx * w, w - 24 - (BENIN.W * s) / 2);
  const sc = Math.min(w / 130, h / 110); // la côte de Ouidah à Cotonou, mer comprise, tient dans le cadre
  return {
    benin: { s, x: BENIN.W / 2 - mx / s, y: BENIN.H / 2 - (cy * h) / s, w: w / s, h: h / s },
    cote: { s: sc, x: 176 - w / sc / 2, y: OUIDAH[1] - 25 - h / sc / 2, w: w / sc, h: h / sc },
  };
}

// Repère de Ouidah : disque blanc et objet 3D, pointe posée sur la ville (géométrie en pixels, mise à l'échelle).
function Repere({ e, OUIDAH }: { e: number; OUIDAH: Point }) {
  return (
    <g transform={`translate(${OUIDAH[0]},${OUIDAH[1]}) scale(${e})`}>
      <path d="M-8,-28 L0,-12 L8,-28Z" className="fill-white" />
      <circle cy={-39} r={23} className="fill-white" />
      <Objet3DSvg nom="destination" fichier={128} x={-16} y={-55} taille={32} />
    </g>
  );
}

function Ondes({ r, OUIDAH }: { r: number; OUIDAH: Point }) {
  return (
    <>
      {["", "is-tard"].map((c) => (
        <circle key={c} className={`oht-onde ${c} fill-none stroke-sun`} cx={OUIDAH[0]} cy={OUIDAH[1]} r={r} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      ))}
    </>
  );
}

export function Prepare() {
  const { date } = useFormatsSite();
  const T = useContenu("fr.prepare", PREPARE);
  const THEMES = useContenu("fr.preparer", PREPARER);
  const emergency = useContenu("fr.emergency", EMERGENCY);
  const nav = useContenu("fr.nav", NAV);
  // points de la carte (lieux de fr.prepare.carte) projetés sur le relevé du Bénin
  const { OUIDAH, AERO, PORTE, MILIEU, ROUTE } = useMemo(() => {
    const OUIDAH = P(T.carte.ouidah), AERO = P(T.carte.aeroport), PORTE = P(T.carte.porte);
    const ROUTE = `M${AERO[0]},${AERO[1]} C${AERO[0] - 12},${AERO[1] + 3.5} ${OUIDAH[0] + 16},${OUIDAH[1] + 5} ${OUIDAH[0]},${OUIDAH[1]}`;
    return { OUIDAH, AERO, PORTE, MILIEU: (OUIDAH[0] + AERO[0]) / 2, ROUTE };
  }, [T.carte]);
  const [id, setId] = useState(THEMES[0].id);
  const t = THEMES.find((x) => x.id === id) ?? THEMES[0];
  const vue = t.vue;
  const reduit = useMouvementReduit();
  const cadreRef = useRef<HTMLDivElement>(null);
  const ficheRef = useRef<HTMLDivElement>(null);
  const [cadre, setCadre] = useState<Cadre | null>(null);
  const [fiche, setFiche] = useState<{ x: number; y: number } | null>(null);
  const [heure, setHeure] = useState<string | null>(null);
  const wa = whatsappHref(nav.whatsapp.number, nav.whatsapp.message);

  // taille du cadre de la carte : le viewBox en prend le format, la carte et les textes s'y calent
  useEffect(() => {
    const el = cadreRef.current;
    if (!el) return;
    const mesure = () => {
      // cadre pas encore mis en page (0 px) : aucune mesure, sinon l'échelle divise par zéro (Infinity dans le SVG)
      if (!el.clientWidth || !el.clientHeight) return;
      const vw = window.innerWidth;
      const p = vw >= 1280 ? { k: 1, fill: 0.82, cx: 0.68, cy: 0.53 } : vw >= 768 ? { k: 0.85, fill: 0.7, cx: 0.68, cy: 0.62 } : { k: 0.62, fill: 0.58, cx: 0.6, cy: 0.64 };
      setCadre({ w: el.clientWidth, h: el.clientHeight, ...p });
      const f = ficheRef.current;
      // départ du fil : bord droit de la carte de visite, à hauteur de la photo (le bas du cadre est fixe)
      setFiche(f && f.offsetWidth ? { x: f.offsetLeft + f.offsetWidth, y: f.offsetTop + f.offsetHeight - 186 } : null);
    };
    mesure();
    const ro = new ResizeObserver(mesure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // l'heure de Ouidah, à la minute (fuseau IANA, pas de décalage écrit en dur)
  useEffect(() => {
    const heureOuidah = date({ hour: "2-digit", minute: "2-digit", timeZone: T.fiche.fuseau });
    const maj = () => setHeure(heureOuidah.format(new Date()).replace(":", " h "));
    maj();
    const n = setInterval(maj, 30_000);
    return () => clearInterval(n);
  }, [T.fiche.fuseau, date]);

  // onglets au clavier : flèches, début, fin (motif ARIA « tabs », sélection automatique)
  const clavier = (ev: KeyboardEvent<HTMLDivElement>) => {
    const i = THEMES.findIndex((x) => x.id === id);
    const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: THEMES.length - 1 }[ev.key];
    if (j === undefined) return;
    ev.preventDefault();
    const n = THEMES[(j + THEMES.length) % THEMES.length].id;
    setId(n);
    document.getElementById(`preparer-onglet-${n}`)?.focus();
  };

  const v = cadre ? vues(cadre, OUIDAH) : null;
  const vb = v ? v[vue] : null;
  const viewBox = vb ? `${vb.x} ${vb.y} ${vb.w} ${vb.h}` : `0 0 ${BENIN.W} ${BENIN.H}`;
  const k = cadre?.k ?? 1;
  const ub = (px: number) => (v ? (px * k) / v.benin.s : px); // pixels → unités, vue Bénin
  const uc = (px: number) => (v ? (px * k) / v.cote.s : px); // pixels → unités, vue côte
  const pin = v ? { x: (OUIDAH[0] - v.benin.x) * v.benin.s, y: (OUIDAH[1] - v.benin.y) * v.benin.s - 62 * 1.15 * k } : null;
  const carteDeVisite = vue === "cote" ? "cote" : t.fiche === "heure" ? "heure" : "ville";

  return (
    <section id="preparer" className="bg-white xl:grid xl:min-h-[52rem] xl:grid-cols-[minmax(0,1fr)_33rem]" data-framer-name="Section · Préparer">
      <div ref={cadreRef} className="relative h-[36rem] overflow-hidden bg-abyss text-ivory md:h-[38rem] xl:h-auto" data-framer-name="Map">
        <div className="absolute top-[5.5rem] right-6 left-6 z-10 md:top-24 md:right-auto md:left-10 md:max-w-[24rem] xl:top-28 xl:left-[max(64px,calc((100vw-1440px)/2+64px))]">
          <MaskedLines lines={T.title} accent="text-sun" className="font-display text-[26px]/[1.08] font-semibold tracking-[-0.025em] md:text-[36px]/[1.05]" />
          <p className="mt-3 text-[15px]/[1.5] text-ivory/80 md:mt-4 md:text-[16px]">{T.lead}</p>
        </div>

        <motion.svg
          className="absolute inset-0 size-full"
          viewBox={viewBox}
          animate={{ viewBox, opacity: cadre ? 1 : 0 }}
          transition={{ viewBox: { duration: reduit ? 0 : 1.1, ease: EASE }, opacity: { duration: 0.6 } }}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={vue === "cote" ? T.carte.ariaCote : T.carte.ariaBenin}
        >
          {DEPS.map(([n, d]) =>
            n === "Atlantique" ? (
              <motion.path key={n} d={d} className="fill-sun stroke-sun" strokeWidth={1.6} vectorEffect="non-scaling-stroke" animate={{ fillOpacity: vue === "cote" ? 0.18 : 0.3 }} />
            ) : (
              <path key={n} d={d} className="fill-white/6 stroke-white/30" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
            ),
          )}
          {v ? (
            <>
              {/* vue Bénin */}
              <motion.g aria-hidden="true" initial={false} animate={{ opacity: vue === "benin" ? 1 : 0 }} transition={{ duration: 0.4, delay: vue === "benin" ? 0.5 : 0 }}>
                {ETIQUETTES.map(([n, [x, y]]) => (
                  <text key={n} x={x} y={y} textAnchor="middle" className="fill-white/40 font-bold tracking-[0.06em] uppercase" style={{ fontSize: ub(9) }}>
                    {n}
                  </text>
                ))}
                {T.carte.pays.map((p) => {
                  const [x, y] = P(p.lieu);
                  return (
                    <text key={p.nom} x={x} y={y} textAnchor="middle" className="fill-white/30 font-bold tracking-[0.3em] uppercase" style={{ fontSize: ub(10) }}>
                      {p.nom}
                    </text>
                  );
                })}
                <text x={OUIDAH[0] + ub(60)} y={OUIDAH[1] + ub(46)} textAnchor="middle" className="fill-sun/75 font-bold tracking-[0.4em] uppercase" style={{ fontSize: ub(10) }}>
                  {T.carte.ocean}
                </text>
                <path d={ROUTE} className="fill-none stroke-sun" strokeWidth={ub(2.4)} strokeLinecap="round" />
                <circle cx={AERO[0]} cy={AERO[1]} r={ub(3)} className="fill-white" />
                <text x={AERO[0] + ub(6)} y={AERO[1] - ub(6)} className="fill-white font-bold" style={{ fontSize: ub(10) }}>
                  {T.carte.cotonou}
                </text>
                <Ondes r={ub(34)} OUIDAH={OUIDAH} />
                <circle cx={OUIDAH[0]} cy={OUIDAH[1]} r={ub(5)} className="fill-sun" />
                <Repere e={ub(1.15)} OUIDAH={OUIDAH} />
                <text x={OUIDAH[0] - ub(34)} y={OUIDAH[1] - ub(2)} textAnchor="end" className="fill-white font-display font-semibold tracking-[-0.02em]" style={{ fontSize: ub(56) }} data-carte="ville">
                  {T.carte.ville}
                </text>
                <text x={OUIDAH[0] - ub(34)} y={OUIDAH[1] + ub(15)} textAnchor="end" className="fill-sun font-bold tracking-[0.14em] uppercase" style={{ fontSize: ub(10) }}>
                  {T.carte.villeSous}
                </text>
              </motion.g>

              {/* vue côte : la route de l'aéroport se trace, la navette posée dessus */}
              <motion.g aria-hidden="true" initial={false} animate={{ opacity: vue === "cote" ? 1 : 0 }} transition={{ duration: 0.4, delay: vue === "cote" ? 0.7 : 0 }} data-vue={vue}>
                {COTE_NOMS.map(([n, [x, y]]) => (
                  <text key={n} x={x} y={y} textAnchor="middle" className="fill-white/45 font-bold tracking-[0.06em] uppercase" style={{ fontSize: uc(16) }}>
                    {n}
                  </text>
                ))}
                <text x={v.cote.x + v.cote.w * 0.7} y={OUIDAH[1] + uc(180)} textAnchor="middle" className="fill-sun/75 font-bold tracking-[0.4em] uppercase" style={{ fontSize: uc(17) }}>
                  {T.carte.ocean}
                </text>
                <motion.path
                  d={ROUTE}
                  className="fill-none stroke-sun"
                  strokeWidth={uc(5)}
                  strokeLinecap="round"
                  initial={false}
                  animate={{ pathLength: vue === "cote" ? 1 : 0 }}
                  transition={{ duration: reduit ? 0 : 1.4, delay: vue === "cote" ? 0.9 : 0, ease: EASE }}
                />
                <g transform={`translate(${MILIEU},${OUIDAH[1] - uc(50)})`}>
                  <circle r={uc(44)} className="fill-white" />
                  <Objet3DSvg nom="navette" fichier={256} x={-uc(34)} y={-uc(34)} taille={uc(68)} />
                </g>
                <text x={MILIEU} y={OUIDAH[1] + uc(80)} textAnchor="middle" className="fill-sun font-display font-semibold" style={{ fontSize: uc(36) }}>
                  {T.carte.km}
                </text>
                <text x={MILIEU} y={OUIDAH[1] + uc(104)} textAnchor="middle" className="fill-white/75 font-bold" style={{ fontSize: uc(15) }}>
                  {T.carte.kmSous}
                </text>
                <circle cx={AERO[0]} cy={AERO[1]} r={uc(8)} className="fill-white" />
                <text x={AERO[0]} y={AERO[1] - uc(40)} textAnchor="middle" className="fill-white font-bold" style={{ fontSize: uc(20) }}>
                  {T.carte.cotonou}
                </text>
                <text x={AERO[0]} y={AERO[1] - uc(20)} textAnchor="middle" className="fill-white/70 font-semibold" style={{ fontSize: uc(14) }}>
                  {T.carte.aeroportNom}
                </text>
                <circle cx={PORTE[0]} cy={PORTE[1]} r={uc(6)} className="fill-white" />
                <text x={PORTE[0] - uc(12)} y={PORTE[1] + uc(18)} textAnchor="end" className="fill-white/80 font-semibold" style={{ fontSize: uc(13) }}>
                  {T.carte.porteNom}
                </text>
                <Ondes r={uc(56)} OUIDAH={OUIDAH} />
                <circle cx={OUIDAH[0]} cy={OUIDAH[1]} r={uc(9)} className="fill-sun" />
                <Repere e={uc(1.5)} OUIDAH={OUIDAH} />
                <text x={OUIDAH[0] - uc(30)} y={OUIDAH[1] + uc(4)} textAnchor="end" className="fill-white font-display font-semibold tracking-[-0.02em]" style={{ fontSize: uc(64) }}>
                  {T.carte.ville}
                </text>
              </motion.g>
            </>
          ) : null}
        </motion.svg>

        {/* fil pointillé de la carte de visite au repère de Ouidah (vue Bénin, tablette et ordinateur) */}
        {fiche && pin ? (
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 hidden size-full md:block">
            <motion.path
              d={`M${fiche.x},${fiche.y} H${pin.x} V${pin.y}`}
              className="fill-none stroke-white/55"
              strokeWidth={1}
              strokeDasharray="3 4"
              initial={false}
              animate={{ opacity: vue === "benin" ? 1 : 0 }}
              transition={{ duration: 0.4, delay: vue === "benin" ? 0.8 : 0 }}
            />
            <motion.circle cx={fiche.x} cy={fiche.y} r={3} className="fill-white" initial={false} animate={{ opacity: vue === "benin" ? 1 : 0 }} />
          </svg>
        ) : null}

        <div ref={ficheRef} className="absolute bottom-10 left-10 z-10 hidden w-60 md:block xl:left-[max(64px,calc((100vw-1440px)/2+64px))]">
          <AnimatePresence mode="wait" initial={false}>
            {carteDeVisite === "cote" ? (
              <motion.div
                key="cote"
                className="absolute bottom-0 left-0 flex w-[22rem] items-center gap-3.5 rounded-lg bg-white py-3 pr-4 pl-3 text-[14px]/[1.4] text-ink shadow-[0_24px_48px_-20px_rgba(0,0,0,.7)]"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ duration: 0.35, ease: EASE }}
              >
                <Objet3D nom="accueil" taille={56} />
                <span>
                  <b className="block font-display text-[18px] font-semibold">{T.accueil.titre}</b>
                  {T.accueil.texte}
                </span>
              </motion.div>
            ) : (
              <motion.figure
                key="ville"
                className="overflow-hidden rounded-lg bg-white text-ink shadow-[0_24px_48px_-20px_rgba(0,0,0,.7)]"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ duration: 0.35, ease: EASE }}
              >
                <Image src={T.fiche.image.src} alt={T.fiche.image.alt} width={480} height={304} sizes="240px" className="h-38 w-full object-cover" />
                <figcaption className="px-3.5 pt-3 pb-3.5">
                  <b className="block font-display text-[22px] font-semibold tracking-[-0.02em]">{carteDeVisite === "heure" && heure ? T.fiche.heure(heure) : T.fiche.titre}</b>
                  <span className="mt-0.5 block text-[13px]/[1.4] text-ink-muted">{carteDeVisite === "heure" ? T.fiche.heureTexte : T.fiche.texte}</span>
                </figcaption>
              </motion.figure>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-col px-6 pt-8 pb-12 md:px-10 xl:pt-28 xl:pr-16 xl:pb-14 xl:pl-12" data-framer-name="Panel">
        <div role="tablist" aria-label={T.ongletsLabel} onKeyDown={clavier} className="-mr-6 flex gap-1.5 overflow-x-auto pr-6 [mask-image:linear-gradient(to_right,black_85%,transparent)] [scrollbar-width:none] md:mr-0 md:flex-wrap md:pr-0 md:[mask-image:none]">
          {THEMES.map((x) => {
            const on = x.id === t.id;
            return (
              <button
                key={x.id}
                id={`preparer-onglet-${x.id}`}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls="preparer-panneau"
                tabIndex={on ? 0 : -1}
                onClick={() => setId(x.id)}
                className={`inline-flex h-10 flex-none items-center gap-1.5 rounded-full pr-3.5 pl-1 text-[13px] font-bold whitespace-nowrap transition-colors duration-300 ${on ? "bg-abyss text-ivory" : "text-ink shadow-[inset_0_0_0_1px_rgba(15,22,45,.14)] hover:bg-abyss/5"}`}
              >
                <Objet3D nom={x.objet} taille={32} />
                {x.court}
              </button>
            );
          })}
        </div>

        <div id="preparer-panneau" role="tabpanel" aria-labelledby={`preparer-onglet-${t.id}`} className="mt-7">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={t.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: reduit ? 0 : 0.35, ease: EASE }}>
              <h3 className="font-display text-[30px]/[1.05] font-semibold tracking-[-0.025em] md:text-[40px]/[1.02]">{t.titre}</h3>
              <p className={`mt-4 flex border-b border-abyss pb-4 ${t.mot ? "flex-col gap-1.5" : "items-baseline gap-3"}`}>
                <b className={`flex-none font-semibold ${t.mot ? "text-[16px]/[1.4]" : "font-display text-[40px]/[0.9] tracking-[-0.04em] md:text-[48px]/[0.9]"}`}>{t.cle.valeur}</b>
                <span className="text-[14px]/[1.4] font-semibold text-ink-muted">{t.cle.texte}</span>
              </p>
              <p className="mt-5 text-[14px] font-bold text-laterite">{T.conseils(t.points.length)}</p>
              <ul className="mt-1">
                {t.points.map((p, i) => (
                  <li key={p} className="flex gap-3 border-b border-abyss/14 py-2.5 text-[15px]/[1.45]">
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-px size-[22px] flex-none rounded-full bg-sun/30">
                      <motion.path
                        d="M7 12.5l3.2 3.2L17 9"
                        className="fill-none stroke-abyss"
                        strokeWidth={2.4}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={{ pathLength: reduit ? 1 : 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.4, delay: 0.15 + i * 0.08, ease: EASE }}
                      />
                    </svg>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-auto flex flex-col gap-4 pt-8">
          <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px] text-ink-muted">
            <span className="basis-full text-[14px] font-bold text-ink">{T.numeros}</span>
            {emergency.map((e) => (
              <a key={e.label} href={`tel:${e.value}`} className="hover:text-ink">
                <b className="mr-1 font-display text-[18px] font-semibold text-ink">{e.value}</b>
                {e.label}
              </a>
            ))}
          </p>
          <p className="text-[14px]/[1.4] text-ink-muted">{T.question}</p>
          <ButtonPrimary href={wa ?? T.ecrire.href} className="self-start">
            {wa ? T.whatsapp : T.ecrire.label}
          </ButtonPrimary>
        </div>
      </div>
    </section>
  );
}
