"use client";

import { useFormatsSite } from "@/lib/formats-site";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { conciergeIntro as CONCIERGE_INTRO, conciergerie as CONCIERGERIE } from "@/content/fr";
import { useContenu } from "@/components/ui/ContenuSite";
import { EASE } from "@/lib/motion";
import { useSejour } from "@/lib/sejour";
import { dateDuJour } from "@/lib/jours";
import { CLE_CONCIERGERIE, ecrireConciergerie, lireConciergerie, passe, type Reponses } from "@/lib/conciergerie";
import { Objet3D } from "@/components/ui/Objet3D";
import { ButtonPrimary } from "@/components/ui/Buttons";

// Section 9 — conciergerie en configurateur (maquette D3 « Le cadre ») : une question par service, la photo du moment à
// gauche, la demande en objets 3D (gris tant que le service n'est pas réglé). Réponses gardées sur l'appareil.

export function Concierge({ comptes }: { comptes: Record<string, number> }) {
  const { date } = useFormatsSite();
  const jour = date({ day: "numeric", month: "long", timeZone: "UTC" });
  const jourSeul = date({ day: "numeric", timeZone: "UTC" });
    const T = useContenu("fr.conciergeIntro", CONCIERGE_INTRO);
  const Q = useContenu("fr.conciergerie", CONCIERGERIE);
  const [reponses, setReponses] = useState<Reponses>({});
  const [rang, setRang] = useState(0);
  const [lu, setLu] = useState(false); // réponses gardées déjà relues : avant, rien n'est écrit
  const avance = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sejour = useSejour();

  // réponses gardées sur l'appareil (aucun compte) : relues une fois, puis écrites à chaque changement
  useEffect(() => {
    const lire = () => {
      try {
        const m = lireConciergerie(localStorage.getItem(CLE_CONCIERGERIE), Q);
        setReponses(m.reponses);
        setRang(m.rang);
      } catch {
        /* stockage indisponible : on repart de zéro */
      }
      setLu(true);
    };
    lire();
    return () => {
      if (avance.current) clearTimeout(avance.current);
    };
  }, [Q]);
  // tant que les réponses gardées ne sont pas relues, l'état initial vide n'est jamais écrit (il les effacerait)
  useEffect(() => {
    if (lu) ecrireConciergerie(reponses, rang);
  }, [reponses, rang, lu]);

  const q = Q[rang];
  const choix = reponses[q.id] ?? [];
  const regles = Q.filter((x) => reponses[x.id]?.length).length;
  const demandes = Q.filter((x) => reponses[x.id]?.length && !passe(x, reponses[x.id])).length;
  const reste = Q.filter((x) => !reponses[x.id]?.length).map((x) => x.court.toLowerCase());
  const lead = q.lead && q.leadReleve ? q.lead.replace("{n}", String(comptes[q.leadReleve] ?? 0)) : q.lead;

  const choisir = (label: string) => {
    if (avance.current) clearTimeout(avance.current);
    const option = q.options.find((o) => o.label === label);
    let suivant: string[];
    if (!q.multi) suivant = [label];
    else if (option?.passe) suivant = choix.includes(label) ? [] : [label];
    else suivant = choix.includes(label) ? choix.filter((l) => l !== label) : [...choix.filter((l) => !q.options.find((o) => o.label === l)?.passe), label];
    setReponses((r) => {
      const n = { ...r };
      if (suivant.length) n[q.id] = suivant;
      else delete n[q.id];
      return n;
    });
    // choix unique : la question suivante arrive d'elle-même
    if (!q.multi && rang < Q.length - 1) avance.current = setTimeout(() => setRang((i) => Math.min(Q.length - 1, i + 1)), 450);
  };

  const dates = sejour
    ? (() => {
        const a = dateDuJour(sejour.arrivee), b = dateDuJour(sejour.depart);
        return T.dates(a.getUTCMonth() === b.getUTCMonth() ? jourSeul.format(a) : jour.format(a), jour.format(b));
      })()
    : null;
  const statut = !regles ? T.rien : T.regles(regles, Q.length) + (reste.length ? T.reste(reste) : T.prete);
  const prec = Q[rang - 1], suiv = Q[rang + 1];

  return (
    <section id="conciergerie" aria-labelledby="conciergerie-titre" className="relative bg-white text-abyss lg:grid lg:h-[min(100svh,960px)] lg:min-h-[720px] lg:grid-cols-2">
      {/* photo du moment, pleine hauteur, et numéro de la question */}
      <div className="relative h-44 overflow-hidden bg-abyss sm:h-64 lg:h-auto">
        <AnimatePresence initial={false}>
          <motion.div key={q.id} className="absolute inset-0" initial={{ clipPath: "inset(100% 0 0 0)" }} animate={{ clipPath: "inset(0% 0 0 0)" }} exit={{ opacity: 0, transition: { duration: 0.6, delay: 0.3 } }} transition={{ duration: 0.7, ease: EASE }}>
            <Image src={q.photo.src} alt={q.photo.alt} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" style={{ objectPosition: q.cadre ?? "50% 50%" }} />
          </motion.div>
        </AnimatePresence>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-abyss/50 to-transparent" />
        <p className="absolute bottom-3 left-4 flex items-baseline gap-1.5 font-display font-semibold tracking-[-0.03em] text-white tabular-nums lg:bottom-7 lg:left-8" aria-hidden="true">
          <span className="text-5xl leading-[0.8] lg:text-7xl">{String(rang + 1).padStart(2, "0")}</span>
          <span className="text-lg opacity-70 lg:text-xl">/ {String(Q.length).padStart(2, "0")}</span>
        </p>
        <p className="absolute right-8 bottom-8 hidden max-w-72 text-right text-xs text-white/80 lg:block">{q.photo.alt}</p>
      </div>

      <div className="flex flex-col px-4 pt-5 pb-40 sm:px-10 lg:min-h-0 lg:py-10 lg:pr-16 lg:pl-16 xl:pr-26">
        <h2 id="conciergerie-titre" className="text-[22px]/[1.15] font-semibold tracking-[-0.02em] lg:text-[28px]/[1.15]">
          {T.title[0]} <span className="text-laterite">{T.title[1]}</span>
        </h2>

        <AnimatePresence mode="wait" initial={false}>
          <motion.fieldset key={q.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4, ease: EASE }} className="mt-4 min-w-0 lg:mt-6">
            <legend className="sr-only">{q.nom} {q.question}</legend>
            <p className="flex items-center gap-3 text-sm font-bold text-ink-soft">
              <Objet3D nom={q.objet} taille={60} className="-my-2 shrink-0" />
              <span>
                <span className="sr-only">{T.rang(rang + 1, Q.length)} · </span>
                {q.moment}
                {lead ? ` · ${lead}` : ""}
              </span>
            </p>
            <h3 className="mt-2.5 font-display text-[34px]/[1.02] font-semibold tracking-[-0.03em] lg:text-[52px]/[1.02]" aria-hidden="true">
              {q.nom} <span className="text-abyss/60">{q.question}</span>
            </h3>
            <div className="mt-5 border-t border-abyss/15" role={q.multi ? "group" : "radiogroup"}>
              {q.options.map((o) => {
                const on = choix.includes(o.label);
                const n = o.releve ? comptes[o.releve] : null;
                return (
                  <label key={o.label} className={`grid min-h-14 cursor-pointer grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-4 border-b px-3 py-1.5 transition-colors duration-150 ${on ? "border-transparent bg-abyss text-white" : "border-abyss/15 hover:bg-abyss/5"}`}>
                    <input type={q.multi ? "checkbox" : "radio"} name={`conciergerie-${q.id}`} checked={on} onChange={() => choisir(o.label)} className="peer sr-only" />
                    <span className={`grid size-7 place-items-center rounded-full peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-laterite ${on ? "bg-white text-abyss" : "bg-abyss/6"}`} aria-hidden="true">
                      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m5 13 4 4 10-10" pathLength={1} style={{ strokeDasharray: 1, strokeDashoffset: on ? 0 : 1, transition: "stroke-dashoffset 500ms cubic-bezier(.625,.05,0,1)" }} />
                      </svg>
                    </span>
                    <span className="min-w-0">
                      <span className={`font-display text-xl font-semibold tracking-[-0.02em] lg:text-2xl ${o.passe && !on ? "text-abyss/60" : ""}`}>{o.label}</span>
                      {o.detail ? <span className={`block text-sm sm:ml-3 sm:inline ${on ? "text-white/70" : "text-ink-soft"}`}>{o.detail}</span> : null}
                    </span>
                    <span className={`text-[15px] font-bold tabular-nums ${on ? "text-white/70" : "text-ink-soft"}`}>{n != null ? T.adresses(n) : ""}</span>
                  </label>
                );
              })}
            </div>
            <p className="mt-2 hidden gap-8 sm:flex">
              {prec ? (
                <button type="button" onClick={() => setRang(rang - 1)} className="oht-lien text-[15px] text-ink-soft">
                  {T.retour(prec.court)}
                </button>
              ) : null}
              {suiv ? (
                <button type="button" onClick={() => setRang(rang + 1)} className="oht-lien text-[15px]">
                  {T.ensuite(suiv.court)}
                </button>
              ) : null}
            </p>
          </motion.fieldset>
        </AnimatePresence>

        {/* la demande : sur téléphone, barre collée en bas de la section */}
        <div className="sticky bottom-0 z-10 -mx-4 mt-auto border-t border-abyss/15 bg-white px-4 pt-3 pb-4 sm:-mx-10 sm:px-10 lg:static lg:mx-0 lg:border-0 lg:px-0 lg:pt-5 lg:pb-0">
          <p className="sr-only">{T.demande}</p>
          <ul className="flex justify-between lg:grid lg:grid-cols-3 lg:border-t lg:border-abyss/15">
            {Q.map((x, i) => {
              const v = reponses[x.id];
              const fait = !!v?.length && !passe(x, v);
              return (
                <li key={x.id} className="lg:border-b lg:border-abyss/15">
                  <button type="button" onClick={() => setRang(i)} aria-current={i === rang ? "step" : undefined} className="flex w-full items-center gap-2.5 py-1 text-left lg:py-1.5 lg:pr-3">
                    <Objet3D nom={x.objet} taille={44} eteint={!fait} className="size-10 lg:size-11" />
                    <span className="hidden min-w-0 lg:block">
                      <span className={`block text-xs font-bold ${i === rang ? "text-laterite" : "text-ink-soft"}`}>{x.court}</span>
                      <span className={`block truncate ${v?.length ? (fait ? "font-display text-[15px] font-semibold" : "text-[13px] font-semibold text-abyss/40") : "text-[13px] font-semibold text-abyss/40"}`}>{v?.length ? v.join(", ") : "—"}</span>
                    </span>
                    <span className="sr-only">
                      {x.court} : {v?.length ? v.join(", ") : "—"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-center justify-between gap-6 lg:mt-4">
            <p className="hidden text-sm text-ink-soft sm:block" aria-live="polite">
              {dates ? <b className="font-bold text-abyss">{dates}</b> : null}
              {dates ? " · " : ""}
              {statut}
            </p>
            <ButtonPrimary href={T.link.href} compte={demandes} desactive={!demandes} className="is-plein-mobile shrink-0">
              {demandes ? T.envoyer : T.aucunService}
              <span className="sr-only"> · {T.compte(demandes)}</span>
            </ButtonPrimary>
          </div>
          <p className="mt-2 hidden text-xs text-ink-soft lg:block">{T.note}</p>
        </div>
      </div>
    </section>
  );
}
