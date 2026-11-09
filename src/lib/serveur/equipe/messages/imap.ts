import "server-only";
import { createHash } from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { base } from "../../base";
import { lireTaches, rpcTache } from "../pilotage/taches";
import { droitsEffectifs } from "../securite/droits";
import type { Session } from "../session";

const MAX_MESSAGE = 2 * 1024 * 1024;
export function configurationImap() {
  const host = process.env.IMAP_HOTE?.trim(), user = process.env.IMAP_UTILISATEUR?.trim(), pass = process.env.IMAP_MDP;
  const port = Number(process.env.IMAP_PORT ?? 993), dossier = process.env.IMAP_DOSSIER?.trim() || "INBOX";
  return host && user && pass && Number.isInteger(port) && port > 0 && port <= 65535
    ? { host, user, pass, port, dossier, boite: createHash("sha256").update(`${host.toLowerCase()}|${port}|${user.toLowerCase()}|${dossier}`).digest("hex") } : null;
}
export async function analyserCourriel(source: Buffer) {
  if (source.length > MAX_MESSAGE) throw new Error("taille");
  const options = { skipHtmlToText: false, skipTextToHtml: true, skipImageLinks: true, maxHtmlLengthToParse: MAX_MESSAGE };
  const m = await simpleParser(source, options);
  // MailParser 3.14 ne produit pas toujours `text` pour multipart/mixed avec HTML seul et PJ.
  // Son convertisseur existant traite correctement la même partie HTML comme document MIME autonome.
  const texte = m.text || (m.html ? (await simpleParser(Buffer.from(`Content-Type: text/html; charset=utf-8\r\n\r\n${m.html}`), options)).text : "") || "";
  const adresse = m.from?.value[0];
  return { message_id: m.messageId?.slice(0, 1000) ?? null, expediteur: (adresse?.address ?? "").toLowerCase().slice(0, 254), nom: (adresse?.name ?? "").slice(0, 200), objet: (m.subject ?? "").slice(0, 1000), texte: texte.replace(/\u0000/g, "").slice(0, 100000), pieces: m.attachments.slice(0, 30).map((p) => ({ nom: (p.filename ?? "").slice(0, 200), type: p.contentType, taille: p.size })) };
}

/** Lecture seule du serveur mail : aucun SEEN, MOVE ou DELETE. Le curseur et le lot importé sont validés ensemble. */
export async function synchroniserImap(automatique = false): Promise<{ ok: true; nombre: number; suite: boolean } | { erreur: "configuration" | "panne" | "occupe" }> {
  const config = configurationImap();
  if (!config) return { erreur: "configuration" };
  if (automatique) {
    const r = await lireTaches();
    if (!r) return { erreur: "panne" };
    if (!r.imap_actif) return { ok: true, nombre: 0, suite: false };
  }
  const reserve = await rpcTache<{ jeton: string; validite: string | null; dernier_uid: number } | null>("imap_reserver", { p_boite: config.boite });
  if (!reserve) return { erreur: "panne" };
  if (!reserve.valeur) return { erreur: "occupe" };
  const client = new ImapFlow({ host: config.host, port: config.port, secure: config.port === 993, doSTARTTLS: config.port !== 993, auth: { user: config.user, pass: config.pass }, logger: false, disableAutoIdle: true, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000, maxResponseSize: 3 * MAX_MESSAGE });
  // ImapFlow émet aussi « error » hors d'une promesse. Fermer la session fait échouer le lot, dont le curseur reste inchangé.
  client.on("error", () => client.close());
  let liberation: (() => void) | undefined;
  try {
    await client.connect();
    const lock = await client.getMailboxLock(config.dossier, { readOnly: true });
    liberation = lock.release;
    if (!client.mailbox) throw new Error("boite");
    const validite = client.mailbox.uidValidity.toString();
    const avant = validite === reserve.valeur.validite ? Number(reserve.valeur.dernier_uid) : 0;
    const dernier = Math.max(0, client.mailbox.uidNext - 1), fin = Math.min(avant + 200, dernier);
    const messages = avant < fin ? await client.fetchAll(`${avant + 1}:${fin}`, { uid: true, size: true, envelope: true, internalDate: true }, { uid: true }) : [];
    const lot = [];
    const debut = Date.now();
    let traite = avant;
    for (const m of messages.sort((a, b) => a.uid - b.uid)) {
      if (Date.now() - debut > 40000) break;
      const volumineux = (m.size ?? MAX_MESSAGE + 1) > MAX_MESSAGE;
      const source = volumineux ? false : await client.fetchOne(String(m.uid), { source: true }, { uid: true });
      // Un message supprimé entre les deux lectures n'est pas inventé.
      if (!volumineux && !source) { traite = m.uid; continue; }
      const mail = source && source.source ? await analyserCourriel(source.source) : { message_id: m.envelope?.messageId ?? null, expediteur: m.envelope?.from?.[0]?.address ?? "", nom: m.envelope?.from?.[0]?.name ?? "", objet: (m.envelope?.subject ?? "").slice(0, 1000), texte: "", pieces: [] };
      lot.push({ ...mail, uid: m.uid, volumineux, recu_le: m.internalDate instanceof Date ? m.internalDate.toISOString() : new Date(m.internalDate || Date.now()).toISOString() });
      traite = m.uid;
    }
    if (!messages.length || traite === messages.at(-1)?.uid) traite = fin;
    const resultat = await rpcTache<boolean>("imap_terminer", { p_boite: config.boite, p_jeton: reserve.valeur.jeton, p_validite: validite, p_uid: traite, p_messages: lot, p_erreur: false });
    return resultat?.valeur ? { ok: true, nombre: lot.length, suite: traite < dernier } : { erreur: "panne" };
  } catch {
    await rpcTache<boolean>("imap_terminer", { p_boite: config.boite, p_jeton: reserve.valeur.jeton, p_validite: null, p_uid: 0, p_messages: [], p_erreur: true });
    return { erreur: "panne" };
  } finally {
    liberation?.();
    client.close();
  }
}

export type CourrielRecu = { id: string; expediteur: string; nom: string; objet: string; texte: string; recu_le: string; demande_id: string | null; volumineux: boolean; pieces: { nom: string; type: string; taille: number }[] };
export async function lireCourrielsRecus(s: Session): Promise<CourrielRecu[] | null> {
  if (s.role !== "admin" && !droitsEffectifs(s.droits).demandes) return [];
  const agent = s.role === "admin" ? "" : `,demande:demandes!inner(agent_id)&demande.agent_id=eq.${s.profilId}`;
  try {
    const r = await base(`courriels_recus?select=id,expediteur,nom,objet,texte,recu_le,demande_id,volumineux,pieces${agent}&order=recu_le.desc,id.asc&limit=100`);
    return r.ok ? await r.json() as CourrielRecu[] : null;
  } catch { return null; }
}
