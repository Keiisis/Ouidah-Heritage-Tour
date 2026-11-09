import { PDFDocument } from "pdf-lib";
import type { Dossier } from "@/lib/suivi";
import { rendrePdf } from "./pdf";

// Contrôle avant publication d'un devis (formulaire de l'admin) : Kevin veut toujours une seule page. Le devis est rendu
// tel qu'il sortira, adresse de vérification comprise (SITE_URL, comme la route du document ; sans elle, le domaine du
// site, pour mesurer la ligne à sa longueur réelle) ; plus d'une page = publication refusée, l'agent raccourcit les
// libellés ou la note.
export async function pagesDevis(dossier: Dossier): Promise<number> {
  const origine = process.env.SITE_URL?.trim().replace(/\/$/, "") || "https://ouidahheritagetour.bj";
  return (await PDFDocument.load(await rendrePdf(dossier, origine))).getPageCount();
}
