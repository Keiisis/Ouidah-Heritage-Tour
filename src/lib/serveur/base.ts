// Base Supabase (API PostgREST), appelée par le serveur seulement. Clé secrète dans l'en-tête « apikey », jamais en
// « Authorization: Bearer » ni dans l'adresse (doc Supabase « API keys »). Elle contourne RLS : les tables n'ont aucune
// politique et aucun droit pour anon / authenticated, seul ce code y accède.
const URL_BASE = () => process.env.SUPABASE_URL;
const CLE = () => process.env.SUPABASE_SECRET_KEY;

export const baseConfiguree = () => Boolean(URL_BASE() && CLE());

export function base(chemin: string, init: { method?: "GET" | "POST" | "PATCH" | "DELETE"; corps?: unknown; prefer?: string; range?: string } = {}) {
  const entetes: Record<string, string> = { apikey: CLE() ?? "", "content-type": "application/json" };
  if (init.prefer) entetes.prefer = init.prefer;
  if (init.range) entetes.range = init.range;
  return fetch(`${URL_BASE()}/rest/v1/${chemin}`, { method: init.method ?? "GET", headers: entetes, body: init.corps === undefined ? undefined : JSON.stringify(init.corps), cache: "no-store" });
}

/** Nombre de lignes qui répondent aux filtres PostgREST (null si la base ne répond pas). */
export async function compter(table: string, filtres: string): Promise<number | null> {
  try {
    const r = await base(`${table}?select=id&${filtres}`, { prefer: "count=exact", range: "0-0" });
    const total = r.headers.get("content-range")?.split("/")[1];
    return r.ok && total && total !== "*" ? Number(total) : null;
  } catch {
    return null;
  }
}
