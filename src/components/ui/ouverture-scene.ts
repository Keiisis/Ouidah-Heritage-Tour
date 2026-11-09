// Moteur de l'ouverture « Dangbé » (piste H, passe 4, validée par Kevin le 29/10/2026). Une seule SVG plein écran, rendue
// image par image : la tête du python écrit le O, les brins de la tresse apparaissent derrière elle, le nœud tire la corde,
// les lettres sortent de derrière la corde, HERITAGE TOUR se trace, tenue, puis plongée dans l'œil qui s'ouvre sur le site.
// Le logo est vectorisé depuis public/brand/oht-logo.png (Assets OHT/Preloader/outils/construire-logo.sh).

type Pt = [number, number];
export type LogoOuverture = {
  taille: Pt;
  centre: Pt;
  pieces: Record<string, [number, number, number, number]>;
  chemins: { anneau: Pt[]; corde: Pt[]; jonction_tete: Pt; oeil: [number, number, number]; oeil_d: { d: string; ox: number; oy: number; s: number } };
};

const NS = "http://www.w3.org/2000/svg";
const clamp = (x: number) => Math.min(Math.max(x, 0), 1);
const lisse = (x: number) => {
  x = clamp(x);
  return x * x * x * (x * (6 * x - 15) + 10);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const bezier = (x1: number, y1: number, x2: number, y2: number) => {
  const f = (t: number, a: number, b: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (x: number) => {
    x = clamp(x);
    let lo = 0, hi = 1;
    for (let i = 0; i < 30; i++) {
      const m = (lo + hi) / 2;
      if (f(m, x1, x2) < x) lo = m;
      else hi = m;
    }
    return f((lo + hi) / 2, y1, y2);
  };
};
const inv = (e: (x: number) => number, v: number) => {
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2;
    if (e(m) < v) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
};
// polyligne : position et angle (cumulé, sans saut de 360°) à une fraction de la longueur
function chemin(pts: Pt[]) {
  const seg: number[] = [], ang: number[] = [];
  let L = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
    seg.push(Math.hypot(dx, dy));
    L += seg[seg.length - 1];
    let a = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (ang.length) {
      while (a - ang[ang.length - 1] > 180) a -= 360;
      while (a - ang[ang.length - 1] < -180) a += 360;
    }
    ang.push(a);
  }
  const at = (u: number) => {
    let d = clamp(u) * L, i = 0;
    while (i < seg.length - 1 && d > seg[i]) d -= seg[i++];
    const f = seg[i] ? d / seg[i] : 0;
    const a0 = ang[Math.max(i - 1, 0)], a1 = ang[i], a2 = ang[Math.min(i + 1, ang.length - 1)];
    return { x: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, y: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f, ang: f < 0.5 ? a0 + (a1 - a0) * (f + 0.5) : a1 + (a2 - a1) * (f - 0.5) };
  };
  return { at, L, d: "M" + pts.map((p) => p.join(" ")).join(" L") };
}
// écrit un attribut seulement s'il change (le navigateur ne repeint que ce qui bouge)
const setA = (e: Element, a: string, v: string | number) => {
  const s = String(v);
  if (e.getAttribute(a) !== s) e.setAttribute(a, s);
};
const el = (tag: string, at: Record<string, string | number> = {}, parent?: Element) => {
  const e = document.createElementNS(NS, tag);
  for (const [a, v] of Object.entries(at)) e.setAttribute(a, String(v));
  parent?.append(e);
  return e;
};
const nombres = (m: string) => (m.match(/-?[\d.e+-]+/g) ?? []).map(Number);

/** Construit la scène dans `svg` et renvoie la durée et la fonction de rendu au temps t (ms). */
export function preparerOuverture(svg: SVGSVGElement, M: LogoOuverture, vec: Document, W: number, H: number) {
  const [LW, LH] = M.taille, P = M.pieces, C = M.centre;
  // portrait (téléphone ou tablette debout) : parcours recomposé ; paysage : parcours bureau
  const mobile = H > W * 1.15, k = Math.min((W * (mobile ? 0.9 : 0.74)) / LW, 1000 / LW);
  const PLONGE = 2150;
  const piece = (nom: string) => document.importNode(vec.getElementById(`p-${nom}`) as Element, true);
  // matrice caméra : le point (fx, fy) du logo au centre de l'écran, échelle s (px écran par px logo), angle r
  const camM = (fx: number, fy: number, s: number, r = 0) => {
    const a = (r * Math.PI) / 180, c = Math.cos(a) * s, n = Math.sin(a) * s;
    return `matrix(${c} ${n} ${-n} ${c} ${W / 2 - (c * fx - n * fy)} ${H / 2 - (n * fx + c * fy)})`;
  };

  // —— scène
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const defs = el("defs", {}, svg);
  const mOeil = el("mask", { id: "ov-oeil", maskUnits: "userSpaceOnUse", x: 0, y: 0, width: W, height: H }, defs);
  el("rect", { width: W, height: H, fill: "#fff" }, mOeil);
  const camOeil = el("g", {}, mOeil), od = M.chemins.oeil_d;
  const oeil = el("path", { d: od.d, transform: `translate(${od.ox} ${od.oy}) scale(${od.s})`, fill: "#fff" }, camOeil);
  const corps = chemin(M.chemins.anneau);
  const mTrait = el("mask", { id: "ov-trait", maskUnits: "userSpaceOnUse", x: 0, y: 0, width: LW, height: LH }, defs);
  const trait = el("path", { d: corps.d, pathLength: 1, fill: "none", stroke: "#fff", "stroke-width": 170, "stroke-linejoin": "round", "stroke-dasharray": "1 1" }, mTrait);
  // les lettres sortent de derrière la corde : découpe sur l'axe de la corde, qui les recouvre
  const ys = M.chemins.corde;
  const yCorde = (x: number) => {
    let i = 0;
    while (i < ys.length - 2 && ys[i + 1][0] < x) i++;
    const [a, b] = [ys[i], ys[i + 1]];
    return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1);
  };
  const dLettres = `M360 0 L${LW} 0 L${LW} ${ys[ys.length - 1][1]} ` + [...ys].reverse().map(([x, y]) => `L${x} ${y}`).join(" ") + ` L360 ${ys[0][1]} Z`;
  el("path", { d: dLettres }, el("clipPath", { id: "ov-lettres", clipPathUnits: "userSpaceOnUse" }, defs));
  const cHt = el("rect", { x: 870, y: 410, width: 0, height: 60 }, el("clipPath", { id: "ov-ht", clipPathUnits: "userSpaceOnUse" }, defs));
  el("circle", { cx: C[0], cy: C[1], r: 133 }, el("clipPath", { id: "ov-int", clipPathUnits: "userSpaceOnUse" }, defs));

  const voile = el("g", {}, svg);
  el("rect", { width: W, height: H, style: "fill: var(--accent-sun)" }, voile);
  const cam = el("g", {}, voile);
  // tresse : brins posés sous le corps ; chacun apparaît en entier quand la tête l'a dépassé
  const gTresse = el("g", {}, cam), gAnneau = el("g", { mask: "url(#ov-trait)" }, cam);
  gAnneau.append(piece("anneau"));
  const brins = [...document.importNode(vec.getElementById("p-brins") as Element, true).children].map((g) => {
    const d = (g as SVGGElement).dataset;
    return { g, groupe: d.groupe, cx: Number(d.cx), cy: Number(d.cy), t: 0 };
  });
  for (const b of brins) if (b.groupe === "anneau") gTresse.append(b.g);
  const gEmb = el("g", {}, el("g", { "clip-path": "url(#ov-int)" }, cam));
  for (const n of ["navire", "symbole", "porte", "eau"]) gEmb.append(piece(n));
  const lettres = ["l-U", "l-I", "l-D", "l-A", "l-H"].map((n) => {
    const g = el("g", {}, el("g", { "clip-path": "url(#ov-lettres)" }, cam));
    g.append(piece(n));
    const [x, , w, h] = P[n];
    return { g, x, w, h, t: 0 };
  });
  const gHt = el("g", { "clip-path": "url(#ov-ht)" }, cam);
  for (const n of Object.keys(P).filter((n) => n.startsWith("h-"))) gHt.append(piece(n));
  const gCordeB = el("g", {}, cam);
  for (const b of brins) if (b.groupe === "corde") gCordeB.append(b.g);
  const gNoeud = el("g", {}, cam);
  gNoeud.append(piece("noeud"));
  const gTete = el("g", {}, cam);
  gTete.append(piece("tete"));

  // —— temps
  const U0 = 0.3, T_TETE = 950, e1 = bezier(0.42, 0, 0.22, 1);
  const J = M.chemins.jonction_tete, finTete = corps.at(1);
  const D_CORDE = 640, T_CORDE = 640, e2 = bezier(0.5, 0, 0.18, 1), X0 = P.corde[0], CW = P.corde[2], NX = P.noeud[0];
  const eMonte = bezier(0.16, 1, 0.3, 1);
  const tFront = (x: number) => D_CORDE + T_CORDE * inv(e2, clamp((x - X0) / CW));
  // chaque lettre monte quand le nœud a dépassé son bord droit ; le H, 65 ms après le A (le nœud ralentit en bout de course)
  for (const L of lettres) L.t = tFront(Math.min(L.x + L.w, NX - 40) + 10);
  lettres[4].t = Math.max(tFront(lettres[4].x + 40), lettres[3].t + 65);
  const [OX, OY] = M.chemins.oeil;
  // à la fin, le rayon intérieur de l'œil (≈ 4,5 px du logo) dépasse la demi-diagonale de l'écran
  const S_FIN = (Math.hypot(W, H) / 2 / 4.5) * 1.8;
  const teteA = (t: number) => corps.at(U0 + (1 - U0) * e1(t / T_TETE));
  // angle de la tête autour du centre du O : table pour trouver quand elle dépasse un brin
  const angle = (x: number, y: number) => {
    const a = (Math.atan2(y - C[1], x - C[0]) * 180) / Math.PI;
    return a < -90 ? a + 360 : a;
  };
  const table: [number, number][] = [];
  for (let t = 0; t <= T_TETE; t += 5) {
    const h = teteA(t);
    table.push([t, angle(h.x, h.y)]);
  }
  const LAG = 12; // degrés : le brin apparaît juste derrière le cou
  // brins de l'anneau au départ de la corde (x > 330) : ils sortent avec le nœud, pas avant (sinon ils flottent seuls)
  for (const b of brins) b.t = b.groupe === "corde" ? tFront(b.cx - 10) : b.cx > 330 ? D_CORDE : (table.find(([, a]) => a >= angle(b.cx, b.cy) + LAG)?.[0] ?? T_TETE - 60);

  function camera(t: number) {
    const h = teteA(t), hAvant = teteA(t + 140); // la caméra vise un peu en avant de la tête
    const fhx = mix(h.x, hAvant.x, 0.6), fhy = mix(h.y, hAvant.y, 0.6);
    const a = lisse((t - 250) / 700), front = X0 + CW * e2((t - D_CORDE) / T_CORDE);
    let fx = mix(fhx, C[0], a), fy = mix(fhy, C[1], a), z = mix(mobile ? 5.2 : 3.1, mobile ? 4 : 1.75, lisse(t / 950));
    const r = mix(-14, 0, lisse(t / 900));
    if (mobile) {
      // on suit le nœud, nom en gros, puis recul sur le logo entier, tenu plus d'une demi-seconde
      const b = lisse((t - D_CORDE - 100) / 340), c = lisse((t - 1150) / 320);
      fx = mix(mix(fx, front - 150, b), LW / 2, c);
      fy = mix(mix(fy, 250, b), LH / 2, c);
      z = mix(mix(z, 2.3, b), 1, c);
    } else {
      const b = lisse((t - 650) / 600);
      fx = mix(fx, LW / 2, b);
      fy = mix(fy, LH / 2, b);
      z = mix(z, 1, b);
      // le front du nœud reste dans le cadre (marge de 90 px du logo)
      const droite = fx + W / 2 / (k * z);
      if (t > D_CORDE && front + 90 > droite) fx += front + 90 - droite;
    }
    z *= mix(1, 1.03, lisse((t - 1500) / 600));
    // plongée : vers l'œil, échelle exponentielle
    const u = clamp((t - PLONGE) / 700);
    if (u > 0) {
      const g = lisse(u * 1.4);
      fx = mix(fx, OX, g);
      fy = mix(fy, OY, g);
      z *= Math.pow(S_FIN / (k * z), Math.pow(u, 1.8));
    }
    return camM(fx, fy, k * z, r);
  }
  // fin : dès que l'œil couvre tout l'écran avec 10 % de marge ; au-delà, zoomer ne coûte que du calcul
  let fin = PLONGE + 700;
  const couvre = (Math.hypot(W, H) / 2 / 4.5) * 1.1;
  for (let t = PLONGE; t <= PLONGE + 700; t += 5) {
    const [a, b] = nombres(camera(t));
    if (Math.hypot(a, b) >= couvre) {
      fin = t + 20;
      break;
    }
  }
  // pendant la plongée, un calque sorti de l'écran est retiré du rendu
  const loin = [gEmb.parentNode as SVGGElement, gHt, ...lettres.map((L) => L.g.parentNode as SVGGElement), gNoeud, gCordeB, gAnneau, gTresse].map((g) => ({ g: g as SVGGraphicsElement, b: null as DOMRect | null }));
  const horsChamp = (b: DOMRect, m: string) => {
    const [a, bb, c, d, e, f] = nombres(m);
    const xs: number[] = [], yy: number[] = [];
    for (const [x, y] of [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]) {
      xs.push(a * x + c * y + e);
      yy.push(bb * x + d * y + f);
    }
    return Math.max(...xs) < 0 || Math.min(...xs) > W || Math.max(...yy) < 0 || Math.min(...yy) > H;
  };

  function rendre(t: number) {
    const Mx = camera(t);
    setA(cam, "transform", Mx);
    // les masques ne coûtent que pendant qu'ils servent : l'anneau jusqu'au O fini, l'œil à partir de son ouverture
    if (t < PLONGE + 220) voile.removeAttribute("mask");
    else {
      setA(voile, "mask", "url(#ov-oeil)");
      setA(camOeil, "transform", Mx);
    }
    if (t < T_TETE) setA(gAnneau, "mask", "url(#ov-trait)");
    else gAnneau.removeAttribute("mask");
    for (const o of loin) {
      o.b ??= o.g.getBBox();
      setA(o.g, "visibility", t > PLONGE && horsChamp(o.b, Mx) ? "hidden" : "visible");
    }
    // tête ; le corps va 30 px plus loin que la jonction : son bout reste sous la tête, plus large que lui
    const h = teteA(t);
    setA(gTete, "transform", `translate(${h.x - J[0]} ${h.y - J[1]}) rotate(${h.ang - finTete.ang} ${J[0]} ${J[1]})`);
    const uT = U0 + (1 - U0) * e1(t / T_TETE);
    setA(trait, "stroke-dashoffset", 1 - Math.min(uT + 30 / corps.L, 1));
    // brins : chacun apparaît en entier, à 85 % de sa taille, et se serre à 100 % en 160 ms (aucune transparence)
    for (const b of brins) {
      if (t < b.t) {
        setA(b.g, "visibility", "hidden");
        continue;
      }
      setA(b.g, "visibility", "visible");
      const u = eMonte((t - b.t) / 160), s = 0.85 + 0.15 * u;
      if (u < 0.999) setA(b.g, "transform", `matrix(${s.toFixed(4)} 0 0 ${s.toFixed(4)} ${(b.cx * (1 - s)).toFixed(2)} ${(b.cy * (1 - s)).toFixed(2)})`);
      else b.g.removeAttribute("transform");
    }
    // corde, nœud, HERITAGE TOUR : un seul front
    const front = X0 + CW * e2((t - D_CORDE) / T_CORDE);
    setA(cHt, "width", 700 * clamp((front - 870) / (NX - 870)));
    setA(gNoeud, "transform", `translate(${front - NX} ${yCorde(front + 30) - yCorde(NX + 30)})`);
    if (t < D_CORDE) setA(gNoeud, "visibility", "hidden");
    for (const L of lettres) setA(L.g, "transform", `translate(0 ${((1 - eMonte((t - L.t) / 400)) * (L.h + 60)).toFixed(2)})`);
    setA(gEmb, "transform", `translate(0 ${((1 - eMonte((t - 780) / 620)) * 300).toFixed(2)})`); // part sous le cercle intérieur
    // l'œil s'ouvre sur le site
    const g = Math.round(255 * (1 - lisse((t - PLONGE - 230) / 200)));
    setA(oeil, "fill", `rgb(${g},${g},${g})`);
  }
  return { fin, rendre };
}
