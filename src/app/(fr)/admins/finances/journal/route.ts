import { exigerRole } from "@/lib/serveur/equipe/session";
import { lire } from "@/lib/serveur/equipe/finances/lectures";
import { bornesMois, csv, moisValide } from "@/lib/serveur/equipe/finances/regles";

/** Journal comptable restreint, distinct du journal d'activité général. */
export async function GET(req: Request) {
  if (!await exigerRole("admins")) return new Response(null, { status: 403 });
  const mois = new URL(req.url).searchParams.get("mois");
  if (!moisValide(mois)) return new Response(null, { status: 400 });
  const b = bornesMois(mois);
  const lignes: (string | number | null)[][] = [["numero", "date", "objet", "identifiant", "avant", "apres"]];
  for (let offset = 0; ; offset += 1000) {
    const page = await lire<{ id: number; cree_le: string; objet: string; cible: string; avant: unknown; apres: unknown }>(`finances_journal?select=id,cree_le,objet,cible,avant,apres&cree_le=gte.${encodeURIComponent(b.debut)}&cree_le=lt.${encodeURIComponent(b.fin)}&order=id.asc&limit=1000&offset=${offset}`);
    if (!page) return new Response(null, { status: 503 });
    lignes.push(...page.map((j) => [j.id, j.cree_le, j.objet, j.cible, j.avant === null ? null : JSON.stringify(j.avant), JSON.stringify(j.apres)]));
    if (page.length < 1000) break;
  }
  return new Response(csv(lignes), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="oht-journal-${mois}.csv"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
