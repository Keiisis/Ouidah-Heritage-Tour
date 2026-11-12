"use client";

import { useFormatsSite } from "@/lib/formats-site";

import "maplibre-gl/dist/maplibre-gl.css";
import Image from "next/image";
import Link from "@/components/ui/LienPublic";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as CarteMapLibre, Marker } from "maplibre-gl";
import { adresseCircuit, adresseLieu, consentement as CONSENTEMENT, creditsPage as CREDITS_PAGE, FICHES_LIEU, places as PLACES, placesIntro as PLACES_INTRO, tours as TOURS } from "@/content/fr";
import { useContenu } from "@/components/ui/ContenuSite";
import route from "@/content/ouidah-route.json";
import { Icon } from "@/components/ui/Icon";
import { Objet3D } from "@/components/ui/Objet3D";
import { useMouvementReduit } from "@/lib/mouvement";
import { enregistrerChoix, useConsentement } from "@/lib/consentement";
import { attendreOuverture } from "@/lib/ouverture";

// Section 3 — Ouidah en quatre lieux. Un voile blanc porte le titre « Ouidah en 4 lieux. » : le chiffre géant est une
// fenêtre découpée sur la vraie carte. Au défilement, le chiffre s'ouvre jusqu'à remplir l'écran, la caméra plonge sur
// le fort portugais, puis suit en direct le trajet à pied (calculé sur les rues) jusqu'à la Porte du Non-Retour ;
// une fiche par lieu arrive en pile, un compteur donne les kilomètres parcourus. Fin : vue d'ensemble du chemin.

// Style « liberty » : rendu proche de Google Maps (eau, parcs, routes hiérarchisées, bâtiments, noms de rues, lieux).
const STYLE = "https://tiles.openfreemap.org/styles/liberty";
type Pt = [number, number];
type Vue = { center: Pt; zoom: number; pitch: number; bearing: number };

// Découpage de la course de défilement (0 → 1).
const OUVRE: Pt = [0.03, 0.15]; // le chiffre s'ouvre et devient la carte
const MARCHE: Pt = [0.17, 0.9]; // marche d'un lieu à l'autre
const RETOUR: Pt = [0.92, 1]; // vue d'ensemble finale
const ARRET = 0.6; // arrêt sur chaque lieu, en part d'une étape de marche
const ZOOMS = [16.2, 16, 15.3, 15.6];
const PENTE = 52;
const CAP: Pt = [-18, 22];

const ligne = route.geometry.coordinates as Pt[];
const metres = (a: Pt, b: Pt) => {
  const r = Math.PI / 180;
  const x = (b[0] - a[0]) * r * Math.cos(((a[1] + b[1]) / 2) * r);
  const y = (b[1] - a[1]) * r;
  return Math.sqrt(x * x + y * y) * 6371000;
};
const cumul = ligne.reduce<number[]>((acc, p, i) => [...acc, i === 0 ? 0 : acc[i - 1] + metres(ligne[i - 1], p)], []);
const total = cumul[cumul.length - 1];
const bornes = ligne.reduce<[Pt, Pt]>(
  ([min, max], [x, y]) => [
    [Math.min(min[0], x), Math.min(min[1], y)],
    [Math.max(max[0], x), Math.max(max[1], y)],
  ],
  [ligne[0], ligne[0]],
);

// Portion du trajet parcourue jusqu'à `d` mètres.
const troncon = (d: number): Pt[] => {
  if (d >= total) return ligne;
  const out: Pt[] = [ligne[0]];
  for (let i = 1; i < ligne.length; i++) {
    if (cumul[i] <= d) {
      out.push(ligne[i]);
      continue;
    }
    const t = (d - cumul[i - 1]) / (cumul[i] - cumul[i - 1]);
    out.push([ligne[i - 1][0] + (ligne[i][0] - ligne[i - 1][0]) * t, ligne[i - 1][1] + (ligne[i][1] - ligne[i - 1][1]) * t]);
    break;
  }
  return out.length > 1 ? out : [ligne[0], ligne[0]];
};
const enLigne = (coords: Pt[]) => ({ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: coords } });
const tete = (d: number) => troncon(d).at(-1) ?? ligne[0];

const borne = (x: number) => Math.min(1, Math.max(0, x));
const phase = (p: number, [a, b]: Pt) => borne((p - a) / (b - a));
const ease = (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const melange = (a: Vue, b: Vue, t: number): Vue => ({
  center: [mix(a.center[0], b.center[0], t), mix(a.center[1], b.center[1], t)],
  zoom: mix(a.zoom, b.zoom, t),
  pitch: mix(a.pitch, b.pitch, t),
  bearing: mix(a.bearing, b.bearing, t),
});
// Marche d'après les lieux lus (fr.places).
function marcheDe(places: typeof PLACES) {
  // Distance le long du trajet de chaque lieu ; recherche vers l'avant, le trajet repasse parfois par les mêmes rues.
  const repere: number[] = [];
  places.reduce((depuis, p) => {
    const cible: Pt = [p.coords[1], p.coords[0]];
    let k = depuis;
    for (let i = depuis; i < ligne.length; i++) if (metres(ligne[i], cible) < metres(ligne[k], cible)) k = i;
    repere.push(cumul[k]);
    return k;
  }, 0);
  // Position (0 → 3, en lieux) le long de la marche : arrêt sur chaque lieu, puis marche jusqu'au suivant.
  const position = (u: number) => {
    let t = u * (places.length * ARRET + places.length - 1);
    for (let k = 0; k < places.length - 1; k++) {
      if (t <= ARRET) return k;
      t -= ARRET;
      if (t <= 1) return k + ease(t);
      t -= 1;
    }
    return places.length - 1;
  };
  const distance = (pos: number) => {
    const k = Math.min(places.length - 2, Math.floor(pos));
    return repere[k] + (repere[k + 1] - repere[k]) * (pos - k);
  };
  // Caméra pendant la marche : elle suit la tête du trajet, prend du recul entre deux lieux et tourne doucement.
  const enMarche = (pos: number): Vue => {
    const k = Math.min(places.length - 2, Math.floor(pos));
    const t = pos - k;
    const d = distance(pos);
    return { center: tete(d), zoom: mix(ZOOMS[k], ZOOMS[k + 1], t) - 0.8 * Math.sin(Math.PI * t), pitch: PENTE, bearing: mix(CAP[0], CAP[1], d / total) };
  };
  return { repere, position, distance, enMarche };
}

const EASE_FICHE = [0.22, 1, 0.36, 1] as const;
export function PlacesMap() {
  const { nombre } = useFormatsSite();
  const km = useCallback((m: number) => nombre({ minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(m / 1000), [nombre]);
  const placesPubliees = useContenu("fr.places", PLACES);
  const fiches = useContenu("fr.FICHES_LIEU", FICHES_LIEU);
  const tours = useContenu("fr.tours", TOURS);
  // lien du lieu : sa fiche ; sans fiche lieu, la fiche du circuit qui porte ce nom (La Route des Esclaves)
  const places = useMemo(
    () => placesPubliees.map((p) => ({ ...p, href: !p.href || p.href.startsWith("/ouidah/lieux/") ? (adresseLieu(p.slug, fiches) ?? (tours.some((t) => t.slug === p.slug) ? adresseCircuit(p.slug, tours) : null)) : p.href })),
    [placesPubliees, fiches, tours],
  );
  const placesIntro = useContenu("fr.placesIntro", PLACES_INTRO);
  const consentement = useContenu("fr.consentement", CONSENTEMENT);
  const creditsPage = useContenu("fr.creditsPage", CREDITS_PAGE);
  const marche = useMemo(() => marcheDe(places), [places]);
  const zone = useRef<HTMLElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const boite = useRef<HTMLDivElement>(null);
  const voile = useRef<SVGSVGElement>(null);
  const groupe = useRef<SVGGElement>(null);
  const chiffre = useRef<SVGTextElement>(null);
  const trou = useRef<HTMLSpanElement>(null);
  const mots = useRef<HTMLDivElement>(null);
  const compteur = useRef<HTMLSpanElement>(null);
  const [etape, setEtape] = useState(-1);
  const [secours, setSecours] = useState(false); // 3D refusée par le navigateur : plan fixe à la place de la carte
  // fonds de carte d'OpenFreeMap (adresse IP du visiteur) : seulement après l'accord « cartes » du bandeau
  const choix = useConsentement();
  const cartesOk = choix?.cartes === true, sansAccord = choix !== undefined && !cartesOk;
  const reduit = useMouvementReduit();
  // la carte est créée une seule fois ; le mouvement réduit est lu à chaque image, sans recréer le contexte graphique
  const reduitRef = useRef(reduit);
  const majRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    reduitRef.current = reduit;
    majRef.current?.();
  }, [reduit]);
  // de même, les lieux et le chiffre du titre sont lus par la carte sans la recréer
  const signe = placesIntro.titleParts.number;
  const lus = useRef({ places, marche, signe });
  useEffect(() => {
    lus.current = { places, marche, signe };
    majRef.current?.();
  }, [places, marche, signe]);

  useEffect(() => {
    let annule = false;
    let m: CarteMapLibre | null = null;
    let comete: Marker | null = null;
    let reperes: HTMLElement[] = [];
    let pret = false;
    let echelle = 80;
    let depart: Vue | null = null;
    let ensemble: Vue | null = null;

    // Place le chiffre du masque exactement dans l'espace réservé du titre et cherche le cœur de son trait le plus
    // épais : c'est l'origine de l'ouverture, pour que la fenêtre finisse par couvrir tout l'écran.
    const poserChiffre = () => {
      const b = scene.current?.getBoundingClientRect();
      const t = trou.current?.getBoundingClientRect();
      const txt = chiffre.current;
      if (!b || !t || !txt || !voile.current || !groupe.current || t.height === 0) return;
      const W = Math.ceil(b.width);
      const H = Math.ceil(b.height);
      const cx = Object.assign(document.createElement("canvas"), { width: W, height: H }).getContext("2d", { willReadFrequently: true });
      if (!cx) return;
      const famille = getComputedStyle(txt).fontFamily;
      const { signe } = lus.current;
      cx.font = `800 100px ${famille}`;
      const fs = t.height / (cx.measureText(signe).actualBoundingBoxAscent / 100);
      const x = t.left - b.left + t.width / 2;
      const y = t.bottom - b.top;
      voile.current.setAttribute("viewBox", `0 0 ${W} ${H}`);
      txt.setAttribute("x", String(x));
      txt.setAttribute("y", String(y));
      txt.setAttribute("font-size", String(fs));
      cx.font = `800 ${fs}px ${famille}`;
      cx.textAlign = "center";
      cx.fillText(signe, x, y);
      const px = cx.getImageData(0, 0, W, H).data;
      const plein = (i: number, j: number) => i >= 0 && i < W && j >= 0 && j < H && px[(j * W + i) * 4 + 3] > 128;
      let best = 1;
      let o: Pt = [x, y - t.height / 2];
      for (let j = Math.max(0, Math.floor(t.top - b.top - t.height * 0.1)); j < Math.min(H, y + t.height * 0.1); j += 4)
        for (let i = Math.max(0, Math.floor(x - t.width)); i < Math.min(W, x + t.width); i += 4) {
          let n = 0;
          while (n < 600 && plein(i + n, j) && plein(i - n, j) && plein(i, j + n) && plein(i, j - n)) n++;
          if (n > best) {
            best = n;
            o = [i, j];
          }
        }
      groupe.current.style.transformOrigin = `${o[0]}px ${o[1]}px`;
      echelle = (1.15 * Math.max(Math.hypot(o[0], o[1]), Math.hypot(W - o[0], o[1]), Math.hypot(o[0], H - o[1]), Math.hypot(W - o[0], H - o[1]))) / best;
    };

    // Cadrages de la vue de départ (le chemin entier dans le chiffre) et de la vue d'ensemble finale.
    const cadrer = () => {
      poserChiffre();
      if (m && pret) {
        const W = m.getContainer().clientWidth;
        const H = m.getContainer().clientHeight;
        const large = W >= 1024;
        const vue = (padding: { top: number; bottom: number; left: number; right: number }, pitch: number): Vue | null => {
          const c = m?.cameraForBounds(bornes, { padding });
          if (!c?.center || c.zoom === undefined) return null;
          const centre = c.center as { lng: number; lat: number };
          return { center: [centre.lng, centre.lat], zoom: c.zoom, pitch, bearing: 0 };
        };
        depart = vue({ top: H * 0.27, bottom: H * 0.27, left: W * 0.3, right: W * 0.3 }, 0);
        ensemble = vue(large ? { top: H * 0.16, bottom: H * 0.12, left: W * 0.08, right: W * 0.42 } : { top: H * 0.24, bottom: H * 0.36, left: W * 0.12, right: W * 0.12 }, 15);
      }
      maj();
    };

    // Tout se joue sur la position mesurée en direct de la section (la page peut s'allonger au chargement).
    const maj = () => {
      const s = zone.current;
      if (!s) return;
      const reduit = reduitRef.current;
      const { repere, position, distance, enMarche } = lus.current.marche;
      const r = s.getBoundingClientRect();
      const p = borne(-r.top / Math.max(1, r.height - window.innerHeight));
      const e = reduit ? 1 : phase(p, OUVRE);
      if (voile.current && groupe.current) {
        groupe.current.style.transform = `scale(${1 + (echelle - 1) * e ** 2.2})`;
        voile.current.style.visibility = e >= 1 ? "hidden" : "visible";
      }
      // le titre s'efface à l'opacité seule (un flou le rendait illisible pendant toute l'ouverture du chiffre)
      if (mots.current) mots.current.style.opacity = String(borne(1 - e * 2.5));
      const pos = reduit ? Math.round(position(phase(p, [0.05, 0.95]))) : position(phase(p, MARCHE));
      const f = reduit ? 0 : ease(phase(p, RETOUR));
      const k = e < 1 ? -1 : Math.floor(pos + 1e-3);
      const d = reduit ? repere[pos] : distance(pos);
      setEtape(k);
      if (compteur.current) compteur.current.textContent = km(d);
      if (!m || !pret || !depart || !ensemble) return;
      const v = reduit ? ensemble : p < MARCHE[0] ? melange(depart, enMarche(0), ease(e)) : f > 0 ? melange(enMarche(pos), ensemble, f) : enMarche(pos);
      m.jumpTo(v);
      (m.getSource("trajet-fait") as GeoJSONSource | undefined)?.setData(enLigne(troncon(reduit ? total : d)));
      comete?.setLngLat(tete(d));
      comete?.getElement().style.setProperty("opacity", !reduit && e >= 1 && f < 1 ? "1" : "0");
      reperes.forEach((el, i) => el.classList.toggle("is-actif", f > 0.5 || i === k));
    };

    window.addEventListener("scroll", maj, { passive: true });
    window.addEventListener("resize", cadrer);
    document.fonts.ready.then(() => !annule && cadrer());
    majRef.current = maj;
    maj();

    (async () => {
      if (!cartesOk) return; // sans accord : le plan fixe reste affiché
      await attendreOuverture(); // pas pendant l'ouverture : elle garde toutes les images
      const ml = await import("maplibre-gl");
      if (annule || !boite.current) return;
      ml.setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
      const css = getComputedStyle(document.documentElement);
      const jeton = (n: string) => css.getPropertyValue(n).trim();
      try {
        m = new ml.Map({
          container: boite.current,
          style: STYLE,
          bounds: bornes,
          attributionControl: { compact: true },
          interactive: false,
        });
      } catch {
        // contexte graphique impossible à créer (3D bloquée, pilote) : le titre, les fiches et le compteur restent
        return setSecours(true);
      }
      m.on("webglcontextlost", () => setSecours(true));
      m.on("webglcontextrestored", () => setSecours(false));
      m.on("load", () => {
        if (!m) return;
        m.addSource("trajet-complet", { type: "geojson", data: enLigne(ligne) });
        m.addSource("trajet-fait", { type: "geojson", data: enLigne(troncon(0)) });
        m.addLayer({ id: "trajet-complet", type: "line", source: "trajet-complet", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": jeton("--surface-abyss"), "line-opacity": 0.45, "line-width": 4, "line-dasharray": [1, 1.5] } });
        m.addLayer({ id: "trajet-bord", type: "line", source: "trajet-fait", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 11 } });
        m.addLayer({ id: "trajet-fait", type: "line", source: "trajet-fait", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": jeton("--surface-abyss"), "line-width": 6 } });
        reperes = lus.current.places.map((p) => {
          const el = document.createElement("div");
          el.className = "oht-repere";
          el.setAttribute("aria-hidden", "true");
          el.innerHTML = `<span style="background-image:url('${p.image.src}')"></span><b>${Number(p.n)}</b>`;
          new ml.Marker({ element: el }).setLngLat([p.coords[1], p.coords[0]]).addTo(m as CarteMapLibre);
          return el;
        });
        const point = document.createElement("div");
        point.className = "oht-comete";
        point.setAttribute("aria-hidden", "true");
        point.style.opacity = "0";
        point.style.transition = "opacity 400ms";
        comete = new ml.Marker({ element: point }).setLngLat(ligne[0]).addTo(m);
        // mention des sources (obligatoire, licence OpenStreetMap) : visible 5 s au chargement, puis repliée en icône « i » qui se déplie au clic
        setTimeout(() => boite.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"), 5000);
        pret = true;
        cadrer();
      });
    })();

    return () => {
      annule = true;
      majRef.current = null;
      window.removeEventListener("scroll", maj);
      window.removeEventListener("resize", cadrer);
      m?.remove();
    };
  }, [cartesOk, km]);

  const t = placesIntro.titleParts;
  const reveler = (k: number) => ({
    initial: { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.6 },
    transition: { duration: 1, ease: EASE_FICHE, delay: k * 0.18 },
  });

  return (
    <section ref={zone} id="lieux" aria-labelledby="lieux-titre" className="relative z-[2] h-[600svh] bg-white text-abyss">
      <div ref={scene} className="sticky top-0 h-[100svh] overflow-hidden bg-sand">
        <div role="img" aria-label={placesIntro.mapLabel} className="absolute inset-0">
          <div ref={boite} className="size-full" />
          {secours || sansAccord ? (
            <>
              <Image src="/ouidah/carte-secours-large.webp" alt="" fill sizes="100vw" className="hidden object-cover lg:block" />
              <Image src="/ouidah/carte-secours-etroit.webp" alt="" fill sizes="100vw" className="object-cover lg:hidden" />
              <span className="absolute right-2 bottom-1 text-[10px] text-abyss/60">{creditsPage.carteSource}</span>
            </>
          ) : null}
        </div>
        {sansAccord ? (
          <button type="button" className="absolute right-4 bottom-4 z-[4] min-h-11 cursor-pointer rounded-full bg-abyss px-5 text-sm font-bold text-white shadow-[0_12px_24px_-12px_rgb(2_4_12/0.6)] hover:bg-ocean" onClick={() => enregistrerChoix({ cartes: true, ville: choix?.ville ?? false, mesure: choix?.mesure ?? false })}>
            {consentement.afficherCarte}
          </button>
        ) : null}

        {reduit ? (
          <div className="absolute top-20 right-4 left-4 z-[6] rounded-[26px] bg-white p-6 lg:top-28 lg:right-auto lg:left-16 lg:max-w-md lg:p-9">
            <h2 id="lieux-titre" className="font-display text-[32px] leading-[1.08] font-semibold lg:text-[46px]">
              {placesIntro.title}
            </h2>
            <p className="mt-4 text-base leading-[1.6] text-abyss/70">{placesIntro.intro}</p>
          </div>
        ) : (
          <>
            {/* voile blanc percé du chiffre : on voit la carte à travers */}
            <svg ref={voile} aria-hidden="true" className="pointer-events-none absolute inset-0 z-[5] size-full">
              <defs>
                <mask id="oht-masque-chiffre">
                  <rect width="100%" height="100%" fill="#fff" />
                  <g ref={groupe}>
                    <text ref={chiffre} textAnchor="middle" fill="#000" fontWeight={800} className="font-text">
                      {t.number}
                    </text>
                  </g>
                </mask>
              </defs>
              <rect width="100%" height="100%" className="fill-white" mask="url(#oht-masque-chiffre)" />
            </svg>
            <div ref={mots} className="pointer-events-none absolute inset-0 z-[6]">
              <h2 id="lieux-titre" className="absolute inset-0 flex flex-col items-center justify-center gap-4 font-display text-[44px] leading-none font-semibold tracking-[-0.015em] whitespace-nowrap lg:flex-row lg:gap-12 lg:text-[92px]">
                <motion.span {...reveler(0)}>{t.before}</motion.span>
                <span ref={trou} className="block aspect-[0.72] h-[36svh] lg:h-[60svh]">
                  <span className="sr-only">{t.spoken}</span>
                </span>
                <motion.span {...reveler(1)}>{t.after}</motion.span>
              </h2>
              <p className="absolute right-4 bottom-10 left-4 max-w-sm text-base leading-[1.6] text-abyss/70 sm:left-6 lg:bottom-16 lg:left-24">{placesIntro.intro}</p>
            </div>

            {/* repère de progression : numéro du lieu et kilomètres parcourus */}
            <motion.div
              initial={false}
              animate={{ opacity: etape >= 0 ? 1 : 0, y: etape >= 0 ? 0 : 20 }}
              transition={{ duration: 0.8, ease: EASE_FICHE }}
              className="absolute top-20 left-4 z-[7] flex items-end gap-4 rounded-[22px] bg-white/90 px-5 py-4 backdrop-blur-md lg:top-auto lg:bottom-16 lg:left-16 lg:px-6"
            >
              <span className="font-display text-[44px] leading-[0.85] font-semibold tabular-nums lg:text-[56px]">{places[Math.max(0, etape)].n}</span>
              <span className="text-[13px] leading-normal font-bold">
                <span ref={compteur}>0,0</span> {placesIntro.walked}
                <br />
                <span className="text-abyss/60">{placesIntro.of(km(total))}</span>
              </span>
            </motion.div>
          </>
        )}

        {/* une fiche par lieu, qui arrive en pile au fil de la marche */}
        <div className="absolute right-4 bottom-4 left-4 z-[7] grid sm:left-auto sm:w-[440px] lg:right-16 lg:bottom-16 lg:w-[480px]">
          {places.map((p, i) => {
            const d = etape - i;
            const vu = etape >= 0 && d >= 0;
            return (
              <motion.article
                key={p.n}
                inert={i !== etape}
                aria-hidden={i !== etape}
                initial={false}
                animate={vu ? { x: 0, y: -18 * d, scale: 1 - 0.06 * d, rotate: 0, opacity: Math.max(0, 1 - 0.4 * d) } : { x: "130%", y: 0, scale: 1, rotate: 5, opacity: 1 }}
                transition={{ duration: 0.9, ease: EASE_FICHE }}
                style={{ zIndex: 10 - Math.abs(d), visibility: d >= 3 ? "hidden" : "visible" }}
                className="grid grid-cols-[96px_minmax(0,1fr)] self-end overflow-hidden rounded-[24px] bg-surface shadow-[0_30px_60px_-24px_color-mix(in_oklab,var(--surface-abyss)_55%,transparent)] [grid-area:1/1] lg:grid-cols-[150px_minmax(0,1fr)]"
              >
                <div className="relative">
                  <Image src={p.image.src} alt={p.image.alt} fill sizes="150px" className="object-cover" />
                </div>
                <div className="relative p-5 lg:px-7 lg:py-6">
                  <span className="absolute top-3 right-3"><Objet3D nom="destination" taille={36} /></span>
                  <p className="pr-10 text-xs font-bold text-abyss/70">
                    {p.n} · {p.kicker}
                  </p>
                  <h3 className="mt-2 pr-8 font-display text-[22px] leading-[1.1] font-semibold lg:text-[26px]">{p.name}</h3>
                  <p className="mt-2 line-clamp-3 text-[13.5px] leading-[1.55] text-abyss/75 lg:line-clamp-none lg:text-sm">{p.text}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-bold">
                    {p.next ? (
                      <span className="flex items-center gap-1.5">
                        <Objet3D nom="a-pied" taille={24} className="-my-1" />
                        {p.next}
                      </span>
                    ) : null}
                    {p.href ? (
                      <Link href={p.href} className="relative inline-flex min-h-7 items-center gap-1 underline-offset-4 before:absolute before:-inset-x-2 before:-inset-y-2 hover:underline focus-visible:outline-sun">
                        {placesIntro.link}
                        <Icon name="arrow-right" className="size-4" />
                      </Link>
                    ) : null}
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
