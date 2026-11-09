import { connection } from "next/server";
import { modeEco } from "@/lib/serveur/equipe/reglages/public";

// GET → { eco } : mode économie (reglages/public.ts › modeEco), le même pour tous les visiteurs, lu une fois par onglet
// (components/mesure/eco.ts) et servi par le CDN pendant 5 min sans appeler la fonction. Rien n'est compté ni gardé.
export async function GET() {
  await connection();
  return Response.json({ eco: await modeEco() }, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=300" } });
}
