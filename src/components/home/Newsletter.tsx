"use client";

import { useFormatsSite } from "@/lib/formats-site";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { langueDetectee, rien } from "@/lib/langue";
import { motion, useScroll, useTransform } from "motion/react";
import { useMouvementReduit } from "@/lib/mouvement";
import { cheminsIntro as CHEMINS_INTRO, evenements as EVENEMENTS, nav as NAV, newsletter as NEWSLETTER, tours as TOURS } from "@/content/fr";
import { useContenu } from "@/components/ui/ContenuSite";
import { EMAIL } from "@/lib/demande";
import { leverCoucher } from "@/lib/soleil";
import { jourOuidah, prochaine } from "@/lib/jours";
import { EASE } from "@/lib/motion";
import { Objet3D } from "@/components/ui/Objet3D";
import { Icon } from "@/components/ui/Icon";

// Section 12 — la lettre de Ouidah (maquette E « Ce soir, à la carte ») : la plage de Ouidah en plein écran, sans voile ;
// l'heure du coucher du soleil calculée ; deux cartes pour choisir ce que Ouidah vous écrit, la langue de la lettre, puis
// un bouton blanc qui s'ouvre en champ d'adresse et devient la confirmation, seulement après la réponse du serveur
// (/api/lettre). Aucun thème coché d'avance.
const OMBRE = "[text-shadow:0_1px_18px_rgba(15,22,45,.55)]";

type Ciel = { coucher: string; passe: boolean; maintenant: string; auj: number };

function Coche({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <motion.path d="M6 12.5l4 4L18 8" className="fill-none stroke-abyss" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" initial={false} animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }} transition={{ duration: 0.35, ease: EASE }} />
    </svg>
  );
}

export function Newsletter() {
  const { date } = useFormatsSite();
  const T = useContenu("fr.newsletter", NEWSLETTER);
  const cheminsIntro = useContenu("fr.cheminsIntro", CHEMINS_INTRO);
  const nav = useContenu("fr.nav", NAV);
  const langues = nav.languages.map((l) => l.code);
  const evenements = useContenu("fr.evenements", EVENEMENTS);
  const tours = useContenu("fr.tours", TOURS);
  const zone = useRef<HTMLElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const reduit = useMouvementReduit();
  const { scrollYProgress } = useScroll({ target: zone, offset: ["start end", "end start"] });
  const zoom = useTransform(scrollYProgress, [0, 1], [1.08, 1]);
  const [ciel, setCiel] = useState<Ciel | null>(null);
  const [choix, setChoix] = useState<string[]>([]);
  const detectee = useSyncExternalStore(rien, () => langueDetectee(langues), () => langues[0]);
  const [choisie, setLangue] = useState<string | null>(null);
  const langue = choisie ?? detectee;
  const [ouvert, setOuvert] = useState(false);
  const [exemple, setExemple] = useState("");
  const [etat, setEtat] = useState<"idle" | "envoi" | "ok" | "erreur" | "aucun" | "echec" | "limite">("idle");
  // ce qui manque au dernier envoi, dans l'ordre du formulaire : adresse, accord, thème
  const [manque, setManque] = useState<("emailManque" | "emailInvalide" | "consentManque" | "aucun")[]>([]);
  const consent = useRef<HTMLInputElement>(null);
  const premierTheme = useRef<HTMLInputElement>(null);
  const debut = useRef(0);
  useEffect(() => {
    debut.current = performance.now();
  }, []);

  // coucher du soleil et heure de Ouidah, à la minute (calculés chez le visiteur : la page est servie en statique)
  useEffect(() => {
    const heureOuidah = date({ hour: "2-digit", minute: "2-digit", timeZone: cheminsIntro.timeZone });
    const fmt = (d: Date) => heureOuidah.format(d).replace(":", " h ");
    const maj = () => {
      const now = new Date();
      const { coucher } = leverCoucher(now, [cheminsIntro.origin[1], cheminsIntro.origin[0]]);
      setCiel({ coucher: fmt(coucher), passe: now > coucher, maintenant: fmt(now), auj: jourOuidah(now.getTime()) });
    };
    maj();
    const id = setInterval(maj, 60_000);
    return () => clearInterval(id);
  }, [cheminsIntro.timeZone, cheminsIntro.origin, date]);

  // le bouton s'ouvre en champ : focus, puis l'exemple d'adresse s'écrit lettre à lettre
  useEffect(() => {
    if (!ouvert) return;
    champ.current?.focus();
    if (reduit) return; // mouvement réduit : l'exemple s'affiche d'emblée (voir placeholder)
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setExemple(T.exemple.slice(0, i));
      if (i >= T.exemple.length) clearInterval(id);
    }, 60);
    return () => clearInterval(id);
  }, [ouvert, reduit, T.exemple]);

  const rendezVous = ciel ? evenements.map((e) => ({ e, a: prochaine(e.quand, ciel.auj)[0] })).sort((x, y) => x.a - y.a) : [];
  const suivant = rendezVous[0];
  const n = choix.length;

  const basculer = (id: string) => {
    setChoix((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
    if (manque.includes("aucun")) {
      const reste = manque.filter((m) => m !== "aucun");
      setManque(reste);
      if (!reste.length) setEtat("idle");
    }
  };
  const envoyer = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (etat === "envoi") return;
    if (!ouvert) return setOuvert(true);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    const fautes = [
      ...(!email ? (["emailManque"] as const) : !EMAIL.test(email) ? (["emailInvalide"] as const) : []),
      ...(!f.get("consent") ? (["consentManque"] as const) : []),
      ...(n === 0 ? (["aucun"] as const) : []),
    ];
    setManque(fautes);
    if (fautes.length) {
      setEtat(fautes[0] === "aucun" ? "aucun" : "erreur");
      // le focus va au premier champ fautif : l'adresse, la case d'accord, sinon le premier thème
      (fautes[0].startsWith("email") ? champ.current : fautes[0] === "consentManque" ? consent.current : premierTheme.current)?.focus();
      return;
    }
    setEtat("envoi");
    try {
      const res = await fetch("/api/lettre", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, langue, sujets: choix, consentement: true, piege: String(f.get("site") ?? ""), duree: Math.round(performance.now() - debut.current) }),
      });
      setEtat(res.status === 201 ? "ok" : res.status === 429 ? "limite" : "echec");
    } catch {
      setEtat("echec");
    }
  };

  return (
    <section ref={zone} id="lettre" aria-labelledby="lettre-titre" className="relative isolate overflow-hidden bg-abyss text-white" data-framer-name="Section · Lettre">
      <motion.div aria-hidden="true" className="absolute inset-0 -z-10" style={{ scale: reduit ? 1 : zoom }}>
        <Image src={T.photo.src} alt="" fill sizes="100vw" className="object-cover object-[30%_50%] md:object-[50%_62%]" />
      </motion.div>

      <div className="container-oht flex min-h-[48rem] flex-col justify-between gap-10 pt-24 pb-10 md:min-h-[46rem] md:pt-28 xl:min-h-[52rem] xl:pb-12">
        <div className={`max-w-[44rem] ${OMBRE}`}>
          <h2 id="lettre-titre" className="font-display text-[34px]/[1.08] font-medium tracking-[-0.025em] md:text-[52px]/[1.04] xl:text-[64px]/[1.04]">
            {ciel ? (
              <>
                {T.phrase(ciel.passe)[0]} <b className="font-semibold text-sun">{ciel.coucher}</b> {T.phrase(ciel.passe)[1]}
              </>
            ) : (
              T.phraseSansHeure
            )}
          </h2>
          <p className="mt-4 flex min-h-5 flex-wrap gap-x-6 gap-y-1 text-[14px] font-bold">
            {ciel ? (
              <>
                <span>
                  <span className="mr-2 font-bold opacity-85">{T.maintenant}</span>
                  {ciel.maintenant}
                </span>
                {suivant ? (
                  <span>
                    <span className="mr-2 font-bold opacity-85">{suivant.e.short}</span>
                    {T.dans(suivant.a - ciel.auj)}
                  </span>
                ) : null}
              </>
            ) : null}
          </p>
        </div>

        <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
          {/* ce que Ouidah vous écrit */}
          <fieldset className="xl:order-2">
            <legend className={`mb-3 text-[15px] font-bold xl:w-full xl:text-right ${OMBRE}`}>
              {T.choisir} <span className="font-semibold opacity-85">({T.auMoinsUn})</span>
            </legend>
            <div className="grid grid-cols-2 gap-2 md:gap-3.5 xl:w-[40rem] xl:grid-cols-[1fr_1.3fr]">
              {T.sujets.map((s, i) => {
                const on = choix.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className={`relative flex cursor-pointer flex-col rounded-xl bg-white p-3 text-ink shadow-[0_24px_48px_-20px_rgba(15,22,45,.65)] transition-[transform,box-shadow] duration-500 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-sun hover:-translate-y-1.5 md:p-4 ${on ? "ring-2 ring-sun" : ""}`}
                  >
                    <input ref={i === 0 ? premierTheme : undefined} type="checkbox" name="sujets" value={s.id} form="lettre-form" className="sr-only" checked={on} onChange={() => basculer(s.id)} aria-invalid={manque.includes("aucun") || undefined} aria-describedby={manque.includes("aucun") ? "lettre-message" : undefined} />
                    <Objet3D nom={s.objet} taille={72} className="size-11 md:size-[72px]" />
                    <span aria-hidden="true" className={`absolute top-2.5 right-2.5 grid size-6 place-items-center rounded-full transition-colors duration-300 md:top-3.5 md:right-3.5 md:size-8 ${on ? "bg-sun" : "shadow-[inset_0_0_0_1.5px_rgba(15,22,45,.25)]"}`}>
                      <Coche on={on} />
                    </span>
                    <span className="mt-1.5 font-display text-[16px]/[1.1] font-semibold tracking-[-0.015em] md:mt-2.5 md:text-[22px]">{s.nom}</span>
                    <span className="mt-1.5 hidden text-[13px]/[1.45] text-ink-muted md:block">{s.texte}</span>
                    <ul className="mt-3 hidden flex-col gap-1 md:flex">
                      {s.id === "agenda"
                        ? rendezVous.map((r) => (
                            <li key={r.e.slug} className="flex justify-between gap-2 border-t border-abyss/8 pt-1 text-[12px] font-bold whitespace-nowrap">
                              {r.e.short}
                              <em className="whitespace-nowrap text-laterite not-italic">{ciel ? T.dans(r.a - ciel.auj) : null}</em>
                            </li>
                          ))
                        : tours.slice(0, 3).map((t) => (
                            <li key={t.slug} className="border-t border-abyss/8 pt-1 text-[12px] font-bold">
                              {t.title}
                            </li>
                          ))}
                    </ul>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* langue, puis le bouton qui devient le champ */}
          <form id="lettre-form" onSubmit={envoyer} noValidate className="xl:order-1 xl:w-[31rem]" aria-describedby="lettre-message">
            <fieldset>
              <legend className={`text-[15px] font-bold ${OMBRE}`}>{T.langue}</legend>
              <div className="mt-2.5 flex gap-1 md:flex-wrap md:gap-1.5">
                {langues.map((l) => (
                  <label
                    key={l}
                    className={`grid h-8 flex-1 cursor-pointer place-items-center rounded-full text-[12px] font-semibold transition-colors duration-300 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-sun md:h-9 md:min-w-11 md:flex-none md:px-2.5 md:text-[13px] ${l === langue ? "bg-white text-ink" : `shadow-[inset_0_0_0_1.5px_rgba(255,255,255,.75)] hover:bg-white/15 ${OMBRE}`}`}
                  >
                    <input type="radio" name="langue" value={l} className="sr-only" checked={l === langue} onChange={() => setLangue(l)} />
                    {l}
                  </label>
                ))}
              </div>
            </fieldset>

            <div
              className={`mt-3.5 flex h-16 w-full items-center rounded-full bg-white pr-2 pl-6 text-ink shadow-[0_24px_48px_-20px_rgba(15,22,45,.6)] transition-[width] duration-500 ease-[cubic-bezier(.625,.05,0,1)] md:mt-5 ${ouvert || etat === "ok" ? "md:w-[31rem]" : "md:w-[21rem]"}`}
            >
              {etat === "ok" ? (
                <>
                  <p role="status" className="flex-1 text-[15px] font-bold md:text-[17px]">
                    {T.thanks}
                  </p>
                  <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-sun">
                    <Coche on />
                  </span>
                </>
              ) : ouvert ? (
                <>
                  <label htmlFor="lettre-champ" className="sr-only">
                    {T.field}
                  </label>
                  <input
                    ref={champ}
                    id="lettre-champ"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder={reduit ? T.exemple : exemple}
                    onInput={() => manque.some((m) => m.startsWith("email")) && setManque((m) => m.filter((x) => !x.startsWith("email")))}
                    aria-invalid={manque.some((m) => m.startsWith("email")) || undefined}
                    aria-describedby={manque.some((m) => m.startsWith("email")) ? "lettre-message" : undefined}
                    className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink/40 md:text-[17px]"
                  />
                  {/* libellé visible (« S'inscrire ») ; le nom complet, thèmes compris, reste lu par les lecteurs d'écran */}
                  <button type="submit" aria-label={etat === "envoi" ? T.envoi : n ? T.envoyer(n) : T.submit} aria-disabled={etat === "envoi" || undefined} className="flex h-12 flex-none items-center gap-2 rounded-full bg-abyss pr-4 pl-5 text-[15px] font-bold whitespace-nowrap text-ivory transition-colors hover:bg-ocean focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sun aria-disabled:cursor-progress">
                    {T.envoyerCourt}
                    {etat === "envoi" ? <span className="oht-tourne" /> : <Icon name="arrow-right" className="size-[18px]" />}
                  </button>
                  {/* piège à robots : invisible et hors du parcours clavier */}
                  <input type="text" name="site" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
                </>
              ) : (
                <button type="submit" aria-expanded={false} aria-label={n ? T.envoyer(n) : T.submit} className="flex h-full flex-1 items-center justify-between gap-4 rounded-full text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sun">
                  <span className="text-[16px] font-bold md:text-[17px]">{T.submit}</span>
                  <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-abyss text-[15px] font-semibold text-ivory">
                    {n || <Icon name="arrow-right" className="size-[18px]" />}
                  </span>
                </button>
              )}
            </div>

            {ouvert && etat !== "ok" ? (
              <label className={`mt-3 flex cursor-pointer items-start gap-2.5 text-[13px]/[1.45] ${OMBRE}`}>
                <input ref={consent} name="consent" type="checkbox" className="peer sr-only" aria-invalid={manque.includes("consentManque") || undefined} aria-describedby={manque.includes("consentManque") ? "lettre-message" : undefined} onChange={() => manque.includes("consentManque") && setManque((m) => m.filter((x) => x !== "consentManque"))} />
                <span aria-hidden="true" className="mt-px grid size-[18px] flex-none place-items-center rounded bg-white text-transparent peer-checked:text-abyss peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sun">
                  <svg viewBox="0 0 24 24" className="size-3 fill-none stroke-current" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 12.5l4 4L18 8" />
                  </svg>
                </span>
                {T.consent}
              </label>
            ) : null}
            <p id="lettre-message" role="alert" className={`mt-2 min-h-5 text-[13px] font-bold text-sun ${OMBRE}`}>
              {etat === "erreur" || etat === "aucun" ? manque.map((m) => T[m]).join(" ") : etat === "echec" ? T.echec : etat === "limite" ? T.limite : etat === "envoi" ? T.envoi : null}
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}
