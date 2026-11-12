"use client";

import Link from "@/components/ui/LienPublic";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { consentement as CONSENTEMENT } from "@/content/fr";
import { useContenu } from "@/components/ui/ContenuSite";
import { enregistrerChoix, surOuverture, useConsentement } from "@/lib/consentement";

// Bandeau « Vos choix sur ce site », piste A « La pastille » (Kevin, 28/10/2026) : une ligne de verre en bas au centre, trois
// boutons de même poids (refuser vaut accepter) ; « Choisir » déplie les interrupteurs sur place. Visible tant qu'aucun choix
// n'est enregistré, puis rouvert par le lien « Cookies » du pied de page. Aucun service facultatif ne démarre avant l'accord.
// Rien ne reste caché dessous : tant qu'il est affiché, la page réserve en bas sa hauteur (--oht-reserve-bas, défilement
// jusqu'au bout et scroll-padding pour le focus clavier) ; à l'arrivée, s'il couvrirait un texte ou un bouton, il monte
// jusqu'à la première bande libre (40 % de l'écran au plus), sinon reste en bas.
const CONTENU = "h1, h2, h3, h4, h5, h6, p, li, dt, dd, figcaption, blockquote, a[href], button, input, select, textarea, label";
// marge basse du bandeau (bottom-3, sm:bottom-5) : la place au repos se calcule, elle ne se lit pas pendant une transition
const marge = () => (window.matchMedia("(min-width: 640px)").matches ? 20 : 12);
function levee(bandeau: HTMLElement): number {
  const h = window.innerHeight;
  const l = bandeau.getBoundingClientRect();
  const r = { left: l.left, right: l.right, bottom: h - marge(), top: h - marge() - bandeau.offsetHeight };
  const dessous = [...document.querySelectorAll<HTMLElement>(CONTENU)]
    .filter((x) => !bandeau.contains(x) && !x.closest("header, dialog, .as-lanceur, .as-panneau, .rb-retour") && x.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
    .map((x) => x.getBoundingClientRect())
    .filter((b) => b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < h && b.left < r.right && b.right > r.left);
  for (let o = 0; o <= h * 0.4; o += 8) if (!dessous.some((b) => b.top < r.bottom - o && b.bottom > r.top - o)) return o;
  return 0;
}

export function Consentement() {
  const T = useContenu("fr.consentement", CONSENTEMENT);
  const choix = useConsentement();
  const [rouvert, setRouvert] = useState(false);
  const [detail, setDetail] = useState(false);
  const [cartes, setCartes] = useState(false);
  const [ville, setVille] = useState(false);
  const [mesure, setMesure] = useState(false);
  const [leve, setLeve] = useState(0);
  const [hauteur, setHauteur] = useState(0);
  const [dejaReserve, setDejaReserve] = useState(0); // bande vide déjà posée en fin de page (lanceur de l'assistant)
  const bandeau = useRef<HTMLElement>(null);
  const id = useId();
  const visible = !(choix === undefined || (choix && !rouvert));

  // réserve basse = du haut du bandeau au bas de l'écran ; levée calculée à l'arrivée (et au redimensionnement), jamais
  // pendant le défilement : il ne saute pas sous le doigt
  useLayoutEffect(() => {
    const el = bandeau.current;
    if (!visible || !el) return;
    const mesurer = () => {
      setHauteur(el.offsetHeight);
      setDejaReserve(document.querySelector<HTMLElement>(".as-reserve")?.offsetHeight ?? 0);
    };
    const placer = () => setLeve(detail ? 0 : levee(el));
    placer();
    const t1 = window.setTimeout(placer, 700), t2 = window.setTimeout(placer, 1600); // textes révélés en fondu à l'arrivée
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    window.addEventListener("resize", placer);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ro.disconnect();
      window.removeEventListener("resize", placer);
    };
  }, [visible, detail]);
  const reserve = visible && hauteur ? hauteur + leve + 20 : 0;
  useLayoutEffect(() => {
    if (!reserve) return;
    const html = document.documentElement;
    html.style.setProperty("--oht-reserve-bas", `${reserve}px`);
    html.style.scrollPaddingBottom = `${reserve}px`;
    return () => {
      html.style.removeProperty("--oht-reserve-bas");
      html.style.removeProperty("scroll-padding-bottom");
    };
  }, [reserve]);

  useEffect(
    () =>
      surOuverture(() => {
        setCartes(choix?.cartes ?? false);
        setVille(choix?.ville ?? false);
        setMesure(choix?.mesure ?? false);
        setDetail(true);
        setRouvert(true);
      }),
    [choix],
  );

  // rendu serveur (choix encore inconnu) ou choix déjà fait : rien à afficher
  if (!visible) return null;

  const decider = (c: { cartes: boolean; ville: boolean; mesure: boolean }) => {
    enregistrerChoix(c);
    setRouvert(false);
    setDetail(false);
  };
  const bouton = "min-h-11 cursor-pointer rounded-full px-4 text-sm font-bold whitespace-nowrap transition-[background-color,box-shadow,color]";
  const contour = `${bouton} text-white shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.34)] hover:shadow-[inset_0_0_0_1.5px_white]`;
  const plein = `${bouton} bg-white text-abyss hover:bg-ivory`;
  const optionnelles = { cartes: [cartes, setCartes], ville: [ville, setVille], mesure: [mesure, setMesure] } as const;

  return (
    <>
    {/* réserve en fin de page : le pied (bleu nuit) se prolonge de la hauteur du bandeau, rien ne reste dessous */}
    <div aria-hidden="true" className="bg-abyss" style={{ height: Math.max(0, reserve - dejaReserve) }} />
    <section
      ref={bandeau}
      role="region"
      aria-labelledby={`${id}-titre`}
      style={{ "--leve": `${leve}px` } as CSSProperties}
      className="fixed bottom-[calc(0.75rem+var(--leve,0px))] left-1/2 z-[70] w-[calc(100%-1.5rem)] max-w-[44rem] -translate-x-1/2 rounded-3xl bg-abyss/[0.82] text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.16),0_24px_48px_-16px_rgb(2_4_12/0.5)] backdrop-blur-[18px] transition-[bottom] duration-500 ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none sm:bottom-[calc(1.25rem+var(--leve,0px))]"
    >
      <h2 id={`${id}-titre`} className="sr-only">
        {T.titre}
      </h2>
      {/* téléphone : deux lignes de texte et une rangée de boutons (environ 106 px) ; écran bas : texte plus petit */}
      <div className="flex flex-col gap-1.5 p-2.5 sm:flex-row sm:items-center sm:gap-4 sm:py-2.5 sm:pr-2.5 sm:pl-5 [@media(max-height:500px)]:py-1.5">
        <p className="flex-1 text-[13px] leading-[18px] text-white/86 sm:text-[15px] sm:leading-[1.5] [@media(max-height:500px)]:text-[13px] [@media(max-height:500px)]:leading-[18px]">
          {T.court}{" "}
          <Link href={T.politique.href} className="text-white underline underline-offset-2">
            {T.politique.label}
          </Link>
        </p>
        <div className="flex gap-1.5 sm:flex-none">
          <button type="button" className={`${contour} flex-1 sm:flex-none`} onClick={() => decider({ cartes: false, ville: false, mesure: false })}>
            {T.refuser}
          </button>
          <button type="button" className={`${plein} flex-1 sm:flex-none`} onClick={() => decider({ cartes: true, ville: true, mesure: true })}>
            {T.accepter}
          </button>
          {detail ? null : (
            <button type="button" aria-expanded={false} aria-controls={`${id}-detail`} className={`${bouton} px-3 text-white underline underline-offset-[3px] sm:px-4`} onClick={() => setDetail(true)}>
              {T.choisir}
            </button>
          )}
        </div>
      </div>
      {detail ? (
        <div id={`${id}-detail`} className="max-h-[55svh] overflow-auto border-t border-white/16 px-4 pt-1 pb-4 sm:px-5 sm:pb-5">
          {T.categories.map((c) => {
            const opt = c.id === "necessaires" ? null : optionnelles[c.id];
            return (
              <div key={c.id} className="grid grid-cols-[1fr_auto] items-center gap-x-5 gap-y-1 border-b border-white/16 py-3.5 last-of-type:border-b-0">
                <b className="font-display text-base font-semibold" id={`${id}-${c.id}`}>
                  {c.nom}
                </b>
                {opt ? (
                  <label className="relative h-7 w-12">
                    <input
                      type="checkbox"
                      role="switch"
                      aria-labelledby={`${id}-${c.id}`}
                      checked={opt[0]}
                      onChange={(e) => opt[1](e.target.checked)}
                      className="peer absolute inset-0 z-[1] m-0 cursor-pointer opacity-0"
                    />
                    <span className="pointer-events-none absolute inset-0 rounded-full bg-white/18 transition-colors peer-checked:bg-sun peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-sun after:absolute after:top-[3px] after:left-[3px] after:size-[22px] after:rounded-full after:bg-white after:transition-transform after:content-[''] peer-checked:after:translate-x-5" />
                  </label>
                ) : (
                  <span className="text-[13px] font-bold text-white/64">{T.toujours}</span>
                )}
                <p className="col-start-1 text-sm text-white/64">{c.texte}</p>
              </div>
            );
          })}
          <div className="mt-3 flex justify-end gap-1.5">
            {rouvert ? (
              <button type="button" className={contour} onClick={() => {
                  setRouvert(false);
                  setDetail(false);
                }}>
                {T.fermer}
              </button>
            ) : null}
            <button type="button" className={plein} onClick={() => decider({ cartes, ville, mesure })}>
              {T.enregistrer}
            </button>
          </div>
        </div>
      ) : null}
    </section>
    </>
  );
}
