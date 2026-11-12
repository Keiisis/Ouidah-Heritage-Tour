"use client";

import { useFormatsSite } from "@/lib/formats-site";

import Image from "next/image";
import Link from "@/components/ui/LienPublic";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion } from "motion/react";
import { useMouvementReduit } from "@/lib/mouvement";
import { adresseAgence, cheminsIntro, consentement as CONSENTEMENT, equipe as EQUIPE, evenements as EVENEMENTS, footer as FOOTER, nav as NAV, newsletter as NEWSLETTER, SECTIONS } from "@/content/fr";
import { useContenu, useLangue } from "@/components/ui/ContenuSite";
import { ChoisirLangue } from "@/components/ui/ChoisirLangue";
import { ouvrirChoix } from "@/lib/consentement";
import { leverCoucher } from "@/lib/soleil";
import { jourOuidah, prochaine } from "@/lib/jours";
import { useDevise } from "@/lib/devise";
import { EASE } from "@/lib/motion";
import { whatsappHref } from "@/components/ui/Buttons";
import { Icon } from "@/components/ui/Icon";

// Section 15 — pied de page (maquette A « Verre sur Ouidah », prompt Assets OHT/Section-15-Pied-de-page) : vraies photos
// de Ouidah en plein écran, jamais assombries, qui changent toutes les 9 s (de nuit à Ouidah, la Porte du Non-Retour
// d'abord) ; l'heure et le coucher du soleil de Ouidah ; le plan du site sur une feuille de verre, rangé comme chez Apple
// (12 px, hiérarchie par l'opacité) ; accordéons sur téléphone ; langue et devise au même endroit.
const VERRE = "border border-white/16 bg-abyss/70 shadow-[inset_0_1px_0_rgba(255,255,255,.22),0_30px_80px_-30px_rgba(0,0,0,.65)] backdrop-blur-[28px] backdrop-saturate-[1.7]";

type Ciel = { maintenant: string; coucher: string; passe: boolean; nuit: boolean; auj: number };

// blog : vrai quand au moins un article est publié ; sinon pas de lien « Blog ».
export function Footer({ year, blog }: { year: number; blog: boolean }) {
  const { date } = useFormatsSite();
  const T = useContenu("fr.footer", FOOTER);
  const nav = useContenu("fr.nav", NAV);
  const consentement = useContenu("fr.consentement", CONSENTEMENT);
  const evenements = useContenu("fr.evenements", EVENEMENTS);
  const newsletter = useContenu("fr.newsletter", NEWSLETTER);
  const equipe = useContenu("fr.equipe", EQUIPE);
  const colonnes = T.columns.map((c) => ({ ...c, links: c.links.filter((l) => blog || !("blog" in l && l.blog)).map((l) => ({ ...l, href: l.href === SECTIONS.agence || l.href === "/a-propos" ? adresseAgence(equipe) : l.href })) }));
  const zone = useRef<HTMLElement>(null);
  const reglagesBouton = useRef<HTMLButtonElement>(null);
  const reduit = useMouvementReduit();
  const [ciel, setCiel] = useState<Ciel | null>(null);
  const [photo, setPhoto] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);
  const [reglages, setReglages] = useState(false);
  const [devise, setDevise, devises] = useDevise();
  const wa = whatsappHref(nav.whatsapp.number, nav.whatsapp.message);
  const actuelle = Math.max(0, photo ?? (ciel?.nuit ? T.photos.findIndex((p) => p.nuit) : 0)) % T.photos.length;

  // heure et soleil de Ouidah, à la minute (calculés chez le visiteur : la page est servie en statique)
  useEffect(() => {
    const heureOuidah = date({ hour: "2-digit", minute: "2-digit", timeZone: cheminsIntro.timeZone });
    const fmt = (d: Date) => heureOuidah.format(d).replace(":", " h ");
    const maj = () => {
      const now = new Date();
      const { lever, coucher } = leverCoucher(now, [cheminsIntro.origin[1], cheminsIntro.origin[0]]);
      setCiel({ maintenant: fmt(now), coucher: fmt(coucher), passe: now > coucher, nuit: now < lever || now > coucher, auj: jourOuidah(now.getTime()) });
    };
    maj();
    const id = setInterval(maj, 60_000);
    return () => clearInterval(id);
  }, [date]);

  // la photo change toutes les 9 s, seulement quand le pied de page est à l'écran et l'onglet visible
  useEffect(() => {
    const el = zone.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || reduit) return;
    const id = setInterval(() => {
      if (!document.hidden) setPhoto((p) => ((p ?? actuelle) + 1) % T.photos.length);
    }, 9000);
    return () => clearInterval(id);
  }, [visible, reduit, actuelle, T.photos.length]);

  // langue et devise : Échap ferme et rend le focus au bouton ; clic ailleurs ferme
  useEffect(() => {
    if (!reglages) return;
    const echap = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setReglages(false);
      reglagesBouton.current?.focus();
    };
    const dehors = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.("[data-reglages]")) setReglages(false);
    };
    document.addEventListener("keydown", echap);
    document.addEventListener("pointerdown", dehors);
    return () => {
      document.removeEventListener("keydown", echap);
      document.removeEventListener("pointerdown", dehors);
    };
  }, [reglages]);

  const suivant = ciel ? evenements.map((e) => ({ e, a: prochaine(e.quand, ciel.auj)[0] })).sort((x, y) => x.a - y.a)[0] : null;
  const vif = (mobile: boolean) =>
    ciel ? (
      <div className={mobile ? "mb-5 border-b border-white/14 pb-4 md:hidden" : `hidden rounded-[20px] px-5 py-4 md:block ${VERRE}`} data-pied="vif">
        <p className={`font-display font-medium tracking-[-0.015em] ${mobile ? "text-[22px]/[1.15]" : "text-[26px]/[1.15]"}`}>
          {T.vif[0]} <b className="font-semibold text-sun">{ciel.maintenant}</b> {T.vif[1]}
        </p>
        <p className="mt-1.5 text-[14px] font-semibold text-white/80">
          {T.coucher(ciel.coucher, ciel.passe)}
          {suivant ? ` · ${suivant.e.short} ${newsletter.dans(suivant.a - ciel.auj)}` : ""}
        </p>
      </div>
    ) : null;
  const codeLangue = useLangue();
  const langue = nav.languages.find((l) => l.code === codeLangue) ?? nav.languages[0];
  const monnaie = devises.find((c) => c.code === devise) ?? devises[0];

  return (
    <footer ref={zone} className="relative isolate overflow-hidden bg-abyss text-white/94" data-framer-name="Footer · Verre sur Ouidah">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 -z-10 h-[26rem] md:h-full">
        {T.photos.map((p, i) => (
          <Image
            key={p.src}
            src={p.src}
            alt=""
            fill
            sizes="100vw"
            className={`oht-pied-photo object-cover ${i === actuelle ? "is-on" : ""}`}
            style={{ objectPosition: p.position }}
          />
        ))}
      </div>

      <div className="mx-auto flex min-h-[44rem] max-w-[1440px] flex-col justify-between px-3 pt-20 pb-3 md:min-h-[58rem] md:px-10 md:pt-28 md:pb-6 xl:px-16">
        {/* haut : l'heure de Ouidah (ordinateur), la légende de la photo et le choix de la photo */}
        <div className="flex h-[16rem] flex-wrap items-end justify-between gap-x-6 gap-y-3 md:h-auto">
          {vif(false)}
          <div className="flex items-center gap-2 md:gap-3.5">
            <p className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-[12px] font-semibold whitespace-nowrap ${VERRE}`} aria-live="polite">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-sun" />
              {T.photos[actuelle].legende}
            </p>
            {/* cibles de 44 px : au toucher, chaque puce s'élargit ; la hauteur passe par un pseudo-élément */}
            <div className={`flex h-9 items-center gap-0.5 rounded-full px-1.5 ${VERRE}`}>
              {T.photos.map((p, i) => (
                <button
                  key={p.src}
                  type="button"
                  aria-label={T.photosLabel(i + 1, T.photos.length)}
                  aria-current={i === actuelle || undefined}
                  onClick={() => setPhoto(i)}
                  className="relative grid h-7 place-items-center px-1 before:absolute before:inset-x-0 before:-inset-y-2 focus-visible:outline-2 focus-visible:outline-sun pointer-coarse:min-w-11"
                >
                  <span className={`block h-1.5 rounded-full transition-[width,background-color] duration-500 ${i === actuelle ? "w-[18px] bg-white" : "w-1.5 bg-white/45"}`} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* la feuille de verre */}
        <motion.div
          className={`mt-6 rounded-[24px] px-4 pt-5 pb-4 md:mt-10 md:rounded-[28px] md:px-12 md:pt-10 md:pb-7 ${VERRE}`}
          initial={reduit ? false : { opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          data-framer-name="Glass sheet"
        >
          {vif(true)}
          <div className="xl:grid xl:grid-cols-[18.75rem_minmax(0,1fr)] xl:gap-8">
            <div className="md:mb-8 xl:mb-0">
              {/* même logo que la barre de navigation (Kevin, 09/11) : emblème rond original sur pastille blanche + nom (10/11) */}
              <p className="flex items-center gap-3">
                <span className="grid size-14 shrink-0 place-items-center rounded-full bg-white md:size-16">
                  <Image src={nav.embleme.src} alt="" width={64} height={64} className="size-11 md:size-[52px]" />
                </span>
                <span className="font-display text-[20px]/[1.15] font-semibold md:text-[22px]">
                  {nav.wordmark[0]} <span className="text-sun">{nav.wordmark[1]}</span>
                </span>
              </p>
              <p className="mt-2 max-w-60 text-[12px]/[1.55] text-white/72 md:mt-4 md:text-[13px]">{T.tagline}</p>
            </div>

            {/* ordinateur : quatre colonnes, toujours ouvertes */}
            <nav aria-label={T.planLabel} style={{ "--colonnes": colonnes.length } as CSSProperties} className="hidden gap-8 md:grid md:grid-cols-2 lg:grid-cols-[repeat(var(--colonnes),minmax(0,1fr))]">
              {colonnes.map((c, ci) => (
                <motion.div key={c.title} initial={reduit ? false : { opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, ease: EASE, delay: 0.15 + ci * 0.06 }}>
                  <h2 className="font-text text-[12px] font-semibold tracking-[0.01em] text-white/94">{c.title}</h2>
                  <ul className="mt-2">
                    {c.links.map((l) => (
                      <li key={l.href} className="text-[12px]/[2.15] whitespace-nowrap">
                        <Link href={l.href} className="oht-pied-lien text-white/72 transition-colors duration-200 hover:text-white focus-visible:text-white focus-visible:outline-sun pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:items-center">
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </nav>

            {/* téléphone : accordéons, un seul ouvert à la fois */}
            <nav aria-label={T.planLabel} className="mt-3 md:hidden">
              {colonnes.map((c) => (
                <details key={c.title} name="pied" className="group border-t border-white/14">
                  <summary className="flex h-12 cursor-pointer list-none items-center justify-between text-[14px] font-semibold focus-visible:outline-sun [&::-webkit-details-marker]:hidden">
                    {c.title}
                    <Icon name="chevron-right" className="size-3 rotate-90 transition-transform duration-300 group-open:-rotate-90" />
                  </summary>
                  <ul className="pb-3 pl-1">
                    {c.links.map((l) => (
                      <li key={l.href} className="text-[14px]">
                        <Link href={l.href} className="flex min-h-11 items-center text-white/72 hover:text-white">
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </nav>
          </div>

          {/* autres moyens de nous joindre : seulement quand OHT a fourni le numéro WhatsApp */}
          {wa ? (
            <p data-pied="joindre" className="mt-1 border-t border-white/14 pt-4 text-[12px]/[1.6] text-white/72 md:mt-7">
              {T.joindre.avant}{" "}
              <a href={wa} target="_blank" rel="noopener noreferrer" className="border-b border-white/35 text-white/94 hover:border-white">
                {T.joindre.whatsapp}
              </a>
              {T.joindre.apres}
            </p>
          ) : null}

          <div className={`flex flex-col gap-3 border-t border-white/14 pt-4 text-[11.5px] text-white/66 ${wa ? "mt-4" : "mt-4 md:mt-7"} xl:flex-row xl:items-center xl:justify-between xl:gap-6`}>
            <nav aria-label={T.legalLabel} className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="text-white/72">{T.copyright(year)}</span>
              {T.legal.map((l) => (
                <span key={l.href} className="flex items-center gap-2.5">
                  <span aria-hidden="true" className="h-3 w-px bg-white/14" />
                  <Link href={l.href} className="hover:text-white pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:items-center pointer-coarse:justify-center">
                    {l.label}
                  </Link>
                </span>
              ))}
              <span className="flex items-center gap-2.5">
                <span aria-hidden="true" className="h-3 w-px bg-white/14" />
                <button type="button" onClick={ouvrirChoix} className="cursor-pointer hover:text-white pointer-coarse:min-h-11 pointer-coarse:min-w-11">
                  {consentement.lienPied}
                </button>
              </span>
            </nav>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 md:flex-none" data-reglages>
                <button
                  ref={reglagesBouton}
                  type="button"
                  aria-expanded={reglages}
                  aria-controls="pied-reglages"
                  aria-label={`${T.reglages} : ${langue.label}, ${monnaie.long}`}
                  onClick={() => setReglages((o) => !o)}
                  className={`relative inline-flex h-8 w-full items-center justify-center gap-2 rounded-full px-3.5 text-[12px] font-semibold whitespace-nowrap text-white/94 before:absolute before:inset-x-0 before:-inset-y-2 focus-visible:outline-2 focus-visible:outline-sun md:w-auto ${VERRE}`}
                >
                  {T.pays} · {langue.label}
                  <span aria-hidden="true" className="opacity-50">
                    |
                  </span>
                  {monnaie.short}
                  <Icon name="chevron-right" className={`size-3 transition-transform duration-300 ${reglages ? "rotate-90" : "-rotate-90"}`} />
                </button>
                <div id="pied-reglages" hidden={!reglages} className="absolute right-0 bottom-[calc(100%+8px)] w-[17rem] rounded-[18px] border border-white/16 bg-abyss/94 p-2.5 shadow-[0_24px_48px_-20px_rgba(0,0,0,.7)]">
                  <p className="px-2.5 py-1.5 text-[13px] font-bold text-white/72">{T.langue}</p>
                  <ul className="grid grid-cols-2 gap-0.5">
                    {nav.languages.map((l) => (
                      <li key={l.code}>
                        <ChoisirLangue code={l.code} className={`flex min-h-11 items-center justify-between rounded-[10px] px-2.5 py-2 text-[13px] font-semibold ${l.code === codeLangue ? "bg-white/16 text-white" : "text-white/80"}`}>
                          {l.label}<small className="text-[11px] text-white/66">{l.code}</small>
                        </ChoisirLangue>
                      </li>
                    ))}
                  </ul>
                  <fieldset className="mt-1">
                    <legend className="px-2.5 py-1.5 text-[13px] font-bold text-white/72">{T.devise}</legend>
                    <div className={`grid gap-0.5 ${devises.length > 2 ? "grid-cols-3" : "grid-cols-2"}`}>
                      {devises.map((c) => (
                        <label key={c.code} className={`flex cursor-pointer justify-between rounded-[10px] px-2.5 py-2 text-[13px] font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-sun ${c.code === devise ? "bg-white/16 text-white" : "text-white/80 hover:bg-white/8"}`}>
                          <input type="radio" name="pied-devise" value={c.code} checked={c.code === devise} onChange={() => setDevise(c.code)} className="sr-only" />
                          {devises.length > 2 ? c.short : c.long}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>
              </div>
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: reduit ? "auto" : "smooth" })}
                className={`relative inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold whitespace-nowrap text-white/94 before:absolute before:inset-x-0 before:-inset-y-2 focus-visible:outline-2 focus-visible:outline-sun ${VERRE}`}
              >
                {T.haut}
                <Icon name="arrow-right" className="size-3 -rotate-90" />
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </footer>
  );
}
