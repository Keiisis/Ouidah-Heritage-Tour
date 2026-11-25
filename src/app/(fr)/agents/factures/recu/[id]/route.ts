import { factureAccessible } from "@/lib/serveur/equipe/finances/lectures";
import { pdfRecu } from "@/lib/serveur/equipe/finances/documents";
import { exigerDroit } from "@/lib/serveur/equipe/securite/droits";
import { origineSite } from "@/lib/serveur/paiement/outils";

// Reçu R- d'une facture payée, en PDF dans la langue du client (générateur partagé de la session documents, appel
// seulement). Agent : ses dossiers seulement ; admin : tous. Hors de portée, introuvable ou pas encore payée : 404.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await exigerDroit("demandes"); // droit « Demandes et devis » ; un admin les a tous
  if (!s) return new Response(null, { status: 403 });
  const f = await factureAccessible(s, (await params).id);
  if (f === "panne") return new Response(null, { status: 503 });
  const r = f ? await pdfRecu(f, origineSite(req)).catch(() => null) : null;
  if (!r) return new Response(null, { status: 404 });
  return new Response(r.pdf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${r.numero}.pdf"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
