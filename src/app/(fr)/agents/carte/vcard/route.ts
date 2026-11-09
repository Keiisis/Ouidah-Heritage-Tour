import { lireCarte } from "@/lib/serveur/equipe/reglages/lectures";
import { exigerRole } from "@/lib/serveur/equipe/session";

// Fiche contact (.vcf) de la carte de visite : celle du compte connecté seulement (aucun identifiant lu de l'adresse).
// Sans session : 403 ; base injoignable : 503. Jamais mise en cache.
export async function GET() {
  if (!(await exigerRole("agents"))) return new Response(null, { status: 403 });
  const c = await lireCarte();
  if (!c) return new Response(null, { status: 503 });
  const fichier = `${c.moi.prenom}-${c.moi.nom}`.normalize("NFD").replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "contact";
  return new Response(c.vcf, {
    headers: {
      "content-type": "text/vcard; charset=utf-8",
      "content-disposition": `attachment; filename="${fichier}.vcf"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
