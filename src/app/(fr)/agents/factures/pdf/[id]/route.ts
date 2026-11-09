import { factureAccessible } from "@/lib/serveur/equipe/finances/lectures";
import { pdfFinancier } from "@/lib/serveur/equipe/finances/pdf";
import { exigerRole } from "@/lib/serveur/equipe/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await exigerRole("agents");
  if (!s) return new Response(null, { status: 403 });
  const f = await factureAccessible(s, (await params).id);
  if (f === "panne") return new Response(null, { status: 503 });
  if (!f) return new Response(null, { status: 404 });
  const r = await pdfFinancier(f).catch(() => null);
  if (!r) return new Response(null, { status: 503 });
  return new Response(r.pdf, { headers: {
    "content-type": "application/pdf", "content-disposition": `inline; filename="${r.numero}.pdf"`,
    "cache-control": "private, no-store", "x-content-type-options": "nosniff",
  } });
}
