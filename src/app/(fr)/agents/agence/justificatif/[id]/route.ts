import { lire, voitTout } from "@/lib/serveur/equipe/finances/lectures";
import { UUID } from "@/lib/serveur/equipe/finances/regles";
import { exigerRole } from "@/lib/serveur/equipe/session";

// Justificatif d'un paiement manuel ou d'une dépense, lu dans le stockage privé de la base. Admin : tous ; agent : ceux
// des paiements qu'il a saisis, rien d'autre (une dépense n'est jamais à lui). Hors de portée ou introuvable : 404.
// Type vérifié à l'envoi d'après les octets (PDF, JPEG, PNG, WebP) ; servi tel quel, sans détection de type.
const HEX = /^\\x[0-9a-f]*$/;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await exigerRole("agents");
  if (!s) return new Response(null, { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return new Response(null, { status: 404 });
  if (!voitTout(s)) {
    const a = await lire<{ id: string }>(`paiements_manuels?select=id&justificatif_id=eq.${id}&saisi_par=eq.${s.profilId}&limit=1`);
    if (!a) return new Response(null, { status: 503 });
    if (!a.length) return new Response(null, { status: 404 });
  }
  const j = await lire<{ type_mime: string; contenu: string }>(`finances_justificatifs?select=type_mime,contenu&id=eq.${id}&limit=1`);
  if (!j) return new Response(null, { status: 503 });
  if (!j[0] || !HEX.test(j[0].contenu)) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(Buffer.from(j[0].contenu.slice(2), "hex")), {
    headers: {
      "content-type": j[0].type_mime,
      "content-disposition": "inline",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-origin",
    },
  });
}
