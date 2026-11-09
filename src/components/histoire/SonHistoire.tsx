"use client";

import { useEffect } from "react";
import { histoirePage as T } from "@/content/histoire";

// Fond sonore de la page Histoire (Kevin, 29/10/2026) : Web Audio, boucle sans trou (la piste est préparée pour se raccorder),
// montée douce, sans bouton. Les navigateurs ne laissent jouer un son qu'après un geste sur le site : arrivé par un lien du
// site, il démarre aussitôt ; arrivé directement, au premier clic, toucher ou touche du clavier. Onglet caché : il se tait.
export function SonHistoire() {
  useEffect(() => {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx(), gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    let fini = false, source: AudioBufferSourceNode | null = null;
    const gestes = ["pointerdown", "keydown", "touchend"] as const;
    const monter = () => {
      if (fini || !source || ctx.state !== "running" || document.hidden) return;
      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(T.son.volume, t + T.son.fondu);
    };
    const reveiller = () => void ctx.resume().then(monter, () => {});
    const visibilite = () => {
      if (document.hidden) {
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
        setTimeout(() => document.hidden && ctx.suspend(), 600);
      } else reveiller();
    };
    // première source que le navigateur sait lire (une réponse vide ou illisible passe à la suivante)
    const charger = async () => {
      for (const src of T.son.sources) {
        try {
          const r = await fetch(src);
          if (r.ok) return await ctx.decodeAudioData(await r.arrayBuffer());
        } catch {
          // source suivante
        }
      }
      throw new Error("aucune source lisible");
    };
    charger()
      .then((buffer) => {
        if (fini) return;
        source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(gain);
        source.start();
        reveiller();
      })
      .catch(() => {}); // sans son, la page reste entière
    for (const g of gestes) window.addEventListener(g, reveiller, { passive: true });
    document.addEventListener("visibilitychange", visibilite);
    return () => {
      fini = true;
      for (const g of gestes) window.removeEventListener(g, reveiller);
      document.removeEventListener("visibilitychange", visibilite);
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
      setTimeout(() => void ctx.close(), 700);
    };
  }, []);
  return null;
}
