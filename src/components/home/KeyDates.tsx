"use client";

import { useFormatsSite } from "@/lib/formats-site";

import Image from "next/image";
import Link from "@/components/ui/LienPublic";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { datesSection as DATES_SECTION, DEVIS, evenements as EVENEMENTS } from "@/content/fr";
import { useContenu } from "@/components/ui/ContenuSite";
import type { Evenement } from "@/content/types";
import { Icon } from "@/components/ui/Icon";
import { Objet3D } from "@/components/ui/Objet3D";
import { useMouvementReduit } from "@/lib/mouvement";
import { dateDuJour, jourDe, jourOuidah, minuitOuidah, prochaine } from "@/lib/jours";
import { ecrireSejour, useSejour, type Sejour } from "@/lib/sejour";
import { useVisiteur } from "@/lib/visiteur";
import { telechargerIcs } from "@/lib/ics";
import { poserBillet } from "@/lib/billets";
import { Talon, type Retour } from "./Talon";
import type { NomPasserelle } from "@/lib/paiement";

// Section 6 — Les dates phares de Ouidah. La photo du rendez-vous en plein cadre, le compte à rebours en pastilles,
// le trajet du visiteur, un pass façon Apple Wallet et une glissière de l'année où le visiteur pose son séjour.
// Événement organisé par OHT : on réserve sa place ; organisé par d'autres : on réserve le séjour autour de la date.
// Les dates suivent l'heure de Ouidah et sont calculées au chargement (jamais figées au moment de la construction).
type Occ = { e: Evenement; a: number; b: number }; // premier et dernier jour de la prochaine occurrence
const EASE = [0.22, 1, 0.36, 1] as const;
function useDates() {
  const { date, nombre } = useFormatsSite();
  return useMemo(() => {
const fmt = (o: Intl.DateTimeFormatOptions) => {
  const f = date({ ...o, timeZone: "UTC" });
  return (n: number) => f.format(dateDuJour(n)).replace(".", "");
};
const fmtJour = fmt({ weekday: "short", day: "numeric", month: "short" });
const fmtLong = fmt({ day: "numeric", month: "long" });
const fmtMois = fmt({ month: "short" });
const fmtCourt = fmt({ day: "numeric", month: "short" });
const fmtFcfa = (n: number) => `${nombre().format(n)} FCFA`;
const dateEvenement = (o: Occ) => {
  const an = dateDuJour(o.a).getUTCFullYear();
  if (o.a === o.b) return `${fmtLong(o.a)} ${an}`;
  const memeMois = dateDuJour(o.a).getUTCMonth() === dateDuJour(o.b).getUTCMonth();
  return memeMois ? `${dateDuJour(o.a).getUTCDate()}–${fmtLong(o.b)} ${an}` : `${fmtLong(o.a)} – ${fmtLong(o.b)} ${an}`;
};

const dateCourte = (o: Occ) => (o.a === o.b ? fmtCourt(o.a) : `${dateDuJour(o.a).getUTCDate()}–${fmtCourt(o.b)}`);
  return { fmtJour, fmtLong, fmtMois, fmtFcfa, dateEvenement, dateCourte };
  }, [date, nombre]);
}
// jours pleins jusqu'à minuit (heure de Ouidah) du jour visé : un seul calcul pour le titre, le compte à rebours et le pass
const joursPleins = (cible: number, now: number) => Math.floor(Math.max(0, cible - now) / 864e5);


// Retour de paiement (?reservation=…&cle=…, plus l'identifiant ajouté par la passerelle) : lu dans l'adresse, effacé à
// la fermeture du talon (l'événement prévient la lecture).
const RETOUR = "oht-retour";
const suivreRetour = (cb: () => void) => {
  window.addEventListener(RETOUR, cb);
  return () => window.removeEventListener(RETOUR, cb);
};

export function KeyDates() {
  const { fmtJour, fmtLong, fmtMois, dateEvenement, dateCourte } = useDates();
  const T = useContenu("fr.datesSection", DATES_SECTION);
  const evenements = useContenu("fr.evenements", EVENEMENTS);
  const zone = useRef<HTMLElement>(null);
  const reduit = useMouvementReduit();
  const [proche, setProche] = useState(false);
  const [maintenant, setMaintenant] = useState<number | null>(null);
  const aujourdhui = maintenant === null ? null : jourOuidah(maintenant);
  const sejourGarde = useSejour();
  const [brouillon, setBrouillon] = useState<Sejour | null>(null); // séjour pendant un glissement
  const [formule, setFormule] = useState(0);
  const { visiteur } = useVisiteur(proche);
  const sejour = brouillon ?? sejourGarde;

  useEffect(() => {
    const el = zone.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setProche(true), { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // heure relue chaque minute (compte à rebours en jours et heures : rien ne défile à la seconde)
  useEffect(() => {
    const maj = () => setMaintenant(Date.now());
    maj();
    const id = setInterval(maj, 60_000);
    return () => clearInterval(id);
  }, []);

  const occ: Occ[] = useMemo(() => (aujourdhui === null ? [] : evenements.map((e) => ({ e, ...(([a, b]) => ({ a, b }))(prochaine(e.quand, aujourdhui)) })).sort((x, y) => x.a - y.a)), [aujourdhui, evenements]);
  const dans = sejour ? occ.filter((o) => o.a < sejour.depart && o.b >= sejour.arrivee) : [];
  const apres = sejour && !dans.length ? (occ.find((o) => o.a >= sejour.depart && o.a - sejour.depart <= 7) ?? null) : null;
  const focus: Occ | null = dans[0] ?? apres ?? occ[0] ?? null;
  const nuits = sejour ? sejour.depart - sejour.arrivee : 0;
  const image = focus?.e.image ?? T.fallbackImage;
  const oht = focus?.e.organisateur.type === "oht";
  const cible = sejour ? minuitOuidah(sejour.arrivee) : focus ? minuitOuidah(focus.a) : null;
  // même compte que le compte à rebours (jours pleins restants), pour que le titre et les pastilles disent le même nombre
  const joursAvant = maintenant !== null && sejour && cible !== null ? joursPleins(cible, maintenant) : null;
  const titre = joursAvant !== null && joursAvant > 0 ? T.titleStay(joursAvant) : T.title;
  const sous = !focus ? null : !sejour ? T.intro(focus.e.short, dateEvenement(focus)) : dans.length ? `${T.during(dans[0].e.short)} ${dans[0].e.text}` : apres ? T.after(apres.e.short, apres.e.organisateur.type === "oht") : T.none;

  // glissière : douze mois à partir du mois en cours
  const debut = aujourdhui === null ? 0 : jourDe(dateDuJour(aujourdhui).getUTCFullYear(), dateDuJour(aujourdhui).getUTCMonth(), 1);
  const fin = aujourdhui === null ? 1 : jourDe(dateDuJour(aujourdhui).getUTCFullYear(), dateDuJour(aujourdhui).getUTCMonth() + 12, 1);
  const pos = (n: number) => ((n - debut) / (fin - debut)) * 100;
  const mois = aujourdhui === null ? [] : Array.from({ length: 12 }, (_, i) => jourDe(dateDuJour(debut).getUTCFullYear(), dateDuJour(debut).getUTCMonth() + i, 1));
  const borner = (s: Sejour): Sejour => {
    const n = Math.min(30, Math.max(1, s.depart - s.arrivee));
    const a = Math.min(Math.max(s.arrivee, aujourdhui ?? debut), fin - n);
    return { arrivee: a, depart: a + n };
  };
  const poser = (s: Sejour | null) => ecrireSejour(s ? borner(s) : null);
  const autour = (o: Occ) => poser({ arrivee: o.a - 2, depart: Math.max(o.b + 3, o.a + 5) });

  // glisser la capsule (déplacer) ou ses poignées (arrivée, départ)
  const piste = useRef<HTMLDivElement>(null);
  const prise = useRef<{ mode: "deplacer" | "arrivee" | "depart"; x: number; s: Sejour } | null>(null);
  const jourParPixel = () => (fin - debut) / Math.max(1, piste.current?.getBoundingClientRect().width ?? 1);
  // une seule prise sur la capsule ; la poignée touchée (data-prise) dit s'il faut déplacer ou changer une date
  const saisir = (ev: React.PointerEvent<HTMLElement>) => {
    if (!sejour) return;
    ev.stopPropagation();
    const mode = ((ev.target as HTMLElement).closest("[data-prise]") as HTMLElement | null)?.dataset.prise;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    prise.current = { mode: mode === "arrivee" || mode === "depart" ? mode : "deplacer", x: ev.clientX, s: sejour };
  };
  const glisser = (ev: React.PointerEvent) => {
    const p = prise.current;
    if (!p) return;
    const d = Math.round((ev.clientX - p.x) * jourParPixel());
    const s = p.mode === "deplacer" ? { arrivee: p.s.arrivee + d, depart: p.s.depart + d } : p.mode === "arrivee" ? { arrivee: Math.min(p.s.arrivee + d, p.s.depart - 1), depart: p.s.depart } : { arrivee: p.s.arrivee, depart: Math.max(p.s.depart + d, p.s.arrivee + 1) };
    setBrouillon(borner(s));
  };
  const lacher = () => {
    if (!prise.current) return;
    prise.current = null;
    if (brouillon) ecrireSejour(brouillon);
    setBrouillon(null);
  };
  const toucherPiste = (ev: React.MouseEvent) => {
    const r = piste.current?.getBoundingClientRect();
    if (!r || aujourdhui === null) return;
    const jour = Math.round(debut + ((ev.clientX - r.left) / r.width) * (fin - debut));
    poser({ arrivee: jour, depart: jour + (sejour ? nuits : 7) });
  };
  const clavier = (ev: React.KeyboardEvent) => {
    if (!sejour || (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight")) return;
    ev.preventDefault();
    const d = ev.key === "ArrowLeft" ? -1 : 1;
    poser(ev.shiftKey ? { arrivee: sejour.arrivee, depart: Math.max(sejour.arrivee + 1, sejour.depart + d) } : { arrivee: sejour.arrivee + d, depart: sejour.depart + d });
  };
  const duree = (n: number) => poser(sejour ? { arrivee: sejour.arrivee, depart: sejour.arrivee + n } : focus ? { arrivee: focus.a - 2, depart: focus.a - 2 + n } : null);

  // étapes du séjour (Live Activity)
  const etapes = sejour
    ? (() => {
        const bout = apres ? apres.b + 1 : sejour.depart, total = Math.max(1, bout - sejour.arrivee), p = (n: number) => ((n - sejour.arrivee) / total) * 100;
        const s: { p: number; t: string; c: string }[] = [{ p: 0, t: `${T.live.arrival} · ${fmtJour(sejour.arrivee)}`, c: "soleil" }];
        for (const o of [...dans, ...(apres ? [apres] : [])]) s.push({ p: p(o.a), t: o.e.short, c: "evenement" });
        if (apres) s.push({ p: p(sejour.depart), t: `${T.live.departure} · ${fmtJour(sejour.depart)}`, c: "" });
        s.push({ p: 100, t: apres ? `${T.live.end} · ${fmtJour(apres.b)}` : `${T.live.departure} · ${fmtJour(sejour.depart)}`, c: "" });
        return s.map((x, i) => ({ ...x, cache: i > 0 && i < s.length - 1 && x.c === "" && s[i + 1].p - x.p < 24 }));
      })()
    : null;

  // réservation : talon de paiement quand la formule a un prix publié et qu'une passerelle est active (admin), sinon le
  // billet rejoint le voyage et la demande passe par /devis
  const [passerelles, setPasserelles] = useState<NomPasserelle[] | null>(null);
  useEffect(() => {
    if (!proche || passerelles) return;
    let vivant = true;
    fetch("/api/paiement/passerelles")
      .then((r) => r.json() as Promise<{ passerelles?: NomPasserelle[] }>)
      .then((d) => vivant && setPasserelles(d.passerelles ?? []))
      .catch(() => vivant && setPasserelles([]));
    return () => {
      vivant = false;
    };
  }, [proche, passerelles]);
  const [ouvert, setOuvert] = useState(false);
  const recherche = useSyncExternalStore(suivreRetour, () => location.search, () => "");
  const retour: Retour | null = useMemo(() => {
    const q = new URLSearchParams(recherche);
    const r = q.get("reservation"), c = q.get("cle");
    return r && c ? { reservation: r, cle: c, transaction: q.get("transaction_id") ?? q.get("session") ?? q.get("id") } : null;
  }, [recherche]);
  const talonOuvert = ouvert || retour !== null;
  useEffect(() => {
    if (retour) zone.current?.scrollIntoView({ block: "start" });
  }, [retour]);
  const prixFormule = focus ? (focus.e.offre.type === "billet" ? (focus.e.offre.categories[formule]?.prix ?? null) : focus.e.offre.prix) : null;
  const payable = prixFormule !== null && (passerelles?.length ?? 0) > 0;
  const fermer = () => {
    setOuvert(false);
    if (retour) {
      history.replaceState(null, "", `${location.pathname}#agenda`);
      window.dispatchEvent(new Event(RETOUR));
    }
    requestAnimationFrame(() => document.getElementById("agenda-reserver")?.focus());
  };

  return (
    <section ref={zone} id="agenda" aria-labelledby="dates-titre" className="relative z-[2] overflow-clip bg-[#0b0f1d] text-white lg:h-[100svh] lg:min-h-[820px]">
      <AnimatePresence initial={false}>
        <motion.div key={image.src} className="absolute inset-0" initial={{ opacity: 0, scale: 1.06 }} animate={{ opacity: 1, scale: 1.02 }} exit={{ opacity: 0 }} transition={{ duration: reduit ? 0 : 1.1, ease: EASE }}>
          <Image src={image.src} alt="" fill sizes="100vw" className="object-cover" />
        </motion.div>
      </AnimatePresence>
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(120%_90%_at_0%_40%,rgb(8_11_22/0.86)_0%,rgb(8_11_22/0.55)_38%,rgb(8_11_22/0.08)_68%),linear-gradient(to_top,rgb(8_11_22/0.8),rgb(8_11_22/0)_38%)] max-lg:bg-[linear-gradient(to_bottom,rgb(8_11_22/0.72),rgb(8_11_22/0.35)_30%,rgb(8_11_22/0.92)_60%)]" />

      <div className="relative flex h-full flex-col gap-6 px-4 pt-24 pb-6 sm:px-6 lg:px-24 lg:pt-28 lg:pb-12">
        <div className="grid gap-6 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-10">
          <div className="min-w-0">
            <h2 id="dates-titre" className="max-w-[40rem] font-display text-[38px] leading-[0.98] font-semibold tracking-[-0.035em] sm:text-[52px] lg:text-[64px]">
              {titre.lead} <span className="text-sun">{titre.accent}</span>
            </h2>
            {cible !== null ? <Compte cible={cible} now={maintenant} /> : <div className="mt-6 h-12 lg:h-14" />}
            {sous ? <p className="mt-4 hidden max-w-[30rem] text-[17px] leading-[1.55] text-white/80 lg:block">{sous}</p> : null}
            {focus && (sejour || visiteur) ? (
              <div className="verre-sombre mt-5 hidden max-w-[33rem] rounded-[1.75rem] px-5 pt-3.5 pb-4 sm:block">
                <div className="grid grid-cols-[2.5rem_1fr] items-center gap-3.5">
                  <span className="grid size-10 place-items-center rounded-xl bg-[linear-gradient(160deg,#1d2748,#0f162d)] text-sun shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]">
                    <Objet3D nom="navette" taille={32} />
                  </span>
                  <p className="text-[13px] leading-snug font-semibold">
                    {sejour && visiteur ? T.live.route(visiteur.ville) : T.live.next(focus.e.short)}
                    <span className="block font-semibold text-white/65">{sejour ? T.live.stay(fmtJour(sejour.arrivee), nuits) : `${dateEvenement(focus)} · ${focus.e.place}`}</span>
                  </p>
                </div>
                {etapes ? (
                  <div className="relative mt-7 h-9" aria-hidden="true">
                    <span className="absolute inset-x-[7px] top-[7px] h-1 rounded-full bg-white/20" />
                    {etapes.map((x, i) => (
                      <div key={i} className={`absolute top-0 flex flex-col gap-1 ${i === 0 ? "-translate-x-[7px] items-start" : i === etapes.length - 1 ? "-translate-x-[calc(100%-7px)] items-end" : "-translate-x-1/2 items-center"}`} style={{ left: `${x.p}%` }}>
                        <i className={`block rounded-full shadow-[0_0_0_3px_rgb(20_22_32/0.6)] ${x.c === "evenement" ? "size-[18px] -mt-0.5 bg-sun shadow-[0_0_0_3px_rgb(20_22_32/0.6),0_0_0_7px_rgb(253_191_40/0.3)]" : x.c === "soleil" ? "size-3.5 bg-sun" : "size-3.5 bg-white"}`} />
                        <span className={`text-[11px] font-semibold whitespace-nowrap ${x.c === "evenement" ? "absolute bottom-[calc(100%+4px)] text-sun" : "text-white/85"} ${x.cache ? "invisible" : ""}`}>{x.t}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {focus && talonOuvert ? (
            <Talon e={focus.e} a={focus.a} b={focus.b} sejour={sejour} formule={formule} setFormule={setFormule} passerelles={passerelles ?? []} retour={retour} onFermer={fermer} />
          ) : focus ? (
            <Pass focus={focus} sejour={sejour} nuits={nuits} dans={dans.length > 0} apres={apres} maintenant={maintenant!} formule={formule} setFormule={setFormule} payable={payable} onReserver={() => { poserBillet(focus.e.slug, { formule, quantite: 1 }, evenements); setOuvert(true); }} oht={oht} onProlonger={() => apres && sejour && poser({ arrivee: sejour.arrivee, depart: apres.b + 1 })} />
          ) : null}
        </div>

        {/* glissière de l'année */}
        <div className={`verre-clair rounded-[1.75rem] px-4 pt-3.5 pb-4 transition-opacity duration-500 lg:px-5 ${talonOuvert ? "lg:pointer-events-none lg:opacity-0" : ""}`} inert={talonOuvert || undefined}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-sm font-semibold">
              <span>{sejour ? T.scrub.range(fmtLong(sejour.arrivee), fmtLong(sejour.depart)) : T.scrub.ask}</span>
              <span className="font-semibold text-white/65">{sejour ? T.scrub.nights(nuits) : T.scrub.hint}</span>
              {sejourGarde ? (
                <button type="button" onClick={() => poser(null)} className="min-h-7 text-xs font-bold text-white/70 underline underline-offset-4 hover:text-white">
                  {T.scrub.reset}
                </button>
              ) : null}
            </p>
            <div className="flex items-center gap-4">
              <span className="hidden items-center gap-4 text-[11px] font-bold text-white/70 xl:flex">
                <span className="flex items-center gap-1.5">
                  <i className="size-2.5 rounded-full bg-sun" />
                  {T.scrub.legendOht}
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="size-2.5 rounded-full bg-white" />
                  {T.scrub.legendOther}
                </span>
              </span>
              <div role="group" aria-label={T.scrub.lengthsLabel} className="hidden rounded-full bg-black/30 p-1 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)] sm:inline-flex">
                {T.scrub.lengths.map((l) => (
                  <button key={l.nuits} type="button" aria-pressed={nuits === l.nuits} onClick={() => duree(l.nuits)} className={`min-h-8 rounded-full px-3.5 text-xs font-semibold transition-colors ${nuits === l.nuits ? "bg-white/95 text-abyss shadow-[0_4px_12px_-4px_rgb(0_0_0/0.5)]" : "text-white/75 hover:text-white"}`}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="-mx-1 mt-1 overflow-x-auto px-1 pt-10 pb-1 [scrollbar-width:none]">
            <div ref={piste} onClick={toucherPiste} className="relative h-14 min-w-[44rem] cursor-pointer lg:min-w-0">
              <span className="absolute inset-x-0 top-5 h-1.5 rounded-full bg-white/16" />
              <div className="absolute inset-x-0 top-9 grid grid-cols-12">
                {mois.map((m, i) => (
                  <span key={m} className="border-l border-white/18 pl-0.5 text-[11px] leading-tight font-semibold text-white/65">
                    {fmtMois(m)}
                    {i === 0 || dateDuJour(m).getUTCMonth() === 0 ? <small className="block font-semibold text-white/45">{dateDuJour(m).getUTCFullYear()}</small> : null}
                  </span>
                ))}
              </div>
              {aujourdhui !== null ? (
                <span className="absolute -top-[22px] h-[60px] w-0.5 -translate-x-px rounded bg-white" style={{ left: `${pos(aujourdhui)}%` }}>
                  <span className="absolute -top-[15px] left-1.5 flex items-center gap-2 whitespace-nowrap">
                    <span className="text-xs/4 font-semibold text-white/75">{T.scrub.today}</span>
                    {!sejour && focus ? (
                      <button type="button" onClick={(ev) => { ev.stopPropagation(); poser({ arrivee: Math.max(aujourdhui + 14, debut), depart: Math.max(aujourdhui + 14, debut) + 7 }); }} className="flex min-h-6 items-center gap-1 rounded-full bg-white px-2.5 text-[11px]/4 font-semibold text-abyss focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sun">
                        <Icon name="clock" className="size-3.5" />
                        {T.scrub.place}
                      </button>
                    ) : null}
                  </span>
                </span>
              ) : null}
              {occ.map((o) => {
                const allume = dans.includes(o) || o === apres || (!sejour && o === focus);
                return (
                  <button
                    key={o.e.slug}
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      autour(o);
                    }}
                    aria-label={T.scrub.eventDot(o.e.short, dateEvenement(o))}
                    className="absolute top-[9px] grid size-7 -translate-x-1/2 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-sun"
                    style={{ left: `${pos(o.a)}%` }}
                  >
                    <i className={`rounded-full ${allume ? "size-[18px] bg-sun shadow-[0_0_0_3px_rgb(12_14_24/0.55),0_0_0_7px_rgb(253_191_40/0.35)]" : `size-4 shadow-[0_0_0_3px_rgb(12_14_24/0.55)] ${o.e.organisateur.type === "oht" ? "bg-sun" : "bg-white/90"}`}`} />
                    {!dans.includes(o) && o !== apres ? <em className="absolute bottom-[calc(100%-1px)] left-1/2 -translate-x-1/2 text-[11px]/[14px] font-semibold whitespace-nowrap text-white not-italic">{dateCourte(o)}</em> : null}
                  </button>
                );
              })}
              {sejour ? (
                <span
                  role="slider"
                  tabIndex={0}
                  aria-label={T.scrub.lengthsLabel}
                  aria-valuemin={debut}
                  aria-valuemax={fin}
                  aria-valuenow={sejour.arrivee}
                  aria-valuetext={T.scrub.slider(fmtLong(sejour.arrivee), nuits)}
                  onKeyDown={clavier}
                  data-prise="deplacer"
                  onPointerDown={saisir}
                  onPointerMove={glisser}
                  onPointerUp={lacher}
                  onPointerCancel={lacher}
                  onClick={(ev) => ev.stopPropagation()}
                  className="absolute top-1.5 h-8 min-w-9 cursor-grab touch-none rounded-full bg-sun/40 shadow-[inset_0_1px_0_rgb(255_255_255/0.65),inset_0_0_0_1.5px_rgb(253_191_40/0.95),0_8px_16px_-8px_rgb(0_0_0/0.6)] backdrop-blur-sm backdrop-saturate-150 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white active:cursor-grabbing"
                  style={{ left: `${pos(sejour.arrivee)}%`, width: `${pos(sejour.depart) - pos(sejour.arrivee)}%` }}
                >
                  <span data-prise="arrivee" className="absolute inset-y-0 left-0 w-3 cursor-ew-resize touch-none">
                    <i className="absolute top-1/2 left-[7px] h-3.5 w-1 -translate-y-1/2 rounded-full bg-white" />
                  </span>
                  <span data-prise="depart" className="absolute inset-y-0 right-0 w-3 cursor-ew-resize touch-none">
                    <i className="absolute top-1/2 right-[7px] h-3.5 w-1 -translate-y-1/2 rounded-full bg-white" />
                  </span>
                  <span className="pointer-events-none absolute bottom-[calc(100%+4px)] left-1/2 -translate-x-1/2 rounded-full bg-sun px-2.5 py-0.5 text-[11px]/4 font-semibold whitespace-nowrap text-abyss">
                    {T.scrub.nights(nuits)}
                    {dans[0] ? ` · ${dans[0].e.short}` : ""}
                  </span>
                </span>
              ) : focus && aujourdhui !== null ? (
                <span aria-hidden="true" className="pointer-events-none absolute top-1.5 h-8 w-[6%] rounded-full bg-white/14 shadow-[inset_0_1px_0_rgb(255_255_255/0.5),inset_0_0_0_1.5px_rgb(255_255_255/0.7)]" style={{ left: `${pos(Math.max(aujourdhui + 14, debut))}%` }} />
              ) : null}
              {apres && sejour ? <span aria-hidden="true" className="absolute top-1.5 h-8 rounded-r-full border-[1.5px] border-l-0 border-dashed border-sun" style={{ left: `calc(${pos(sejour.depart)}% + 0.5rem)`, width: `calc(${pos(apres.b + 1) - pos(sejour.depart)}% - 0.25rem)` }} /> : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// compte à rebours en pastilles qui se chevauchent (jours, heures), sur l'heure relue chaque minute par la section
function Compte({ cible, now }: { cible: number; now: number | null }) {
  const T = useContenu("fr.datesSection", DATES_SECTION);
  const reste = Math.max(0, cible - (now ?? cible));
  const j = joursPleins(cible, now ?? cible), h = Math.floor((reste % 864e5) / 36e5);
  const deux = (n: number) => String(n).padStart(2, "0");
  const seg = "absolute inset-y-0 right-0 flex items-center gap-1.5 rounded-full pl-4 font-semibold";
  const val = "font-display text-[22px] font-semibold tracking-[-0.02em] tabular-nums lg:text-[28px]";
  const uni = "text-xs opacity-75";
  return (
    <div role="timer" aria-label={now === null ? undefined : T.countdownLabel(j, h)} className="relative mt-6 h-12 w-full max-w-[15rem] lg:h-14">
      <span className={`${seg} left-0 z-[1] bg-sun text-abyss`}>
        <b className={val}>{now === null ? "—" : j}</b>
        <span className={uni}>{T.units.days}</span>
      </span>
      <span className={`${seg} left-[60%] z-[2] bg-abyss/60`}>
        <b className={val}>{now === null ? "—" : deux(h)}</b>
        <span className={uni}>{T.units.hours}</span>
      </span>
    </div>
  );
}

function Pass({ focus, sejour, nuits, dans, apres, maintenant, formule, setFormule, payable, onReserver, oht, onProlonger }: { focus: Occ; sejour: Sejour | null; nuits: number; dans: boolean; apres: Occ | null; maintenant: number; formule: number; setFormule: (i: number) => void; payable: boolean; onReserver: () => void; oht: boolean; onProlonger: () => void }) {
  const { fmtJour, dateCourte, fmtFcfa } = useDates();
  const T = useContenu("fr.datesSection", DATES_SECTION);
  const evenements = useContenu("fr.evenements", EVENEMENTS);
  const { e } = focus, o = e.offre;
  const img = e.image ?? T.fallbackImage;
  const jourSejour = (n: number) => (sejour ? n - sejour.arrivee + 1 : 0);
  const champs: [string, string][] = sejour
    ? [[T.pass.arrival, fmtJour(sejour.arrivee)], [T.pass.departure, fmtJour(sejour.depart)], [T.pass.nights, String(nuits)]]
    : [[T.pass.date, dateCourte(focus)], [T.pass.place, e.place.split(",")[0]], [T.pass.in, `${joursPleins(minuitOuidah(focus.a), maintenant)} j`]];
  return (
    <motion.aside key={e.slug} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} aria-label={e.title} className="overflow-hidden rounded-[1.75rem] bg-[#fbfaf7] text-abyss shadow-[0_40px_64px_-32px_rgb(0_0_0/0.75),inset_0_0_0_1px_rgb(255_255_255/0.8)]">
      <div className="relative h-24 lg:h-[7.75rem]">
        <Image src={img.src} alt={img.alt} fill sizes="22rem" className="object-cover" />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#080b16]/80 to-transparent to-70%" />
        {oht ? (
          <span className="absolute top-3.5 left-3.5 flex items-center gap-1.5 rounded-full bg-sun py-1 pr-2.5 pl-1.5 text-[11px] font-semibold text-abyss">
            <Icon name="star" className="size-[15px]" />
            {T.pass.oht}
          </span>
        ) : (
          <span className="verre-sombre absolute top-3.5 left-3.5 flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1.5 text-[11px] font-semibold text-white">
            <Icon name="info" className="size-[15px] text-sun" />
            {e.organisateur.type === "externe" ? e.organisateur.nom : ""}
          </span>
        )}
        <span className="verre-clair absolute top-3.5 right-3.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white">{e.theme}</span>
        <p className="absolute right-4 bottom-3 left-4 font-display text-2xl leading-[1.05] font-semibold tracking-[-0.02em] text-white">{e.short}</p>
      </div>
      <div className="px-4 pt-3.5 pb-4">
        <dl className="grid grid-cols-[1fr_1fr_auto] gap-3">
          {champs.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs font-semibold text-abyss/55">{k}</dt>
              <dd className="mt-0.5 text-[17px] font-semibold tracking-[-0.01em]">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 flex items-center gap-2.5 border-t border-abyss/10 pt-3 text-[13px] font-semibold">
          <Objet3D nom="destination" taille={24} className="-my-1" />
          {dans ? T.pass.during : apres ? T.pass.after : e.theme}
          <small className="ml-auto text-xs font-bold text-abyss/55">{dans && sejour ? T.pass.dayOf(jourSejour(focus.a), jourSejour(focus.b)) : dateCourte(focus)}</small>
        </p>

        {o.type === "billet" ? (
          <fieldset className="mt-3 grid gap-1.5">
            <legend className="sr-only">{T.pass.formulas}</legend>
            {o.categories.map((c, i) => (
              <label key={c.nom} className={`grid cursor-pointer grid-cols-[18px_1fr_auto] items-center gap-2.5 rounded-[14px] border-[1.5px] px-3 py-2 text-[13px] font-semibold transition-colors ${formule === i ? "border-abyss bg-abyss/[0.03]" : "border-abyss/12 hover:border-abyss/40"}`}>
                <input type="radio" name="formule-billet" checked={formule === i} onChange={() => setFormule(i)} className="size-[18px] accent-abyss" />
                <span>
                  {c.nom}
                  <small className="mt-0.5 block text-[11px]/[15px] font-semibold text-abyss/55">{c.detail}</small>
                </span>
                <span>{c.prix !== null ? fmtFcfa(c.prix) : T.pass.onRequest}</span>
              </label>
            ))}
          </fieldset>
        ) : (
          <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-2.5 rounded-[14px] border-[1.5px] border-abyss px-3 py-2 text-[13px] font-semibold">
            <span>
              {sejour ? T.pass.stay(nuits) : o.nom}
              <small className="mt-0.5 block text-[11px]/[15px] font-semibold text-abyss/55">{o.inclus}</small>
            </span>
            <span className="text-right">{o.prix !== null ? T.pass.from(fmtFcfa(o.prix)) : T.pass.onRequest}</span>
          </div>
        )}
        {o.places !== null ? (
          <p className="mt-2 text-xs font-bold text-abyss/60">
            <b className="text-abyss">{o.type === "billet" && o.jauge !== null ? T.pass.placesLeft(o.places, o.jauge) : T.pass.places(o.places)}</b>
          </p>
        ) : null}
        {apres && sejour ? (
          <p className="mt-2.5 flex items-center justify-between gap-2.5 rounded-[14px] bg-sun/20 px-3 py-2 text-[13px] leading-snug font-semibold">
            <span className="text-balance">{T.pass.extend(apres.b + 1 - sejour.depart)}</span>
            <button type="button" onClick={onProlonger} className="min-h-8 shrink-0 rounded-full bg-abyss px-3 text-xs font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sun">
              {T.pass.extendCta}
            </button>
          </p>
        ) : null}
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          {payable ? (
            <button id="agenda-reserver" type="button" onClick={onReserver} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-abyss ${oht ? "bg-sun text-abyss" : "bg-abyss text-white"}`}>
              {oht ? <Objet3D nom="billet" taille={26} className="-my-1" /> : null}
              {oht ? T.pass.bookPlace : T.pass.bookStay}
              {oht ? null : <Icon name="arrow-right" className="size-[18px]" />}
            </button>
          ) : (
            <Link id="agenda-reserver" href={DEVIS.voyage} onClick={() => poserBillet(e.slug, { formule, quantite: 1 }, evenements)} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-abyss ${oht ? "bg-sun text-abyss" : "bg-abyss text-white"}`}>
              {oht ? <Objet3D nom="billet" taille={26} className="-my-1" /> : null}
              {oht ? T.pass.bookPlace : T.pass.bookStay}
              {oht ? null : <Icon name="arrow-right" className="size-[18px]" />}
            </Link>
          )}
          <button type="button" onClick={() => telechargerIcs(focus)} aria-label={T.pass.calendar(e.short)} title={T.pass.calendar(e.short)} className="grid size-11 place-items-center rounded-full bg-abyss/[0.06] hover:bg-abyss/10 focus-visible:outline-2 focus-visible:outline-sun">
            <Objet3D nom="calendrier" taille={28} />
          </button>
        </div>
        <p className="mt-2.5 text-[11px] leading-snug font-bold text-abyss/55">{oht ? T.pass.byOht : e.organisateur.type === "externe" ? T.pass.byOther(e.organisateur.nom) : null}</p>
      </div>
    </motion.aside>
  );
}
