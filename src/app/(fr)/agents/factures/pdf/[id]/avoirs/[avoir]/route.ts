import { factureAccessible } from "@/lib/serveur/equipe/finances/lectures";
import { pdfFinancier } from "@/lib/serveur/equipe/finances/pdf";
import { exigerRole } from "@/lib/serveur/equipe/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; avoir: string }> }) {
  const s = await exigerRole("agents");
  if (!s) return new Response(null, { status: 403 });
  const { id, avoir } = await params;
  const f = await factureAccessible(s, id);
  if (f === "panne") return new Response(null, { status: 503 });
  if (!f || !f.avoirs.some((a) => a.id === avoir)) return new Response(null, { status: 404 });
  const r = await pdfFinancier(f, avoir).catch(() => null);
  if (!r) return new Response(null, { status: 503 });
  return new Response(r.pdf, { headers: {
    "content-type": "application/pdf", "content-disposition": `inline; filename="${r.numero}.pdf"`,
    "cache-control": "private, no-store", "x-content-type-options": "nosniff",
  } });
}
