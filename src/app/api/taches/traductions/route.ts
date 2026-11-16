import { cronAutorise } from "@/lib/serveur/equipe/pilotage/taches";
import { traiterTraductions } from "@/lib/serveur/traduction-auto/worker";

export const maxDuration = 200; // passage borné à 170 s par le worker
export async function GET(request: Request) {
  if (!cronAutorise(request)) return Response.json({ erreur: "acces" }, { status: 401 });
  const resultat = await traiterTraductions();
  return Response.json(resultat, { status: resultat.erreur === "base" ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
