import "server-only";
import { assistantEquipe, CONSERVATION_JOURS, EFFACEMENT_MINUTES, type LangueAssistant, LIMITES } from "@/content/assistant";
import { base, compter } from "../base";
import { limiteAtteinte } from "../garde";
import { egaux, hmac, iso } from "../equipe/outils";
import { effacer } from "../equipe/dossiers";
import { droitsEffectifs } from "../equipe/securite/droits";
import type { Session } from "../equipe/session";
import { type Action, completer, lireSigne, resumer, signer, UUID } from "./regles";

// Conversations des visiteurs (assistant, puis agent), lues et écrites par le serveur seulement (clé secrète, RLS sans
// politique). L'identifiant donné au navigateur est toujours signé (HMAC EQUIPE_SEL), jamais l'uuid seul. Une conversation
// plus vieille que CONSERVATION_JOURS n'est plus jamais rendue. Rien ici n'est lu par l'assistant IA.
// Conversation avec l'assistant : effacée quand le visiteur quitte la page (terminer), ou par le filet après
// EFFACEMENT_MINUTES sans activité ; transmise à l'équipe, seule sa ligne (résumé) reste, finie. Les limites par connexion
// sont comptées dans assistant_compteurs (sans contenu) : effacer une conversation ne les remet jamais à zéro.

export const signerConversation = (id: string) => signer(id, hmac);
export const lireConversationSignee = (v: unknown) => lireSigne(v, hmac, egaux);

export type Conversation = {
  id: string;
  cree_le: string;
  vu_le: string;
  langue: LangueAssistant;
  mode: "assistant" | "agent";
  ip_hash: string;
  passage_le: string | null;
  hors_ligne: boolean;
  resume: string | null;
  transmise_le: string | null;
  agent_id: string | null;
  contact_nom: string | null;
  contact_email: string | null;
  contact_whatsapp: string | null;
  contact_accord_le: string | null;
  demande_id: string | null;
};
const CHAMPS = "id,cree_le,vu_le,langue,mode,ip_hash,passage_le,hors_ligne,resume,transmise_le,agent_id,contact_nom,contact_email,contact_whatsapp,contact_accord_le,demande_id";

export type LigneMessage = { id: number; cree_le: string; auteur: "visiteur" | "assistant" | "agent"; texte: string; actions: Action[]; sans_reponse: boolean; envoye_le: string | null; agent: { prenom: string } | null };

const maintenant = () => iso(Date.now());
const depuis = (minutes: number) => encodeURIComponent(iso(Date.now() - minutes * 60_000));
const conservee = () => `cree_le=gte.${depuis(CONSERVATION_JOURS * 1440)}`;

async function lire<T>(chemin: string): Promise<T[] | null> {
  try {
    const r = await base(chemin);
    return r.ok ? ((await r.json()) as T[]) : null;
  } catch {
    return null;
  }
}

/** PATCH qui rend les identifiants modifiés, null si la base ne répond pas. */
async function marquer(chemin: string, champs: Record<string, unknown>): Promise<{ id: string }[] | null> {
  try {
    const r = await base(chemin, { method: "PATCH", corps: { ...champs, modifie_le: maintenant() }, prefer: "return=representation" });
    return r.ok ? ((await r.json()) as { id: string }[]) : null;
  } catch {
    return null;
  }
}

/** Une ligne sans contenu (empreinte IP, genre, date) pour les limites par connexion ; false si la base ne répond pas. */
const compterVisiteur = (ip: string, genre: "message" | "conversation") =>
  base("assistant_compteurs", { method: "POST", corps: { ip_hash: ip, genre }, prefer: "return=minimal" }).then(
    (r) => r.ok,
    () => false,
  );

const CHAMPS_MESSAGE = "id,cree_le,auteur,texte,actions,sans_reponse,envoye_le,agent:equipe_profils(prenom)";

/** Conversation encore conservée et pas finie, null si inconnue (ou effacée, ou finie), "panne" si la base ne répond pas.
 * Avec `apres` : ses messages d'id supérieur (ordre d'arrivée, 200 au plus) dans la même requête (ressource embarquée). */
export async function chargerConversation(id: string): Promise<Conversation | null | "panne">;
export async function chargerConversation(id: string, apres: number): Promise<(Conversation & { messages: LigneMessage[] }) | null | "panne">;
export async function chargerConversation(id: string, apres?: number) {
  if (!UUID.test(id)) return null;
  const messages = apres === undefined ? "" : `,messages:conversation_messages(${CHAMPS_MESSAGE})&messages.id=gt.${Math.max(0, Math.floor(apres))}&messages.order=id.asc&messages.limit=200`;
  const l = await lire<Conversation>(`conversations?select=${CHAMPS}${messages}&id=eq.${id}&finie_le=is.null&${conservee()}&limit=1`);
  return l ? (l[0] ?? null) : "panne";
}

/** Nouvelle conversation, comptée d'abord pour la limite par connexion (sans compte possible : rien n'est créé). */
export async function creerConversation(c: { langue: LangueAssistant; ip: string; agent?: { horsLigne: boolean } }): Promise<string | null> {
  const t = maintenant();
  const corps = { langue: c.langue, ip_hash: c.ip, ...(c.agent ? { mode: "agent", passage_le: t, hors_ligne: c.agent.horsLigne, resume: assistantEquipe.resume.aucune } : {}) };
  if (!(await compterVisiteur(c.ip, "conversation"))) return null;
  try {
    const r = await base("conversations?select=id", { method: "POST", corps, prefer: "return=representation" });
    return r.ok ? (((await r.json()) as { id: string }[])[0]?.id ?? null) : null;
  } catch {
    return null;
  }
}

export async function modifierConversation(id: string, champs: Record<string, unknown>) {
  try {
    return (await base(`conversations?id=eq.${id}`, { method: "PATCH", corps: { ...champs, modifie_le: maintenant() }, prefer: "return=minimal" })).ok;
  } catch {
    return false;
  }
}

/** Messages d'une conversation après `apres` (ordre d'arrivée), au plus `limite` ; les plus récents si `derniers`. */
export async function lireMessages(id: string, o: { apres?: number; limite?: number; derniers?: boolean } = {}): Promise<LigneMessage[] | null> {
  const l = await lire<LigneMessage>(
    `conversation_messages?select=${CHAMPS_MESSAGE}&conversation_id=eq.${id}&id=gt.${Math.max(0, Math.floor(o.apres ?? 0))}&order=id.${o.derniers ? "desc" : "asc"}&limit=${o.limite ?? 200}`,
  );
  return l && o.derniers ? l.reverse() : l;
}

/** Message ajouté ; celui d'un visiteur est d'abord compté pour les limites par connexion (sans compte : refusé). */
export async function ajouterMessage(m: { conversation: string; auteur: "visiteur" | "assistant" | "agent"; texte: string; ip?: string; agent?: string; actions?: Action[]; sansReponse?: boolean }): Promise<number | null> {
  if (m.auteur === "visiteur" && !(m.ip && (await compterVisiteur(m.ip, "message")))) return null;
  try {
    const r = await base("conversation_messages?select=id", {
      method: "POST",
      corps: { conversation_id: m.conversation, auteur: m.auteur, texte: m.texte.slice(0, 4000), ip_hash: m.ip ?? null, agent_id: m.agent ?? null, actions: m.actions ?? [], sans_reponse: m.sansReponse ?? false },
      prefer: "return=representation",
    });
    return r.ok ? (((await r.json()) as { id: number }[])[0]?.id ?? null) : null;
  } catch {
    return null;
  }
}

/** Limite atteinte pour un nouveau message du visiteur (par connexion, puis par conversation), ou false. Base muette :
 * limite atteinte (on refuse plutôt que de laisser passer sans compter). Par connexion : assistant_compteurs, qui survit
 * à l'effacement des conversations ; par conversation : ses messages (une conversation effacée ou finie n'en reçoit plus). */
export async function limiteMessage(ip: string, conversation: string | null): Promise<boolean> {
  const g = "&genre=eq.message";
  const [minute, jour] = await Promise.all([limiteAtteinte("assistant_compteurs", ip, LIMITES.parMinuteIp, 1, g), limiteAtteinte("assistant_compteurs", ip, LIMITES.parJourIp, 1440, g)]);
  if (minute || jour) return true;
  if (!conversation) return limiteAtteinte("assistant_compteurs", ip, LIMITES.conversationsParHeureIp, 60, "&genre=eq.conversation");
  const v = "&auteur=eq.visiteur";
  const [n1, nTout] = await Promise.all([compter("conversation_messages", `conversation_id=eq.${conversation}${v}&cree_le=gte.${depuis(1)}`), compter("conversation_messages", `conversation_id=eq.${conversation}${v}`)]);
  return n1 === null || nTout === null || n1 >= LIMITES.parMinuteConversation || nTout >= LIMITES.parConversation;
}

/** Passages à un agent depuis cette connexion dans l'heure, au-delà de la limite (ou base muette). */
export async function limitePassage(ip: string) {
  const n = await compter("conversations", `ip_hash=eq.${ip}&passage_le=gte.${depuis(60)}`);
  return n === null || n >= LIMITES.passagesParHeureIp;
}

let memoEnLigne: { t: number; v: boolean } | null = null;

/** Un membre de l'équipe a une session active depuis moins de LIMITES.enLigneMinutes (equipe_sessions.vu_le, prolongé
 * au plus toutes les 5 minutes par lireSession). Relu au plus toutes les 30 s par processus (base muette : non mémorisé). */
export async function agentsEnLigne(): Promise<boolean> {
  if (memoEnLigne && Date.now() - memoEnLigne.t < 30_000) return memoEnLigne.v;
  const n = await compter("equipe_sessions", `revoque_le=is.null&expire_le=gt.${encodeURIComponent(maintenant())}&vu_le=gte.${depuis(LIMITES.enLigneMinutes)}`);
  if (n === null) return false;
  memoEnLigne = { t: Date.now(), v: n > 0 };
  return memoEnLigne.v;
}

/** `vu_le` (lecture du visiteur) n'est réécrit qu'après ce délai : avec une interrogation toutes les 30 s au plus, il a au
 * plus VU_MS + 30 s de retard quand le visiteur lit, sous LIMITES.absentMinutes (règle « absent » de actions.ts). */
export const VU_MS = 60_000;
export const vuPerime = (vuLe: string, t = Date.now()) => !(t - Date.parse(vuLe) < VU_MS);

/** Notification « conversation_agent » (re)posée, non lue, pour chaque admin et chaque agent actif qui a le droit
 * « Demandes » (le seul qui ouvre les conversations). */
export async function notifierEquipe(conversation: string) {
  const p = await lire<{ id: string; role: string; droits: unknown }>("equipe_profils?select=id,role,droits&etat=eq.actif&limit=500");
  const t = maintenant();
  const lignes = (p ?? []).filter((x) => x.role === "admin" || droitsEffectifs(x.droits).demandes).map((x) => ({ profil_id: x.id, type: "conversation_agent", objet_id: conversation, quand: t, lu_le: null }));
  if (!lignes.length) return;
  await base("notifications?on_conflict=profil_id,type,objet_id", { method: "POST", corps: lignes, prefer: "resolution=merge-duplicates,return=minimal" }).catch(() => null);
}

/** Passage d'une conversation de l'assistant à un agent : mode, date, résumé des questions (sans appel au modèle), à la
 * suite du résumé déjà transmis par l'assistant s'il y en a un. */
export async function passerAgent(c: Conversation, horsLigne: boolean): Promise<boolean> {
  if (c.mode === "agent") return true;
  const m = await lireMessages(c.id, { limite: 40, derniers: true });
  if (!m) return false;
  return modifierConversation(c.id, { mode: "agent", passage_le: maintenant(), hors_ligne: horsLigne, resume: completer(c.resume, resumer(m, assistantEquipe.resume)) });
}

/** Résumé de l'assistant transmis à l'équipe : `resume` complété, jamais écrasé. À la première transmission seulement,
 * transmise_le est posé et l'équipe est prévenue (notification « conversation_agent »). false si rien n'est enregistré. */
export async function transmettre(id: string, texte: string): Promise<boolean> {
  const c = (await lire<Pick<Conversation, "resume" | "transmise_le">>(`conversations?select=resume,transmise_le&id=eq.${id}&finie_le=is.null&limit=1`))?.[0];
  if (!c) return false;
  const resume = completer(c.resume, texte);
  if (c.transmise_le) return modifierConversation(id, { resume });
  const premiere = await marquer(`conversations?id=eq.${id}&transmise_le=is.null&select=id`, { resume, transmise_le: maintenant() });
  if (!premiere) return false;
  if (premiere.length) await notifierEquipe(id);
  else await modifierConversation(id, { resume }); // transmise entre-temps par une autre réponse
  return true;
}

/** Fin des conversations de l'assistant qui répondent à `filtre` (visiteur parti, ou filet) : non transmise, effacée
 * entièrement (messages en cascade ; la consommation reste, sans lien) ; transmise, marquée finie puis ses messages sont
 * effacés : seule la ligne (résumé, transmise_le) reste pour l'équipe. Passée à un agent ou devenue demande : rien n'est
 * touché, la conservation de CONSERVATION_JOURS s'applique. false si la base ne répond pas. */
export async function terminer(filtre: string): Promise<boolean> {
  const cible = `mode=eq.assistant&demande_id=is.null&finie_le=is.null&${filtre}`;
  const [effacees, finies] = await Promise.all([effacer<{ id: string }>(`conversations?${cible}&transmise_le=is.null&select=id`), marquer(`conversations?${cible}&transmise_le=not.is.null&select=id`, { finie_le: maintenant() })]);
  const messages = finies?.length ? await effacer(`conversation_messages?conversation_id=in.(${finies.map((x) => x.id).join(",")})&select=id`) : [];
  return Boolean(effacees && finies && messages);
}

/** Filet : conversations de l'assistant sans activité depuis EFFACEMENT_MINUTES (signal de départ perdu, onglet tué), et
 * messages arrivés après la fin d'une conversation transmise (réponse encore en cours quand le visiteur est parti). */
export async function terminerInactives(): Promise<boolean> {
  const inactives = `vu_le=lt.${depuis(EFFACEMENT_MINUTES)}`;
  const lot = await lire<{ id: string }>(`conversations?select=id&mode=eq.assistant&demande_id=is.null&finie_le=is.null&${inactives}&order=id.asc&limit=80`);
  if (!lot) return false;
  const ok = !lot.length || await terminer(`id=in.(${lot.map(x => x.id).join(",")})&${inactives}`);
  const restes = await lire<{ id: string }>("conversations?select=id,conversation_messages!inner(id)&finie_le=not.is.null&limit=50");
  const messages = restes?.length ? await effacer(`conversation_messages?conversation_id=in.(${restes.map((x) => x.id).join(",")})&select=id`) : [];
  return ok && restes !== null && messages !== null;
}

/** Un agent agit sur une conversation libre ou qu'il suit ; l'admin sur toutes. */
export const peutAgir = (s: Session, c: Pick<Conversation, "agent_id">) => s.role === "admin" || !c.agent_id || c.agent_id === s.profilId;

export type ConversationEquipe = Conversation & { agent: { prenom: string; nom: string } | null; messages: LigneMessage[]; plus: number };

/** Filet de l'assistant (terminerInactives), puis efface les conversations plus anciennes que CONSERVATION_JOURS (résumés
 * transmis compris ; messages par cascade, consommation gardée sans lien) et leurs notifications, et les compteurs des
 * limites de plus de 2 jours (la plus longue fenêtre est d'un jour). Celles devenues demande restent : elles suivent la
 * durée des demandes. Appelée à l'ouverture de la boîte, appelable par un cron. Nombre de conversations effacées après
 * CONSERVATION_JOURS, null si la base ne répond pas. */
export async function purgerConversations(): Promise<number | null> {
  if (!await terminerInactives()) return null;
  const anciennes = `cree_le=lt.${depuis(CONSERVATION_JOURS * 1440)}&demande_id=is.null`;
  const lot = await lire<{ id: string }>(`conversations?select=id&${anciennes}&order=id.asc&limit=80`);
  if (!lot) return null;
  // Les critères sont revérifiés lors de la mutation : une conversion en demande intercalée est conservée.
  const l = lot.length ? await effacer<{ id: string }>(`conversations?${anciennes}&id=in.(${lot.map(x => x.id).join(",")})&select=id`) : [];
  if (!l) return null;
  if (l.length && !await effacer(`notifications?type=eq.conversation_agent&objet_id=in.(${l.map((x) => x.id).join(",")})&select=id`)) return null;
  const perimes = `cree_le=lt.${depuis(2 * 1440)}`;
  const compte = await lire<{ id: number }>(`assistant_compteurs?select=id&${perimes}&order=id.asc&limit=500`);
  if (!compte) return null;
  const compteurs = compte.length ? await effacer(`assistant_compteurs?${perimes}&id=in.(${compte.map(x => x.id).join(",")})&select=id`) : [];
  return compteurs ? l.length : null;
}

/** Boîte de réception : conversations passées à un agent et conversations transmises par l'assistant (résumé), les plus
 * récentes d'abord ; un agent ne voit que les libres et les siennes. Les 12 derniers messages de chacune (aucun pour une
 * conversation transmise finie). null si la base ne répond pas. */
export async function lireConversationsEquipe(s: Session): Promise<ConversationEquipe[] | null> {
  await purgerConversations();
  const voies = "mode.eq.agent,transmise_le.not.is.null";
  const filtre = s.role === "admin" ? `or=(${voies})` : `and=(or(${voies}),or(agent_id.is.null,agent_id.eq.${s.profilId}))`;
  const l = await lire<Conversation & { agent: { prenom: string; nom: string } | null }>(`conversations?select=${CHAMPS},agent:equipe_profils(prenom,nom)&${filtre}&${conservee()}&order=cree_le.desc&limit=30`);
  if (!l?.length) return l ? [] : null;
  const m = await lire<LigneMessage & { conversation_id: string }>(
    `conversation_messages?select=id,conversation_id,cree_le,auteur,texte,actions,sans_reponse,envoye_le,agent:equipe_profils(prenom)&conversation_id=in.(${l.map((c) => c.id).join(",")})&order=id.desc&limit=600`,
  );
  if (!m) return null;
  return l.map((c) => {
    const tous = m.filter((x) => x.conversation_id === c.id);
    return { ...c, messages: tous.slice(0, 12).reverse(), plus: Math.max(0, tous.length - 12) };
  });
}

/** La conversation devient une demande (question), attribuée à l'agent qui la suit : il faut un nom, un e-mail et
 * l'accord daté du visiteur (contrainte de la table demandes). */
export async function versDemande(c: Conversation): Promise<"ok" | "contact" | "deja" | "panne"> {
  if (c.demande_id) return "deja";
  if (!c.contact_nom || !c.contact_email || !c.contact_accord_le) return "contact";
  const m = await lireMessages(c.id, { limite: 40, derniers: true });
  if (!m) return "panne";
  try {
    const r = await base("demandes?select=id", {
      method: "POST",
      corps: {
        statut: "envoyee",
        intention: "question",
        langue: c.langue,
        nom: c.contact_nom,
        email: c.contact_email,
        whatsapp: c.contact_whatsapp,
        message: resumer(m, assistantEquipe.resume),
        consentement_le: c.contact_accord_le,
        ip_hash: c.ip_hash,
        agent_id: c.agent_id,
        ...(c.agent_id ? { attribuee_le: maintenant() } : {}),
      },
      prefer: "return=representation",
    });
    const id = r.ok ? ((await r.json()) as { id: string }[])[0]?.id : undefined;
    if (!id) return "panne";
    return (await modifierConversation(c.id, { demande_id: id })) ? "ok" : "panne";
  } catch {
    return "panne";
  }
}
