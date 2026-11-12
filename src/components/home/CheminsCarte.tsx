"use client";

import { useFormatsSite } from "@/lib/formats-site";

import "maplibre-gl/dist/maplibre-gl.css";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as CarteMapLibre, Marker } from "maplibre-gl";
import { cheminsIntro as CHEMINS_INTRO, consentement as CONSENTEMENT, creditsPage as CREDITS_PAGE } from "@/content/fr";
import { useContenu } from "@/components/ui/ContenuSite";
import { enregistrerChoix, useConsentement } from "@/lib/consentement";
import type { Destination, LieuReleve } from "@/content/types";
import { distanceKm } from "@/lib/soleil";
import { attendreOuverture } from "@/lib/ouverture";

// Carte des lieux (OpenFreeMap, style « liberty », comme la carte de la section 3). En mode « composer » : les lieux
// à voir (repères photo), tout le relevé (hôtels, restaurants, services… en points de couleur, regroupés quand on
// dézoome), le lieu proposé, les lieux gardés reliés. En mode « circuits prêts » : le circuit choisi et son tracé.
const STYLE = "https://tiles.openfreemap.org/styles/liberty";
type Pt = [number, number];
const ll = (d: { coords: [number, number] }): Pt => [d.coords[1], d.coords[0]];
const ligne = (coords: Pt[]) => ({ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: coords.length > 1 ? coords : [] } });
const points = (liste: LieuReleve[], couleur: Record<string, string>) => ({
  type: "FeatureCollection" as const,
  features: liste.map((l) => ({ type: "Feature" as const, properties: { id: `r:${l.slug}`, nom: l.nom, couleur: couleur[l.categorie] ?? "#5b6478", fort: l.categorie === "a-voir" ? 1 : 0 }, geometry: { type: "Point" as const, coordinates: ll(l) } })),
});
export const idReleve = (l: LieuReleve) => `r:${l.slug}`;

export type Vue = { mode: "composer"; gardes: string[]; ici: string | null } | { mode: "prets"; etapes: string[]; trace: Pt[] | null };

type Props = {
  lieux: Destination[];
  releve: LieuReleve[] | null;
  categoriesActives: Set<string>;
  couleur: Record<string, string>;
  vue: Vue;
  choisi: string | null;
  large: boolean;
  reduit: boolean;
  onAller: (slug: string) => void;
  onChoisir: (id: string) => void;
};

export function CheminsCarte({ lieux, releve, categoriesActives, couleur, vue, choisi, large, reduit, onAller, onChoisir }: Props) {
  const { nombre } = useFormatsSite();
  const T = useContenu("fr.cheminsIntro", CHEMINS_INTRO);
  const consentement = useContenu("fr.consentement", CONSENTEMENT);
  const creditsPage = useContenu("fr.creditsPage", CREDITS_PAGE);
  const boite = useRef<HTMLDivElement>(null);
  const carte = useRef<CarteMapLibre | null>(null);
  const reperes = useRef(new Map<string, { m: Marker; el: HTMLDivElement }>());
  const [prete, setPrete] = useState(false);
  const [loin, setLoin] = useState<{ d: Destination; km: number }[]>([]);
  const [secours, setSecours] = useState(false); // 3D refusée par le navigateur : plan fixe, la liste des lieux reste
  // fonds de carte d'OpenFreeMap (adresse IP du visiteur) : seulement après l'accord « cartes » du bandeau
  const choix = useConsentement();
  const cartesOk = choix?.cartes === true, sansAccord = choix !== undefined && !cartesOk;
  const vueRef = useRef(vue);
  const rappels = useRef({ onAller, onChoisir });
  const reduitRef = useRef(reduit);
  useEffect(() => {
    vueRef.current = vue;
    rappels.current = { onAller, onChoisir };
    reduitRef.current = reduit;
  }, [vue, onAller, onChoisir, reduit]);

  // création de la carte, des calques du relevé et des repères des lieux à voir
  useEffect(() => {
    let annule = false;
    (async () => {
      if (!cartesOk) return; // sans accord : le plan fixe reste affiché
      await attendreOuverture(); // pas pendant l'ouverture : elle garde toutes les images
      const ml = await import("maplibre-gl");
      if (annule || !boite.current) return;
      ml.setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
      let m: CarteMapLibre;
      try {
        m = new ml.Map({
          container: boite.current,
          style: STYLE,
          center: [2.09, 6.345],
          zoom: 13,
          attributionControl: { compact: true },
          cooperativeGestures: true, // la page continue de défiler : zoom au Ctrl + molette, déplacement à deux doigts
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          locale: T.mapLocale,
        });
      } catch {
        return setSecours(true); // contexte graphique impossible à créer (3D bloquée, pilote)
      }
      m.on("webglcontextlost", () => setSecours(true));
      m.on("webglcontextrestored", () => setSecours(false));
      m.touchZoomRotate.disableRotation();
      m.addControl(new ml.NavigationControl({ showCompass: false }), "bottom-left");
      carte.current = m;
      m.on("load", () => {
        const css = getComputedStyle(document.documentElement);
        const jeton = (n: string) => css.getPropertyValue(n).trim();
        const abyss = jeton("--surface-abyss"), sun = jeton("--accent-sun");
        m.addSource("chemin", { type: "geojson", data: ligne([]) });
        m.addLayer({ id: "chemin-bord", type: "line", source: "chemin", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 10, "line-opacity": ["case", ["==", ["get", "plein"], true], 1, 0] } });
        m.addLayer({ id: "chemin-plein", type: "line", source: "chemin", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": abyss, "line-width": 5, "line-opacity": ["case", ["==", ["get", "plein"], true], 1, 0] } });
        m.addLayer({ id: "chemin-garde", type: "line", source: "chemin", layout: { "line-cap": "round" }, paint: { "line-color": sun, "line-width": 4, "line-dasharray": [1.2, 1.6], "line-opacity": ["case", ["==", ["get", "plein"], true], 0, 1] } });
        // relevé : regroupé en pastilles numérotées quand on dézoome (plus de deux cents lieux)
        m.addSource("releve", { type: "geojson", data: points([], couleur), cluster: true, clusterRadius: 38, clusterMaxZoom: 14 });
        m.addLayer({ id: "releve-grp", type: "circle", source: "releve", filter: ["has", "point_count"], paint: { "circle-color": "#ffffff", "circle-stroke-color": abyss, "circle-stroke-width": 2, "circle-radius": ["step", ["get", "point_count"], 13, 10, 16, 30, 21] } });
        m.addLayer({ id: "releve-grp-n", type: "symbol", source: "releve", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-allow-overlap": true }, paint: { "text-color": abyss } });
        m.addLayer({ id: "releve-pt", type: "circle", source: "releve", filter: ["!", ["has", "point_count"]], paint: { "circle-color": ["get", "couleur"], "circle-radius": ["case", ["==", ["get", "fort"], 1], 7, 5.5], "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
        m.addSource("releve-gardes", { type: "geojson", data: points([], couleur) });
        m.addLayer({ id: "releve-garde", type: "circle", source: "releve-gardes", paint: { "circle-color": ["get", "couleur"], "circle-radius": 8, "circle-stroke-color": sun, "circle-stroke-width": 3 } });
        m.addLayer({ id: "releve-garde-nom", type: "symbol", source: "releve-gardes", layout: { "text-field": ["get", "nom"], "text-font": ["Noto Sans Bold"], "text-size": 11, "text-offset": [0, 1.2], "text-anchor": "top" }, paint: { "text-color": abyss, "text-halo-color": "#ffffff", "text-halo-width": 1.6 } });
        m.addSource("releve-choisi", { type: "geojson", data: points([], couleur) });
        m.addLayer({ id: "releve-choisi", type: "circle", source: "releve-choisi", paint: { "circle-color": "rgba(0,0,0,0)", "circle-radius": 14, "circle-stroke-color": sun, "circle-stroke-width": 3 } });

        m.on("click", "releve-grp", async (e) => {
          const f = e.features?.[0];
          const id = f?.properties?.cluster_id as number | undefined;
          if (id === undefined || f?.geometry.type !== "Point") return;
          const z = await (m.getSource("releve") as GeoJSONSource).getClusterExpansionZoom(id);
          m.easeTo({ center: f.geometry.coordinates as Pt, zoom: z + 0.2, duration: reduitRef.current ? 0 : 700 });
        });
        for (const couche of ["releve-pt", "releve-garde"]) {
          m.on("click", couche, (e) => {
            const id = e.features?.[0]?.properties?.id as string | undefined;
            if (id) rappels.current.onChoisir(id);
          });
          m.on("mouseenter", couche, () => (m.getCanvas().style.cursor = "pointer"));
          m.on("mouseleave", couche, () => (m.getCanvas().style.cursor = ""));
        }
        m.on("mouseenter", "releve-grp", () => (m.getCanvas().style.cursor = "zoom-in"));
        m.on("mouseleave", "releve-grp", () => (m.getCanvas().style.cursor = ""));

        for (const d of lieux) {
          const el = document.createElement("div");
          el.className = "oht-lieu";
          el.innerHTML = d.image ? `<span class="oht-lieu-photo" style="background-image:url('${d.image.src}')"><b></b></span><span class="oht-lieu-nom">${d.name}</span>` : `<span class="oht-lieu-point"><b></b></span><span class="oht-lieu-nom">${d.name}</span>`;
          el.addEventListener("click", () => rappels.current.onAller(d.slug));
          reperes.current.set(d.slug, { el, m: new ml.Marker({ element: el, anchor: "left", offset: [d.image ? -22 : -7, 0] }).setLngLat(ll(d)).addTo(m) });
        }
        setTimeout(() => boite.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"), 5000);
        m.on("moveend", () => {
          majLoin();
          // près du bord droit, le nom passe à gauche du repère pour ne pas être coupé
          const larg = m.getContainer().clientWidth;
          for (const [slug, { el }] of reperes.current) {
            const d = lieux.find((x) => x.slug === slug);
            if (d) el.classList.toggle("is-gauche", m.project(ll(d)).x > larg - 200);
          }
        });
        setPrete(true);
      });
    })();
    const majLoin = () => {
      const m = carte.current, v = vueRef.current;
      if (!m || v.mode !== "composer") return setLoin([]);
      const b = m.getBounds(), c = m.getCenter().toArray() as Pt;
      setLoin(lieux.filter((d) => !b.contains(ll(d))).map((d) => ({ d, km: distanceKm(c, ll(d)) })).sort((a, z) => a.km - z.km).slice(0, 3));
    };
    const r = reperes.current;
    return () => {
      annule = true;
      carte.current?.remove();
      carte.current = null;
      r.clear();
    };
  }, [lieux, couleur, cartesOk, T.mapLocale]);

  // position d'un lieu, qu'il vienne des lieux à voir ou du relevé
  const position = useCallback(
    (id: string): Pt | null => {
      if (id.startsWith("r:")) {
        const l = releve?.find((x) => idReleve(x) === id);
        return l ? ll(l) : null;
      }
      const d = lieux.find((x) => x.slug === id);
      return d ? ll(d) : null;
    },
    [releve, lieux],
  );
  const positionRef = useRef(position);
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  // repères, relevé affiché et tracé suivent la vue et les filtres
  useEffect(() => {
    const m = carte.current;
    if (!m || !prete) return;
    const composer = vue.mode === "composer";
    const ordre = composer ? vue.gardes : vue.etapes;
    for (const [slug, { el }] of reperes.current) {
      const rang = ordre.indexOf(slug);
      const ici = composer && vue.ici === slug;
      el.classList.toggle("is-garde", rang >= 0);
      el.classList.toggle("is-ici", ici);
      el.classList.toggle("is-cache", !composer && rang < 0);
      el.classList.toggle("is-nomme", rang >= 0 || ici);
      const b = el.querySelector("b");
      if (b) b.textContent = rang >= 0 ? String(rang + 1) : "";
    }
    const libres = composer && releve ? releve.filter((l) => !l.destination && categoriesActives.has(l.categorie) && !vue.gardes.includes(idReleve(l))) : [];
    const gardes = composer && releve ? releve.filter((l) => !l.destination && vue.gardes.includes(idReleve(l))) : [];
    (m.getSource("releve") as GeoJSONSource | undefined)?.setData(points(libres, couleur));
    (m.getSource("releve-gardes") as GeoJSONSource | undefined)?.setData(points(gardes, couleur));
    const pts = ordre.map(position).filter((p): p is Pt => !!p);
    const src = m.getSource("chemin") as GeoJSONSource | undefined;
    if (!composer) src?.setData({ ...ligne(vue.trace ?? pts), properties: { plein: true } });
    else {
      const ici = vue.ici ? position(vue.ici) : null;
      src?.setData(ligne(ici ? [...pts, ici] : pts));
    }
  }, [vue, prete, releve, categoriesActives, couleur, position]);

  // cadrage : seulement quand le lieu proposé ou le circuit change (garder un hôtel ne déplace pas la carte)
  const cle = vue.mode === "composer" ? `c:${vue.ici ?? vue.gardes.join(",")}` : `p:${vue.etapes.join(",")}`;
  useEffect(() => {
    const m = carte.current;
    if (!m || !prete) return;
    const v = vueRef.current;
    const pos = positionRef.current;
    const ici = v.mode === "composer" && v.ici ? pos(v.ici) : null;
    const cadre = ici ? [ici] : (v.mode === "composer" ? v.gardes : v.etapes).map(pos).filter((p): p is Pt => !!p);
    if (!cadre.length) return;
    // la marge d'un flyTo reste mémorisée par la carte : on la remet à zéro avant chaque cadrage
    m.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    const marge = large ? { top: 90, bottom: 70, left: 70, right: v.mode === "composer" ? 360 : 90 } : { top: 60, bottom: 40, left: 40, right: 40 };
    if (cadre.length === 1) {
      const vers = { center: cadre[0], zoom: large ? 14.6 : 14, padding: marge };
      if (reduit) m.jumpTo(vers);
      else m.flyTo({ ...vers, duration: 1400 });
    } else {
      const lo = cadre.map((p) => p[0]), la = cadre.map((p) => p[1]);
      m.fitBounds([[Math.min(...lo), Math.min(...la)], [Math.max(...lo), Math.max(...la)]], { padding: marge, maxZoom: 14.6, duration: reduit ? 0 : 1400 });
    }
  }, [cle, prete, large, reduit]); // recadrer seulement quand le lieu proposé ou le circuit change

  // lieu du relevé choisi (carte ou liste) : anneau soleil, et la carte s'en approche
  useEffect(() => {
    const m = carte.current;
    if (!m || !prete) return;
    const l = choisi?.startsWith("r:") ? releve?.find((x) => idReleve(x) === choisi) : undefined;
    (m.getSource("releve-choisi") as GeoJSONSource | undefined)?.setData(points(l ? [l] : [], couleur));
    if (!l) return;
    const p = ll(l);
    const visible = m.getBounds().contains(p) && m.getZoom() >= 14.2;
    if (!visible) m.easeTo({ center: p, zoom: Math.max(m.getZoom(), 15), padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: reduit ? 0 : 900 });
  }, [choisi, prete, releve, couleur, reduit]);

  return (
    <div className="absolute inset-0">
      <div ref={boite} role="img" aria-label={T.mapLabel} className="size-full" />
      {/* plan fixe de Ouidah : sans accord, quand la 3D est refusée, et le temps que la carte se charge (jamais de vide) */}
      {secours || sansAccord || (cartesOk && !prete) ? (
        <div className="absolute inset-0">
          <Image src="/ouidah/carte-secours-large.webp" alt="" fill sizes="(min-width: 1024px) 60vw, 100vw" loading="eager" className="object-cover" />
          <span className="absolute top-2 right-2 text-[10px] text-abyss/60">{creditsPage.carteSource}</span>
          {sansAccord ? (
            <button type="button" className="absolute right-4 bottom-4 z-[4] min-h-11 cursor-pointer rounded-full bg-abyss px-5 text-sm font-bold text-white shadow-[0_12px_24px_-12px_rgb(2_4_12/0.6)] hover:bg-ocean" onClick={() => enregistrerChoix({ cartes: true, ville: choix?.ville ?? false, mesure: choix?.mesure ?? false })}>
              {consentement.afficherCarte}
            </button>
          ) : secours ? (
            <p className="absolute inset-x-4 bottom-4 rounded-2xl bg-white/95 px-4 py-3 text-sm font-bold text-abyss shadow-[0_12px_24px_-16px_color-mix(in_oklab,var(--surface-abyss)_60%,transparent)]">{T.mapFallback}</p>
          ) : null}
        </div>
      ) : null}
      {vue.mode === "composer" && loin.length && large ? (
        <div className="absolute right-6 bottom-8 z-[3] flex flex-col items-end gap-2">
          <p className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold">{T.compose.far}</p>
          {loin.map(({ d, km }) => (
            <button key={d.slug} type="button" onClick={() => onAller(d.slug)} className="flex min-h-10 items-center gap-2 rounded-full bg-white py-1.5 pr-3 pl-1.5 text-xs font-semibold shadow-[0_12px_24px_-16px_color-mix(in_oklab,var(--surface-abyss)_60%,transparent)] focus-visible:outline-2 focus-visible:outline-sun">
              <span className="size-7 rounded-full bg-sand bg-cover bg-center" style={d.image ? { backgroundImage: `url('${d.image.src}')` } : undefined} />
              {d.name} · {nombre().format(km)} km
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
