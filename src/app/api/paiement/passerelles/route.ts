import { connection } from "next/server";
import { baseConfiguree } from "@/lib/serveur/base";
import { billetsPossibles } from "@/lib/serveur/paiement/billet";
import { passerellesActives } from "@/lib/serveur/paiement";

// Passerelles proposées au talon : activées dans l'admin et configurées sur le serveur, dans l'ordre de l'admin. Rien de
// secret : seulement leurs noms. Liste vide → le talon envoie vers le devis (aucun paiement possible).
// Même réponse pour tous les visiteurs : servie par le CDN 60 s puis rafraîchie en arrière-plan (lue à l'approche de
// l'agenda de l'accueil et sur /devis) ; une passerelle allumée ou coupée dans l'admin y paraît en quelques minutes au plus.
const CACHE_PUBLIC = { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" };

export async function GET() {
  // À chaque requête : sans cela, le build fige la réponse (BILLET_SECRET absent au build → liste vide pour toujours).
  await connection();
  if (!baseConfiguree() || !billetsPossibles()) return Response.json({ passerelles: [] }, { headers: CACHE_PUBLIC });
  return Response.json({ passerelles: await passerellesActives() }, { headers: CACHE_PUBLIC });
}
