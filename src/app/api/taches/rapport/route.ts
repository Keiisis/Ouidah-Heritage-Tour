import { traiterRapport } from "@/lib/serveur/equipe/pilotage/rapport-envoi";
import { cronAutorise } from "@/lib/serveur/equipe/pilotage/taches";
export async function GET(request: Request) {
  if (!cronAutorise(request)) return Response.json({ erreur: "acces" }, { status: 401 });
  const r = await traiterRapport(null, false, true);
  return Response.json(r, { status: "erreur" in r ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
