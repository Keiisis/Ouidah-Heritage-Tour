import { ECO_FACTEUR } from "@/components/mesure/eco";

// Rafraîchissement économe des écrans de l'espace (sur le modèle de lib/visible-interval.ts de Retour Gagnant), sans React
// pour être testé avec une horloge simulée (tests-oht/rafraichir.test.mjs). Un seul minuteur à la fois :
//   - au plus une fois par RAFRAICHIR_MIN_MS (ECO_FACTEUR fois moins souvent en mode économie) ;
//   - en pause quand l'onglet est caché, ou après INACTIF_MS sans souris, clavier ni toucher ;
//   - au retour (onglet visible, geste après la pause) : rafraîchi tout de suite, puis le rythme reprend.
export const RAFRAICHIR_MIN_MS = 60_000;
export const INACTIF_MS = 5 * 60_000;
export const GESTES = ["pointermove", "pointerdown", "keydown", "touchstart", "wheel"] as const;

type Cible = { addEventListener(type: string, f: () => void, o?: AddEventListenerOptions): void; removeEventListener(type: string, f: () => void): void };
export type Milieu = {
  document: Cible & { readonly hidden: boolean };
  fenetre: Cible;
  maintenant: () => number;
  plusTard: (f: () => void, ms: number) => unknown;
  annuler: (t: unknown) => void;
};

/** Pas réel entre deux rafraîchissements, en ms. */
export const pasDe = (ms: number, eco = false) => Math.max(RAFRAICHIR_MIN_MS, ms) * (eco ? ECO_FACTEUR : 1);

/** Lance `fn` toutes les `pasDe(ms, eco)` ms selon les règles ci-dessus ; rend la fonction de nettoyage. */
export function rafraichir(fn: () => void, ms: number, m: Milieu, eco = false): () => void {
  const pas = pasDe(ms, eco);
  let t: unknown = null;
  let geste = m.maintenant();
  const arreter = () => {
    if (t !== null) m.annuler(t);
    t = null;
  };
  const tic = () => {
    t = null;
    if (m.document.hidden || m.maintenant() - geste >= INACTIF_MS) return; // en pause jusqu'au retour
    fn();
    t = m.plusTard(tic, pas);
  };
  const actif = () => {
    geste = m.maintenant();
    if (t !== null || m.document.hidden) return;
    fn(); // retour après une pause
    t = m.plusTard(tic, pas);
  };
  const vue = () => (m.document.hidden ? arreter() : actif());
  m.document.addEventListener("visibilitychange", vue);
  for (const g of GESTES) m.fenetre.addEventListener(g, actif, { passive: true });
  if (!m.document.hidden) t = m.plusTard(tic, pas);
  return () => {
    m.document.removeEventListener("visibilitychange", vue);
    for (const g of GESTES) m.fenetre.removeEventListener(g, actif);
    arreter();
  };
}
