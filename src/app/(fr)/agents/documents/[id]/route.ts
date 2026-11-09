import { base } from "@/lib/serveur/base";
import { documentAccessible } from "@/lib/serveur/equipe/pilotage/lectures";
import { lienLecture } from "@/lib/serveur/equipe/pilotage/stockage";
import { exigerDroit } from "@/lib/serveur/equipe/securite/droits";

// Lecture d'un document client (passeport, billet d'avion, contrat…), données sensibles. Session exigée ; un agent
// seulement sur un dossier qui lui est attribué, un admin sur tous ; sinon 404 (rien ne dit qu'il existe). Chaque lecture
// est inscrite au journal AVANT de répondre, et refusée (503) si le journal ne l'a pas prise : jamais de lecture sans trace
// (même ligne que journaliser() de journal.ts, dont l'échec est muet). Le fichier vient du compartiment privé par un lien
// signé valable 60 secondes (une réponse de fonction Vercel ne dépasse pas 4,5 Mo ; un document peut en faire 10).

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await exigerDroit("demandes"); // droit « Demandes et devis » (lot « securite ») ; un admin les a tous
  if (!s) return new Response(null, { status: 403, headers: { "cache-control": "private, no-store" } });
  const doc = await documentAccessible(s, (await params).id);
  if (doc === null) return new Response(null, { status: 503, headers: { "cache-control": "private, no-store" } });
  if (doc === "non") return new Response(null, { status: 404, headers: { "cache-control": "private, no-store" } });
  const lien = await lienLecture(doc.chemin, 60);
  if (!lien) return new Response(null, { status: 503, headers: { "cache-control": "private, no-store" } });
  const trace = await base("equipe_journal", { method: "POST", corps: { action: "document.lecture", profil_id: s.profilId, ip_hash: null, details: { dossier: doc.demande, document: doc.id } }, prefer: "return=minimal" }).catch(() => null);
  if (!trace?.ok) return new Response(null, { status: 503, headers: { "cache-control": "private, no-store" } });
  return new Response(null, { status: 303, headers: { location: lien, "cache-control": "private, no-store", "referrer-policy": "no-referrer" } });
}
