import "server-only";

// Images du site (Supabase Storage, compartiments créés par 20261104_contenu_site.sql). Dépôt PRIVÉ « site-medias-depot » :
// le navigateur y pose l'original par une URL de dépôt signée, propre à un chemin, sans remplacement possible (les
// fonctions Vercel refusent un corps de plus de 4,5 Mo). Compartiment PUBLIC « site-medias » : les WebP convertis par le
// serveur, lus par le site. Clé secrète en en-tête « apikey », jamais envoyée au navigateur.

export const DEPOT = "site-medias-depot";
export const PUBLIC = "site-medias";
const S = () => `${process.env.SUPABASE_URL}/storage/v1`;
const K = () => ({ apikey: process.env.SUPABASE_SECRET_KEY ?? "" });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** URL de dépôt signée pour un objet neuf du dépôt privé (valable 2 h côté Supabase). */
export async function urlDepot(objet: string): Promise<string | null> {
  if (!UUID.test(objet)) return null;
  try {
    const r = await fetch(`${S()}/object/upload/sign/${DEPOT}/${objet}`, { method: "POST", headers: { ...K(), "content-type": "application/json" }, body: "{}", cache: "no-store" });
    const j = r.ok ? ((await r.json()) as { url?: string }) : null;
    return j?.url?.startsWith(`/object/upload/sign/${DEPOT}/${objet}?token=`) ? `${S()}${j.url}` : null;
  } catch {
    return null;
  }
}

/** Octets d'un objet du dépôt privé ; « absent » s'il n'existe pas, « trop » au-delà de `max` octets, null si panne. */
export async function lireDepot(objet: string, max: number): Promise<Uint8Array | "absent" | "trop" | null> {
  if (!UUID.test(objet)) return "absent";
  try {
    const r = await fetch(`${S()}/object/authenticated/${DEPOT}/${objet}`, { headers: K(), cache: "no-store" });
    if (r.status === 400 || r.status === 404) return "absent";
    if (!r.ok) return null;
    if (Number(r.headers.get("content-length") ?? 0) > max) return "trop";
    const o = new Uint8Array(await r.arrayBuffer());
    return o.byteLength > max ? "trop" : o;
  } catch {
    return null;
  }
}

/** Efface un objet du dépôt privé (true si le stockage a répondu). */
export async function effacerDepot(objet: string): Promise<boolean> {
  if (!UUID.test(objet)) return true;
  try {
    const r = await fetch(`${S()}/object/${DEPOT}`, { method: "DELETE", headers: { ...K(), "content-type": "application/json" }, body: JSON.stringify({ prefixes: [objet] }), cache: "no-store" });
    return r.ok;
  } catch {
    return false;
  }
}

/** Pose un WebP dans le compartiment public ; rend son adresse publique, ou null. */
export async function poserPublic(chemin: string, webp: Uint8Array): Promise<string | null> {
  if (!/^\d{4}\/[0-9a-f-]{36}\.webp$/.test(chemin)) return null;
  try {
    const r = await fetch(`${S()}/object/${PUBLIC}/${chemin}`, { method: "POST", headers: { ...K(), "content-type": "image/webp", "cache-control": "max-age=31536000" }, body: new Blob([webp as BlobPart], { type: "image/webp" }), cache: "no-store" });
    return r.ok ? `${S()}/object/public/${PUBLIC}/${chemin}` : null;
  } catch {
    return null;
  }
}
