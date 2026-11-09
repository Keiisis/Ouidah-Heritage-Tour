// Mode économie (réglage admin, lib/serveur/equipe/reglages/public.ts › modeEco) : lu par GET /api/mesure/eco, réponse mise en
// cache par le CDN 5 min, une fois par onglet (mémoire du module seulement : rien n'est stocké dans le navigateur).
// Allumé : interrogations de l'espace et de l'assistant ECO_FACTEUR fois plus espacées, Vercel Analytics coupé.
export const ECO_FACTEUR = 3;

let lu: Promise<boolean> | null = null;

/** Mode économie allumé ; false si la réponse manque (le site garde son rythme normal). */
export function lireEco(): Promise<boolean> {
  lu ??= fetch("/api/mesure/eco")
    .then((r) => (r.ok ? (r.json() as Promise<{ eco?: unknown }>) : null))
    .then(
      (j) => j?.eco === true,
      () => false,
    );
  return lu;
}
