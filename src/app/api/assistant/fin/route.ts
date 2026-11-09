import { lireConversationSignee, terminer } from "@/lib/serveur/assistant/conversations";
import { baseConfiguree } from "@/lib/serveur/base";
import { selConfigure } from "@/lib/serveur/equipe/outils";
import { lireCorps } from "@/lib/serveur/garde";

// Le visiteur quitte la page : fin de sa conversation avec l'assistant. Envoyé par navigator.sendBeacon, le corps peut
// arriver en text/plain ; il est lu comme JSON quel que soit son type. Contrat :
// POST { c: identifiant signé } → toujours 204, sans corps (rien n'est révélé : identifiant inconnu, forgé, conversation
//      déjà effacée ou base muette donnent la même réponse).
// Conversation de l'assistant non transmise : effacée entièrement. Transmise à l'équipe : ses messages sont effacés, seule
// la ligne (résumé, transmise_le) reste. Passée à un agent ou devenue demande : rien n'est touché (conservation de 90 jours).
// La consommation et les compteurs des limites ne sont jamais effacés ici.

export async function POST(req: Request) {
  if (baseConfiguree() && selConfigure()) {
    const corps = (await lireCorps(req, 1_000)) as Record<string, unknown> | null;
    const id = corps && typeof corps === "object" ? lireConversationSignee(corps.c) : null;
    if (id) await terminer(`id=eq.${id}`);
  }
  return new Response(null, { status: 204, headers: { "cache-control": "private, no-store" } });
}
