import "server-only";
import { createHash } from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { base } from "../../base";
import { lireTaches, rpcTache } from "../pilotage/taches";
import { droitsEffectifs } from "../securite/droits";
import type { Session } from "../session";
import { UUID } from "./rendu";

const MAX_MESSAGE = 2 * 1024 * 1024;
/** Plus grosse pièce jointe servie : sous le plafond de 4,5 Mo d'une réponse de fonction Vercel. */
export const MAX_PIECE = 4 * 1024 * 1024;
/** Intervalle minimal, côté serveur, entre deux relèves automatiques de l'écran boîte (le navigateur en demande une toutes
 * les 3 minutes ; plusieurs onglets ou plusieurs membres de l'équipe n'en font pas plus). */
export const INTERVALLE_AUTO_S = 150;
export function configurationImap() {
  const host = process.env.IMAP_HOTE?.trim(), user = process.env.IMAP_UTILISATEUR?.trim(), pass = process.env.IMAP_MDP;
  const port = Number(process.env.IMAP_PORT ?? 993), dossier = process.env.IMAP_DOSSIER?.trim() || "INBOX";
  return host && user && pass && Number.isInteger(port) && port > 0 && port <= 65535
    ? { host, user, pass, port, dossier, boite: createHash("sha256").update(`${host.toLowerCase()}|${port}|${user.toLowerCase()}|${dossier}`).digest("hex") } : null;
}
type ConfigImap = NonNullable<ReturnType<typeof configurationImap>>;
/** Connexion TLS (993) ou STARTTLS exigé, sans journal ni IDLE. ImapFlow émet aussi « error » hors d'une promesse : la
 * session est alors fermée, et l'opération en cours échoue. */
function clientImap(config: ConfigImap) {
  const client = new ImapFlow({ host: config.host, port: config.port, secure: config.port === 993, doSTARTTLS: config.port !== 993, auth: { user: config.user, pass: config.pass }, logger: false, disableAutoIdle: true, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000, maxResponseSize: 3 * MAX_MESSAGE });
  client.on("error", () => client.close());
  return client;
}
/** Chaîne venue d'un message ou de son enveloppe, coupée puis gardable par Postgres : sans moitié de caractère (une coupe
 * au milieu d'un emoji, réparée par toWellFormed) ni U+0000, que jsonb refuse. Sinon tout le lot serait refusé. */
const propre = (v: unknown, max: number) => String(v ?? "").slice(0, max).toWellFormed().replace(/\u0000/g, "");

/** L'adresse From n'est pas authentifiée : n'importe qui peut l'écrire. Seul le serveur de réception (`serveur`, l'hôte IMAP)
 * la vérifie, et le note dans l'en-tête Authentication-Results (RFC 8601) qu'il pose AU-DESSUS des autres : seul le premier
 * est lu, et seulement s'il porte le nom de ce serveur (un en-tête plus bas a pu être écrit par l'expéditeur). Vérifié :
 * dmarc=pass pour le domaine du From, ou spf=pass et dkim=pass alignés sur lui (même domaine ou domaine parent/enfant).
 * Plusieurs From (ou plusieurs adresses), aucun en-tête, autre serveur : non vérifié. */
export function expediteurVerifie(entetes: readonly { key: string; line: string }[], serveur: string, adresse: string, nAdresses: number) {
  const domaine = adresse.split("@")[1] ?? "", ar = entetes.find((e) => e.key === "authentication-results");
  if (!domaine || !serveur || !ar || nAdresses !== 1 || entetes.filter((e) => e.key === "from").length !== 1) return false;
  let t = ar.line.replace(/^[^:]*:/, "").replace(/\r?\n[ \t]+/g, " ").toLowerCase();
  for (let avant = ""; avant !== t; ) [avant, t] = [t, t.replace(/\([^()]*\)/g, " ")]; // commentaires, même imbriqués
  const [id, ...resultats] = t.split(";").map((x) => x.trim());
  if (id.split(/\s+/)[0] !== serveur.toLowerCase()) return false;
  const lus = resultats.map((r) => ({ methode: /^([a-z0-9-]+)\s*=\s*([a-z]+)/.exec(r)?.slice(1).join("=") ?? "", p: Object.fromEntries([...r.matchAll(/([a-z]+\.[a-z0-9_-]+)\s*=\s*"?([^\s";]+)/g)].map((x) => [x[1], x[2].split("@").pop() ?? ""])) }));
  const aligne = (d?: string) => !!d && (d === domaine || d.endsWith(`.${domaine}`) || domaine.endsWith(`.${d}`));
  const passe = (methode: string, ok: (p: Record<string, string>) => boolean) => lus.some((x) => x.methode === `${methode}=pass` && ok(x.p));
  return passe("dmarc", (p) => (p["header.from"] ?? domaine) === domaine) || (passe("spf", (p) => aligne(p["smtp.mailfrom"])) && passe("dkim", (p) => aligne(p["header.d"] ?? p["header.i"])));
}

export async function analyserCourriel(source: Buffer, serveur = "") {
  if (source.length > MAX_MESSAGE) throw new Error("taille");
  const options = { skipHtmlToText: false, skipTextToHtml: true, skipImageLinks: true, maxHtmlLengthToParse: MAX_MESSAGE };
  const m = await simpleParser(source, options);
  // MailParser 3.14 ne produit pas toujours `text` pour multipart/mixed avec HTML seul et PJ.
  // Son convertisseur existant traite correctement la même partie HTML comme document MIME autonome.
  const texte = m.text || (m.html ? (await simpleParser(Buffer.from(`Content-Type: text/html; charset=utf-8\r\n\r\n${m.html}`), options)).text : "") || "";
  const adresse = m.from?.value[0];
  const expediteur = propre(adresse?.address?.toLowerCase(), 254);
  // partie : numéro IMAP de la pièce dans le message (« 2 », « 1.2 »), pour la relire à la demande (lirePiece) ; un message
  // d'une seule partie n'a que la partie 1
  return { message_id: m.messageId ? propre(m.messageId, 1000) : null, expediteur, expediteur_verifie: expediteurVerifie(m.headerLines, serveur, expediteur, m.from?.value.length ?? 0), nom: propre(adresse?.name, 200), objet: propre(m.subject, 1000), texte: propre(texte, 100000), pieces: m.attachments.slice(0, 30).map((p) => ({ nom: propre(p.filename, 200), type: propre(p.contentType, 200), taille: p.size, partie: p.partId ?? "1" })) };
}

/** Lecture seule du serveur mail : aucun SEEN, MOVE ou DELETE. Le curseur et le lot importé sont validés ensemble.
 * `intervalle` (secondes) : refusée comme « occupe » si une relève a été lancée depuis moins longtemps (imap_reserver). */
export async function synchroniserImap(automatique = false, intervalle = 0): Promise<{ ok: true; nombre: number; suite: boolean } | { erreur: "configuration" | "panne" | "occupe" }> {
  const config = configurationImap();
  if (!config) return { erreur: "configuration" };
  if (automatique) {
    const r = await lireTaches();
    if (!r) return { erreur: "panne" };
    if (!r.imap_actif) return { ok: true, nombre: 0, suite: false };
  }
  const reserve = await rpcTache<{ jeton: string; validite: string | null; dernier_uid: number } | null>("imap_reserver", intervalle ? { p_boite: config.boite, p_intervalle: intervalle } : { p_boite: config.boite });
  if (!reserve) return { erreur: "panne" };
  if (!reserve.valeur) return { erreur: "occupe" };
  let jeton = reserve.valeur.jeton;
  // fermer la session sur « error » fait échouer le lot, dont le curseur reste inchangé
  const client = clientImap(config);
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
      const e = m.envelope;
      const mail = source && source.source ? await analyserCourriel(source.source, config.host) : { message_id: e?.messageId ? propre(e.messageId, 1000) : null, expediteur: propre(e?.from?.[0]?.address?.toLowerCase(), 254), expediteur_verifie: false, nom: propre(e?.from?.[0]?.name, 200), objet: propre(e?.subject, 1000), texte: "", pieces: [] };
      lot.push({ ...mail, uid: m.uid, volumineux, recu_le: m.internalDate instanceof Date ? m.internalDate.toISOString() : new Date(m.internalDate || Date.now()).toISOString() });
      traite = m.uid;
    }
    if (!messages.length || traite === messages.at(-1)?.uid) traite = fin;
    const terminer = async (uid: number, l: unknown[]) =>
      (await rpcTache<boolean>("imap_terminer", { p_boite: config.boite, p_jeton: jeton, p_validite: validite, p_uid: uid, p_messages: l, p_erreur: false }))?.valeur === true;
    if (!(await terminer(traite, lot))) {
      // Lot refusé : un message à la fois, et s'il est refusé seul, son marqueur (uid, expéditeur, « Message illisible ») :
      // le curseur avance toujours. Chaque enregistrement rend la réservation, reprise pour le suivant.
      for (const x of lot) {
        if (!(await terminer(x.uid, [x])) && !(await terminer(x.uid, [{ ...x, message_id: null, nom: "", objet: "Message illisible", texte: "", pieces: [] }]))) throw new Error("lot");
        const r = await rpcTache<{ jeton: string } | null>("imap_reserver", { p_boite: config.boite });
        if (!r?.valeur) throw new Error("reservation");
        jeton = r.valeur.jeton;
      }
      if (!(await terminer(traite, []))) throw new Error("lot");
    }
    return { ok: true, nombre: lot.length, suite: traite < dernier };
  } catch {
    // Réservation rendue avec l'erreur notée : l'admin la voit, et la relève suivante n'attend pas son expiration.
    await rpcTache<boolean>("imap_terminer", { p_boite: config.boite, p_jeton: jeton, p_validite: null, p_uid: 0, p_messages: [], p_erreur: true });
    return { erreur: "panne" };
  } finally {
    liberation?.();
    client.close();
  }
}

export type Piece = { nom: string; type: string; taille: number; partie?: string };
export type CourrielRecu = { id: string; expediteur: string; expediteur_verifie: boolean; nom: string; objet: string; texte: string; recu_le: string; demande_id: string | null; volumineux: boolean; pieces: Piece[] };
/** Droits de l'écran boîte sur les courriels reçus : l'admin les voit tous ; l'agent qui a le droit « demandes », ceux des
 * dossiers qui lui sont attribués (jointure filtrée) ; sans ce droit, aucun (null). */
const filtreAcces = (s: Session) => (s.role === "admin" ? "" : droitsEffectifs(s.droits).demandes ? `,demande:demandes!inner(agent_id)&demande.agent_id=eq.${s.profilId}` : null);
export async function lireCourrielsRecus(s: Session): Promise<CourrielRecu[] | null> {
  const agent = filtreAcces(s);
  if (agent === null) return [];
  try {
    const r = await base(`courriels_recus?select=id,expediteur,expediteur_verifie,nom,objet,texte,recu_le,demande_id,volumineux,pieces${agent}&order=recu_le.desc,id.asc&limit=100`);
    return r.ok ? await r.json() as CourrielRecu[] : null;
  } catch { return null; }
}

export type CourrielComplet = CourrielRecu & { message_id: string | null; boite: string; validite: string; uid: number };
/** Un courriel reçu, avec les mêmes droits que la liste de l'écran boîte : « non » s'il n'existe pas ou n'est pas visible
 * par ce compte (rien ne dit lequel), null si la base ne répond pas. */
export async function courrielRecu(s: Session, id: string): Promise<CourrielComplet | "non" | null> {
  const agent = filtreAcces(s);
  if (agent === null || !UUID.test(id)) return "non";
  try {
    const r = await base(`courriels_recus?select=id,expediteur,expediteur_verifie,nom,objet,texte,recu_le,demande_id,volumineux,pieces,message_id,boite,validite,uid${agent}&id=eq.${id}&limit=1`);
    return r.ok ? ((await r.json()) as CourrielComplet[])[0] ?? "non" : null;
  } catch { return null; }
}

/** Une pièce jointe relue à la demande sur le serveur IMAP (rien n'est stocké ailleurs), en lecture seule, par UID et
 * numéro de partie : « absent » si la boîte n'est plus la même (configuration, UIDVALIDITY), si le message ou la partie
 * n'existe plus, ou si la pièce dépasse MAX_PIECE ; null si le serveur ne répond pas. */
export async function lirePiece(c: Pick<CourrielComplet, "boite" | "validite" | "uid">, partie: string): Promise<Buffer | "absent" | null> {
  const config = configurationImap();
  if (!config || config.boite !== c.boite || !/^[1-9]\d{0,2}(\.[1-9]\d{0,2}){0,9}$/.test(partie)) return "absent";
  const client = clientImap(config);
  let liberation: (() => void) | undefined;
  try {
    await client.connect();
    const lock = await client.getMailboxLock(config.dossier, { readOnly: true });
    liberation = lock.release;
    if (!client.mailbox || client.mailbox.uidValidity.toString() !== c.validite) return "absent";
    // decodeText: false : les octets du fichier tels quels (seul l'encodage de transfert est retiré)
    const d = await client.download(String(c.uid), partie, { uid: true, maxBytes: MAX_PIECE + 1, decodeText: false });
    if (!d.content) return "absent";
    const morceaux: Buffer[] = [];
    let n = 0;
    for await (const x of d.content as AsyncIterable<Buffer>) {
      n += x.length;
      if (n > MAX_PIECE) {
        d.content.destroy();
        return "absent";
      }
      morceaux.push(x);
    }
    return Buffer.concat(morceaux);
  } catch {
    return null;
  } finally {
    liberation?.();
    client.close();
  }
}

/** Copie d'e-mails partis (RFC 822, les octets envoyés au SMTP) dans le dossier Envoyés, drapeau \Seen, une connexion pour
 * le lot. Dossier : celui que le serveur marque \Sent (RFC 6154), sinon IMAP_DOSSIER_ENVOYES, sinon « Sent ». Rend, pour
 * chaque message, null s'il est copié, sinon le motif court de l'échec (journal des envois). */
export async function copierDansEnvoyes(bruts: Buffer[]): Promise<(string | null)[]> {
  const config = configurationImap();
  if (!config) return bruts.map(() => "imap_absent");
  const client = clientImap(config);
  try {
    await client.connect();
    const marque = (await client.list({ listOnly: true })).find((d) => d.specialUse === "\\Sent" && d.specialUseSource === "extension");
    const dossier = marque?.path ?? (process.env.IMAP_DOSSIER_ENVOYES?.trim() || "Sent");
    const motifs: (string | null)[] = [];
    for (const brut of bruts) motifs.push(await client.append(dossier, brut, ["\\Seen"]).then((r) => (r ? null : "imap_append"), () => "imap_append"));
    return motifs;
  } catch {
    return bruts.map(() => "imap");
  } finally {
    client.close();
  }
}
