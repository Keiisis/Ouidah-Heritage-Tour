import { ACCUEIL, FIN_OUVERTURE } from "@/lib/ouverture";
import { EMBLEME } from "./ouverture-embleme";
import "./ouverture.css";

export const CLE_OUVERTURE = "oht-intro";

type Params = { cle: string; accueil: string; fin: string; avif: string; webp: string; dev: boolean; e: typeof EMBLEME };

// Ouverture « Le passage » (Kevin, 12/11/2026), sur l'emblème rond original : gros plan sur la Porte du Non-Retour de
// l'emblème, recul jusqu'à l'emblème entier, tenue, puis passage par l'embrasure de la Porte jusqu'au site. Accueil seul,
// une fois par session ; rien sous mouvement réduit. Site utilisable avant 2,4 s depuis la navigation (image en retard :
// pas d'ouverture) ; un clic, une touche, la molette, un toucher ou un défilement la passent en 150 ms.
// L'emblème n'est jamais redessiné : chaque pièce affiche la même image (embleme.avif), découpée par un clip-path tiré de
// ses vrais pixels (ouverture-embleme.ts) ; seuls transform et opacity sont animés, par Web Animations (fil du compositeur).
// Exécutée telle quelle dans le navigateur (script en tête de <body>, avant le premier affichage et sans attendre
// l'hydratation) : aucune référence hors de ses paramètres. Le voile est un élément <oht-ouverture> ajouté au <body> :
// l'hydratation de React passe les balises inconnues placées directement dans <body>.
function ouverture(o: Params) {
  const html = document.documentElement;
  try {
    if (!new RegExp(o.accueil).test(location.pathname) || sessionStorage.getItem(o.cle) === "1" || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      html.dataset.ouverture = "vue";
      return;
    }
  } catch {
    html.dataset.ouverture = "vue";
    return;
  }
  try {
    sessionStorage.setItem(o.cle, "1");
  } catch {
    // stockage bloqué : l'ouverture rejouera à la prochaine visite de l'accueil, sans gêner
  }
  // ms. Le site doit être utilisable avant BUDGET, compté depuis la navigation : si l'image n'est pas prête à DEPART,
  // pas d'ouverture (jamais jouée en accéléré). En développement, compté depuis ce script : la compilation à la demande
  // de next dev retarde la page de 0,5 à 20 s et l'ouverture ne jouerait jamais
  const BUDGET = 2380, DUREE = 1650, BASCULE = 690, UTILISABLE = 1450, DEPART = BUDGET - UTILISABLE - 40;
  const t0 = o.dev ? performance.now() : 0;
  const ov = document.createElement("oht-ouverture");
  ov.className = "ov";
  ov.setAttribute("aria-hidden", "true");
  document.body.append(ov);
  const img = new Image();
  img.fetchPriority = "high";
  const fin = new AbortController(), minuteurs: number[] = [];
  let fini = false, saute = false;
  const terminer = () => {
    if (fini) return;
    fini = true;
    minuteurs.forEach(clearTimeout);
    fin.abort();
    ov.remove();
    // les cartes et le globe démarrent après l'image qui montre le site, pas avant : sinon leur mise en route retarde
    // cette image (passage par un clic mesuré à 358 ms au lieu de 150 ms)
    requestAnimationFrame(() => window.setTimeout(() => dispatchEvent(new Event(o.fin))));
  };
  const sauter = () => {
    if (fini || saute) return;
    saute = true;
    minuteurs.forEach(clearTimeout);
    ov.style.pointerEvents = "none";
    const op = +getComputedStyle(ov).opacity;
    ov.animate([{ opacity: op }, { opacity: 0 }], { duration: 150 * op, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" }).finished.then(terminer, terminer);
    minuteurs.push(window.setTimeout(terminer, 150 * op + 10)); // sans attendre l'image suivante si le rendu est lent
  };
  minuteurs.push(window.setTimeout(sauter, Math.max(0, DEPART - (performance.now() - t0))));
  for (const ev of ["pointerdown", "keydown", "wheel", "touchstart", "scroll"]) addEventListener(ev, sauter, { once: true, passive: true, capture: true, signal: fin.signal });

  const jouer = () => {
    if (fini || saute) return;
    if (performance.now() - t0 > DEPART) return sauter();
    const { e } = o, [IW, IH] = e.taille, [CX, CY] = e.centre, vw = innerWidth, vh = innerHeight;
    const S = Math.round(Math.min(0.84 * vw, 0.7 * vh, 640)), k = S / IW, S2 = IH * k;
    const sx = Math.round((vw - S) / 2), sy = Math.round((vh - S2) / 2);
    const lin = (a: number, b: number, t: number) => a + (b - a) * t;
    const lisse = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
    const bloc = (parent: Element, style: Record<string, string>) => {
      const el = document.createElement("div");
      Object.assign(el.style, style);
      parent.append(el);
      return el;
    };
    // animations créées en pause puis lancées ensemble : elles partent à la première image peinte (lecture en attente),
    // même si le fil principal est pris par l'hydratation ; jusque-là, l'image affichée est leur état de départ
    const lecture: Animation[] = [];
    const anime = (el: Element, images: Keyframe[], d: number, a: number, easing = "linear") => {
      const an = el.animate(images, { duration: d, delay: a, easing, fill: "both" });
      an.pause();
      lecture.push(an);
    };
    // contour d'une pièce (px de l'image, relatifs à son coin) -> chemin en px CSS de la scène
    const chemin = (p: { b: number[]; l: number[][] }) => p.l.map((c) => {
      let s = "";
      for (let i = 0; i < c.length; i += 2) s += (i ? "L" : "M") + ((c[i] + p.b[0]) * k).toFixed(2) + " " + ((c[i + 1] + p.b[1]) * k).toFixed(2);
      return s + "Z";
    }).join("");
    const px = (n: number) => n + "px";
    const fond = { backgroundImage: `url("${img.src}")`, backgroundSize: `${S}px ${S2}px`, backgroundRepeat: "no-repeat" };

    // caméra (recul) > scène à la place de l'emblème > lot : une découpe pour tout sauf navire et horizon, puis ces deux-là.
    // Chaque pièce couvre toute la scène, image en 0 0 comme l'image entière : aucun décalage à la bascule.
    const cam = bloc(ov, { left: "0", top: "0", width: px(vw), height: px(vh), transformOrigin: "0 0" });
    const scene = bloc(cam, { left: px(sx), top: px(sy), width: px(S), height: px(S2) });
    const lot = bloc(scene, { inset: "0" });
    const origine = `${CX * k}px ${CY * k}px`;
    bloc(lot, { inset: "0", ...fond, clipPath: `path(evenodd,"M0 0H${S}V${S2}H0Z${chemin(e.navire)}${chemin(e.horizon)}")` });
    const horizon = bloc(lot, { inset: "0", ...fond, clipPath: `path(evenodd,"${chemin(e.horizon)}")`, transformOrigin: origine });
    const navire = bloc(lot, { inset: "0", ...fond, clipPath: `path(evenodd,"${chemin(e.navire)}")`, transformOrigin: origine });
    // tenue (690 -> 1200 ms) : l'emblème entier dans un bloc à fond blanc qu'aucune transformation ne touche. Sans ce
    // fond, un calque animé qui ne contient qu'une image est rendu tel quel par la carte graphique, avec un autre filtrage
    // que celui du navigateur : bords changés jusqu'à 73/255 (mesuré le 12/11 ; fond blanc : 0). Le blanc est déjà
    // derrière (demi-plans et volet). Le passage a sa propre copie, « marque », montrée à 1200 ms seulement
    const image = (parent: Element) => {
      const el = document.createElement("img");
      el.src = img.src;
      el.alt = "";
      el.width = S;
      el.height = S2;
      Object.assign(el.style, { inset: "0", width: px(S), height: px(S2) });
      parent.append(el);
      return el;
    };
    const cadre = { left: px(sx), top: px(sy), width: px(S), height: px(S2) };
    const tenue = bloc(ov, { ...cadre, background: "#fff" });
    image(tenue);
    // passage : la même image, et par-dessus, invisibles jusqu'au fondu, les mêmes pixels découpés aux deux piliers et
    // aux deux linteaux de la Porte, qui restent quand le reste de l'emblème s'efface
    const marque = bloc(ov, { ...cadre, transformOrigin: "0 0" });
    const entier = image(marque);
    // une seconde <img> et non un fond : même rendu que l'image entière. Superposée, elle foncerait les bords
    // semi-transparents de la Porte : elle reste à opacité 0 tant que l'image entière est pleine
    const piliers = entier.cloneNode() as HTMLImageElement;
    piliers.style.clipPath = `path("${e.piliers.map(chemin).join("")}")`;
    marque.append(piliers);
    // le blanc du voile = quatre demi-plans autour de l'embrasure de la Porte + un volet dedans, sous la caméra
    const [ox, oy, ow, oh] = e.embrasure, hx = sx + ox * k, hy = sy + oy * k, hw = ow * k, hh = oh * k;
    const blanc = (x: number, y: number, w: number, h: number) => {
      const el = bloc(ov, { left: px(x), top: px(y), width: px(w), height: px(h), background: "#fff", transformOrigin: "0 0" });
      ov.insertBefore(el, cam);
      return el;
    };
    const pan = { g: blanc(-vw - 8, 0, vw + 8, vh), d: blanc(vw, 0, vw + 8, vh), h: blanc(0, -vh - 8, vw, vh + 8), b: blanc(0, vh, vw, vh + 8) };
    const volet = blanc(hx - 2, hy - 2, hw + 4, hh + 4); // 2 px de marge sous les piliers et le linteau
    ov.style.background = "transparent";

    // 1. recul (0 -> 680 ms) : image 0 = gros plan net sur la Porte (55 % du petit côté), à pleine opacité ; échelle en
    //    progression logarithmique, la Porte glisse du centre vers sa place
    const E = [sx + CX * k, sy + CY * k], G = [sx + e.porte[0] * k, sy + e.porte[1] * k];
    const Z0 = Math.min(5, Math.max(3, (0.55 * Math.min(vw, vh)) / (268 * k))), recul: Keyframe[] = [];
    for (let i = 0; i <= 20; i++) {
      const s = i / 20, f = 1 - (1 - s) ** 3, z = Z0 ** (1 - f);
      recul.push({ transform: `translate(${E[0] - z * lin(G[0], E[0], f)}px, ${E[1] - z * lin(G[1], E[1], f)}px) scale(${z})` });
    }
    anime(cam, recul, 680, 0);
    // navire et horizon présents dès l'image 0 : le navire glisse sur sa ligne, l'horizon se déroule
    const glisse = "cubic-bezier(.3,.05,.15,1)";
    anime(horizon, [{ transform: "scaleX(0.2)" }, { transform: "none" }], 640, 0, glisse);
    anime(navire, [{ transform: `translateX(${-0.2 * S}px)` }, { transform: "none" }], 640, 0, glisse);
    // 2. bascule invisible (690 ms) vers l'image entière (mêmes pixels que le fichier) ; tenue jusqu'à 1200 ms
    // (une seule animation d'opacité par élément : la seconde, en attente, imposerait son état de départ à la première)
    anime(lot, [{ opacity: 1 }, { opacity: 0 }], 1, BASCULE);
    anime(tenue, [{ opacity: 0 }, { opacity: 1, offset: 0.001 }, { opacity: 1, offset: 0.999 }, { opacity: 0 }], 1200 - BASCULE, BASCULE);
    anime(marque, [{ opacity: 0 }, { opacity: 1 }], 1, 1200);
    // 3. passage (1200 -> 1650 ms), une seule courbe : toute la scène grandit en homothétie autour de l'embrasure,
    //    z = Z^lisse(s), jusqu'à ce que l'embrasure couvre l'écran (x 1,15). Point X de l'écran -> z (X - F) + T :
    //    F va du centre de l'emblème à celui de l'embrasure, T au point de l'écran où l'embrasure finit centrée (haut du
    //    site : barre de navigation et titre dans la fenêtre)
    const H = [hx + hw / 2, hy + hh / 2], Tf = [vw / 2, 0.4 * vh], D = 450, A0 = 1200, N = 40;
    const Z = 1.15 * Math.max((Math.max(Tf[0], vw - Tf[0]) + 8) / (hw / 2), (Math.max(Tf[1], vh - Tf[1]) + 8) / (hh / 2));
    const im: Record<"marque" | "volet" | "g" | "d" | "h" | "b", Keyframe[]> = { marque: [], volet: [], g: [], d: [], h: [], b: [] };
    for (let i = 0; i <= N; i++) {
      const s = i / N, z = Z ** lisse(s), f = lisse(s * 1.8);
      const F = [lin(E[0], H[0], f), lin(E[1], H[1], f)], T = [lin(E[0], Tf[0], f), lin(E[1], Tf[1], f)];
      const tr = (ex: number, ey: number) => `translate(${z * (ex - F[0]) + T[0] - ex}px, ${z * (ey - F[1]) + T[1] - ey}px) scale(${z})`;
      im.marque.push({ transform: tr(sx, sy) });
      // volet : se replie vers le bas en 130 ms, le site apparaît par le haut de l'embrasure (aucun état grisé)
      const c = 1 - lisse((s * D) / 130);
      im.volet.push({ transform: `${tr(hx - 2, hy - 2)} translateY(${(hh + 4) * (1 - c)}px) scaleY(${Math.max(c, 0.0001)})` });
      const x0 = z * (hx - F[0]) + T[0], x1 = z * (hx + hw - F[0]) + T[0], y0 = z * (hy - F[1]) + T[1], y1 = z * (hy + hh - F[1]) + T[1];
      im.g.push({ transform: `translateX(${x0}px)` });
      im.d.push({ transform: `translateX(${x1 - vw}px)` });
      im.h.push({ transform: `translateY(${y0}px)` });
      im.b.push({ transform: `translateY(${y1 - vh}px)` });
    }
    anime(marque, im.marque, D, A0);
    anime(volet, im.volet, D, A0);
    for (const c of ["g", "d", "h", "b"] as const) anime(pan[c], im[c], D, A0);
    // le reste de l'emblème s'efface sur 8 images (1240 -> 1375 ms), puis la Porte sur 8 images (1360 -> 1495 ms), quand
    // linteau et piliers sortent du cadre. Une seule animation pour la Porte : apparition au début du fondu, effacement
    anime(entier, [{ opacity: 1 }, { opacity: 0 }], 135, 1240);
    anime(piliers, [{ opacity: 0 }, { opacity: 1, offset: 0.001 }, { opacity: 1, offset: 120 / 255 }, { opacity: 0 }], 255, 1240);
    // garde : quoi qu'il arrive, le voile part à BUDGET depuis la navigation
    minuteurs.forEach(clearTimeout);
    minuteurs.push(window.setTimeout(sauter, BUDGET - (performance.now() - t0)));
    lecture.forEach((an) => an.play());
    ov.dataset.etat = "joue";
    lecture[0].ready.then(() => {
      if (fini || saute) return;
      const reste = (ms: number) => Math.max(0, ms - Number(lecture[0].currentTime));
      minuteurs.push(window.setTimeout(() => (ov.style.pointerEvents = "none"), reste(UTILISABLE)), window.setTimeout(terminer, reste(DUREE)));
    });
  };
  new Promise<void>((ok, ko) => {
    img.onload = () => ok();
    img.onerror = () => (img.src.endsWith(o.webp) ? ko() : (img.src = o.webp));
    img.src = o.avif;
  }).then(() => img.decode()).then(jouer, sauter);
}

// Script de tête de <body> (DocumentSite) : hors accueil, déjà vue dans la session ou mouvement réduit, il marque
// html[data-ouverture="vue"] et s'arrête ; sinon il pose le voile blanc avant le premier affichage et lance l'ouverture.
const params: Params = { cle: CLE_OUVERTURE, accueil: ACCUEIL.source, fin: FIN_OUVERTURE, avif: "/ouverture/embleme.avif", webp: "/brand/oht-embleme.webp", dev: process.env.NODE_ENV === "development", e: EMBLEME };
export const scriptOuverture = `(${ouverture.toString()})(${JSON.stringify(params)})`;
