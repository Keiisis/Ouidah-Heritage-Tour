"use client";

import { useRafraichir } from "../useRafraichir";

// « En direct » : l'écran se relit auprès du serveur toutes les `secondes` (60 au moins), en pause onglet caché ou personne
// devant l'écran (useRafraichir). Les compteurs à volets basculent alors sur le chiffre qui change.
export function Direct({ secondes = 60 }: { secondes?: number }) {
  useRafraichir(secondes);
  return null;
}
