// Position du soleil (formules NOAA simplifiées, précision de l'ordre de la minute) : point subsolaire pour éclairer
// la Terre à l'heure exacte, lever et coucher à Ouidah pour dire s'il y fait jour ou nuit.
const rad = Math.PI / 180;

function jourSolaire(d: Date) {
  const debut = Date.UTC(d.getUTCFullYear(), 0, 1);
  const n = Math.floor((d.getTime() - debut) / 864e5) + 1;
  const g = ((2 * Math.PI) / 365) * (n - 1);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g)); // minutes
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g); // radians
  return { eqt, decl };
}

/** Point de la Terre où le soleil est au zénith : [longitude, latitude] en degrés. */
export function pointSubsolaire(d: Date): [number, number] {
  const { eqt, decl } = jourSolaire(d);
  const heures = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  let lon = -15 * (heures - 12) - eqt / 4;
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  return [lon, decl / rad];
}

/** Lever et coucher du soleil du jour (UTC) pour un lieu [latitude, longitude]. */
export function leverCoucher(d: Date, [lat, lon]: [number, number]) {
  const { eqt, decl } = jourSolaire(d);
  const ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl)) / rad;
  const minuit = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return { lever: new Date(minuit + (720 - 4 * (lon + ha) - eqt) * 6e4), coucher: new Date(minuit + (720 - 4 * (lon - ha) - eqt) * 6e4) };
}

/** Distance à vol d'oiseau en kilomètres entre deux points [longitude, latitude]. */
export function distanceKm(a: [number, number], b: [number, number]) {
  const [lo1, la1] = a, [lo2, la2] = b;
  const s = Math.sin(((la2 - la1) * rad) / 2) ** 2 + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(((lo2 - lo1) * rad) / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(s)));
}
