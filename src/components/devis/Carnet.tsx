"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as EvClavier, type PointerEvent } from "react";
import { cheminsIntro as CHEMINS_INTRO, destinations as DESTINATIONS, devisPage as DEVIS_PAGE, tenReasons as TEN_REASONS, tourFilters as TOUR_FILTERS, tours as TOURS } from "@/content/fr";
import type { Circuit, LieuReleve, Media } from "@/content/types";
import { useContenu } from "@/components/ui/ContenuSite";
import { Objet3D, type NomObjet } from "@/components/ui/Objet3D";
import { Palettes } from "@/components/ui/Palettes";
import { modifierChemin } from "@/lib/chemin";
import { useFormatsSite } from "@/lib/formats-site";
import { CarteLieux, type Trace } from "./CarteLieux";
import "./carnet.css";

// Carnet des lieux du billet /devis (Kevin, 11/11/2026 : piste A « Le carnet » + recherche aux flèches et étiquettes « +N »
// de B + carte C). S'ouvre depuis la case « Vos lieux » : circuits prêts, lieux à voir filtrés par type, recherche dans les
// listes et le relevé de la ville (adresses de la commune seulement), carte synchronisée avec la liste. Chaque geste écrit
// la mémoire de l'accueil (« oht-chemin », lib/chemin.ts) : la case du billet et « Votre voyage · N » suivent d'eux-mêmes.
// Bureau : panneau posé sur le billet, carte à côté de la liste. Téléphone et paysage bas : feuille plein écran qui monte
// du bas, bouton « Carte / Liste ». <dialog> modal : le reste de la page est inerte ; Tab tourne dans le carnet, Échap le
// ferme et rend le focus à la case. Mouvement : une seule animation par geste (l'ouverture, puis le compte en palettes).
export type Fiche = { id: string; nom: string; sous: string | null; theme: string | null; image: Media | null; objet: NomObjet; coords: [number, number]; km: number };
type Option = { cle: string; fiche?: Fiche; circuit?: Circuit };

const FEUILLE = "(max-width: 700px), (max-height: 500px)";
const FOCUSABLES = "a[href], button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])";
const LOIN_KM = 6; // au-delà : « Plus loin », au bord de la carte (Route des Pêches, Ganvié)
const OBJET: Record<string, NomObjet> = { hebergement: "hebergement", restauration: "tables", plage: "lagune", nature: "lagune", sante: "sante", transport: "vehicule" };
const plat = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const remplir = (modele: string, v: Record<string, string | number>) => modele.replace(/\{(\w+)\}/g, (j, k: string) => (k in v ? String(v[k]) : j));
const selon = (n: number, m: { un: string; plusieurs: string }) => remplir(n > 1 ? m.plusieurs : m.un, { n });
const kmEntre = ([lat, lon]: readonly [number, number], [oLon, oLat]: readonly [number, number]) => {
  const r = Math.PI / 180;
  const a = Math.sin(((lat - oLat) * r) / 2) ** 2 + Math.cos(lat * r) * Math.cos(oLat * r) * Math.sin(((lon - oLon) * r) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
};
// recherche : accents ignorés, début du nom d'abord, puis début d'un mot, puis n'importe où
const rang = (texte: string, n: string) => {
  const p = plat(texte);
  return p.startsWith(n) ? 0 : p.split(/[\s'’,(-]+/).some((m) => m.startsWith(n)) ? 1 : p.includes(n) ? 2 : 9;
};
const trier = <X,>(xs: X[], texte: (x: X) => string, n: string) =>
  xs
    .map((x) => [rang(texte(x), n), x] as const)
    .filter(([r]) => r < 9)
    .sort((a, b) => a[0] - b[0])
    .map(([, x]) => x);

const Plus = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 6v12M6 12h12" />
  </svg>
);
const Coche = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 12.5l4 4L18 8" />
  </svg>
);
const Croix = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

type Props = {
  gardes: string[];
  cadre: () => DOMRect | null; // corps du billet, sur lequel le panneau se pose au bureau
  onFermer: () => void;
  onConseil: () => void;
  onMessage: (ligne: string) => void;
};

export function Carnet({ gardes, cadre, onFermer, onConseil, onMessage }: Props) {
  const T = useContenu("fr.devisPage", DEVIS_PAGE);
  const C = T.carnet;
  const chemins = useContenu("fr.cheminsIntro", CHEMINS_INTRO);
  const destinations = useContenu("fr.destinations", DESTINATIONS);
  const tours = useContenu("fr.tours", TOURS);
  const filtres = useContenu("fr.tourFilters", TOUR_FILTERS);
  const raisons = useContenu("fr.tenReasons", TEN_REASONS);
  const { nombre } = useFormatsSite();
  const [releveCode, setReleveCode] = useState<LieuReleve[] | null>(null);
  const releve = useContenu("lieux-ouidah", useMemo(() => ({ lieux: releveCode ?? [] }), [releveCode])).lieux;
  useEffect(() => {
    let annule = false;
    import("@/content/lieux-ouidah.json").then((m) => !annule && setReleveCode(m.default.lieux as LieuReleve[]));
    return () => {
      annule = true;
    };
  }, []);

  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState(filtres[0]);
  const [vue, setVue] = useState<"liste" | "carte">("liste");
  const [actif, setActif] = useState(-1);
  const [question, setQuestion] = useState<string | null>(null);
  const [retablir, setRetablir] = useState<{ slug: string; avant: string[] } | null>(null);
  const [survol, setSurvol] = useState<{ id?: string; circuit?: string } | null>(null);
  const [annonce, setAnnonce] = useState("");
  const [ajoute, setAjoute] = useState<string | null>(null);
  const [auChargement] = useState(gardes.length > 0); // déjà choisis sur l'accueil
  const boite = useRef<HTMLDialogElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const rangee = useRef<HTMLDivElement>(null);

  // ——— fiches : lieux à voir (photo du lieu, sinon celle de la raison qui le cite) et relevé de la ville
  const parId = useMemo(() => {
    const m = new Map<string, Fiche>();
    const km = (c: [number, number]) => kmEntre(c, chemins.origin);
    for (const d of destinations) m.set(d.slug, { id: d.slug, nom: d.name, sous: d.subtitle ?? d.theme, theme: d.theme, image: d.image ?? raisons.find((r) => r.lieux.includes(d.slug))?.image ?? null, objet: "destination", coords: d.coords, km: km(d.coords) });
    for (const l of releve) {
      const famille = chemins.filters.find((f) => f.ids.includes(l.categorie));
      m.set(`r:${l.slug}`, { id: `r:${l.slug}`, nom: l.nom, sous: famille?.label ?? null, theme: null, image: null, objet: OBJET[l.categorie] ?? "destination", coords: l.coords, km: km(l.coords) });
    }
    return m;
  }, [destinations, releve, raisons, chemins]);
  const fiches = (ids: string[]) => ids.map((id) => parId.get(id)).filter((f): f is Fiche => !!f);
  const kmTexte = (f: Fiche) => nombre({ style: "unit", unit: "kilometer", maximumFractionDigits: 0 }).format(f.km);
  const sousTitre = (f: Fiche) => (f.km > LOIN_KM ? `${chemins.place.outside}, ${kmTexte(f)}` : f.sous);
  const numero = (id: string) => gardes.indexOf(id) + 1;
  const inclus = (t: Circuit) => t.stops.every((s) => gardes.includes(s));
  const recouvre = (t: Circuit) => t.stops.filter((s) => gardes.includes(s)).length;

  // ——— filtres de type (fr.tourFilters) : « Tous », puis ceux qui ont un lieu ou un circuit
  const etapesDe = (f: string) => tours.filter((t) => t.tag === f).flatMap((t) => t.stops);
  const lieuDe = (f: string) => destinations.filter((d) => d.theme === f || etapesDe(f).includes(d.slug));
  const types = filtres.filter((f, i) => i === 0 || lieuDe(f).length || tours.some((t) => t.tag === f));
  const tous = filtre === filtres[0] || !types.includes(filtre);
  const circuitsVus = tous ? tours : tours.filter((t) => t.tag === filtre);
  const lieuxVus = fiches((tous ? destinations : lieuDe(filtre)).map((d) => d.slug));

  // ——— recherche : circuits, lieux à voir, puis adresses de la commune (relevé hors_commune exclu)
  const n = plat(q.trim());
  const options: Option[] = useMemo(() => {
    if (!n) return [];
    const c = trier(tours, (t) => `${t.title} ${t.tag}`, n).map((t) => ({ cle: `c:${t.slug}`, circuit: t }));
    const l = trier(destinations, (d) => `${d.name} ${d.subtitle ?? ""} ${d.theme}`, n).map((d) => ({ cle: d.slug, fiche: parId.get(d.slug) }));
    const v = trier(
      releve.filter((x) => !x.hors_commune && !x.destination),
      (x) => `${x.nom} ${x.sous_type ?? ""} ${parId.get(`r:${x.slug}`)?.sous ?? ""}`,
      n,
    )
      .slice(0, 8)
      .map((x) => ({ cle: `r:${x.slug}`, fiche: parId.get(`r:${x.slug}`) }));
    return [...c, ...l, ...v];
  }, [n, tours, destinations, releve, parId]);
  const groupes = [
    { titre: chemins.ready.label, liste: options.filter((o) => o.circuit) },
    { titre: C.aVoir, liste: options.filter((o) => o.fiche && !o.cle.startsWith("r:")) },
    { titre: C.ville, liste: options.filter((o) => o.cle.startsWith("r:")) },
  ];
  const optionActive = actif >= 0 ? options[actif] : undefined;

  // ——— carte : épingles proches, « Plus loin », tracés des circuits gardés et de celui qu'on survole
  const proches = [...fiches(destinations.map((d) => d.slug)), ...fiches(gardes.filter((g) => g.startsWith("r:")))].filter((f) => f.km <= LOIN_KM);
  const lointains = [...fiches(destinations.map((d) => d.slug)), ...fiches(gardes.filter((g) => g.startsWith("r:")))].filter((f) => f.km > LOIN_KM);
  const points = useMemo(() => releve.filter((l) => !l.hors_commune).map((l) => l.coords), [releve]);
  // la question « ajouter / remplacer » montre le circuit sur la carte : on décide en voyant ses étapes
  const enApercu = survol?.circuit ?? question ?? optionActive?.circuit?.slug ?? null;
  const traces: Trace[] = useMemo(
    () =>
      tours.flatMap((t) => {
        const on = t.stops.every((s) => gardes.includes(s));
        if (!on && t.slug !== enApercu) return [];
        const etapes = t.stops.map((s) => parId.get(s));
        if (etapes.some((f) => !f || f.km > LOIN_KM) || etapes.length < 2) return [];
        const pts = t.trace ? t.trace.map(([lon, lat]) => [lat, lon] as [number, number]) : etapes.map((f) => f!.coords);
        return [{ slug: t.slug, points: pts, etat: on ? ("on" as const) : ("apercu" as const) }];
      }),
    [tours, gardes, enApercu, parId],
  );
  const allumes = enApercu && !survol?.id ? (tours.find((t) => t.slug === enApercu)?.stops ?? []) : survol?.id ? [survol.id] : optionActive?.circuit ? optionActive.circuit.stops : optionActive?.fiche ? [optionActive.fiche.id] : [];

  // ——— ouverture : <dialog> modal posé sur le corps du billet (bureau) ou en feuille plein écran ; la page ne défile plus
  useLayoutEffect(() => {
    const d = boite.current;
    if (!d) return;
    const poser = () => {
      const r = cadre();
      if (matchMedia(FEUILLE).matches || !r) return d.style.removeProperty("--cn-g"), d.style.removeProperty("--cn-l");
      d.style.setProperty("--cn-g", `${Math.max(8, r.left)}px`);
      d.style.setProperty("--cn-l", `${Math.min(r.width, innerWidth - 16)}px`);
    };
    poser();
    if (!d.open) d.showModal();
    const feuille = matchMedia(FEUILLE).matches;
    // au téléphone, le clavier virtuel ne s'ouvre pas d'emblée : le focus va au titre
    (feuille ? d.querySelector<HTMLElement>("#cn-titre") : champ.current)?.focus({ preventScroll: true });
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
      d.animate(feuille ? [{ transform: "translateY(100%)" }, { transform: "none" }] : [{ opacity: 0, transform: "translateY(-8px) scale(.98)" }, { opacity: 1, transform: "none" }], { duration: feuille ? 380 : 260, easing: "cubic-bezier(.16, 1, .3, 1)" });
    const html = document.documentElement;
    const avant = html.style.overflow;
    html.style.overflow = "hidden";
    addEventListener("resize", poser);
    return () => {
      removeEventListener("resize", poser);
      html.style.overflow = avant;
      if (d.open) d.close();
    };
  }, [cadre]);

  // focus sur la question (« Ajouter ses N étapes » d'abord : on ne perd rien) dès qu'elle s'ouvre
  useEffect(() => {
    if (question) boite.current?.querySelector<HTMLElement>(`[data-question="${question}"] button`)?.focus();
  }, [question]);

  // étiquettes des lieux gardés : une seule ligne ; ce qui ne tient pas devient « +N »
  useLayoutEffect(() => {
    const r = rangee.current;
    if (!r) return;
    const mesurer = () => {
      const tous = [...r.querySelectorAll<HTMLElement>("[data-etiquette]")];
      const plus = r.querySelector<HTMLElement>("[data-plus]");
      if (!plus) return;
      tous.forEach((e) => (e.hidden = false));
      plus.hidden = true;
      const W = r.clientWidth;
      let k = tous.findIndex((e) => e.offsetLeft + e.offsetWidth > W);
      if (k === -1) return;
      while (k > 0 && tous[k - 1].offsetLeft + tous[k - 1].offsetWidth > W - 52) k--;
      tous.slice(k).forEach((e) => (e.hidden = true));
      plus.hidden = false;
      plus.firstElementChild!.textContent = `+${tous.length - k}`;
      plus.lastElementChild!.textContent = selon(tous.length - k, C.autres);
    };
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(r);
    return () => ro.disconnect();
  }, [gardes, parId, C.autres]);

  // ——— gestes
  const dire = (t: string) => setAnnonce((a) => (a === t ? `${t}​` : t)); // relu même si la phrase se répète
  const fermer = () => boite.current?.close();
  const compte = (k: number) => chemins.trip.count(k);
  const basculer = (id: string) => {
    const f = parId.get(id);
    const avait = gardes.includes(id);
    setQuestion(null);
    setRetablir(null);
    modifierChemin(avait ? [] : [id], avait ? [id] : []);
    const k = gardes.length + (avait ? -1 : 1);
    if (f) dire(`${remplir(avait ? C.retire : C.garde, { nom: f.nom })} ${compte(k)}.`);
  };
  const surCircuit = (t: Circuit) => {
    setRetablir(null);
    // déjà entier dans le voyage : un geste retire ses étapes
    if (inclus(t)) {
      setQuestion(null);
      modifierChemin([], t.stops);
      return dire(`${compte(gardes.filter((s) => !t.stops.includes(s)).length)}.`);
    }
    // sélection vide ou contenue dans le circuit : un geste suffit
    if (!gardes.length || gardes.every((s) => t.stops.includes(s))) {
      setQuestion(null);
      modifierChemin(t.stops, []);
      return dire(`${T.lieux.circuit(t.title)}. ${compte(t.stops.length)}.`);
    }
    setQuestion((x) => (x === t.slug ? null : t.slug));
  };
  const trancher = (t: Circuit, mode: "ajouter" | "remplacer") => {
    setQuestion(null);
    if (mode === "remplacer") {
      setRetablir({ slug: t.slug, avant: [...gardes] });
      modifierChemin(t.stops, gardes);
      dire(`${T.lieux.circuit(t.title)}. ${compte(t.stops.length)}.`);
    } else {
      modifierChemin(t.stops, []);
      dire(`${compte(new Set([...gardes, ...t.stops]).size)}.`);
    }
    requestAnimationFrame(() => (boite.current?.querySelector<HTMLElement>(`[data-circuit="${t.slug}"]`) ?? champ.current)?.focus());
  };
  const remettre = () => {
    if (!retablir) return;
    const slug = retablir.slug;
    modifierChemin(retablir.avant, gardes);
    dire(`${compte(retablir.avant.length)}.`);
    setRetablir(null);
    requestAnimationFrame(() => (boite.current?.querySelector<HTMLElement>(`[data-circuit="${slug}"]`) ?? champ.current)?.focus());
  };
  const choisirOption = (o: Option | undefined) => {
    if (o?.circuit) surCircuit(o.circuit);
    else if (o?.fiche) basculer(o.fiche.id);
  };
  const chercher = (v: string) => {
    setQ(v);
    setQuestion(null);
    setAjoute(null);
    setActif(v.trim() ? 0 : -1);
  };
  const clavierChamp = (e: EvClavier<HTMLInputElement>) => {
    const k = options.length;
    if (e.key === "ArrowDown" && k) {
      e.preventDefault();
      setActif((i) => (i + 1) % k);
    } else if (e.key === "ArrowUp" && k) {
      e.preventDefault();
      setActif((i) => (i <= 0 ? k - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choisirOption(optionActive);
    }
  };
  const ajouterAuMessage = () => {
    const v = q.trim();
    onMessage(remplir(C.ligneMessage, { q: v }));
    setAjoute(v);
    dire(remplir(C.ajouteMessage, { q: v }));
  };
  // Tab tourne dans le carnet (le navigateur laisserait sortir vers sa barre d'adresse)
  const clavier = (e: EvClavier<HTMLDialogElement>) => {
    if (e.key !== "Tab") return;
    const f = [...e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLES)].filter((x) => x.getClientRects().length > 0);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement as HTMLElement);
    if (e.shiftKey && i <= 0) {
      e.preventDefault();
      f.at(-1)!.focus();
    } else if (!e.shiftKey && (i === -1 || i === f.length - 1)) {
      e.preventDefault();
      f[0].focus();
    }
  };

  // ——— pièces
  const marque = (id: string) => {
    const k = numero(id);
    return <span className={`cn-marque ${k ? "cn-num" : ""}`}>{k ? k : <Plus />}</span>;
  };
  const vignette = (f: Fiche, taille: number) => (f.image ? <Image src={f.image.src} alt="" fill sizes={`${taille}px`} /> : <Objet3D nom={f.objet} taille={Math.round(taille * 0.6)} />);
  // survol à la souris seulement : au doigt, le contact laisserait un survol collé sous la feuille qui vient de s'ouvrir
  const suivre = (s: { id?: string; circuit?: string }) => ({ onPointerEnter: (e: PointerEvent<HTMLElement>) => e.pointerType === "mouse" && setSurvol(s), onPointerLeave: () => setSurvol(null), onFocus: () => setSurvol(s), onBlur: () => setSurvol(null) });
  const blocQuestion = (t: Circuit) => {
    const manque = t.stops.filter((s) => !gardes.includes(s)).length;
    return (
      <div className="cn-question" role="group" aria-label={T.lieux.circuit(t.title)} data-question={t.slug}>
        <button type="button" className="bt-petitBouton" onClick={() => trancher(t, "ajouter")}>
          {selon(manque, C.ajouterEtapes)}
        </button>
        <button type="button" className="bt-puce" onClick={() => trancher(t, "remplacer")}>
          {selon(gardes.length, C.remplacer)}
        </button>
      </div>
    );
  };
  const blocRetablir = () =>
    retablir ? (
      <div className="cn-question">
        <button type="button" className="bt-puce" onClick={remettre}>
          {selon(retablir.avant.length, C.retablir)}
        </button>
      </div>
    ) : null;
  const ligneCircuit = (t: Circuit) => {
    const on = inclus(t);
    const r = recouvre(t);
    return (
      <li key={t.slug} className="cn-circuit">
        <button type="button" className={`cn-cbouton ${allumes.length && t.stops.every((s) => allumes.includes(s)) ? "cn-allume" : ""}`} data-circuit={t.slug} aria-pressed={on} onClick={() => surCircuit(t)} {...suivre({ circuit: t.slug })}>
          <span className="cn-cphoto">
            <Image src={t.image.src} alt="" fill sizes="56px" />
          </span>
          <span className="cn-ctexte">
            <span className="cn-ctitre">{t.title}</span>
            <span className="cn-cmeta">
              {t.tag}, {chemins.ready.steps(t.stops.length)}
            </span>
            {r && !on ? <span className="cn-crec">{remplir(C.recouvre, { a: r, n: t.stops.length })}</span> : null}
          </span>
          <span className={`cn-coche ${on ? "cn-on" : ""}`}>{on ? <Coche /> : <Plus />}</span>
        </button>
        {question === t.slug ? blocQuestion(t) : null}
        {retablir?.slug === t.slug ? blocRetablir() : null}
      </li>
    );
  };

  const nGardes = gardes.length;
  const etiquettes = fiches(gardes);
  const questionRecherche = n && question ? tours.find((t) => t.slug === question) : undefined;
  return (
    <dialog
      ref={boite}
      className="cn"
      aria-labelledby="cn-titre"
      data-vue={vue}
      data-lenis-prevent
      onKeyDown={clavier}
      onClose={(e) => {
        if (!e.currentTarget.open) onFermer(); // rouvert entre-temps (double montage en développement) : rien
      }}
      onClick={(e) => e.target === e.currentTarget && fermer()}
    >
      <div className="cn-boite">
        <div className="cn-tete">
          <h2 id="cn-titre" className="cn-titre" tabIndex={-1}>
            {T.lieux.trou.replace(/^./, (x) => x.toLocaleUpperCase())}
          </h2>
          <div className="cn-vues" role="group" aria-label={C.vues}>
            <button type="button" aria-pressed={vue === "liste"} onClick={() => setVue("liste")}>
              {C.liste}
            </button>
            <button type="button" aria-pressed={vue === "carte"} onClick={() => setVue("carte")}>
              {C.carte}
            </button>
          </div>
          <button type="button" className="cn-fermer" aria-label={T.fermer} onClick={fermer}>
            <Croix />
          </button>
        </div>

        <div className="cn-liste">
          <div className="cn-recherche">
            <label className="cn-champ">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16l4.5 4.5" />
              </svg>
              <span className="bt-sr">{C.chercher}</span>
              <input
                ref={champ}
                className="bt-saisie"
                type="text"
                role="combobox"
                aria-expanded={Boolean(n)}
                aria-controls="cn-resultats"
                aria-autocomplete="list"
                aria-activedescendant={n && actif >= 0 && options[actif] ? `cn-opt-${actif}` : undefined}
                enterKeyHint="search"
                autoComplete="off"
                placeholder={C.chercher}
                value={q}
                onChange={(e) => chercher(e.target.value)}
                onKeyDown={clavierChamp}
              />
              {q ? (
                <button type="button" className="cn-effacer" aria-label={chemins.ready.effacer} onClick={() => (chercher(""), champ.current?.focus())}>
                  <Croix />
                </button>
              ) : null}
            </label>
            {nGardes ? (
              <div ref={rangee} className="cn-etiquettes">
                {etiquettes.map((f) => (
                  <button key={f.id} type="button" className="cn-etiquette" data-etiquette aria-label={chemins.trip.remove(f.nom)} onClick={() => basculer(f.id)}>
                    <span className="cn-pastille">{vignette(f, 28)}</span>
                    <span className="cn-enom">{f.nom}</span>
                    <Croix />
                  </button>
                ))}
                <span className="cn-plus" data-plus hidden>
                  <span aria-hidden="true" />
                  <span className="bt-sr" />
                </span>
              </div>
            ) : null}
          </div>

          {auChargement ? <p className="cn-note">{C.accueil}</p> : null}

          {n ? (
            <>
              {questionRecherche ? (
                <div className="cn-qRecherche">
                  <p>{T.lieux.circuit(questionRecherche.title)}</p>
                  {blocQuestion(questionRecherche)}
                </div>
              ) : null}
              {retablir && !question ? blocRetablir() : null}
              {options.length ? (
                <div id="cn-resultats" role="listbox" aria-multiselectable="true" aria-label={C.chercher} className="cn-resultats">
                  {groupes.map((g) =>
                    g.liste.length ? (
                      <div key={g.titre} role="group" aria-label={g.titre} className="cn-groupe">
                        <p className="cn-gtitre" aria-hidden="true">
                          {g.titre} <small>{g.liste.length}</small>
                        </p>
                        {g.liste.map((o) => {
                          const i = options.indexOf(o);
                          const t = o.circuit, f = o.fiche;
                          const choisi = t ? inclus(t) : f ? gardes.includes(f.id) : false;
                          return (
                            <div
                              key={o.cle}
                              id={`cn-opt-${i}`}
                              role="option"
                              aria-selected={choisi}
                              className={`cn-option ${i === actif ? "cn-actif" : ""}`}
                              onPointerDown={(e) => e.preventDefault()}
                              onPointerMove={(e) => e.pointerType === "mouse" && i !== actif && setActif(i)} // vrai déplacement seulement : une liste qui se redessine sous la souris immobile ne vole pas la flèche
                              onClick={() => (setActif(i), choisirOption(o))}
                            >
                              <span className="cn-ovignette">{t ? <Image src={t.image.src} alt="" fill sizes="48px" /> : f ? vignette(f, 48) : null}</span>
                              <span className="cn-otexte">
                                <b>{t ? t.title : f?.nom}</b>
                                <small>{t ? `${t.tag}, ${chemins.ready.steps(t.stops.length)}` : f ? sousTitre(f) : ""}</small>
                              </span>
                              {t ? <span className={`cn-coche ${choisi ? "cn-on" : ""}`}>{choisi ? <Coche /> : <Plus />}</span> : f ? marque(f.id) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : null,
                  )}
                </div>
              ) : (
                <div className="cn-vide">
                  <p className="cn-videTitre">{remplir(C.aucun, { q: q.trim() })}</p>
                  <p className="cn-videAide">{chemins.ready.aucunAide}</p>
                  <div className="cn-videActions">
                    {ajoute === q.trim() ? (
                      <p className="cn-ajoute">{remplir(C.ajouteMessage, { q: q.trim() })}</p>
                    ) : (
                      <button type="button" className="bt-petitBouton" onClick={ajouterAuMessage}>
                        {remplir(C.ajouterMessage, { q: q.trim() })}
                      </button>
                    )}
                    <button type="button" className="bt-puce" onClick={() => (chercher(""), champ.current?.focus())}>
                      {chemins.ready.effacer}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="cn-filtres" role="radiogroup" aria-label={C.filtres}>
                {types.map((f, i) => (
                  <button key={f} type="button" role="radio" aria-checked={i === 0 ? tous : filtre === f} className="bt-puce" onClick={() => setFiltre(f)}>
                    {f}
                    {i ? <small>{lieuDe(f).length}</small> : null}
                  </button>
                ))}
              </div>
              {circuitsVus.length ? (
                <section className="cn-bloc" aria-labelledby="cn-h-circuits">
                  <h3 id="cn-h-circuits" className="cn-h">
                    {chemins.ready.label} <small>{circuitsVus.length}</small>
                  </h3>
                  <ul className="cn-circuits">{circuitsVus.map(ligneCircuit)}</ul>
                </section>
              ) : null}
              <section className="cn-bloc" aria-labelledby="cn-h-lieux">
                <h3 id="cn-h-lieux" className="cn-h">
                  {C.aVoir} <small>{lieuxVus.length}</small>
                </h3>
                <div className="cn-grille">
                  {lieuxVus.map((f) => (
                    <button key={f.id} type="button" className={`cn-lieu ${allumes.includes(f.id) ? "cn-allume" : ""}`} data-id={f.id} aria-pressed={gardes.includes(f.id)} onClick={() => basculer(f.id)} {...suivre({ id: f.id })}>
                      <span className={`cn-photo ${f.image ? "" : "cn-objet"}`}>
                        {vignette(f, 240)}
                        {marque(f.id)}
                      </span>
                      <span className="cn-nom">{f.nom}</span>
                      {sousTitre(f) ? <span className="cn-sous">{sousTitre(f)}</span> : null}
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>

        <div className="cn-carte">
          <CarteLieux
            lieux={proches}
            loin={lointains}
            points={points}
            gardes={gardes}
            traces={traces}
            allumes={allumes}
            onBasculer={basculer}
            onSurvol={(id) => setSurvol(id ? { id } : null)}
            textes={{ carte: chemins.mapLabel, ocean: C.ocean, source: C.source, loin: chemins.compose.far, km: kmTexte, echelle: nombre({ style: "unit", unit: "kilometer" }).format(1) }}
          />
        </div>

        <div className="cn-pied">
          <div className="cn-compte">
            <Palettes texte={String(nGardes)} taille="mini" />
            <span className="cn-cl">
              <b>{compte(nGardes)}</b>
              <span>{chemins.trip.saved}</span>
            </span>
          </div>
          {nGardes ? (
            <button type="button" className="bt-petitBouton" onClick={fermer}>
              {T.qui.valider}
            </button>
          ) : (
            <button type="button" className="bt-puce" onClick={() => (onConseil(), fermer())}>
              {T.lieux.conseil}
            </button>
          )}
        </div>
        <p className="bt-sr" aria-live="polite">
          {annonce}
        </p>
      </div>
    </dialog>
  );
}
