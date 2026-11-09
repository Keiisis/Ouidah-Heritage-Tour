"use client";

import Link from "@/components/ui/LienPublic";
import { useEffect, useId, useState } from "react";
import { consentement as CONSENTEMENT } from "@/content/fr";
import { useContenu } from "@/components/ui/ContenuSite";
import { enregistrerChoix, surOuverture, useConsentement } from "@/lib/consentement";

// Bandeau « Vos choix sur ce site », piste A « La pastille » (Kevin, 28/10/2026) : une ligne de verre en bas au centre, trois
// boutons de même poids (refuser vaut accepter) ; « Choisir » déplie les interrupteurs sur place. Visible tant qu'aucun choix
// n'est enregistré, puis rouvert par le lien « Cookies » du pied de page. Aucun service facultatif ne démarre avant l'accord.
export function Consentement() {
  const T = useContenu("fr.consentement", CONSENTEMENT);
  const choix = useConsentement();
  const [rouvert, setRouvert] = useState(false);
  const [detail, setDetail] = useState(false);
  const [cartes, setCartes] = useState(false);
  const [ville, setVille] = useState(false);
  const [mesure, setMesure] = useState(false);
  const id = useId();

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
  if (choix === undefined || (choix && !rouvert)) return null;

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
    <section
      role="region"
      aria-labelledby={`${id}-titre`}
      className="fixed bottom-3 left-1/2 z-[70] w-[calc(100%-1.5rem)] max-w-[44rem] -translate-x-1/2 rounded-3xl bg-abyss/[0.82] text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.16),0_24px_48px_-16px_rgb(2_4_12/0.5)] backdrop-blur-[18px] sm:bottom-5"
    >
      <h2 id={`${id}-titre`} className="sr-only">
        {T.titre}
      </h2>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:py-2.5 sm:pr-2.5 sm:pl-5">
        <p className="flex-1 text-[15px] leading-[1.5] text-white/86">
          {T.court}{" "}
          <Link href={T.politique.href} className="text-white underline underline-offset-2">
            {T.politique.label}
          </Link>
        </p>
        <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-none">
          <button type="button" className={contour} onClick={() => decider({ cartes: false, ville: false, mesure: false })}>
            {T.refuser}
          </button>
          <button type="button" className={plein} onClick={() => decider({ cartes: true, ville: true, mesure: true })}>
            {T.accepter}
          </button>
          {detail ? null : (
            <button type="button" aria-expanded={false} aria-controls={`${id}-detail`} className={`${bouton} col-span-2 text-white underline underline-offset-[3px]`} onClick={() => setDetail(true)}>
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
  );
}
