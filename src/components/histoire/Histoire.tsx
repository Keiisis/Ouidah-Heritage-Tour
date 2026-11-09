"use client";

import Image from "next/image";
import Link from "@/components/ui/LienPublic";
import { useEffect, useRef } from "react";
import {
  histoireChapitres as CHAPITRES,
  histoireFinale as FINALE_DEFAUT,
  histoireOuverture as OUVERTURE,
  histoirePage as PAGE,
  type ChapitreHistoire,
  type PieceHistoire,
} from "@/content/histoire";
import { useContenu } from "@/components/ui/ContenuSite";
import { SonHistoire } from "./SonHistoire";
import "./histoire.css";

// Page « L'histoire de Ouidah », piste D v2 « Le plan-séquence » (validée par Kevin le 28/10/2026). Un seul plan sur deux
// cartes : la carte du royaume de Whidah (1747) et le plan de Ouidah (1926). La scène est fixe ; le texte défile au-dessus.
// Le moteur (caméra, intertitres, documents, planche gravée, projecteur, Route) tourne dans un seul effet, image par image,
// seulement quand la page bouge. Tout le texte vient de content/histoire.ts.

type NomPlan = "royaume" | "ville";
// caméra : [carte, point visé x, y, zoom, inclinaison, rotation, noms soulignés, place du point à l'écran]
type Vue = [NomPlan, number, number, number, number, number, string[], number];

// finesse réelle du trait (le plan de 1926 vient d'un scan de 1168 px agrandi : on plafonne le zoom en conséquence)
const FINESSE: Record<NomPlan, number> = { royaume: 3146, ville: 1800 };
// noms gravés (1747) ou imprimés (1926) à souligner : x, y, largeur, en fraction de la carte
const NOMS: Record<NomPlan, Record<string, [number, number, number]>> = {
  royaume: { sabi: [0.524, 0.496, 0.082], rade: [0.39, 0.8, 0.197], whidah: [0.62, 0.064, 0.088] },
  ville: {
    fortfr: [0.3, 0.634, 0.09],
    anglais: [0.4925, 0.68, 0.045],
    portugais: [0.664, 0.633, 0.06],
    chacha: [0.45, 0.79, 0.1],
    maro: [0.348, 0.782, 0.035],
    fetiche: [0.461, 0.627, 0.047],
    eglise: [0.442, 0.571, 0.037],
    marche: [0.552, 0.615, 0.04],
  },
};
// bureau : le point visé tombe entre le document (à gauche) et le texte (à droite). Clé « id-n » = temps n d'un chapitre.
const VUES: Record<string, Vue> = {
  ouverture: ["royaume", 0.5, 0.42, 1.1, 12, 0, [], 0.5],
  avant: ["royaume", 0.565, 0.47, 2, 26, -4, ["sabi"], 0.49],
  "forts-0": ["ville", 0.43, 0.65, 1, 16, 3, ["fortfr", "anglais"], 0.49],
  "forts-1": ["ville", 0.66, 0.64, 1.6, 26, -2, ["portugais"], 0.49],
  dahomey: ["royaume", 0.565, 0.49, 1.5, 20, -8, ["sabi"], 0.49],
  chacha: ["ville", 0.5, 0.79, 1.8, 34, -3, ["chacha"], 0.49],
  agudas: ["ville", 0.366, 0.78, 1.8, 30, 4, ["maro"], 0.49],
  mer: ["royaume", 0.49, 0.69, 1.9, 40, 0, [], 0.49],
  large: ["royaume", 0.49, 0.79, 1.45, 50, 2, ["rade"], 0.49],
  "mer-1": ["royaume", 0.62, 0.86, 1.4, 44, 0, [], 0.49],
  "mer-2": ["royaume", 0.42, 0.88, 1.4, 44, 0, [], 0.49],
  climax: ["royaume", 0.48, 0.845, 1.35, 0, 0, [], 0.18],
  basilique: ["ville", 0.46, 0.6, 1.8, 28, 4, ["fetiche", "eglise"], 0.49],
  fort: ["ville", 0.694, 0.63, 1.8, 18, 0, ["portugais"], 0.49],
  souvenir: ["ville", 0.5, 0.78, 1.6, 40, -4, ["chacha"], 0.49],
  fete: ["ville", 0.4, 0.66, 1.4, 26, -4, ["fortfr", "maro", "fetiche"], 0.49],
  route: ["ville", 0.5, 0.79, 1.1, 40, -2, ["chacha"], 0.49],
  "route-0": ["ville", 0.5, 0.79, 1.1, 40, -2, ["chacha"], 0.49],
  "route-1": ["ville", 0.5, 0.84, 1.1, 40, -2, [], 0.49],
  "route-2": ["ville", 0.5, 0.89, 1.1, 40, -2, [], 0.49],
  "route-3": ["ville", 0.5, 0.94, 1.1, 40, -2, [], 0.49],
  "route-4": ["ville", 0.5, 0.99, 1.1, 40, -2, [], 0.49],
  "route-5": ["ville", 0.5, 1.05, 1.1, 40, -2, [], 0.49],
  aujourdhui: ["ville", 0.5, 0.62, 1.1, 10, 0, ["marche"], 0.49],
  finale: ["ville", 0.5, 0.62, 1, 0, 0, [], 0.5],
};
// lettres de la planche : tentes gravées sur la plage, rivage hachuré, navire du milieu de la rade
const CLES: Record<string, [number, number]> = { A: [0.488, 0.668], B: [0.45, 0.704], C: [0.48, 0.845] };

const deux = (n: number) => String(n).padStart(2, "0");
// « Hier » seulement pour un document d'archive (aucune année récente dans la légende) ; sinon « Avant »
const recent = (l: string) => /\b(19[6-9]\d|20\d\d)\b/.test(l);
const docs = (c: ChapitreHistoire) => (c.id === "mer" ? [] : c.pieces);
const blocs = (c: ChapitreHistoire) => (c.id === "mer" ? c.temps.slice(1) : c.temps);
// document j d'un chapitre → temps n qu'il illustre (donnée « temps », sinon répartition dans l'ordre)
const tempsDe = (c: ChapitreHistoire, j: number) => {
  const n = blocs(c).length;
  return docs(c)[j]?.temps ?? Math.min(n - 1, Math.floor((j * n) / Math.max(1, docs(c).length)));
};

function Mots({ texte }: { texte: string }) {
  return texte.split(" ").map((m, i, tous) => (
    <span key={i}>
      <span className="hi-mot">
        <span style={{ "--i": i } as React.CSSProperties}>{m}</span>
      </span>
      {i < tous.length - 1 ? " " : null}
    </span>
  ));
}

function Faces({ p, sizes }: { p: PieceHistoire; sizes: string }) {
  const T = useContenu("histoire.histoirePage", PAGE);
  const double = p.hier && p.auj;
  const archive = p.hier && !recent(p.hier.legende);
  // dimensions explicites (pas de « fill ») : la mise en page des faces reste dans la feuille de style, mouvement réduit compris
  const image = (m: NonNullable<PieceHistoire["hier"]>, classe: string) => <Image className={classe} src={m.src} alt="" width={m.largeur} height={m.hauteur} sizes={sizes} />;
  return (
    <>
      <div className={`hi-faces${double ? " hi-double" : ""}`}>
        {p.hier ? image(p.hier, `hi-hier${archive ? " hi-archive" : ""}`) : null}
        {p.auj ? image(p.auj, "hi-auj") : null}
      </div>
      <figcaption className="hi-legende">
        {p.hier ? (
          <span className="hi-l-hier">
            {double ? (
              <>
                <b>{recent(p.hier.legende) ? T.avant : T.hier}</b> ·{" "}
              </>
            ) : null}
            {p.hier.legende}
          </span>
        ) : null}
        {p.auj ? (
          <span className="hi-l-auj" style={double ? { opacity: 0 } : undefined}>
            {double ? (
              <>
                <b>{T.aujourdhui}</b> ·{" "}
              </>
            ) : null}
            {p.auj.legende}
          </span>
        ) : null}
      </figcaption>
    </>
  );
}

// temps [debut, fin[ d'un chapitre (le chapitre de la mer est coupé par le climax)
function Colonnes({ c, debut = 0, fin }: { c: ChapitreHistoire; debut?: number; fin?: number }) {
  return blocs(c).slice(debut, fin).map((bloc, i) => {
    const n = debut + i;
    const ds = docs(c).filter((_, j) => tempsDe(c, j) === n);
    return (
      <div key={n} className="hi-colonne" data-vue={VUES[`${c.id}-${n}`] ? `${c.id}-${n}` : undefined}>
        {n === 0 ? (
          <h2 className="hi-leve" id={`t-${c.id}`}>
            {c.titre}
          </h2>
        ) : null}
        {bloc.map((t, i) => (
          <p key={i} className="hi-leve">
            {t}
          </p>
        ))}
        {ds.map((p, i) => (
          <figure key={i} className="hi-piece-flux">
            <Faces p={p} sizes="100vw" />
          </figure>
        ))}
      </div>
    );
  });
}

declare global {
  interface Window {
    __aller?: (id: string, fraction?: number, decalage?: number) => void;
    __pret?: boolean;
  }
}

export function Histoire() {
  const C = useContenu("histoire.histoireChapitres", CHAPITRES);
  const O = useContenu("histoire.histoireOuverture", OUVERTURE);
  const FINALE = useContenu("histoire.histoireFinale", FINALE_DEFAUT);
  const T = useContenu("histoire.histoirePage", PAGE);
  const racine = useRef<HTMLDivElement>(null);
  const mer = C.find((c) => c.id === "mer");
  const route = C.find((c) => c.id === "route");
  const PAS = 0.8 / (O.noms.length - 1);
  const IW = O.noms.findIndex((n) => /^Wh/.test(n)) * PAS;

  useEffect(() => {
    const R0 = racine.current;
    if (!R0) return;
    const $ = <E extends Element = HTMLElement>(s: string) => R0.querySelector<E>(s)!;
    const $$ = <E extends Element = HTMLElement>(s: string) => [...R0.querySelectorAll<E>(s)];
    R0.classList.add("hi-js");
    const scene = $(".hi-scene"), plateau = $(".hi-plateau"), photo = $(".hi-photo-fin"), hud = $(".hi-hud"), ou = $(".hi-hud .hi-ou"), compte = $(".hi-hud .hi-compte");
    const cartes = Object.fromEntries($$(".hi-carte").map((e) => [e.dataset.plan, e])) as Record<NomPlan, HTMLElement>;
    const calque = $(".hi-calque-fil"), cles = $$(".hi-cle"), lignesLegende = $$(".hi-legende-planche li"), legende = $(".hi-legende-planche");
    const [lumiere, lumiereForte] = $$(".hi-lumiere");
    const noms = $$(".hi-noms span"), nomsBloc = $(".hi-noms"), indice = $(".hi-indice"), rail = $(".hi-rail"), liens = $$<HTMLAnchorElement>(".hi-rail a"), coiffe = $(".hi-coiffe");
    const progres = $(".hi-progres i"), voile = $(".hi-voile-texte"), climax = $(".hi-climax"), sas = $(".hi-sas"), ouverture = $(".hi-ouverture"), finale = $(".hi-finale");
    const parcours = $(".hi-parcours"), stations = $$(".hi-parcours li"), parcoursPlein = $(".hi-parcours i");
    const soulignes = $$(".hi-souligne");
    const inter = Object.fromEntries($$(".hi-intertitre").map((e) => [e.dataset.pour, e]));
    const pieces = $$(".hi-piece");
    const calme = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const borne = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
    const rampe = (v: number, a: number, b: number) => (b === a ? (v >= b ? 1 : 0) : borne((v - a) / (b - a)));
    const doux = (t: number) => t * t * (3 - 2 * t);
    const melev = (a: Vue, b: Vue, t: number) => a.map((x, i) => (typeof x === "number" ? x + ((b[i] as number) - x) * t : t < 0.5 ? x : b[i])) as Vue;
    const haut = (el: Element) => el.getBoundingClientRect().top + scrollY;

    type Mesures = {
      vw: number; vh: number; mobile: boolean;
      tailles: Record<NomPlan, { M: number; H: number }>;
      ancres: { id: string; v: Vue; top: number }[];
      chap: Record<string, { top: number; h: number; blocs: { top: number; h: number }[] }>;
      ordre: { id: string; top: number }[];
      gen: number; fin: number; sas: { top: number; h: number };
    };
    let L: Mesures;
    let cam: number[] | null = null;
    const mesurer = () => {
      const vw = innerWidth, vh = innerHeight;
      const tailles = {} as Mesures["tailles"];
      for (const k of ["royaume", "ville"] as NomPlan[]) {
        const ratio = T.cartes[k].largeur / T.cartes[k].hauteur, M = Math.max(vw, vh * ratio);
        tailles[k] = { M, H: M / ratio };
        cartes[k].style.width = `${M}px`;
        cartes[k].style.height = `${M / ratio}px`;
      }
      calque.style.width = cartes.royaume.style.width;
      calque.style.height = cartes.royaume.style.height;
      const chap: Mesures["chap"] = {};
      for (const c of C) {
        const el = R0.querySelector(`#${c.id}`)!;
        chap[c.id] = { top: haut(el), h: (el as HTMLElement).offsetHeight, blocs: [...el.querySelectorAll(":scope > .hi-colonne")].map((b) => ({ top: haut(b), h: (b as HTMLElement).offsetHeight })) };
      }
      L = {
        vw, vh, tailles, mobile: vw <= 900, chap,
        ancres: $$("[data-vue]").map((el) => ({ id: el.dataset.vue!, v: VUES[el.dataset.vue!], top: haut(el) })).filter((a) => a.v).sort((a, b) => a.top - b.top),
        ordre: C.map((c) => ({ id: c.id, top: chap[c.id].top })),
        gen: $(".hi-generique").offsetHeight, fin: haut(finale), sas: { top: haut(sas), h: sas.offsetHeight },
      };
    };
    // deux caméras (royaume et ville) et le poids de la ville ; la dernière ancre franchie donne les noms soulignés
    const cible = (y: number) => {
      const g = rampe(y, 0, L.gen - L.vh);
      const gen: Vue = ["royaume", L.mobile ? 0.62 : 0.5, 0.12 + 0.32 * g, 1.7 - 0.6 * g, 10 * g, 0, Math.abs(g - IW) < 0.06 ? ["whidah"] : [], 0.5];
      let R = calme ? VUES.ouverture : gen, V = VUES.finale, w = 0, actif = -1, soul = R[6], tc = 0;
      for (const a of L.ancres) {
        const t = calme ? (y >= a.top - L.vh * 0.5 ? 1 : 0) : doux(rampe(y, a.top - L.vh, a.top - L.vh * 0.35));
        if (a.v[0] === "ville") {
          V = melev(V, a.v, t);
          w = w + (1 - w) * t;
        } else {
          R = melev(R, a.v, t);
          w = w * (1 - t);
          tc = a.id === "climax" ? t : tc * (1 - t);
        }
        if (y >= a.top - L.vh * 0.9) soul = a.v[6];
      }
      L.ordre.forEach((c, i) => {
        if (y >= c.top - L.vh * 0.5 - 2) actif = i;
      });
      return { R, V, w, actif, g, soul, tc };
    };
    const poser = (k: NomPlan, v: Vue, el: HTMLElement, tc = 0) => {
      const [, fx, fy, z0, t0, , , cx] = v, { vw, vh, mobile } = L, { M, H } = L.tailles[k];
      const t = mobile ? t0 * 0.6 : t0, plafond = Math.max(1, (1.35 * FINESSE[k]) / (M * devicePixelRatio) / (1 + t / 70));
      const z = Math.min(mobile ? z0 * 0.85 : z0, plafond), px = mobile ? 0.5 : cx, py = mobile ? 0.36 + 0.44 * tc : 0.5;
      const tyMax = fy < 0.2 ? 96 : 0;
      // bureau : la carte peut glisser jusqu'au bord du document (36 %) et de la colonne de texte (62 %), zones déjà sombres
      const [gx0, gx1] = mobile ? [vw - M * z, 0] : [vw * 0.62 - M * z, k === "ville" ? vw * 0.12 : 0], gy0 = (k === "ville" ? vh * 0.4 : vh) - H * z;
      const tx = borne(vw * px - fx * M * z, gx0, gx1), ty = borne(vh * py - fy * H * z, gy0, tyMax);
      const tr = `translate3d(${tx}px,${ty}px,0) scale(${z})`;
      el.style.transform = tr;
      el.style.setProperty("--z", String(z));
      return tr;
    };
    // niveau du climax (0 à 1) : la carte s'éteint sauf le navire, les repères disparaissent
    const niveauClimax = (y: number): [number, number] => {
      const kc = rampe(y, L.sas.top, L.sas.top + L.sas.h - L.vh);
      if (calme || y < L.sas.top - L.vh * 0.2 || y > L.sas.top + L.sas.h - L.vh * 0.5) return [0, kc];
      return [rampe(kc, 0, 0.05) * (1 - rampe(kc, 0.9, 0.97)), kc];
    };
    let actifPrec: number | null = null, soulPrec = "", hudPrec = "";
    const lum: { x: number | null; y: number | null } = { x: null, y: null };
    let lumBouge = false;
    const image = () => {
      const y = scrollY, { vh } = L, { R, V, w, actif, g, soul, tc } = cible(y);
      const avant = cam, nouv = [...(R.slice(1, 6) as number[]), ...(V.slice(1, 6) as number[]), w];
      cam = !cam || calme ? nouv : cam.map((x, i) => x + (nouv[i] - x) * 0.09);
      const cR = ["royaume", ...cam.slice(0, 5), R[6], R[7]] as Vue, cV = ["ville", ...cam.slice(5, 10), V[6], V[7]] as Vue, cw = cam[10];
      calque.style.transform = poser("royaume", cR, cartes.royaume, tc);
      poser("ville", cV, cartes.ville);
      const ti = (cR[4] * (1 - cw) + cV[4] * cw) * (L.mobile ? 0.6 : 1), ro = cR[5] * (1 - cw) + cV[5] * cw;
      plateau.style.transform = `rotateX(${ti}deg) rotateZ(${ro}deg) scale(${1 + ti / 70})`;
      const cleSoul = soul.join(",");
      if (cleSoul !== soulPrec) {
        soulPrec = cleSoul;
        soulignes.forEach((s) => s.classList.toggle("hi-on", soul.includes(s.dataset.nom!)));
      }
      // générique : chaque nom tient un palier
      noms.forEach((n, i) => {
        if (calme) return;
        const c = i * PAS, der = i === noms.length - 1, d = Math.abs(g - c);
        const o = i === 0 ? 1 - rampe(g, 0.045, 0.075) : der ? rampe(g, c - 0.075, c - 0.045) * (1 - rampe(g, 0.92, 1)) : 1 - rampe(d, 0.045, 0.075);
        n.style.opacity = String(o);
        n.style.transform = `translateY(${(c - g) * 22}vh) scale(${1 + (c - g) * 0.16})`;
      });
      nomsBloc.style.opacity = calme ? (y > 4 ? "0" : "1") : "1";
      indice.style.opacity = String(1 - rampe(g, 0, 0.06));
      // chapitres : intertitres ; la mer : planche gravée et projecteur
      let cadre = false, planche = 0, lettre = -1;
      for (const c of C) {
        const m = L.chap[c.id], s = y - m.top;
        const etat = calme ? "avant" : s < -vh * 0.62 ? "avant" : s < -vh * 0.08 ? "on" : "apres";
        const e = inter[c.id];
        if (e.dataset.etat !== etat) e.dataset.etat = etat;
        if (etat === "on") cadre = true;
        if (c.id === "mer") {
          // A, B, C au fil du premier temps (la ville, la plage, la barre, les navires) ; C reste jusqu'au climax
          const b0 = m.blocs[0], av = rampe(y, b0.top - vh * 0.6, b0.top + b0.h - vh * 0.5);
          lettre = s < -vh * 0.05 ? -1 : av < 0.3 ? 0 : av < 0.62 ? 1 : 2;
          planche = rampe(s, -vh * 0.05, vh * 0.25) * (1 - rampe(y, L.sas.top + L.sas.h - vh * 1.2, L.sas.top + L.sas.h - vh * 0.6));
        }
      }
      const [cl, kc] = niveauClimax(y);
      // documents (bureau) : chacun apparaît avec le temps qu'il illustre ; plusieurs documents d'un même temps se suivent
      if (!L.mobile)
        pieces.forEach((p) => {
          const b = L.chap[p.dataset.pour!].blocs[Number(p.dataset.n)];
          if (!b) return;
          const freres = pieces.filter((x) => x.dataset.pour === p.dataset.pour && x.dataset.n === p.dataset.n), i = freres.indexOf(p), nb = freres.length;
          const loc = rampe(y, b.top - vh * 0.62, b.top + b.h - vh * 0.3), a = i / nb, z = (i + 1) / nb, part = rampe(loc, a, z);
          p.style.opacity = String((i === 0 ? rampe(loc, 0, 0.05) : rampe(loc, a, a + 0.05)) * (1 - rampe(loc, z - 0.05, z)) * (1 - cl));
          const ty = calme ? 0 : (0.5 - part) * 8, rz = calme ? 0 : (part - 0.5) * -4;
          p.style.transform = `translateY(calc(-50% + ${ty}vh)) rotate(${rz}deg)`;
          const f = p.firstElementChild as HTMLElement;
          if (f.classList.contains("hi-double") && !calme) {
            const tour = doux(rampe(part, 0.3, 0.6)) * 180;
            f.style.transform = `rotateY(${tour}deg)`;
            p.querySelector<HTMLElement>(".hi-l-hier")!.style.opacity = String(1 - rampe(tour, 30, 80));
            p.querySelector<HTMLElement>(".hi-l-auj")!.style.opacity = String(rampe(tour, 100, 150));
          }
        });
      // documents (mobile, dans le texte) : retournement quand ils traversent l'écran
      if (L.mobile && !calme)
        $$(".hi-piece-flux").forEach((p) => {
          const f = p.firstElementChild as HTMLElement;
          if (!f.classList.contains("hi-double")) return;
          const tour = doux(rampe(-p.getBoundingClientRect().top, -vh * 0.55, -vh * 0.2)) * 180;
          f.style.transform = `rotateY(${tour}deg)`;
          p.querySelector<HTMLElement>(".hi-l-hier")!.style.opacity = String(1 - rampe(tour, 30, 80));
          p.querySelector<HTMLElement>(".hi-l-auj")!.style.opacity = String(rampe(tour, 100, 150));
        });
      // la Route : station en cours = dernier temps entré au milieu de l'écran
      let etape = -1;
      const rc = route ? L.chap[route.id] : null;
      if (rc) {
        rc.blocs.forEach((b, i) => {
          if (y >= b.top - vh * 0.5 - 2) etape = i;
        });
        const avance = rc.blocs.reduce((acc, b, i) => acc + (i ? rampe(y, b.top - vh * 0.9, b.top - vh * 0.5) : 0), 0);
        const s = y - rc.top, k = rampe(s, 0, rc.h - vh);
        parcours.style.opacity = String(calme ? (s > -vh * 0.1 && k < 1 ? 1 : 0) : rampe(s, vh * 0.25, vh * 0.55) * (1 - rampe(k, 0.94, 1)));
        parcoursPlein.style.transform = `${L.mobile ? "scaleX" : "scaleY"}(${avance / (rc.blocs.length - 1)})`;
        stations.forEach((li, i) => {
          li.classList.toggle("hi-fait", i <= etape);
          li.classList.toggle("hi-actuel", i === etape);
        });
      }
      // climax : tout s'éteint sauf le navire
      climax.classList.toggle("hi-on", calme || cl > 0.5);
      climax.classList.toggle("hi-fini", !calme && kc >= 0.9);
      scene.classList.toggle("hi-cadre", cadre || cl > 0.5);
      // fondu au noir, puis la Porte, la nuit
      const f1 = rampe(y, L.fin - vh, L.fin - vh * 0.6), f2 = rampe(y, L.fin - vh * 0.5, L.fin - vh * 0.1);
      const base = (calme ? 1 : 0.85 + 0.15 * rampe(g, 0.3, 0.9)) * (1 - 0.35 * cl) * (1 - f1);
      cartes.royaume.style.opacity = String(base * (1 - cw));
      cartes.ville.style.opacity = String(base * cw);
      calque.style.opacity = legende.style.opacity = String(planche * (1 - cl) * (1 - f1));
      cles.forEach((e, i) => {
        e.classList.toggle("hi-vue", i <= lettre);
        e.classList.toggle("hi-actuelle", i === lettre);
      });
      lignesLegende.forEach((e, i) => {
        e.classList.toggle("hi-vue", i <= lettre);
        e.classList.toggle("hi-actuelle", i === lettre);
      });
      // le projecteur suit la lettre en cours (position mesurée à l'écran, après la perspective du plateau)
      if (lettre >= 0 && !calme) {
        const r = cles[lettre].getBoundingClientRect(), x = r.left + r.width / 2, yy = r.top + r.height / 2;
        lum.x = lum.x == null ? x : lum.x + (x - lum.x) * 0.14;
        lum.y = lum.y == null ? yy : lum.y + (yy - lum.y) * 0.14;
        lumiere.style.transform = lumiereForte.style.transform = `translate3d(${lum.x}px,${lum.y}px,0)`;
        lumBouge = Math.abs(x - lum.x) + Math.abs(yy - lum.y) > 0.5;
      } else lumBouge = false;
      lumiere.style.opacity = String(calme ? 0 : planche * (1 - cl) * (1 - f1));
      lumiereForte.style.opacity = String(calme ? 0 : cl * (1 - f1));
      photo.style.opacity = String(f2);
      photo.style.transform = `scale(${1.06 - 0.06 * f2})`;
      const chrome = rampe(y, L.ordre[0].top - vh * 0.9, L.ordre[0].top - vh * 0.6) * (1 - f1) * (1 - cl);
      rail.style.opacity = coiffe.style.opacity = (progres.parentNode as HTMLElement).style.opacity = String(chrome);
      rail.inert = chrome < 0.05; // repères invisibles : ni cliquables ni atteignables au clavier
      hud.style.opacity = String(chrome * (cadre ? 0 : 1));
      voile.style.opacity = String(rampe(y, L.ordre[0].top - vh * 0.2, L.ordre[0].top + vh * 0.3) * (1 - f1) * (1 - cl));
      const c = C[actif];
      const txt = !c ? "" : c.id === route?.id && etape >= 0 && route.etapes ? T.etape(etape + 1, route.etapes.length, route.etapes[etape]) : `${c.repere} · ${c.titre}`;
      if (txt !== hudPrec) {
        hudPrec = txt;
        ou.textContent = txt;
      }
      if (actif !== actifPrec) {
        actifPrec = actif;
        compte.textContent = c ? `${deux(actif + 1)} / ${deux(C.length)}` : "";
        liens.forEach((l, i) => {
          l.classList.toggle("hi-actif", i === actif);
          l.toggleAttribute("aria-current", i === actif);
        });
      }
      progres.style.transform = `scaleX(${rampe(y, L.ordre[0].top - vh * 0.5, L.fin - vh)})`;
      return lumBouge || !avant || cam.some((x, i) => Math.abs(x - avant[i]) > 1e-4);
    };

    // paragraphes : levée quand ils entrent à l'écran ; titres mot à mot de l'ouverture et de la fin
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add("hi-vu")), { rootMargin: "0px 0px -12% 0px" });
    $$(".hi-leve").forEach((el) => io.observe(el));
    const titres = [ouverture.querySelector("h1")!, finale.querySelector("h2")!];
    const io2 = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.closest("section")!.classList.add("hi-on")), { rootMargin: "0px 0px -15% 0px" });
    titres.forEach((el) => io2.observe(el));
    // boucle d'images seulement quand la page bouge
    let encours = false, rafId = 0, actif = true;
    const boucle = () => {
      if (actif && image()) rafId = requestAnimationFrame(boucle);
      else encours = false;
    };
    const demander = () => {
      if (!encours) {
        encours = true;
        rafId = requestAnimationFrame(boucle);
      }
    };
    const remesurer = () => {
      mesurer();
      cam = null;
      demander();
    };
    // la hauteur du récit change avec les polices et les images (mobile) : on remesure
    const ro = new ResizeObserver(remesurer);
    ro.observe($(".hi-flux"));
    addEventListener("scroll", demander, { passive: true });
    addEventListener("resize", remesurer);
    mesurer();
    image();
    // aide aux tests (développement seulement) : aller à un moment précis et poser la caméra
    if (process.env.NODE_ENV !== "production") {
      window.__aller = (id, frac = 0, decale = 0) => {
        const c = L.chap[id];
        const y = (id === "ouverture" ? haut(ouverture) : id === "finale" ? L.fin : id === "generique" ? frac * (L.gen - L.vh) : id === "sas" ? L.sas.top + frac * (L.sas.h - L.vh) : c.top + frac * (c.h - L.vh)) + decale * L.vh;
        scrollTo(0, y);
        cam = null;
        lum.x = lum.y = null;
        image();
        $$(".hi-leve").forEach((el) => el.getBoundingClientRect().top < innerHeight && el.classList.add("hi-vu"));
        titres.forEach((el) => el.getBoundingClientRect().top < innerHeight && el.closest("section")!.classList.add("hi-on"));
      };
      document.fonts.ready.then(() => requestAnimationFrame(() => (window.__pret = true)));
    }
    return () => {
      actif = false;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      io.disconnect();
      io2.disconnect();
      removeEventListener("scroll", demander);
      removeEventListener("resize", remesurer);
      R0.classList.remove("hi-js");
      delete window.__aller;
      delete window.__pret;
    };
  }, [C, T, route, PAS, IW]);

  return (
    <div ref={racine} className="hi">
      <SonHistoire />
      <div className="hi-film">
        <div className="hi-scene" aria-hidden="true">
          <div className="hi-plateau">
            {(["royaume", "ville"] as NomPlan[]).map((k) => (
              <div key={k} className="hi-carte" data-plan={k}>
                <Image src={T.cartes[k].src} alt="" fill sizes="250vw" priority={k === "royaume"} />
                {Object.entries(NOMS[k]).map(([n, [x, y, w]]) => (
                  <span key={n} className="hi-souligne" data-nom={n} style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%` }} />
                ))}
              </div>
            ))}
            <div className="hi-calque-fil">
              {(mer?.legende ?? []).map((l) => (
                <span key={l.lettre} className="hi-cle" data-lettre={l.lettre} style={{ left: `${CLES[l.lettre][0] * 100}%`, top: `${CLES[l.lettre][1] * 100}%` }}>
                  <b>{l.lettre}</b>
                </span>
              ))}
            </div>
          </div>
          <div className="hi-vignette" />
          <div className="hi-lumiere" />
          <div className="hi-lumiere hi-forte" />
          <div className="hi-voile-texte" />
          <div className="hi-photo-fin">
            <Image src={T.photoFin} alt="" fill sizes="100vw" />
          </div>
          <div className="hi-noms">
            {O.noms.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </div>
          <div className="hi-indice">
            {T.defiler}
            <i />
          </div>
          {C.map((c) => (
            <div key={c.id} className="hi-intertitre" data-pour={c.id} data-etat="avant">
              <span className="hi-masque">
                <b>{c.court}</b>
              </span>
              <span className="hi-filet" />
              <small>{c.titre}</small>
            </div>
          ))}
          {C.flatMap((c) =>
            docs(c).map((p, j) => (
              <figure key={`${c.id}-${j}`} className="hi-piece" data-pour={c.id} data-n={tempsDe(c, j)}>
                <Faces p={p} sizes="31vw" />
              </figure>
            )),
          )}
          <span className="hi-bande hi-haut" />
          <span className="hi-bande hi-bas" />
        </div>
        <div className="hi-flux">
          <div className="hi-generique" />
          <section className="hi-ouverture" data-vue="ouverture" aria-labelledby="t-ouverture">
            <div>
              <h1 id="t-ouverture">
                <Mots texte={O.titre} />
              </h1>
              <p className="hi-leve">{O.texte}</p>
            </div>
          </section>
          {C.map((c) => {
            const vue = VUES[c.id] ? c.id : undefined;
            if (c.id === "mer" && c.chiffre) {
              const mots = c.chiffre.valeur.split(" ");
              return (
                <section key={c.id} className="hi-chap" id={c.id} data-vue={vue} aria-labelledby={`t-${c.id}`}>
                  <Colonnes c={c} fin={1} />
                  <div className="hi-marque" data-vue="large" />
                  <div className="hi-sas" data-vue="climax">
                    <div className="hi-climax">
                      <p className="hi-geant" aria-label={c.chiffre.valeur}>
                        <Mots texte={mots.slice(0, -1).join(" ")} />
                        <br />
                        <Mots texte={mots.at(-1)!} />
                      </p>
                      <p className="hi-phrase">{c.chiffre.legende}</p>
                    </div>
                  </div>
                  <Colonnes c={c} debut={1} />
                </section>
              );
            }
            return (
              <section key={c.id} className="hi-chap" id={c.id} data-vue={vue} aria-labelledby={`t-${c.id}`}>
                <Colonnes c={c} />
              </section>
            );
          })}
          <section className="hi-finale" data-vue="finale" aria-labelledby="t-finale">
            <h2 id="t-finale">
              <Mots texte={FINALE.titre} />
            </h2>
            {FINALE.texte ? <p className="hi-leve">{FINALE.texte}</p> : null}
            <div className="hi-boutons hi-leve">
              <Link className="hi-btn hi-principal" href={T.appel.principal.href}>
                {T.appel.principal.label}
              </Link>
              <Link className="hi-btn hi-second" href={T.appel.secondaire.href}>
                {T.appel.secondaire.label}
              </Link>
            </div>
          </section>
        </div>
      </div>
      <div className="hi-coiffe" aria-hidden="true" />
      <ol className="hi-legende-planche" aria-hidden="true">
        {(mer?.legende ?? []).map((l) => (
          <li key={l.lettre} data-lettre={l.lettre}>
            <b>{l.lettre}</b>
            {l.nom}
          </li>
        ))}
      </ol>
      <div className="hi-parcours" aria-hidden="true">
        <i />
        <ol>
          {(route?.etapes ?? []).map((e) => (
            <li key={e}>
              <span>{e}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="hi-hud" aria-hidden="true">
        <span className="hi-ou" />
        <span className="hi-compte" />
      </div>
      <nav className="hi-rail" aria-label={T.chapitres}>
        {C.map((c, i) => (
          <a key={c.id} href={`#${c.id}`} aria-label={c.titre} title={c.titre}>
            {deux(i + 1)}
          </a>
        ))}
      </nav>
      <div className="hi-progres" aria-hidden="true">
        <i />
      </div>
    </div>
  );
}
