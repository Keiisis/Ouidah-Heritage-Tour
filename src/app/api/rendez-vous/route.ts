import { disponibilites, reserver } from "@/lib/serveur/services/public";
import { reponse } from "@/lib/serveur/garde";
export const POST = reserver;
export async function GET() { const c = await disponibilites(); return reponse(c ? { creneaux: c } : { erreur: "erreur" }, c ? 200 : 503); }
