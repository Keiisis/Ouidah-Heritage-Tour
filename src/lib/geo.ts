// Distances sur le terrain (fiches circuit et lieu) : coordonnées en [latitude, longitude], comme `destinations` et le relevé.
const R = 6371000; // rayon terrestre moyen, en mètres
const RAD = Math.PI / 180;

/** Distance à vol d'oiseau entre deux points [lat, lon], en mètres (haversine). */
export function distance([la1, lo1]: [number, number], [la2, lo2]: [number, number]) {
  const a = Math.sin(((la2 - la1) * RAD) / 2) ** 2 + Math.cos(la1 * RAD) * Math.cos(la2 * RAD) * Math.sin(((lo2 - lo1) * RAD) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Longueur d'un tracé GeoJSON ([lon, lat] par point), en mètres. */
export function longueur(trace: [number, number][]) {
  let m = 0;
  for (let i = 1; i < trace.length; i++) m += distance([trace[i - 1][1], trace[i - 1][0]], [trace[i][1], trace[i][0]]);
  return m;
}

/** Marche estimée à 4,5 km/h, en minutes (affichée « environ »). */
export const minutesAPied = (metres: number) => Math.max(1, Math.round(metres / 75));
