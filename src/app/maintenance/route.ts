import { etatMaintenanceEnCache } from "@/lib/serveur/equipe/reglages/maintenance-cache";
import { normaliserLangue } from "@/lib/langue";
import { adresseLangue } from "@/lib/adresses-langues";

const echapper = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("langue")?.toUpperCase() ?? "FR";
  const langue = normaliserLangue(code);
  const etat = await etatMaintenanceEnCache();
  if (!etat?.actif) return Response.redirect(new URL(adresseLangue("/", langue), request.url), 307);
  const texte = etat.message[langue] ?? etat.message.FR ?? "Ouidah Heritage Tour";
  return new Response(`<!doctype html><html lang="${langue.toLowerCase()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Ouidah Heritage Tour</title></head><body><main><img src="/brand/oht-embleme.webp" alt="Ouidah Heritage Tour" width="96" height="96"><h1>${echapper(texte)}</h1></main></body></html>`, { status: 503, headers: { "content-type": "text/html; charset=utf-8", "retry-after": "3600", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
