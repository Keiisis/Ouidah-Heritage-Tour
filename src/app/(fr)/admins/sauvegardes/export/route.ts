import { csv } from "@/lib/serveur/equipe/finances/regles";
import { journaliser } from "@/lib/serveur/equipe/journal";
import { FORMATS, TABLES } from "@/lib/serveur/equipe/securite/regles";
import { cellules, lignesTable } from "@/lib/serveur/equipe/securite/sauvegarde";
import { exigerRole } from "@/lib/serveur/equipe/session";

// Sauvegarde d'une table (lot « securite ») : ?table=<nom>&format=json|csv, admin connecté seulement (session relue ici ;
// sans elle, 404 sans rien dire). Seules les tables de la liste (regles.ts › TABLES) sortent ; jamais une colonne de mot
// de passe, de code, de jeton ni d'empreinte. CSV : « ; » et BOM UTF-8, cellules = + - @ neutralisées (csv()). Chaque
// export va au journal (table, format, nombre de lignes), d'où « Dernier export » sur l'écran.
const ENTETES = { "cache-control": "private, no-store", "x-robots-tag": "noindex", "x-content-type-options": "nosniff" };

export async function GET(req: Request) {
  const s = await exigerRole("admins");
  if (!s) return new Response(null, { status: 404, headers: ENTETES });
  const q = new URL(req.url).searchParams;
  const table = q.get("table") ?? "", format = q.get("format") ?? "";
  if (!Object.hasOwn(TABLES, table) || !(FORMATS as readonly string[]).includes(format)) return new Response(null, { status: 400, headers: ENTETES });
  const l = await lignesTable(table);
  if (!l) return new Response(null, { status: 503, headers: ENTETES });
  await journaliser("sauvegarde.export", s.profilId, null, { type: table, mode: format, nombre: l.length });
  const jour = new Date().toISOString().slice(0, 10);
  const corps = format === "json" ? JSON.stringify({ table, exporte_le: new Date().toISOString(), lignes: l }, null, 2) : csv(cellules(l));
  return new Response(corps, {
    headers: { ...ENTETES, "content-type": format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8", "content-disposition": `attachment; filename="oht-${table}-${jour}.${format}"` },
  });
}
