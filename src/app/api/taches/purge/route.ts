import { revalidateTag } from "next/cache";
import { cronAutorise } from "@/lib/serveur/equipe/pilotage/taches";
import { traiterPurge } from "@/lib/serveur/equipe/pilotage/purge";
import { expirerCommandes } from "@/lib/serveur/paiement/lien";

export async function GET(request: Request) {
  if (!cronAutorise(request)) return Response.json({ erreur: "acces" }, { status: 401 });
  // boutique (09/11) : stock des commandes à paiement immédiat échues rendu, quel que soit le réglage de purge
  if (await expirerCommandes()) revalidateTag("boutique", "max");
  const r = await traiterPurge();
  return Response.json(r, { status: "erreur" in r ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
