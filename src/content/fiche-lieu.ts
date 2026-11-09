// Fiche lieu (/ouidah/lieux/<slug>), piste A « Hier, aujourd'hui » retenue par Kevin le 30/10/2026 : tous les libellés de la
// page. Les faits viennent de fr.ts (destinations, FICHES_LIEU), histoire.ts et du relevé (lieux-ouidah.json) ; ici, aucun.
import { DEVIS, SECTIONS } from "./fr";

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export const ficheLieu = {
  metaTitre: (nom: string) => `${nom} — Ouidah Heritage Tour`,
  retour: { label: "Les lieux de Ouidah", href: SECTIONS.lieux },
  ajouter: "Ajouter à mon voyage",
  ajoute: "Ajouté à votre voyage",
  ajouteAnnonce: (nom: string) => `${nom} est ajouté à votre voyage.`,
  creer: { label: "Créer mon voyage", href: DEVIS.voyage },
  voirCircuits: "Voir les circuits",
  scene: { paire: "Hier et aujourd’hui", carte: "Le lieu et ce qu’il y a autour" },
  hier: "Hier",
  vers: (annee: string) => `Vers ${annee}`,
  aujourdhui: "Aujourd’hui",
  curseur: "Glisser pour passer d’hier à aujourd’hui",
  curseurValeur: (pct: number) => `${pct} % aujourd’hui`,
  enPratique: "En pratique",
  lignes: { aller: "S’y rendre", horaires: "Horaires", tarif: "Tarif", usages: "Sur place aujourd’hui", telephone: "Téléphone", site: "Site" },
  yAller: "Y aller",
  carteOsm: (lat: number, lon: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`,
  lireChapitre: "Lire tout le chapitre",
  toutHistoire: "Toute l’histoire de Ouidah",
  histoire: "/ouidah/histoire",
  circuits: "Les circuits qui passent ici",
  etape: (n: number, total: number) => `étape ${n} sur ${total}`,
  autour: "Autour de ce lieu",
  note: "Distances à vol d’oiseau ; temps de marche estimé à 4,5 km/h.",
  familles: { voir: "À voir", table: "Se restaurer", dormir: "Dormir", culte: "Lieux de culte", nature: "Nature et plages", marche: "Marchés et artisanat" },
  carteAria: (nom: string, n: number) => `Carte : ${nom} au centre, anneaux de distance réelle, et ${n} lieux proches à leur vraie position`,
  nord: "N",
  metres: (m: number) => (m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${nf.format(m / 1000)} km`),
  // temps de marche (lib/geo, 4,5 km/h) affiché « environ » ; au-delà de 5 km, la distance seule
  marche: (minutes: number, metres: number) =>
    metres > 5000 ? "" : minutes < 60 ? `environ ${minutes} min à pied` : `environ ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} à pied`,
  marcheCourt: (minutes: number) => (minutes < 60 ? `environ ${minutes} min` : `environ ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`),
};
