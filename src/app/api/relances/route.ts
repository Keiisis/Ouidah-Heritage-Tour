import { timingSafeEqual } from "node:crypto";
import { traiterRelances } from "@/lib/serveur/equipe/finances/relances";

/** Aucune programmation Vercel ici. Un secret absent ou trop court ferme entièrement la tâche. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const fourni = request.headers.get("authorization") ?? "";
  const attendu = secret && secret.length >= 32 ? `Bearer ${secret}` : null;
  const a = Buffer.from(fourni), b = Buffer.from(attendu ?? "");
  if (!attendu || a.length !== b.length || !timingSafeEqual(a, b)) return Response.json({ erreur: "acces" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const r = await traiterRelances(null);
  return Response.json(r, { status: "erreur" in r ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}

// Les ordonnanceurs Vercel appellent une route GET, avec le même en-tête Bearer.
export const GET = POST;
