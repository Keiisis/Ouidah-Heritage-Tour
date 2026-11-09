// Ville approximative du visiteur, d'après les en-têtes de géolocalisation que Vercel ajoute à chaque requête
// (adresse IP, aucune autorisation demandée). Rien n'est enregistré ; réponse jamais mise en cache.
// Hors Vercel (ou en-têtes absents) : null, et la page se replie sur le fuseau horaire du navigateur.
export async function GET(request: Request) {
  const h = request.headers;
  const ville = h.get("x-vercel-ip-city");
  const lat = h.get("x-vercel-ip-latitude");
  const lon = h.get("x-vercel-ip-longitude");
  const pays = h.get("x-vercel-ip-country"); // code ISO 3166-1 alpha-2 (doc Vercel « Request headers »)
  const coords = lat && lon ? [Number(lon), Number(lat)] : null;
  const valide = ville && coords && coords.every(Number.isFinite) && Math.abs(coords[1]) <= 90 && Math.abs(coords[0]) <= 180;
  let nom = ville;
  try {
    nom = ville ? decodeURIComponent(ville) : null;
  } catch {
    nom = null; // en-tête mal encodé : on ne devine pas
  }
  const corps = valide && nom ? { ville: nom, coords, ...(pays && /^[A-Z]{2}$/.test(pays) ? { pays } : {}) } : null;
  return Response.json(corps, { headers: { "cache-control": "private, no-store" } });
}
