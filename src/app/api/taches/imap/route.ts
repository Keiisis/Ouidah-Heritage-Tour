import { synchroniserImap } from "@/lib/serveur/equipe/messages/imap";
import { cronAutorise } from "@/lib/serveur/equipe/pilotage/taches";
export async function GET(request: Request) {
  if (!cronAutorise(request)) return Response.json({ erreur: "acces" }, { status: 401 });
  const r = await synchroniserImap(true);
  return Response.json(r, { status: "erreur" in r ? r.erreur === "occupe" ? 409 : 503 : 200, headers: { "Cache-Control": "no-store" } });
}
