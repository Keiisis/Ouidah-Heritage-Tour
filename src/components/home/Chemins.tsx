"use client";

import { useFormatsSite } from "@/lib/formats-site";

import Image from "next/image";
import Link from "@/components/ui/LienPublic";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { adresseCircuit, adresseLieu, cheminsIntro as CHEMINS_INTRO, cleType, destinations as DESTINATIONS, FICHES_LIEU, tours as TOURS, toursIntro as TOURS_INTRO } from "@/content/fr";
import { useContenu } from "@/components/ui/ContenuSite";
import type { Circuit, LieuReleve } from "@/content/types";
import { Icon } from "@/components/ui/Icon";
import { EquivalentDevise } from "@/components/ui/EquivalentDevise";
import { Objet3D } from "@/components/ui/Objet3D";
import { useEcranLarge, useMouvementReduit } from "@/lib/mouvement";
import { distanceKm, leverCoucher } from "@/lib/soleil";
import { useVisiteur } from "@/lib/visiteur";
import { CLE_CHEMIN, EVENEMENT_CHEMIN } from "@/lib/chemin";
import { signalerVoyage } from "@/lib/voyage";
import { CheminsCarte, idReleve, type Vue } from "./CheminsCarte";
import { CheminsGlobe } from "./CheminsGlobe";

// Section 5 — Votre chemin vers Ouidah. La Terre en ce moment (jour et nuit réels), tournée vers Ouidah, avec l'arc depuis
// la ville du visiteur. Deux façons de partir : un circuit déjà composé par OHT, ou un chemin composé lieu par lieu
// (« Garder ce lieu » / « Passer ») ; la carte trace le chemin, la sélection reste sur l'appareil et préremplit la demande.
// Lieux et circuits viennent du contenu (éditable) : aucun nombre n'est écrit en dur.
type Pt = [number, number];
type Mode = "accueil" | "prets" | "composer";
const MEMOIRE = CLE_CHEMIN;
const EASE = [0.22, 1, 0.36, 1] as const;
type Fiche = { id: string; nom: string; image: string | null; famille: string };

const carteV = {
  entre: { opacity: 0, y: 28, scale: 0.97 },
  la: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: EASE } },
  // la carte qui part ne doit plus recevoir de clic (sinon un double clic ferait sauter un lieu)
  sort: (sens: number) => ({ opacity: 0, x: sens * 200, rotate: sens * 7, pointerEvents: "none" as const, transition: { duration: 0.5, ease: EASE } }),
};

const sansAbonnement = () => () => {};

export function Chemins({ totalLieux }: { totalLieux: number }) {
  const { nombre, date } = useFormatsSite();
  const fmtKm = nombre();
  const T = useContenu("fr.cheminsIntro", CHEMINS_INTRO);
  const destinations = useContenu("fr.destinations", DESTINATIONS);
  const fiches = useContenu("fr.FICHES_LIEU", FICHES_LIEU);
  const tours = useContenu("fr.tours", TOURS);
  const toursIntro = useContenu("fr.toursIntro", TOURS_INTRO);
  const { COULEUR, FAMILLE, LIBELLE, ORDRE_FILTRE } = useMemo(() => ({
    COULEUR: Object.fromEntries(T.filters.flatMap((f) => f.ids.map((id) => [id, f.color]))),
    FAMILLE: Object.fromEntries(T.filters.flatMap((f) => f.ids.map((id) => [id, f.group]))),
    LIBELLE: Object.fromEntries(T.filters.flatMap((f) => f.ids.map((id) => [id, f.label]))),
    ORDRE_FILTRE: Object.fromEntries(T.filters.flatMap((f, i) => f.ids.map((id) => [id, i]))),
  }), [T.filters]);
  const zone = useRef<HTMLElement>(null);
  const large = useEcranLarge();
  const reduit = useMouvementReduit();
  const [mode, setMode] = useState<Mode>("accueil");
  // la carte ne se crée qu'à la première ouverture d'un mode qui la montre, puis elle reste
  const [carteMontee, setCarteMontee] = useState(false);
  if (mode !== "accueil" && !carteMontee) setCarteMontee(true);
  const [index, setIndex] = useState(0);
  const [gardes, setGardes] = useState<string[]>([]);
  const [retour, setRetour] = useState(false);
  const [sens, setSens] = useState(1);
  const [actif, setActif] = useState(0);
  const [saisie, setSaisie] = useState(false);
  const [erreurVille, setErreurVille] = useState(false);
  const [heure, setHeure] = useState<{ h: string; info: string; nuit: boolean } | null>(null);
  const [proche, setProche] = useState(false);
  const [releveDefaut, setReleve] = useState<{ lieux: LieuReleve[] } | null>(null);
  const releve = useContenu("lieux-ouidah", releveDefaut)?.lieux ?? null;
  const [filtres, setFiltres] = useState(() => new Set(T.filters.filter((f) => f.on).map((f) => f.key)));
  const [parcours, setParcours] = useState<"deck" | "liste">("deck");
  const [choisi, setChoisi] = useState<string | null>(null);
  const [lu, setLu] = useState(false); // sélection gardée déjà relue : avant, rien n'est écrit

  const n = destinations.length;
  const lieu = destinations[index] ?? null; // null : tous les lieux ont été vus
  const lienLieu = lieu && (!lieu.href || lieu.href.startsWith("/ouidah/lieux/")) ? adresseLieu(lieu.slug, fiches) : lieu?.href;
  const circuit = tours[actif] ?? tours[0];
  const parSlug = useMemo(() => new Map(destinations.map((d) => [d.slug, d])), [destinations]);
  const lieuxGlobe = useMemo(() => destinations.map((d) => [d.coords[1], d.coords[0]] as Pt), [destinations]);

  // les bibliothèques lourdes (Terre, carte) ne se chargent qu'à l'approche de la section
  useEffect(() => {
    const el = zone.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setProche(true), { rootMargin: "900px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // recherche envoyée par le Hero (/?lieu=&type=&duree=#chemins) : ouvre les circuits prêts sur celui qui répond au plus
  // de critères (lieu visité ou circuit lui-même, type), une fois par adresse. La durée n'est pas encore saisie pour les
  // circuits : elle ne départage rien tant que l'admin ne l'a pas remplie.
  const recherche = useSyncExternalStore(sansAbonnement, () => location.search, () => "");
  const [rechercheLue, setRechercheLue] = useState("");
  if (recherche !== rechercheLue) {
    setRechercheLue(recherche);
    const q = new URLSearchParams(recherche);
    const lieu = q.get("lieu"), type = q.get("type");
    if (q.has("lieu") || q.has("type") || q.has("duree")) {
      const score = (t: Circuit) => Number(!!lieu && (t.slug === lieu || t.stops.includes(lieu))) + Number(!!type && cleType(t.tag) === type);
      setActif(tours.reduce((m, t, j) => (score(t) > score(tours[m]) ? j : m), 0));
      setMode("prets");
    }
  }

  // relevé complet (hôtels, restaurants, services…) : chargé à part, seulement à l'approche de la section
  useEffect(() => {
    if (!proche) return;
    let annule = false;
    import("@/content/lieux-ouidah.json").then((m) => !annule && setReleve({ lieux: m.default.lieux as LieuReleve[] }));
    return () => {
      annule = true;
    };
  }, [proche]);

  const categoriesActives = useMemo(() => new Set(T.filters.filter((f) => filtres.has(f.key)).flatMap((f) => f.ids)), [filtres, T.filters]);
  const parId = useMemo(() => new Map((releve ?? []).map((l) => [idReleve(l), l])), [releve]);
  const fiche = useCallback(
    (id: string): Fiche | null => {
      const d = parSlug.get(id);
      if (d) return { id, nom: d.name, image: d.image?.src ?? null, famille: "voir" };
      const l = parId.get(id);
      return l ? { id, nom: l.nom, image: null, famille: FAMILLE[l.categorie] ?? "voir" } : null;
    },
    [parSlug, parId, FAMILLE],
  );
  const basculer = useCallback((id: string) => setGardes((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id])), []);
  const lieuChoisi = choisi ? (parId.get(choisi) ?? null) : null;
  const fermerFiche = useCallback(() => setChoisi(null), []);
  // liste « Tous les lieux » : lieux à voir d'abord, puis le relevé, dans l'ordre des filtres
  const liste = useMemo(() => {
    const voir = categoriesActives.has("a-voir") ? destinations.map((d) => ({ id: d.slug, nom: d.name, detail: d.subtitle ?? d.theme, couleur: COULEUR["a-voir"], destination: true })) : [];
    const autres = (releve ?? [])
      .filter((l) => !l.destination && categoriesActives.has(l.categorie))
      .sort((a, b) => (ORDRE_FILTRE[a.categorie] ?? 99) - (ORDRE_FILTRE[b.categorie] ?? 99) || a.nom.localeCompare(b.nom, "fr"))
      .map((l) => ({ id: idReleve(l), nom: l.nom, detail: [LIBELLE[l.categorie], l.sous_type].filter(Boolean).join(" · "), couleur: COULEUR[l.categorie] ?? "#5b6478", destination: false }));
    return [...voir, ...autres];
  }, [releve, categoriesActives, destinations, COULEUR, ORDRE_FILTRE, LIBELLE]);

  // sélection gardée sur l'appareil (aucun compte)
  useEffect(() => {
    const lire = () => {
      try {
        const m = JSON.parse(localStorage.getItem(MEMOIRE) ?? "null") as { gardes?: unknown; index?: unknown } | null;
        if (m && Array.isArray(m.gardes)) {
          // lieux à voir connus, et lieux du relevé (vérifiés à l'affichage, le relevé se charge plus tard)
          const g = m.gardes.filter((s): s is string => typeof s === "string" && (parSlug.has(s) || s.startsWith("r:")));
          setGardes(g);
          setIndex(Math.min(Math.max(0, Number(m.index) || 0), n));
          setRetour(g.length > 0);
        }
      } catch {
        /* stockage indisponible : on repart de zéro */
      }
      setLu(true);
    };
    lire();
    // la section 7 a entouré une raison : relire ; « Voir mon chemin » ouvre la composition
    const changement = (e: Event) => {
      lire();
      if ((e as CustomEvent<{ ouvrir?: boolean }>).detail?.ouvrir) setMode("composer");
    };
    window.addEventListener(EVENEMENT_CHEMIN, changement);
    return () => window.removeEventListener(EVENEMENT_CHEMIN, changement);
  }, [parSlug, n]);
  // tant que la sélection gardée n'est pas relue, l'état initial vide n'est jamais écrit (il l'effacerait)
  useEffect(() => {
    if (!lu) return;
    try {
      localStorage.setItem(MEMOIRE, JSON.stringify({ gardes, index }));
    } catch {
      /* navigation privée : sélection non gardée */
    }
    signalerVoyage();
  }, [gardes, index, lu]);

  // ville du visiteur (partagée avec la section 6)
  const { visiteur, changer } = useVisiteur(proche);

  // heure de Ouidah, jour ou nuit (mise à jour chaque minute)
  useEffect(() => {
    if (!proche) return;
    const fmtHeure = date({ hour: "2-digit", minute: "2-digit", timeZone: T.timeZone });
    const heureFr = (d: Date) => fmtHeure.format(d).replace(":", " h ");
    const maj = () => {
      const now = new Date();
      const { lever, coucher } = leverCoucher(now, [T.origin[1], T.origin[0]]);
      const nuit = now < lever || now > coucher;
      setHeure({ h: heureFr(now), nuit, info: nuit ? T.time.night(heureFr(coucher)) : T.time.day(heureFr(lever)) });
    };
    maj();
    const id = setInterval(maj, 60_000);
    return () => clearInterval(id);
  }, [proche, T.timeZone, T.origin, T.time, date]);

  const suivant = (garder: boolean) => {
    if (!lieu) return;
    setSens(garder ? 1 : -1);
    if (garder) setGardes((g) => (g.includes(lieu.slug) ? g : [...g, lieu.slug]));
    setIndex((i) => i + 1);
  };
  const aller = useCallback((slug: string) => {
    const i = destinations.findIndex((d) => d.slug === slug);
    if (i < 0) return;
    setMode("composer");
    setSens(-1);
    setIndex(i);
  }, [destinations]);
  const personnaliser = (c: Circuit) => {
    setGardes(c.stops.filter((s) => parSlug.has(s)));
    setIndex(0);
    setMode("composer");
  };
  const changerVille = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const nom = String(new FormData(e.currentTarget).get("ville") ?? "").trim();
    if (!nom) return;
    const ok = await changer(nom);
    setErreurVille(!ok);
    if (ok) setSaisie(false);
  };

  const vue: Vue = useMemo(() => (mode === "prets" ? { mode: "prets", etapes: circuit.stops, trace: circuit.trace } : { mode: "composer", gardes, ici: lieu?.slug ?? null }), [mode, circuit, gardes, lieu]);
  const gardesConnus = gardes.filter((id) => fiche(id));
  const lienDevis = T.trip.href; // la demande lit le dossier de voyage : aucun paramètre
  // prix par personne de la fiche du circuit, affiché dès que l'interrupteur « Afficher le prix sur le site » est mis
  const prixPublic = (c: Circuit) => (c.priceVisible ? c.price : null);
  const prix = (c: Circuit) => { const p = prixPublic(c); return p !== null ? toursIntro.from(p) : toursIntro.onRequest; };
  const vignette = destinations.find((d) => d.image)?.image;

  return (
    <section ref={zone} id="chemins" aria-labelledby="chemins-titre" className="relative z-[2] overflow-hidden bg-white text-abyss lg:h-[100svh] lg:min-h-[760px]">
      {/* la Terre est créée une fois puis gardée : elle s'efface quand on compose, et revient sans recréer la 3D */}
      {proche ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={mode === "accueil" ? { opacity: 1, scale: 1, visibility: "visible", transition: { duration: 1 } } : { opacity: 0, scale: 1.12, transition: { duration: 0.8, ease: EASE }, transitionEnd: { visibility: "hidden" } }}
          aria-hidden={mode !== "accueil" || undefined}
          className={`absolute inset-x-0 top-[17rem] h-[27rem] lg:inset-0 lg:h-auto ${mode === "accueil" ? "" : "pointer-events-none"}`}
        >
          <CheminsGlobe ouidah={T.origin} lieux={lieuxGlobe} visiteur={visiteur?.coords ?? null} large={large} reduit={reduit} libelleOuidah={T.globe.ouidah(totalLieux)} libelleVisiteur={visiteur ? `${visiteur.ville} · ${T.location.you}` : null} />
        </motion.div>
      ) : null}

      <div className="relative h-full px-4 pt-20 pb-10 sm:px-6 lg:px-24 lg:pt-28 lg:pb-12">
        <div className={`relative flex flex-col lg:h-full lg:w-[34rem] ${mode === "accueil" ? "lg:justify-center" : ""}`}>
          <h2 id="chemins-titre" className={mode === "accueil" ? "font-display text-[40px] leading-[0.98] font-semibold tracking-[-0.03em] sm:text-[52px] lg:text-[68px]" : "sr-only"}>
            {T.title.lead} <span className="text-laterite">{T.title.accent}</span>
          </h2>

          {mode === "accueil" ? (
            <>
              <div className="mt-6 flex flex-wrap gap-2">
                <p className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#f6f6f4] py-1.5 pr-3.5 pl-1.5 text-[13px] font-bold">
                  <Objet3D nom="destination" taille={28} />
                  {visiteur ? T.location.youAre(visiteur.ville, fmtKm.format(distanceKm(visiteur.coords, T.origin))) : T.location.ask}
                  <button type="button" onClick={() => setSaisie((s) => !s)} aria-expanded={saisie} className="min-h-7 font-semibold text-abyss/60 underline underline-offset-4 hover:text-abyss focus-visible:outline-2 focus-visible:outline-sun">
                    {T.location.change}
                  </button>
                </p>
                {heure ? (
                  <p className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#f6f6f4] py-1.5 pr-3.5 pl-1.5 text-[13px] font-bold">
                    <Objet3D nom={heure.nuit ? "lune" : "soleil"} taille={28} />
                    {T.time.at(heure.h)} <span className="font-semibold text-abyss/60">· {heure.info}</span>
                  </p>
                ) : null}
              </div>
              {saisie ? (
                <form onSubmit={changerVille} className="mt-3 flex max-w-md gap-2">
                  <label className="sr-only" htmlFor="chemins-ville">
                    {T.location.field}
                  </label>
                  <input id="chemins-ville" name="ville" autoComplete="address-level2" placeholder={T.location.placeholder} className="min-h-11 flex-1 rounded-full border border-abyss/15 px-4 text-sm outline-none focus:border-abyss" />
                  <button type="submit" className="min-h-11 rounded-full bg-abyss px-5 text-sm font-bold text-white">
                    {T.location.submit}
                  </button>
                </form>
              ) : null}
              {erreurVille && saisie ? <p className="mt-2 text-sm font-semibold text-laterite">{T.location.notFound}</p> : null}
              <p className="mt-6 hidden max-w-md text-base leading-[1.6] text-abyss/65 lg:block">{T.intro}</p>
              <div className="h-[19rem] lg:hidden" aria-hidden="true" />
              <div className="relative z-[2] mt-6 grid max-w-[30rem] gap-3">
                <Choix image={tours[0]?.image.src} titre={T.ready.label} texte={T.ready.desc(tours.length)} onClick={() => setMode("prets")} principal />
                <Choix image={vignette?.src} titre={T.compose.label} texte={T.compose.desc(totalLieux)} onClick={() => setMode("composer")} />
                {retour && gardesConnus.length ? <p className="text-sm font-bold text-abyss/70">{T.trip.back}</p> : null}
              </div>
            </>
          ) : (
            <>
              <div role="group" aria-label={T.tabs} className="mt-4 flex items-center gap-2">
                <div className="inline-flex rounded-full bg-[#f6f6f4] p-1">
                  {(["prets", "composer"] as const).map((m) => (
                    <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={`min-h-10 rounded-full px-4 text-sm font-semibold transition-colors ${mode === m ? "bg-abyss text-white" : "text-abyss/55 hover:text-abyss"}`}>
                      {m === "prets" ? `${T.ready.label} · ${tours.length}` : T.compose.label}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setMode("accueil")} aria-label={T.globe.label} className="grid size-11 place-items-center rounded-full border border-abyss/15 hover:border-abyss focus-visible:outline-2 focus-visible:outline-sun">
                  <Objet3D nom="globe" taille={30} />
                </button>
              </div>

              <AnimatePresence mode="wait" initial={false}>
                {mode === "composer" ? (
                  <motion.div key="composer" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.45, ease: EASE }} className="flex min-h-0 flex-1 flex-col">
                    <h3 className="mt-6 hidden font-display text-[28px] leading-[1.1] font-semibold lg:block">{T.compose.heading}</h3>
                    <div role="group" aria-label={T.compose.viewsLabel} className="mt-4 inline-flex self-start rounded-full bg-[#f6f6f4] p-1">
                      {(["deck", "liste"] as const).map((p) => (
                        <button key={p} type="button" aria-pressed={parcours === p} onClick={() => setParcours(p)} className={`min-h-9 rounded-full px-3.5 text-[13px] font-semibold transition-colors ${parcours === p ? "bg-white text-abyss shadow-sm" : "text-abyss/55 hover:text-abyss"}`}>
                          {p === "deck" ? T.compose.views.deck : T.compose.views.list(liste.length)}
                        </button>
                      ))}
                    </div>
                    {parcours === "liste" ? (
                      <ul className="mt-3 grid max-h-[31rem] content-start gap-1.5 overflow-auto pr-1 lg:max-h-none lg:min-h-0 lg:flex-1">
                        {liste.map((r) => {
                          const garde = gardes.includes(r.id);
                          return (
                            <li key={r.id} className={`grid grid-cols-[0.75rem_1fr_auto] items-center gap-3 rounded-xl border px-3 py-1.5 ${choisi === r.id ? "border-abyss" : "border-abyss/10"}`}>
                              <span aria-hidden="true" className="size-3 rounded-full" style={{ background: r.couleur }} />
                              <button
                                type="button"
                                onClick={() => {
                                  if (r.destination) {
                                    aller(r.id);
                                    setParcours("deck");
                                  } else setChoisi(r.id);
                                }}
                                className="min-h-10 text-left focus-visible:outline-2 focus-visible:outline-sun"
                              >
                                <span className="block text-sm leading-tight font-bold">{r.nom}</span>
                                <span className="block text-xs font-semibold text-abyss/55">{r.detail}</span>
                              </button>
                              <button type="button" aria-pressed={garde} aria-label={`${garde ? T.place.remove : T.place.add} : ${r.nom}`} onClick={() => basculer(r.id)} className={`grid size-10 place-items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-sun ${garde ? "bg-sun text-abyss" : "bg-[#f6f6f4] text-abyss/60 hover:text-abyss"}`}>
                                <Objet3D nom="garder" taille={24} eteint={!garde} />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                    <div
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowRight") suivant(true);
                        if (e.key === "ArrowLeft") suivant(false);
                      }}
                      className="relative mt-4 h-[31rem] rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sun lg:h-auto lg:min-h-0 lg:flex-1"
                    >
                      <AnimatePresence initial={false} custom={sens} mode="popLayout">
                        {lieu ? (
                          <motion.article key={lieu.slug} custom={sens} variants={carteV} initial="entre" animate="la" exit="sort" className="absolute inset-0 overflow-hidden rounded-3xl bg-abyss text-white">
                            {lieu.image ? (
                              <Image src={lieu.image.src} alt={lieu.image.alt} fill sizes="(min-width: 1024px) 34rem, 100vw" className="object-cover" />
                            ) : (
                              <div className="absolute inset-0 grid place-items-center">
                                <span className="text-sm font-bold text-white/50">{T.compose.noPhoto}</span>
                              </div>
                            )}
                            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#080c1a]/90 via-[#080c1a]/30 via-40% to-transparent to-65%" />
                            <div className="absolute inset-x-4 top-4 z-[2] flex items-center justify-between gap-4">
                              <span className="verre-liquide relative rounded-full px-3 py-1.5 text-xs font-semibold">
                                {T.compose.position(index + 1, n)} · {lieu.theme}
                              </span>
                              <span aria-hidden="true" className="h-1 w-24 overflow-hidden rounded-full bg-white/30">
                                <span className="block h-full rounded-full bg-sun" style={{ width: `${((index + 1) / n) * 100}%` }} />
                              </span>
                            </div>
                            <div className="absolute inset-x-6 bottom-24 z-[2]">
                              {lieu.subtitle ? <p className="text-xs font-semibold text-sun">{lieu.subtitle}</p> : null}
                              <h4 className="mt-2 font-display text-[30px] leading-[1.04] font-semibold tracking-[-0.02em] lg:text-[36px]">{lieu.name}</h4>
                              {lieu.text ? <p className="mt-2 max-w-md text-sm leading-[1.55] font-semibold text-white/85">{lieu.text}</p> : null}
                            </div>
                            <div className={`verre-liquide absolute inset-x-4 bottom-4 z-[3] grid h-14 gap-1.5 rounded-full p-1.5 ${lienLieu ? "grid-cols-[1fr_1.4fr_1fr]" : "grid-cols-[1fr_1.4fr]"}`}>
                              <button type="button" onClick={() => suivant(false)} className="flex items-center justify-center gap-1.5 rounded-full text-sm font-semibold hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white">
                                <Icon name="close" className="size-4" />
                                {T.compose.skip}
                              </button>
                              <button type="button" onClick={() => suivant(true)} className="flex items-center justify-center gap-1.5 rounded-full bg-sun text-sm font-semibold text-abyss focus-visible:outline-2 focus-visible:outline-white">
                                <Objet3D nom="garder" taille={24} eteint={!gardes.includes(lieu.slug)} />
                                {gardes.includes(lieu.slug) ? T.compose.kept : T.compose.keep}
                              </button>
                              {/* fiche du lieu : seulement quand elle existe (sinon tout est déjà sur cette carte) */}
                              {lienLieu ? (
                                <Link href={lienLieu} className="flex items-center justify-center gap-1.5 rounded-full text-sm font-semibold hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white">
                                  <Icon name="eye" className="size-4" />
                                  {T.compose.see}
                                </Link>
                              ) : null}
                            </div>
                          </motion.article>
                        ) : (
                          <motion.div key="fin" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="absolute inset-0 flex flex-col items-start justify-end gap-4 rounded-3xl bg-abyss p-8 text-white">
                            <p className="font-display text-[30px] leading-[1.08] font-semibold">{T.compose.done}</p>
                            <p className="text-sm font-semibold text-white/75">{T.trip.count(gardesConnus.length)}</p>
                            <div className="flex flex-wrap gap-3">
                              <Link href={lienDevis} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-sun px-6 text-sm font-semibold text-abyss">
                                {T.trip.cta}
                                <Icon name="arrow-right" className="size-4" />
                              </Link>
                              <button type="button" onClick={() => setIndex(0)} className="min-h-12 rounded-full border border-white/30 px-6 text-sm font-semibold">
                                {T.compose.restart}
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div key="prets" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.45, ease: EASE }}>
                    <h3 className="mt-6 font-display text-[26px] leading-[1.1] font-semibold lg:text-[28px]">{T.ready.heading}</h3>
                    <ul className="mt-4 grid gap-2.5">
                      {tours.map((c, i) => (
                        <li key={c.slug}>
                          {i === actif ? (
                            <div className="grid grid-cols-[5rem_1fr] gap-4 rounded-[1.25rem] border-2 border-abyss p-4">
                              <span className="relative size-20 overflow-hidden rounded-xl">
                                <Image src={c.image.src} alt={c.image.alt} fill sizes="80px" className="object-cover" />
                              </span>
                              <div>
                                <p className="text-xs font-semibold text-laterite">
                                  {c.tag} · {T.ready.steps(c.stops.length)}
                                </p>
                                <p className="mt-1 font-display text-[22px] leading-[1.1] font-semibold">{c.title}</p>
                                <p className="mt-2 text-sm leading-[1.6] font-semibold text-abyss/60">{c.stops.map((s) => parSlug.get(s)?.name).filter(Boolean).join(" → ")}</p>
                                <p className="mt-1 text-sm text-abyss/60">
                                  {c.duration ?? toursIntro.durationPending} · {prix(c)}
                                  <EquivalentDevise xof={prixPublic(c)} />
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <Link href={adresseCircuit(c.slug, tours)} className="inline-flex min-h-11 items-center rounded-full bg-abyss px-5 text-sm font-bold text-white">
                                    {T.ready.book}
                                  </Link>
                                  <button type="button" onClick={() => personnaliser(c)} className="min-h-11 rounded-full border border-abyss/15 px-5 text-sm font-bold hover:border-abyss">
                                    {T.ready.customize}
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <button type="button" onClick={() => setActif(i)} className="grid w-full grid-cols-[3.75rem_1fr_auto] items-center gap-4 rounded-[1.125rem] border border-abyss/12 p-2.5 pr-4 text-left hover:border-abyss/40 focus-visible:outline-2 focus-visible:outline-sun">
                              <span className="relative size-[3.75rem] overflow-hidden rounded-xl">
                                <Image src={c.image.src} alt="" fill sizes="60px" className="object-cover" />
                              </span>
                              <span>
                                <span className="block font-display text-lg leading-[1.15] font-semibold">{c.title}</span>
                                <span className="mt-0.5 block text-xs font-bold text-abyss/55">
                                  {c.tag} · {T.ready.steps(c.stops.length)}
                                </span>
                              </span>
                              <Icon name="chevron-right" className="size-5 text-abyss/50" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>

        {/* la carte est créée à la première ouverture puis gardée (masquée sur l'accueil) : un seul contexte graphique */}
        {carteMontee ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: mode === "accueil" ? 0 : 1 }} transition={{ duration: 0.8 }} aria-hidden={mode === "accueil" || undefined} className={`relative mt-4 overflow-hidden rounded-2xl bg-sand lg:absolute lg:top-28 lg:right-16 lg:bottom-12 lg:left-[46rem] lg:mt-0 lg:h-auto lg:rounded-[28px] ${mode === "composer" ? "h-[26rem]" : "h-[17rem]"} ${mode === "accueil" ? "hidden" : ""}`}>
            <CheminsCarte lieux={destinations} releve={releve} categoriesActives={categoriesActives} couleur={COULEUR} vue={vue} choisi={choisi} large={large} reduit={reduit} onAller={aller} onChoisir={setChoisi} />
            {mode === "composer" ? (
              <div role="group" aria-label={T.filtersLabel} className="absolute inset-x-3 top-3 z-[4] flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] lg:inset-x-4 lg:top-4">
                {T.filters.map((fl) => {
                  const actif = filtres.has(fl.key);
                  const nb = releve ? releve.filter((l) => fl.ids.includes(l.categorie)).length : null;
                  return (
                    <button
                      key={fl.key}
                      type="button"
                      aria-pressed={actif}
                      onClick={() =>
                        setFiltres((prev) => {
                          const next = new Set(prev);
                          if (next.has(fl.key)) next.delete(fl.key);
                          else next.add(fl.key);
                          return next;
                        })
                      }
                      className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] bg-white py-1 pr-3 pl-2 text-xs font-semibold whitespace-nowrap shadow-[0_8px_16px_-12px_color-mix(in_oklab,var(--surface-abyss)_60%,transparent)] transition-opacity focus-visible:outline-2 focus-visible:outline-sun ${actif ? "border-abyss/80" : "border-transparent opacity-60 hover:opacity-100"}`}
                    >
                      <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: fl.color }} />
                      {fl.label}
                      {nb !== null ? <span className="font-bold text-abyss/50">{nb}</span> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {mode === "composer" && large && !lieuChoisi ? (
              <aside className="absolute top-[4.25rem] right-4 z-[4] max-h-[calc(100%-6rem)] w-[18.5rem] overflow-auto rounded-[1.25rem] bg-white p-4 shadow-[0_24px_48px_-28px_color-mix(in_oklab,var(--surface-abyss)_60%,transparent)]">
                <Panier gardes={gardesConnus} fiche={fiche} retour={retour} lienDevis={lienDevis} onRetirer={basculer} />
              </aside>
            ) : null}
            {mode === "composer" && lieuChoisi ? <FicheLieu lieu={lieuChoisi} garde={gardes.includes(idReleve(lieuChoisi))} compte={gardesConnus.length} onBasculer={() => basculer(idReleve(lieuChoisi))} onFermer={fermerFiche} /> : null}
          </motion.div>
        ) : null}

        {mode === "composer" && !large ? (
          <div className="sticky bottom-4 z-[5] mt-4 flex items-center justify-between rounded-full bg-abyss py-2 pr-2 pl-5 text-white" aria-live="polite">
            <span className="text-sm font-bold">{T.trip.count(gardesConnus.length)}</span>
            {gardesConnus.length ? (
              <Link href={lienDevis} className="inline-flex min-h-10 items-center rounded-full bg-sun px-4 text-sm font-semibold text-abyss">
                {T.trip.cta}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Choix({ image, titre, texte, onClick, principal = false }: { image?: string; titre: string; texte: string; onClick: () => void; principal?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`grid grid-cols-[4rem_1fr_auto] items-center gap-4 rounded-[1.25rem] border bg-white p-3 pr-5 text-left transition-shadow hover:shadow-[0_16px_32px_-20px_color-mix(in_oklab,var(--surface-abyss)_45%,transparent)] focus-visible:outline-2 focus-visible:outline-sun ${principal ? "border-abyss" : "border-abyss/12"}`}>
      <span className="relative size-16 overflow-hidden rounded-[0.875rem] bg-sand">{image ? <Image src={image} alt="" fill sizes="64px" className="object-cover" /> : null}</span>
      <span>
        <span className="block font-display text-lg leading-[1.15] font-semibold">{titre}</span>
        <span className="mt-0.5 block text-sm text-abyss/60">{texte}</span>
      </span>
      <span className={`grid size-10 place-items-center rounded-full ${principal ? "bg-abyss text-white" : "bg-sun text-abyss"}`}>
        <Icon name="arrow-right" className="size-4" />
      </span>
    </button>
  );
}

function FicheLieu({ lieu, garde, compte, onBasculer, onFermer }: { lieu: LieuReleve; garde: boolean; compte: number; onBasculer: () => void; onFermer: () => void }) {
  const T = useContenu("fr.cheminsIntro", CHEMINS_INTRO);
  const filtre = T.filters.find((f) => f.ids.includes(lieu.categorie));
  const fermer = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    fermer.current?.focus({ preventScroll: true });
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFermer();
    };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [lieu, onFermer]);
  return (
    <motion.article
      key={lieu.slug}
      role="dialog"
      aria-label={lieu.nom}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="absolute inset-x-3 bottom-3 z-[5] rounded-[1.125rem] bg-white p-4 shadow-[0_24px_48px_-24px_color-mix(in_oklab,var(--surface-abyss)_65%,transparent)] lg:inset-x-auto lg:top-[4.25rem] lg:right-4 lg:bottom-auto lg:w-[18.5rem]"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-xs font-semibold text-abyss/60">
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: filtre?.color }} />
          {[filtre?.label, lieu.sous_type, lieu.hors_commune ? T.place.outside : null].filter(Boolean).join(" · ")}
        </p>
        <button ref={fermer} type="button" onClick={onFermer} aria-label={T.place.close} className="-mt-1 -mr-1 grid size-9 shrink-0 place-items-center rounded-full text-abyss/50 hover:bg-abyss/5 hover:text-abyss focus-visible:outline-2 focus-visible:outline-sun">
          <Icon name="close" className="size-5" />
        </button>
      </div>
      <h4 className="mt-1 font-display text-lg leading-tight font-semibold">{lieu.nom}</h4>
      {lieu.adresse ? <p className="mt-1 text-xs font-semibold text-abyss/60">{lieu.adresse}</p> : null}
      {lieu.description ? <p className="mt-2 text-[13px] leading-[1.5] text-abyss/75">{lieu.description}</p> : null}
      {lieu.remarque ? <p className="mt-2 rounded-lg bg-sun/15 px-2.5 py-1.5 text-xs font-semibold text-abyss/80">{lieu.remarque}</p> : null}
      {lieu.telephone || lieu.site ? (
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold">
          {lieu.telephone ? (
            <a href={`tel:${lieu.telephone.replace(/[^\d+]/g, "")}`} className="inline-flex min-h-7 items-center gap-1 underline underline-offset-4">
              <Icon name="phone" className="size-3.5" />
              {T.place.call} · {lieu.telephone}
            </a>
          ) : null}
          {lieu.site ? (
            <a href={lieu.site} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-7 items-center gap-1 underline underline-offset-4">
              {T.place.website}
            </a>
          ) : null}
        </p>
      ) : null}
      <button type="button" aria-pressed={garde} onClick={onBasculer} className={`mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-abyss ${garde ? "border border-abyss/15 text-abyss" : "bg-sun text-abyss"}`}>
        <Objet3D nom="garder" taille={24} eteint={!garde} />
        {garde ? T.place.remove : T.place.add}
      </button>
      <p className="mt-2 flex justify-between gap-3 text-[11px] text-abyss/50">
        <span>{T.place.verification[lieu.verification]}</span>
        <span aria-live="polite" className="shrink-0 font-bold text-abyss/70">
          {T.trip.count(compte)}
        </span>
      </p>
    </motion.article>
  );
}

function Panier({ gardes, fiche, retour, lienDevis, onRetirer }: { gardes: string[]; fiche: (id: string) => Fiche | null; retour: boolean; lienDevis: string; onRetirer: (id: string) => void }) {
  const T = useContenu("fr.cheminsIntro", CHEMINS_INTRO);
  const fiches = gardes.map(fiche).filter((x): x is Fiche => !!x);
  const familles = Object.keys(T.groups).filter((g) => fiches.some((x) => x.famille === g));
  return (
    <div aria-live="polite">
      <p className="text-xs font-semibold text-laterite">{T.trip.label}</p>
      <p className="mt-1 font-display text-lg font-semibold">{T.trip.count(fiches.length)}</p>
      {retour && fiches.length ? <p className="mt-1 text-xs font-bold text-abyss/60">{T.trip.back}</p> : null}
      {fiches.length ? (
        familles.map((g) => (
          <div key={g} className="mt-3">
            <p className="flex justify-between text-xs font-semibold text-abyss/50">
              <span>{T.groups[g]}</span>
              <span>{fiches.filter((x) => x.famille === g).length}</span>
            </p>
            <ol className="mt-1.5 grid gap-1.5">
              {fiches
                .filter((x) => x.famille === g)
                .map((x) => (
                  <li key={x.id} className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-2 text-[13px] font-bold">
                    <span className="relative size-9 overflow-hidden rounded-lg bg-sand">{x.image ? <Image src={x.image} alt="" fill sizes="36px" className="object-cover" /> : null}</span>
                    <span className="leading-tight">{x.nom}</span>
                    <button type="button" onClick={() => onRetirer(x.id)} aria-label={T.trip.remove(x.nom)} className="grid size-7 place-items-center rounded-full text-abyss/50 hover:bg-abyss/5 hover:text-abyss">
                      <Icon name="close" className="size-4" />
                    </button>
                  </li>
                ))}
            </ol>
          </div>
        ))
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-abyss/20 p-3 text-center text-[13px] font-semibold text-abyss/55">{T.trip.empty}</p>
      )}
      <p className="mt-3 text-xs text-abyss/55">{T.trip.note}</p>
      {fiches.length ? (
        <Link href={lienDevis} className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-full bg-sun text-sm font-semibold text-abyss">
          {T.trip.cta}
          <Icon name="arrow-right" className="size-4" />
        </Link>
      ) : null}
      <p className="mt-2 text-center text-[11px] text-abyss/45">{T.trip.saved}</p>
    </div>
  );
}
