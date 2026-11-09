// Fin de l'ouverture « Dangbé » : les cartes et le globe de l'accueil (maplibre, three.js) attendent qu'elle soit finie
// pour démarrer, sinon leur mise en route vole les images de l'animation. Aucune ouverture (déjà vue, mouvement réduit,
// autre cas) : départ immédiat. Filet : 8 s au plus.
const FINIE = "oht-ouverture-finie";
let finie = false;

export function finirOuverture() {
  if (finie) return;
  finie = true;
  window.dispatchEvent(new Event(FINIE));
}

export function attendreOuverture(): Promise<void> {
  if (finie || document.documentElement.dataset.ouverture === "vue" || !document.querySelector(".ov")) return Promise.resolve();
  return new Promise((ok) => {
    const t = window.setTimeout(ok, 8000);
    window.addEventListener(FINIE, () => (window.clearTimeout(t), ok()), { once: true });
  });
}
