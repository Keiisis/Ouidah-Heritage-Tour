import { connection } from "next/server";
import { tauxPublics } from "@/lib/serveur/equipe/reglages/public";

// Taux d'affichage du dollar (FCFA pour 1 $), saisi par un admin dans « Devises ». null : USD non proposé sur le site.
export async function GET() {
  await connection();
  const t = await tauxPublics();
  return Response.json({ usd: t?.usd ?? null, le: t?.usdLe ?? null }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" } });
}
