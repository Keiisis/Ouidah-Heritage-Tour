import { connection } from "next/server";
import { lireDossier } from "@/lib/serveur/documents/dossier";
import { rendrePdf } from "@/lib/serveur/documents/pdf";
import { origineSite } from "@/lib/serveur/paiement/outils";

// Document PDF d'un dossier de suivi : reçu de paiement (réservation payée) ou devis (publié par un agent), rendu à
// chaque demande depuis la commande réelle, dans sa langue. Ce que le QR code du ticket imprimé ouvre.
const PRIVE = { "cache-control": "private, no-store", "x-robots-tag": "noindex" };

export async function GET(req: Request, { params }: { params: Promise<{ jeton: string }> }) {
  // À chaque requête : sans cela, la réponse serait figée à la build (cacheComponents).
  await connection();
  const dossier = await lireDossier((await params).jeton, { image: true }); // le PDF porte le tracé du client
  if (!dossier?.document) return new Response(null, { status: 404, headers: PRIVE });
  const pdf = await rendrePdf(dossier, origineSite(req));
  return new Response(pdf, {
    headers: {
      ...PRIVE,
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${dossier.document.numero.replace(/[^\w-]/g, "")}.pdf"`,
    },
  });
}
