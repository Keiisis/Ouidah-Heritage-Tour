import { after, connection } from "next/server";
import { LIMITES } from "@/content/assistant";
import {
  agentsEnLigne,
  ajouterMessage,
  chargerConversation,
  type Conversation,
  creerConversation,
  limiteMessage,
  limitePassage,
  lireConversationSignee,
  modifierConversation,
  notifierEquipe,
  passerAgent,
  signerConversation,
  versDemande,
  vuPerime,
} from "@/lib/serveur/assistant/conversations";
import { compter } from "@/lib/serveur/assistant/compteur";
import { estLangue, lireContact, lireMessage } from "@/lib/serveur/assistant/regles";
import { baseConfiguree } from "@/lib/serveur/base";
import { envoyerAccuse, envoyerAvisConversation } from "@/lib/serveur/courriels/assistant";
import { selConfigure } from "@/lib/serveur/equipe/outils";
import { empreinteIp, lireCorps, reponse } from "@/lib/serveur/garde";
import { origineSite } from "@/lib/serveur/paiement/outils";

// Discussion avec un agent (sans IA, sans clé Groq : les messages restent chez OHT ; conversation gardée CONSERVATION_JOURS,
// jamais effacée à la fin de la visite). Une conversation de l'assistant effacée ou finie (/api/assistant/fin) donne 404.
// POST { etape, c?, langue, … } :
//   "passage"  { c?, langue, message? }  → { c, enLigne, demanderContact } : la conversation (ou une nouvelle) passe à
//              l'équipe avec son résumé ; notification « conversation_agent » pour les admins et les agents ayant le droit
//              « Demandes ». Personne en ligne : demanderContact = true (e-mail ou WhatsApp).
//   "message"  { c, message }           → { ok, id } (conversation passée à un agent seulement)
//   "contact"  { c, nom?, email?, whatsapp?, accord: true } → { ok } (e-mail ou WhatsApp exigé, accord daté)
//   "demande"  { c, nom, email, whatsapp?, accord: true }   → { ok } : la conversation devient une demande (question)
//   Erreurs : 400 { erreur: "illisible" | "langue" | "vide" | "long" | "etape" | "accord" | "contact", champs? } ·
//   404 { erreur: "conversation" } · 409 { erreur: "assistant" | "deja" } · 429 { erreur: "limite" } · 502 / 503.
// GET ?c=<signé>&apres=<id> → { mode, enLigne, contact, demande, messages: [{ id, auteur, texte, actions, quand, agent? }] }
//   (interrogation périodique du visiteur ; vaut lecture, vu_le réécrit au plus toutes les VU_MS : une réponse d'agent ne
//   part par e-mail que s'il est absent depuis LIMITES.absentMinutes).

const pret = () => baseConfiguree() && selConfigure();

async function charger(v: unknown): Promise<Conversation | Response> {
  const id = lireConversationSignee(v);
  const c = id ? await chargerConversation(id) : null;
  if (c === "panne") return reponse({ erreur: "base" }, 502);
  return c ?? reponse({ erreur: "conversation" }, 404);
}

export async function GET(req: Request) {
  await connection();
  if (!pret()) return reponse({ erreur: "indisponible" }, 503);
  const q = new URL(req.url).searchParams;
  const id = lireConversationSignee(q.get("c"));
  // une requête pour la conversation et ses nouveaux messages ; en ligne mémorisé 30 s ; vu_le réécrit au plus chaque minute
  const [c, enLigne] = await Promise.all([id ? chargerConversation(id, Number(q.get("apres")) || 0) : null, agentsEnLigne()]);
  if (c === "panne") return reponse({ erreur: "base" }, 502);
  if (!c) return reponse({ erreur: "conversation" }, 404);
  const m = c.messages;
  if (vuPerime(c.vu_le)) await modifierConversation(c.id, { vu_le: new Date().toISOString() });
  return reponse(
    {
      mode: c.mode,
      enLigne,
      contact: Boolean(c.contact_email || c.contact_whatsapp),
      demande: Boolean(c.demande_id),
      messages: m.map((x) => ({ id: x.id, auteur: x.auteur, texte: x.texte, actions: x.actions, quand: x.cree_le, ...(x.auteur === "agent" && x.agent ? { agent: x.agent.prenom } : {}) })),
    },
    200,
  );
}

export async function POST(req: Request) {
  if (!pret()) return reponse({ erreur: "indisponible" }, 503);
  const corps = (await lireCorps(req, 6_000)) as Record<string, unknown> | null;
  if (!corps || typeof corps !== "object") return reponse({ erreur: "illisible" }, 400);
  const ip = empreinteIp(req);
  const etape = corps.etape;

  if (etape === "passage") {
    if (!estLangue(corps.langue)) return reponse({ erreur: "langue" }, 400);
    const m = corps.message === undefined || corps.message === "" ? null : lireMessage(corps.message, LIMITES.message);
    if (m && !m.ok) return reponse({ erreur: m.erreur }, 400);
    if (await limitePassage(ip)) return reponse({ erreur: "limite" }, 429);
    const enLigne = await agentsEnLigne();
    let c: Conversation | null = null;
    if (corps.c !== undefined && corps.c !== null) {
      const x = await charger(corps.c);
      if (x instanceof Response) return x;
      c = x;
      if (!(await passerAgent(c, !enLigne))) return reponse({ erreur: "base" }, 502);
    } else if (await limiteMessage(ip, null)) return reponse({ erreur: "limite" }, 429);
    const id = c?.id ?? (await creerConversation({ langue: corps.langue, ip, agent: { horsLigne: !enLigne } }));
    if (!id) return reponse({ erreur: "base" }, 502);
    if (m?.ok) {
      if (c && (await limiteMessage(ip, id))) return reponse({ erreur: "limite" }, 429);
      if (!(await ajouterMessage({ conversation: id, auteur: "visiteur", texte: m.texte, ip }))) return reponse({ erreur: "base" }, 502);
    }
    await notifierEquipe(id);
    // personne en ligne, conversation qui vient de passer à l'équipe : avis par e-mail, et accusé au visiteur s'il a déjà
    // laissé son adresse (après la réponse ; un échec d'envoi ne touche pas la conversation)
    const origine = origineSite(req);
    if (!enLigne && c?.mode !== "agent" && origine) after(() => envoyerAvisConversation(id, origine).then(() => (c?.contact_email ? envoyerAccuse(id, origine) : false)).catch(() => null));
    // mesure d'audience (accord « mesure » transmis par le widget) : un passage à un agent, sans identifiant
    if (req.headers.get("x-oht-mesure") === "1") after(() => compter("passage_agent"));
    return reponse({ c: signerConversation(id), enLigne, demanderContact: !enLigne && !(c?.contact_email || c?.contact_whatsapp) }, 201);
  }

  if (etape !== "message" && etape !== "contact" && etape !== "demande") return reponse({ erreur: "etape" }, 400);
  const c = await charger(corps.c);
  if (c instanceof Response) return c;

  if (etape === "message") {
    if (c.mode !== "agent") return reponse({ erreur: "assistant" }, 409);
    const m = lireMessage(corps.message, LIMITES.message);
    if (!m.ok) return reponse({ erreur: m.erreur }, 400);
    if (await limiteMessage(ip, c.id)) return reponse({ erreur: "limite" }, 429);
    const id = await ajouterMessage({ conversation: c.id, auteur: "visiteur", texte: m.texte, ip });
    if (!id) return reponse({ erreur: "base" }, 502);
    await modifierConversation(c.id, { vu_le: new Date().toISOString() });
    await notifierEquipe(c.id);
    return reponse({ ok: true, id }, 201);
  }

  // coordonnées (étape contact, ou données avec la demande) : seulement avec l'accord explicite du visiteur
  const donne = ["nom", "email", "whatsapp"].some((k) => typeof corps[k] === "string" && (corps[k] as string).trim());
  if (etape === "contact" || donne) {
    if (corps.accord !== true) return reponse({ erreur: "accord" }, 400);
    const k = lireContact(corps);
    if (!k.ok) return reponse({ erreur: "contact", champs: k.champs }, 400);
    const email = k.v.email ?? c.contact_email, whatsapp = k.v.whatsapp ?? c.contact_whatsapp, avant = c.contact_email;
    if (!email && !whatsapp) return reponse({ erreur: "contact", champs: ["email", "whatsapp"] }, 400);
    const champs = { contact_nom: k.v.nom ?? c.contact_nom, contact_email: email, contact_whatsapp: whatsapp, contact_accord_le: new Date().toISOString() };
    if (!(await modifierConversation(c.id, champs))) return reponse({ erreur: "base" }, 502);
    Object.assign(c, champs);
    if (etape === "contact") {
      // conversation passée à l'équipe hors ligne : accusé au visiteur pour une adresse nouvelle (« l'équipe vous répond »)
      const origine = origineSite(req);
      if (c.mode === "agent" && c.hors_ligne && email && email !== avant && origine) after(() => envoyerAccuse(c.id, origine).catch(() => null));
      return reponse({ ok: true }, 200);
    }
  }

  const r = await versDemande(c);
  if (r === "contact") return reponse({ erreur: "contact", champs: [...(c.contact_nom ? [] : ["nom"]), ...(c.contact_email ? [] : ["email"])] }, 400);
  if (r === "deja") return reponse({ erreur: "deja" }, 409);
  if (r === "panne") return reponse({ erreur: "base" }, 502);
  return reponse({ ok: true }, 201);
}
