import { terrain } from "@/content/espace-terrain";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { lignesCsv } from "@/lib/serveur/equipe/terrain/billets";

// Export CSV des billets d'une édition (lot terrain L5), admin connecté seulement : la session est relue ici ; sans elle
// (agent, personne), 404 sans rien dire de l'édition. Une ligne par billet payé, entré ou non. Séparateur « ; » et BOM UTF-8
// (Excel en français) ; une cellule qui commence par = + - @ est précédée d'une apostrophe (injection de formule).
const ENTETES = { "cache-control": "private, no-store", "x-robots-tag": "noindex" };
const cellule = (v: string) => {
  const t = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export async function GET(req: Request) {
  const s = await exigerRole("admins");
  if (!s) return new Response(null, { status: 404, headers: ENTETES });
  const q = new URL(req.url).searchParams;
  const evenement = q.get("evenement") ?? "", occurrence = q.get("occurrence") ?? "";
  const lignes = await lignesCsv(evenement, occurrence);
  if (!lignes) return new Response(null, { status: 404, headers: ENTETES });
  const csv = `\uFEFF${[terrain.reservations.csvCols, ...lignes].map((l) => l.map(cellule).join(";")).join("\r\n")}\r\n`;
  return new Response(csv, { headers: { ...ENTETES, "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="billets-${evenement}-${occurrence}.csv"` } });
}
