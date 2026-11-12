import { after } from "next/server";
import { envoyerRdv } from "@/lib/serveur/courriels/rdv";
import { disponibilites, reserver } from "@/lib/serveur/services/public";
import { reponse } from "@/lib/serveur/garde";
import { origineSite } from "@/lib/serveur/paiement/outils";

// Rendez-vous enregistré : confirmation au client et avis à l'équipe après la réponse ; un échec d'envoi ne touche pas
// le rendez-vous.
export async function POST(req: Request) {
  const origine = origineSite(req);
  return reserver(req, (id) => { if (origine) after(() => envoyerRdv(id, origine).catch(() => null)); });
}
export async function GET() { const c = await disponibilites(); return reponse(c ? { creneaux: c } : { erreur: "erreur" }, c ? 200 : 503); }
