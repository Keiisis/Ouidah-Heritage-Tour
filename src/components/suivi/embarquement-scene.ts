// Mise en scène de l'animation « Bienvenue au Bénin », portée telle quelle de la maquette validée
// (Assets OHT/Animation-Embarquement/maquettes/experience.html, Kevin, 22-23/10/2026) : une image = une fonction du temps.
// Ticket (0 → 4 s), métamorphose du ticket en billet (0,8 s), puis le film : 10 plans, 22,1 s. Seuls transform et opacity
// bougent (les fumées de l'atterrissage, qui changeaient de taille, passent ici par scale). Repère 1920 × 1080 (16:9) ou
// 1080 × 1920 (9:16, téléphone en portrait), recomposé plan par plan.

type Css = Record<string, string | number>;
const S = (el: Element, css: Css) => Object.assign((el as HTMLElement).style, css);

// ---------- temps ----------
export const T_IMPR = 2.8, T_TICKET = 4.0, T_TRANS = 0.8, T0 = T_TICKET + T_TRANS, DUREE_ANIM = 22.1, FIN = T0 + DUREE_ANIM;
const PL = { comptoir: 0, scan: 1.6, passerelle: 2.5, decollage: 4.9, globe: 7.1, approche: 10.0, cotonou: 11.6, porte: 13.8, salut: 16.2, titre: 18.2 };
/** Instants du préchauffage (repère du film) : un rendu par plan et par effet nouveau, avant de lancer l'horloge. */
export const PRECHAUFFE = [-0.5, 0.3, 1.6, 2.2, 2.6, 4.7, 5.0, 6.5, 7.2, 8.5, 9.6, 10.2, 11.7, 12.5, 13.6, 14.5, 15.5, 16.3, 17.9, 18.6, 19.9, 21];

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const eio = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const eo = (k: number) => 1 - Math.pow(1 - k, 3);
const ei = (k: number) => k * k * k;
const lisse = (k: number) => k * k * k * (k * (6 * k - 15) + 10);
const back = (k: number) => {
  const c = 1.6;
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
};

// ---------- géométrie relevée sur les décors (repère 1920 × 1080) ----------
const SOL = 745, PASSERELLE = 712, H_PERSO = 230;
const AV = { w: 1394, h: 520, roueY: 515, porte: { x: 1150, y: 244, w: 50, h: 102 } };
const DOCK = { s: 1.15, x: 1517, sol: 800 };
const G = { cx: 960, cy: 545, s: 1.1, w: 811, h: 820, benin: [455, 418] };
const pin = [G.cx - (G.w * G.s) / 2 + G.benin[0] * G.s, G.cy - (G.h * G.s) / 2 + G.benin[1] * G.s];
// Cotonou : l'avion s'arrête avec son bord gauche à x = 600 ; porte en (1520–1560, 588–670)
const C = { s: 0.8, sol: 805, xFin: 600 };
const porteBas = C.sol - AV.roueY * C.s + (AV.porte.y + AV.porte.h) * C.s;
const porteX = C.xFin + (AV.porte.x + AV.porte.w / 2) * C.s, porteY = C.sol - AV.roueY * C.s + (AV.porte.y + AV.porte.h / 2) * C.s;
const ESC = { k: (830 - porteBas) / (299 - 78) }; // escalier d6 retourné : plancher y = 78, roues y = 299
const yCentreSol = (sol: number, s: number) => sol - (AV.roueY - AV.h / 2) * s;
const W_C = (H_PERSO * 232) / 320, W_M = (H_PERSO * 284) / 320, HP = 98, WP = (HP * 458) / 640, HS = 907, WS = (HS * 458) / 640;
const Z_COT = 1.25, Z_VOL = 1.2; // atterrissage cadré serré ; portrait : l'avion fait environ 25 % de la hauteur
const R_FUMEE = 68; // rayon final des fumées : taille de base de .eb-fumee, réduite par scale

const trouve = <E extends Element>(root: HTMLElement, sel: string) => {
  const e = root.querySelector<E>(sel);
  if (!e) throw new Error(`embarquement : ${sel}`);
  return e;
};

/** Prépare la scène posée dans `root` (attributs data-eb) et renvoie son rendu à l'instant t (secondes). */
export function preparerScene(root: HTMLElement, portrait: boolean) {
  const cache = new Map<string, HTMLElement>();
  const $ = (k: string) => {
    let e = cache.get(k);
    if (!e) cache.set(k, (e = trouve<HTMLElement>(root, `[data-eb="${k}"]`)));
    return e;
  };
  const enfants = (k: string) => Array.from($(k).children) as HTMLElement[];

  // ---------- format : 16:9 (bureau) ou 9:16 (téléphone en portrait) ----------
  const scene = $("scene");
  const SW = portrait ? 1080 : 1920, SH = portrait ? 1920 : 1080;
  scene.classList.toggle("is-portrait", portrait);
  S(scene, { width: SW + "px", height: SH + "px" });
  const ajuste = () => {
    const k = Math.min(window.innerWidth / SW, window.innerHeight / SH);
    scene.style.transform = `translate(${(window.innerWidth - SW * k) / 2}px,${(window.innerHeight - SH * k) / 2}px) scale(${k})`;
  };

  // ---------- ticket : imprimante, hauteur du papier mesurée une seule fois (rendu déterministe) ----------
  const papier = trouve<HTMLElement>(root, ".sv-papier");
  const IMP = portrait ? { x: 18, y: 60, s: 1.45 } : { x: 190, y: 58, s: 1.25 }; // portrait : x recalculé pour centrer
  let H_PAPIER = 0;
  const hPapier = () => H_PAPIER || (H_PAPIER = papier.offsetHeight);
  function placer() {
    const h = hPapier();
    S($("t-sortie"), { height: Math.max(778, h) + "px" }); // un ticket plus long que la maquette sort en entier
    if (!portrait) {
      if ((22 + h) * IMP.s + IMP.y > SH - 40) IMP.s = (SH - 40 - IMP.y) / (22 + h); // le ticket tient dans le cadre
      return;
    }
    const bloc = $("t-texte"), total = (22 + h) * IMP.s + 44 + bloc.offsetHeight;
    if (total > SH - 80) {
      IMP.s = (SH - 80 - 44 - bloc.offsetHeight) / (22 + h);
      IMP.x = (SW - 720 * IMP.s) / 2;
    } // le tout doit tenir dans l'écran
    IMP.y = Math.max(40, (SH - ((22 + h) * IMP.s + 44 + bloc.offsetHeight)) / 2); // imprimante + texte centrés verticalement
    S(bloc, { top: IMP.y + (22 + h) * IMP.s + 44 + "px" });
  }

  // ---------- personnage : piles d'images (toutes décodées d'avance) ----------
  function montre(k: string, i: number) {
    enfants(k).forEach((im, j) => {
      const v = j === i ? "visible" : "hidden";
      if (im.style.visibility !== v) im.style.visibility = v;
    });
  }

  // ---------- décors ----------
  S($("dock"), { left: DOCK.x + "px", top: DOCK.sol - AV.roueY * DOCK.s + "px" });
  S($("porte-dock"), { left: (AV.w - AV.porte.x - AV.porte.w) * DOCK.s + "px", top: AV.porte.y * DOCK.s + "px", width: AV.porte.w * DOCK.s + "px", height: AV.porte.h * DOCK.s + "px", transformOrigin: "0 50%" });

  // l'arc entre par le bord gauche du cadre (portrait : cadre plus étroit, il part du bord visible)
  const P0 = portrait ? [470, 330] : [-120, 380], P1 = portrait ? [700, -40] : [600, -60];
  const kArc = (a: number) => eo(seg(a, 7.1, 9.0));
  const arc = trouve<SVGPathElement>(root, '[data-eb="arc"]');
  arc.setAttribute("d", `M ${P0[0]} ${P0[1]} Q ${P1[0]} ${P1[1]} ${pin[0]} ${pin[1]}`);
  const arcLen = arc.getTotalLength();
  const surArc = (k: number): [number, number, number] => {
    const p = arc.getPointAtLength(arcLen * k), p2 = arc.getPointAtLength(Math.min(arcLen, arcLen * k + 2));
    return [p.x, p.y, Math.atan2(p2.y - p.y, p2.x - p.x)];
  };

  // piste de départ agrandie autour de (960, 772) : plus d'avion, moins de ciel, aucun bord visible
  const PISTE = { k: portrait ? 2.3 : 1.4, ox: 960, oy: 772 };
  const solDepart = PISTE.oy + (765 - PISTE.oy) * PISTE.k;
  S($("piste-depart"), { transformOrigin: "0 0", transform: `translate(${PISTE.ox * (1 - PISTE.k)}px,${PISTE.oy * (1 - PISTE.k)}px) scale(${PISTE.k})` });

  S($("perso-comptoir"), { height: H_PERSO + "px", width: W_C + "px", left: 530 - W_C / 2 + "px", top: SOL - H_PERSO + "px", transform: "scaleX(-1)" });
  S($("perso-marche"), { height: H_PERSO + "px", width: W_M + "px", left: "0px", top: PASSERELLE - H_PERSO + "px" });
  S($("ombre-perso"), { left: "0px", top: "0px", width: "140px", height: "24px" });
  S($("perso-scan"), { height: 820 * 0.937 + "px", left: "0px", top: 450 - 249 * 0.937 + "px", transformOrigin: "50% 100%" });
  S($("lueur-scan"), { left: "1570px", top: "370px" });
  S($("escalier"), { height: 300 * ESC.k + "px", left: "0px", top: 830 - 300 * ESC.k + "px" });
  // il sort sur la plateforme de l'escalier, devant la rambarde (repère du monde)
  S($("perso-porte"), { width: WP * C.s + "px", height: HP * C.s + "px", left: porteX - WP * C.s * 0.45 + "px", top: porteBas - HP * C.s + 3 + "px", transformOrigin: "50% 100%" });
  S($("perso-salut"), { width: WS + "px", height: HS + "px", left: "710px", top: 970 - HS + "px", transformOrigin: "50% 100%" });
  S($("epingle"), { left: pin[0] - 44 + "px", top: pin[1] - 120 + "px", transformOrigin: "50% 100%" });

  function placeAvion(cx: number, cy: number, s: number, rot = 0) {
    S($("avion-vol"), { transform: `translate(${cx}px,${cy}px) rotate(${rot}deg) scale(${s}) translate(${-AV.w / 2}px,${-AV.h / 2}px)`, display: "block" });
  }

  // ---------- caméras ----------
  // maquette de départ (plans 1 et 3) : point visé (x, y) et échelle s
  const persoX = (a: number) => lerp(1000, 1640, seg(a, 2.55, 4.6));
  function camDepart(a: number) {
    if (a < 2.4) {
      const k = eio(seg(a, 0, PL.scan)), push = lisse(seg(a, 1.32, 1.64));
      const c = { x: lerp(480, 505, k), y: 640, s: lerp(2.3, 2.45, k) };
      return { x: lerp(c.x, 675, push), y: lerp(c.y, 600, push), s: lerp(c.s, 4.4, push), push };
    }
    return { x: clamp(persoX(a) + 120, 1150, 1700), y: 600, s: 2.2, push: 0 };
  }
  type Cam = { x: number; y: number; s: number };
  const versEcran = (c: Cam, x: number, y: number) => [960 + (x - c.x) * c.s, 540 + (y - c.y) * c.s];

  // vol (plans 4 à 8) : point du monde W amené au point d'écran P, échelle s
  type CamVol = { wx: number; wy: number; px: number; py: number; s: number };
  function camVol(a: number): CamVol {
    const base = { wx: 1100, wy: 805, px: 1100, py: 805, s: 1 };
    if (a < PL.cotonou) return base;
    // l'atterrissage est cadré serré (1,25) : l'avion garde à l'écran la taille et la place qu'il avait à la fin de l'approche
    const kA = eio(seg(a, PL.cotonou, 13.4)), kB = lisse(seg(a, 13.3, 15.0)), kC = seg(a, 15.0, PL.salut);
    return { wx: lerp(1100, porteX, kB), wy: lerp(805, porteY, kB), px: 1100, py: lerp(805, 470, kB), s: lerp(lerp(Z_COT, 1.15, kA), 4.6, kB) * lerp(1, 1.06, kC) };
  }
  const camVolT = (c: CamVol) => `translate(${c.px - c.wx * c.s}px,${c.py - c.wy * c.s}px) scale(${c.s})`;
  const camVolPt = (c: CamVol, x: number, y: number) => [c.px + (x - c.wx) * c.s, c.py + (y - c.wy) * c.s];

  // portrait : chaque calque 16:9 est recadré (z, point visé fx, fy) ; « remplir » interdit les bords pour les décors opaques
  type PCam = { tx: number; ty: number; z: number };
  function pcamVals(z: number, fx: number, fy: number, remplir: boolean): PCam {
    let tx = SW / 2 - fx * z, ty = SH / 2 - fy * z;
    if (remplir) {
      tx = clamp(tx, SW - 1920 * z, 0);
      ty = clamp(ty, SH - 1080 * z, 0);
    }
    return { tx, ty, z };
  }
  const pcamT = (p: PCam) => (portrait ? `translate(${p.tx}px,${p.ty}px) scale(${p.z}) ` : "");
  const pcamPt = (p: PCam, x: number, y: number) => (portrait ? [p.tx + x * p.z, p.ty + y * p.z] : [x, y]);
  function pDepart(a: number) {
    const c = camDepart(a);
    if (a < 2.4) return pcamVals(lerp(1.55, 1.778, c.push), lerp(920, 960, c.push), lerp(560, 540, c.push), false);
    const [mx] = versEcran(c, persoX(a), 0), [dx] = versEcran(c, 1768, 0);
    return pcamVals(1.6, clamp(lerp(mx + 100, dx, seg(a, 4.2, 4.6)), 338, 1582), 560, false);
  }
  const pScan = () => pcamVals(1.778, 1400, 540, true);
  const pSeuil = () => pcamVals(1.778, 1035, 520, true);

  // ---------- l'avion : une seule trajectoire, du décollage à l'arrêt ----------
  type Avion = { cx: number; cy: number; s: number; rot: number; o: number };
  function avion(a: number): Avion | null {
    if (a < PL.decollage || a > PL.salut + 0.3) return null;
    if (a < PL.globe + 0.05) {
      // accélération constante, il s'envole et sort à droite sans ralentir
      const tau = Math.max(0, a - (PL.decollage + 0.05)), s = portrait ? 0.75 : 1.05;
      const cx = 700 + 0.5 * 950 * tau * tau, up = tau > 1 ? 0.5 * 744 * (tau - 1) * (tau - 1) : 0;
      return { cx, cy: yCentreSol(solDepart, s) - up, s, rot: -8 * seg(tau, 0.85, 1.3), o: 1 };
    }
    if (a < PL.approche) {
      // autour du globe : entre lancé par le bord du cadre, ralentit jusqu'à l'épingle du Bénin
      const [x, y, ang] = surArc(kArc(a));
      return { cx: x, cy: y, s: 0.12, rot: (ang * 180) / Math.PI, o: seg(a, 7.08, 7.14) * (1 - seg(a, 8.85, 9.0)) };
    }
    const bob = Math.sin(a * 2.4) * 6;
    if (a < PL.cotonou) {
      // approche : la côte arrive, il descend et grossit vers la côte
      const k = seg(a, PL.approche, PL.cotonou);
      return { cx: lerp(400, 760, k), cy: lerp(400, 520, eio(k)) + bob, s: C.s * lerp(1.05, Z_COT, eio(k)), rot: lerp(-1, 3, k), o: 1 };
    }
    // Cotonou : départ = position et vitesse de fin d'approche, ramenées dans le repère du monde ; Hermite jusqu'à l'arrêt
    const T = 13.4 - PL.cotonou, u = seg(a, PL.cotonou, 13.4), desc = eo(seg(a, PL.cotonou, 12.4));
    const x0 = 1100 + (760 - 1100) / Z_COT, y0 = 805 + (520 - 805) / Z_COT, v0 = 225 / Z_COT, D = C.xFin + (AV.w / 2) * C.s - x0;
    const cx = x0 + (u * u * u - 2 * u * u + u) * T * v0 + (-2 * u * u * u + 3 * u * u) * D;
    const choc = a > 12.4 ? Math.sin((a - 12.4) * 40) * 6 * Math.exp(-(a - 12.4) * 8) : 0;
    return { cx, cy: lerp(y0 + bob / Z_COT, yCentreSol(C.sol, C.s), desc) - choc, s: C.s, rot: lerp(3, 0, desc), o: 1 };
  }
  // suivi : linéaire entre lo et hi, genoux paraboliques de largeur k (vitesse continue, jamais de butée)
  function suivi(x: number, lo: number, hi: number, k = 220) {
    if (x <= lo - k) return lo;
    if (x < lo + k) return lo + (x - (lo - k)) ** 2 / (4 * k);
    if (x <= hi - k) return x;
    if (x < hi + k) return hi - (hi + k - x) ** 2 / (4 * k);
    return hi;
  }
  function pVol(a: number, av: Avion | null) {
    if (a < 7.05) return pcamVals(1.25, suivi(av ? av.cx : 960, 540, 1500), 560, false);
    if (a < PL.approche) return pcamVals(1.15, 960, 545, false);
    if (a < PL.cotonou) return pcamVals(Z_VOL, suivi(av ? av.cx : 760, 560, 1360), 560, false);
    const c = camVol(a), kB = lisse(seg(a, 13.3, 15.0)), [dx, dy] = camVolPt(c, porteX, porteY);
    const [ax] = av ? camVolPt(c, av.cx, av.cy) : [dx];
    return pcamVals(lerp(Z_VOL, 1.6, kB), lerp(suivi(ax, 560, 1360), dx, kB), lerp(560, dy, kB), false);
  }

  // position du billet sur le comptoir, à l'écran, au début du film (cible de la métamorphose du ticket)
  function billetEcran() {
    const c = camDepart(0), p = pDepart(0), [x, y] = versEcran(c, 391, 619);
    const [ex, ey] = pcamPt(p, x, y);
    return [ex, ey, 62 * c.s * (portrait ? p.z : 1)];
  }

  // ---------- une image = une fonction du temps ----------
  function render(t: number) {
    const vis = (k: string, o: number) => S($(k), { opacity: o, display: o > 0.001 ? "block" : "none" });
    // ----- ticket : le papier avance par à-coups, comme une imprimante thermique -----
    const imp = seg(t, 0.25, 0.25 + T_IMPR);
    const pas = Math.floor(imp * 14) / 14, dans = (imp * 14) % 1;
    const sortie = clamp(pas + eo(clamp(dans * 3)) / 14);
    const h = hPapier();
    papier.style.transform = `translateY(${sortie * h - h}px)`;
    const tr = eio(seg(t, T_TICKET, T0));
    const efface = 1 - seg(t, T_TICKET, T_TICKET + 0.15);
    S($("t-titre"), { opacity: eo(seg(t, 0.2, 0.8)) * efface, transform: `translateY(${24 * (1 - eo(seg(t, 0.2, 0.9)))}px)` });
    S($("t-sous"), { opacity: eo(seg(t, 0.5, 1.1)) * efface });
    const oActions = eo(seg(t, T_IMPR + 0.4, T_IMPR + 0.9)) * efface;
    S($("t-actions"), { opacity: oActions, pointerEvents: oActions > 0.5 ? "auto" : "none" });

    // métamorphose : le ticket imprimé rétrécit et vole jusqu'au comptoir, où il devient le billet du voyageur
    let ix = IMP.x, iy = IMP.y, is = IMP.s;
    if (tr > 0) {
      const [bx, by, bw] = billetEcran(), s1 = (bw * 1.25) / 660;
      ix = lerp(IMP.x, bx - 360 * s1, tr);
      iy = lerp(IMP.y, by - (22 + h / 2) * s1, tr);
      is = lerp(IMP.s, s1, tr);
    }
    S($("imprimante"), { transform: `translate(${ix}px,${iy}px) scale(${is})` });
    S($("t-fente"), { opacity: 1 - seg(t, T_TICKET, T_TICKET + 0.3) });
    S($("ticket-fond"), { opacity: 1 - eo(seg(t, T_TICKET + 0.15, T0 - 0.1)) });
    S(papier, { opacity: t < T0 - 0.02 ? 1 : 0 });
    S($("ticket"), { display: t >= T0 ? "none" : "block" });

    const a = t - T0;
    S($("anim"), { display: a > -T_TRANS ? "block" : "none" });
    vis("p-depart", a < 2.0 ? 1 - seg(a, 1.58, 1.64) : seg(a, 2.45, 2.55) * (1 - seg(a, 4.85, 4.95)));
    vis("p-scan", a < 2.0 ? seg(a, 1.58, 1.64) : 1 - seg(a, 2.45, 2.55));
    S($("vol"), { display: a > 4.8 && a < PL.salut ? "block" : "none" });
    vis("p-decollage", seg(a, 4.85, 4.95) * (1 - seg(a, 7.05, 7.15)));
    vis("p-globe", seg(a, 7.05, 7.15) * (1 - seg(a, 9.95, 10.03)));
    vis("p-approche", seg(a, 9.95, 10.03) * (a < PL.cotonou ? 1 : 0));
    vis("p-cotonou", a >= PL.cotonou ? 1 : 0);
    vis("p-seuil", a >= PL.salut && a < 18.5 ? 1 : 0);
    vis("titre", a > 17.75 ? 1 : 0);

    // ----- plans 1 et 3 : maquette de départ -----
    const cd = camDepart(a), pd = pDepart(a);
    S($("p-depart"), { transform: pcamT(pd) || "none" });
    S($("m-depart"), { transform: `translate(${960 - cd.x * cd.s}px,${540 - cd.y * cd.s}px) scale(${cd.s})` });
    S($("porte-dock"), { transform: `scaleX(${1 - eio(seg(a, 4.55, 4.8))})` });
    if (a < 2.4) {
      montre("perso-comptoir", a < 0.35 ? 0 : a < 0.6 ? 1 : a < 0.9 ? 2 : 3); // tend la main, prend, garde le billet
      S($("perso-comptoir"), { display: "block" });
      S($("perso-marche"), { display: "none" });
      S($("ombre-perso"), { transform: `translate(460px,${SOL - 12}px)` });
      // le billet glisse vers la main tendue (image 2) et disparaît quand l'image 3 le montre dans sa main
      const kb = eio(seg(a, 0.3, 0.58));
      S($("billet-comptoir"), { display: "block", opacity: a < -0.02 ? 0 : 1 - seg(a, 0.57, 0.6), transform: `translate(${lerp(360, 420, kb)}px,${lerp(588, 592, kb)}px) rotate(${lerp(0, -6, kb)}deg)` });
    } else {
      S($("billet-comptoir"), { display: "none" });
      S($("perso-comptoir"), { display: "none" });
      const x = persoX(a);
      S($("perso-marche"), { display: "block", transform: `translateX(${x - W_M / 2}px)` });
      montre("perso-marche", Math.floor(Math.max(0, a - 2.5) * 13) % 8);
      S($("ombre-perso"), { transform: `translate(${x - 70}px,${PASSERELLE - 12}px)` });
    }

    // ----- plan 2 : scan ; il arrive en marchant, tend le billet, le lecteur s'allume -----
    S($("p-scan"), { transform: pcamT(pScan()) || "none" });
    const ks = seg(a, PL.scan, PL.scan + 0.45), pasScan = (a - PL.scan) * 4.4 * Math.PI;
    S($("perso-scan"), { transform: `translate(${lerp(660, 798, eo(ks))}px,${-Math.abs(Math.sin(pasScan)) * 10 * (1 - ks)}px) rotate(${Math.sin(pasScan) * 1.2 * (1 - ks)}deg)` });
    const glow = seg(a, 2.05, 2.15) * (1 - 0.6 * seg(a, 2.3, 2.5));
    S($("lueur-scan"), { opacity: glow, transform: `scale(${1 + glow * 0.6})` });

    // ----- plans 4 à 8 : vol -----
    const av = avion(a), cv = camVol(a), pv = pVol(a, av);
    S($("vol"), { transform: pcamT(pv) + camVolT(cv) });
    if (av) {
      placeAvion(av.cx, av.cy, av.s, av.rot);
      S($("avion-vol"), { opacity: av.o });
    } else S($("avion-vol"), { display: "none" });
    const xAv = av ? av.cx - (AV.w / 2) * av.s : C.xFin;

    // globe : il grandit, l'arc entre par la gauche, l'épingle tombe sur le Bénin, plongée dans l'épingle
    const kg = eo(seg(a, 7.05, 7.6)), zoom = ei(seg(a, 9.45, 10.0));
    const gs = G.s * lerp(0.82, 1, kg) * lerp(1, 5, zoom);
    const gx = lerp(G.cx, pin[0], zoom) - (pin[0] - G.cx) * (gs / G.s - 1) * zoom, gy = lerp(G.cy, pin[1], zoom) - (pin[1] - G.cy) * (gs / G.s - 1) * zoom;
    S($("globe"), { transform: `translate(${gx - (G.w * gs) / 2}px,${gy - (G.h * gs) / 2}px) scale(${gs})` });
    arc.style.strokeDasharray = String(arcLen);
    arc.style.strokeDashoffset = String(arcLen * (1 - kArc(a)));
    const kpin = seg(a, 8.95, 9.3), pouls = a > 9.3 ? 1 + 0.12 * Math.sin((a - 9.3) * 18) * Math.exp(-(a - 9.3) * 5) : 1;
    S($("epingle"), { transform: `translateY(${-60 * (1 - back(kpin))}px) scale(${pouls})`, opacity: kpin > 0 ? 1 : 0 });

    // approche : bande côtière + mer prolongée dessous, nuages (n3 passe devant la dérive)
    const kap = seg(a, PL.approche, PL.cotonou);
    S($("bande"), { transform: `translate(${-480 * kap}px,${lerp(-330, -430, kap)}px)` });
    S($("n1"), { transform: `translateX(${lerp(1900, -300, kap)}px)` });
    S($("n2"), { transform: `translateX(${lerp(2300, 300, kap)}px)` });
    S($("n3"), { transform: `translateX(${lerp(2100, -500, seg(a, 10.2, 11.5))}px)`, display: a > 10.1 && a < 11.6 ? "block" : "none" });

    // toucher des roues : fumées sous le train principal
    for (let i = 0; i < 6; i++) {
      const k = seg(a, 12.4 + i * 0.03, 13.1 + i * 0.05), x = xAv + (i < 3 ? 470 : 965) * C.s, r = 18 + 50 * eo(k);
      S($("f" + i), { transform: `translate(${x - r + (i % 3) * 22}px,${C.sol - r * 0.9}px) scale(${r / R_FUMEE})`, opacity: k > 0 && k < 1 ? 0.85 * (1 - k) : 0, display: a > 12.3 && a < 13.4 ? "block" : "none" });
    }
    // escalier, porte, voyageur à la porte
    S($("escalier"), { transform: `translateX(${lerp(2100, porteX - 57 * ESC.k, eo(seg(a, 13.0, 13.75)))}px) scaleX(-1)`, display: a > 12.95 ? "block" : "none" });
    const ko = eio(seg(a, 13.7, 14.1));
    S($("porte"), { opacity: ko > 0 ? 1 : 0, transform: `scaleX(${ko})` });
    const kp = eo(seg(a, 14.05, 14.35));
    S($("perso-porte"), { transform: `translateY(${4 * (1 - kp)}px) scale(${lerp(0.92, 1, kp)})`, opacity: kp, display: kp > 0 ? "block" : "none" });
    montre("perso-porte", Math.floor(Math.max(0, a - 14.4) * 6) % 4);

    // ----- plan 9 : seuil ; deux saluts, le corps se balance -----
    S($("p-seuil"), { transform: pcamT(pSeuil()) || "none" });
    S($("perso-salut"), { transform: `translateY(${Math.sin((a - PL.salut) * 7) * 4}px) rotate(${Math.sin((a - PL.salut) * 3.5) * 1.2}deg)` });
    montre("perso-salut", Math.floor(Math.max(0, a - (PL.salut + 0.05)) * 6) % 4);

    // ----- plan 10 : le billet sort de sa main levée, grandit et remplit le cadre -----
    const kt = seg(a, 17.75, 18.5), main = pcamPt(pSeuil(), 850, 150);
    const zT = portrait ? 0.588 : 1, fin = portrait ? [540, 860] : [960, 540];
    const sB = lerp(0.05, 1, back(kt)) * zT;
    const choc2 = a > 19.95 ? Math.sin((a - 19.95) * 38) * 5 * Math.exp(-(a - 19.95) * 9) : 0;
    const px = lerp(main[0], fin[0], eo(kt)) + choc2, py = lerp(main[1], fin[1], eo(kt)) + choc2 * 0.6;
    S($("titre-billet"), { opacity: seg(a, 17.75, 17.8), transform: `translate(${px}px,${py}px) rotate(${lerp(-14, 0, eo(kt))}deg) scale(${sB}) translate(-962px,-516px)` });
    S($("titre-fond"), { opacity: eo(seg(a, 18.1, 18.45)) });
    for (const k of ["l1", "l1p"]) S($(k), { opacity: seg(a, 18.55, 18.85), transform: `translateY(${18 * (1 - eo(seg(a, 18.55, 18.95)))}px)` });
    enfants("l2").forEach((sp, i) => {
      const k = eo(seg(a, 18.75 + i * 0.07, 19.2 + i * 0.07));
      S(sp, { opacity: k, transform: `translateY(${(1 - k) * 34}%)` });
    });
    enfants("feux").forEach((f, i) => f.classList.toggle("is-on", a > 19.3 + i * 0.07));
    const kst = seg(a, 19.8, 20.0);
    S($("tampon"), { opacity: kst > 0 ? 1 : 0, transform: `rotate(-12deg) scale(${lerp(1.7, 1, eo(kst))})` });
  }

  return { scene, ajuste, placer, render };
}
