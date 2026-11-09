import "server-only";
import { exigerRole } from "../session";
import { lireTout } from "./lectures";
import { sansSensible, TABLES } from "./regles";

// Export d'une table entière (sauvegardes, lot « securite »), admin seulement (relu ici). Lignes lues par pages de 1 000
// dans un ordre stable, 100 000 au plus ; les colonnes d'empreinte, de jeton, de code ou de contenu binaire sont retirées
// (regles.ts › SENSIBLE). Les justificatifs n'exportent que leur fiche, jamais le fichier.
const CHOIX: Record<string, string> = { finances_justificatifs: "id,cree_le,type_mime,taille,depose_par" };
export const MAX_LIGNES = 100_000;

export async function lignesTable(table: string): Promise<Record<string, unknown>[] | null> {
  if (!(await exigerRole("admins")) || !Object.hasOwn(TABLES, table)) return null;
  const l = await lireTout<Record<string, unknown>>(`${table}?select=${CHOIX[table] ?? "*"}&order=${TABLES[table].split(",").map((c) => `${c}.asc`).join(",")}`, MAX_LIGNES);
  return l ? l.map(sansSensible) : null;
}

/** Cellules d'un CSV : en-tête (toutes les colonnes vues), puis une ligne par enregistrement (objets en JSON). */
export function cellules(l: Record<string, unknown>[]): (string | number | null)[][] {
  const cols = [...new Set(l.flatMap((x) => Object.keys(x)))];
  const cel = (v: unknown) => (v === null || v === undefined ? null : typeof v === "number" ? v : typeof v === "string" ? v : JSON.stringify(v));
  return [cols, ...l.map((x) => cols.map((c) => cel(x[c])))];
}
