import { baseConfiguree } from "@/lib/serveur/base";
import { finaliser, lireReservation } from "@/lib/serveur/paiement/finaliser";
import { envoyerBillets } from "@/lib/serveur/paiement/courriel";
import { passerelle } from "@/lib/serveur/paiement";
import { chargerCles } from "@/lib/serveur/paiement/cles";
import { finaliserLienWebhook } from "@/lib/serveur/paiement/lien";
import { origineSite } from "@/lib/serveur/paiement/outils";
import { PASSERELLES, type Reservation } from "@/lib/serveur/paiement/types";

// Notifications des passerelles. Corps brut lu tel quel (la signature porte sur lui), signature vérifiée par la
// passerelle concernée, puis la transaction est RELUE auprès de son API : le contenu du webhook ne décide de rien.
// Réponse sans détail : 401 si la signature est fausse, 200 sinon (la passerelle n'a pas à réessayer un refus métier).
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function POST(req: Request, { params }: { params: Promise<{ passerelle: string }> }) {
  const demandee = (await params).passerelle;
  const nom = PASSERELLES.find((p) => p === demandee);
  if (!nom) return new Response(null, { status: 404 });
  const p = passerelle(nom);
  await chargerCles(); // clés saisies dans l'admin (sinon variables du serveur), relues au plus toutes les 60 s
  if (!p.disponible() || !baseConfiguree()) return new Response(null, { status: 503 });
  const brut = await req.text();
  if (brut.length > 64_000) return new Response(null, { status: 413 });
  const lu = p.lireWebhook(brut, req.headers);
  if (!lu) return new Response(null, { status: 401 });
  if (lu === "ignorer") return new Response(null, { status: 200 });

  const c = await p.constater(lu.transaction).catch(() => null);
  if (!c) return new Response(null, { status: 502 }); // API de la passerelle muette : elle renverra le webhook
  // la référence peut venir de données posées par le navigateur (widget) : format vérifié avant toute requête
  if (c.reservation !== null && !ID.test(c.reservation)) return new Response(null, { status: 200 });
  // Une panne de lecture n'est pas une réservation absente : conserver le rejeu du prestataire.
  let r: Reservation | null;
  try {
    r = c.reservation ? await lireReservation(`id=eq.${c.reservation}&passerelle=eq.${nom}`, true) : await lireReservation(`passerelle=eq.${nom}&transaction_id=eq.${encodeURIComponent(c.transaction)}`, true);
  } catch {
    return new Response(null, { status: 502 });
  }
  // pas de réservation : la transaction peut appartenir à un lien de paiement de devis (lot finances)
  if (!r) return new Response(null, { status: (await finaliserLienWebhook(nom, c)) === "base" ? 502 : 200 });
  const issue = await finaliser(r, c);
  if (issue.refus === "base") return new Response(null, { status: 502 });
  const origine = origineSite(req);
  if (issue.statut === "paye" && origine) await envoyerBillets(issue.reservation, origine);
  return new Response(null, { status: 200 });
}
