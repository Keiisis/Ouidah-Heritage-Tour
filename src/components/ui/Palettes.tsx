"use client";

import { useEffect, useRef } from "react";
import { useMouvementReduit } from "@/lib/mouvement";
import "./palettes.css";

// Lettres à palettes (split-flap) : billet E de /devis, talon de réservation de l'Agenda. Tuiles construites à la main
// (DOM) et animées par WAAPI, transform seulement ; mouvement réduit : texte posé d'emblée.
const s = new Proxy({} as Record<string, string>, { get: (_, k) => `bt-${String(k)}` });
const dort = (ms: number) => new Promise((r) => setTimeout(r, ms));
// ——— lettres à palettes : chaque tuile a deux moitiés fixes et deux volets qui tournent (transform seulement)
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
type Tuile = HTMLSpanElement & { _v?: string };
function creerTuile(v: string, type: "car" | "ligne") {
  const t = document.createElement("span") as Tuile;
  t.className = `${s.volet} ${type === "car" ? s.car : s.ligneTuile}`;
  t.innerHTML = `<span class="${s.t}"></span><i class="${s.h}"><b></b></i><i class="${s.b}"><b></b></i><i class="${s.ph}"><b></b></i><i class="${s.pb}"><b></b></i>`;
  poser(t, v);
  return t;
}
function poser(t: Tuile, v: string) {
  t._v = v;
  t.querySelectorAll("b").forEach((b) => (b.textContent = v));
  t.firstElementChild!.textContent = v;
}
async function pli(t: Tuile, v: string, d: number) {
  const [x, h, b, ph, pb] = [...t.children] as HTMLElement[];
  if (v.length > (t._v ?? "").length) x.textContent = v;
  h.firstElementChild!.textContent = v;
  pb.firstElementChild!.textContent = v;
  const o: KeyframeAnimationOptions = { duration: d, fill: "forwards" };
  const a = ph.animate([{ transform: "scaleY(1)", easing: "cubic-bezier(.55, 0, 1, .45)" }, { transform: "scaleY(0)", offset: 0.5 }, { transform: "scaleY(0)" }], o);
  const c = pb.animate([{ transform: "scaleY(0)" }, { transform: "scaleY(0)", offset: 0.5, easing: "cubic-bezier(0, .55, .45, 1)" }, { transform: "scaleY(1)" }], o);
  await dort(d);
  ph.firstElementChild!.textContent = v;
  b.firstElementChild!.textContent = v;
  x.textContent = v;
  t._v = v;
  a.cancel();
  c.cancel();
}

export type TaillePalettes = "grand" | "moyen" | "petit" | "mini" | "ligne";
/** Texte en lettres à palettes. Ville longue : tuiles plus petites, et retour à la ligne entre les mots seulement. */
export function Palettes({ texte, taille, delai = 0, entree = false }: { texte: string; taille: TaillePalettes; delai?: number; entree?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduit = useMouvementReduit();
  const vu = useRef(false);
  useEffect(() => {
    const el = ref.current as (HTMLSpanElement & { _jeton?: object }) | null;
    if (!el) return;
    const jeton = {};
    el._jeton = jeton;
    const anime = !reduit && (vu.current || entree);
    vu.current = true;
    if (taille === "ligne") {
      let t = el.firstElementChild as Tuile | null;
      if (!t) {
        t = creerTuile(anime ? " " : texte, "ligne");
        el.append(t);
      }
      if (!anime) return poser(t, texte);
      const tuile = t;
      void dort(delai).then(async () => {
        if (el._jeton === jeton && tuile._v !== texte) await pli(tuile, texte, 170);
      });
      return;
    }
    const mots = texte.split(/(?<=[- ])/);
    const forme = mots.map((m) => m.length).join(",");
    if (el.dataset.forme !== forme) {
      el.replaceChildren(
        ...mots.map((m) => {
          const g = document.createElement("span");
          g.className = s.mot;
          g.append(...[...m].map((c) => creerTuile(anime ? " " : c, "car")));
          return g;
        }),
      );
      el.dataset.forme = forme;
    }
    const tuiles = [...el.querySelectorAll(`.${s.volet}`)] as Tuile[];
    const cars = [...texte];
    if (!anime) return void tuiles.forEach((t, i) => poser(t, cars[i] ?? " "));
    tuiles.forEach((t, i) =>
      dort(delai + i * 45).then(async () => {
        if (t._v === cars[i]) return;
        for (let k = 0; k < 3 + (i % 3); k++) {
          if (el._jeton !== jeton) return;
          await pli(t, ALPHA[(Math.random() * ALPHA.length) | 0], 62);
        }
        if (el._jeton === jeton) await pli(t, cars[i] ?? " ", 62);
      }),
    );
  }, [texte, taille, reduit, delai, entree]);
  const classe = taille === "ligne" ? "" : s[taille];
  return <span ref={ref} aria-hidden="true" className={`${s.tuiles} ${classe}`} />;
}

