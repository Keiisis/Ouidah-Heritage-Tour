// Fin de l'ouverture « Le passage » (Ouverture.tsx) : les cartes et le globe de l'accueil (maplibre, three.js) attendent
// qu'elle soit finie pour démarrer, sinon leur mise en route vole les images de l'animation. Aucune ouverture (hors
// accueil, déjà vue, mouvement réduit, voile déjà retiré) : départ immédiat. Filet : 8 s au plus.
export const FIN_OUVERTURE = "oht-ouverture-finie";

// L'ouverture est réservée à l'accueil (Kevin, 10/11/2026) : « / » et « /<langue> » des six autres langues, avec ou sans
// barre finale. Lue par le script de tête de <body> (Ouverture.tsx) et ici.
export const ACCUEIL = /^\/(?:(?:en|es|de|pt|ht|gcf)\/?)?$/;
export const estAccueil = (chemin: string) => ACCUEIL.test(chemin);

export function attendreOuverture(): Promise<void> {
  if (!estAccueil(location.pathname) || document.documentElement.dataset.ouverture === "vue" || !document.querySelector(".ov")) return Promise.resolve();
  return new Promise((ok) => {
    const t = window.setTimeout(ok, 8000);
    window.addEventListener(FIN_OUVERTURE, () => (window.clearTimeout(t), ok()), { once: true });
  });
}
