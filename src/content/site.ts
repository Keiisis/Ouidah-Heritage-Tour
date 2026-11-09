// Réglages de départ éditables dans Contenu du site. Les polices suivent la charte validée.
export const seoSite = {
  titre: "Ouidah Heritage Tour · Voyages à Ouidah, Bénin",
  description: "Découvrez Ouidah, son patrimoine et ses lieux de mémoire avec Ouidah Heritage Tour. Circuits, événements et voyages préparés avec l'équipe locale.",
  image: { src: "/brand/oht-embleme.webp", alt: "Ouidah Heritage Tour" },
  pages: [] as { chemin: string; titre: string; description: string; indexer: boolean }[],
};

export const themeSite = {
  couleurs: {
    "brand-primary": "#ac3215",
    "brand-primary-hover": "#8e2a10",
    "surface-brand": "#122460",
    "surface-abyss": "#0f162d",
    "accent-sun": "#fdbf28",
  },
};
