import "server-only";
import nodemailer from "nodemailer";
import { expediteur } from "@/content/courriels";
import { base, baseConfiguree } from "./base";

// Envoi d'e-mails par le SMTP d'OHT (SMTP_HOTE, SMTP_PORT = 465 en SSL, SMTP_UTILISATEUR = l'adresse d'envoi, SMTP_MDP),
// module commun aux e-mails clients et à ceux de l'équipe. Sans configuration : rien ne part (false), et la page ne prétend
// pas le contraire. `cle` sert d'identifiant de message stable : un même envoi relancé garde le même Message-ID.
// Chaque tentative laisse une ligne dans courriels_journal (11/11) : modèle, destinataire masqué, réussite ou motif court
// de l'échec, jamais le contenu. Une base muette n'empêche pas l'envoi.
export const courrielConfigure = () => {
  const port = Number(process.env.SMTP_PORT);
  return Boolean(process.env.SMTP_HOTE?.trim() && Number.isInteger(port) && port > 0 && port <= 65535 && process.env.SMTP_UTILISATEUR?.trim() && process.env.SMTP_MDP);
};

export type PieceJointe = { nom: string; contenu: Uint8Array; type: string };

/** « nadia@exemple.com » → « n***@e***.com » : assez pour reconnaître un envoi, sans l'adresse en clair. */
export const adresseMasquee = (a: string) => {
  const [local = "", domaine = ""] = a.trim().toLowerCase().split("@");
  const point = domaine.lastIndexOf(".");
  const masque = (s: string) => (s ? `${s[0]}***` : "***");
  return `${masque(local)}@${point > 0 ? `${masque(domaine.slice(0, point))}${domaine.slice(point)}` : masque(domaine)}`.slice(0, 80);
};

/** Motif court d'un échec SMTP (code nodemailer, code de réponse du serveur) : jamais le message ni l'adresse. */
export function motifEchec(e: unknown) {
  const x = (e ?? {}) as { code?: unknown; responseCode?: unknown };
  const code = typeof x.code === "string" ? x.code.toLowerCase().replace(/[^a-z0-9_]/g, "") : "";
  const reponse = typeof x.responseCode === "number" ? String(x.responseCode) : "";
  return [code, reponse].filter(Boolean).join("_").slice(0, 40) || "inconnu";
}

async function noter(modele: string, a: string, reussi: boolean, motif: string | null) {
  if (!baseConfiguree()) return;
  try {
    await base("courriels_journal", { method: "POST", corps: { modele, destinataire: adresseMasquee(a), reussi, motif }, prefer: "return=minimal" });
  } catch {
    // journal indisponible : l'envoi garde son résultat
  }
}

/** Échec avant tout envoi (exception de rendu ou de lecture) : tracé au journal au lieu d'être avalé. */
export const noterException = (modele: string, a: string) => noter(modele, a, false, "exception");

// pieces : vrais fichiers joints (PDF) ; entetes : en-têtes ajoutés (ex. List-Unsubscribe de la lettre) ; modele : clé
// du journal (auto-…, avis-…), « autre » à défaut.
export async function envoyerCourriel(m: { a: string; sujet: string; html: string; texte: string; repondreA?: string | null; cle: string; nom?: string; pieces?: PieceJointe[]; entetes?: Record<string, string>; modele?: string }) {
  const modele = m.modele && /^[a-z0-9][a-z0-9-]{0,39}$/.test(m.modele) ? m.modele : "autre";
  if (!courrielConfigure()) {
    await noter(modele, m.a, false, "smtp_absent");
    return false;
  }
  const port = Number(process.env.SMTP_PORT);
  const adresse = process.env.SMTP_UTILISATEUR!.trim();
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOTE!.trim(),
      port,
      secure: port === 465, // 465 : TLS dès la connexion ; sinon STARTTLS exigé
      requireTLS: port !== 465,
      auth: { user: adresse, pass: process.env.SMTP_MDP },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      dnsTimeout: 10000,
    });
    await transport.sendMail({
      from: { name: m.nom ?? expediteur, address: adresse },
      to: m.a,
      subject: m.sujet,
      html: m.html,
      text: m.texte,
      messageId: `<${m.cle}@${adresse.split("@")[1]}>`,
      ...(m.repondreA ? { replyTo: m.repondreA } : {}),
      ...(m.pieces?.length ? { attachments: m.pieces.map((p) => ({ filename: p.nom, content: Buffer.from(p.contenu), contentType: p.type })) } : {}),
      ...(m.entetes ? { headers: m.entetes } : {}),
    });
    await noter(modele, m.a, true, null);
    return true;
  } catch (e) {
    await noter(modele, m.a, false, motifEchec(e));
    return false;
  }
}

export const MAX_AVIS = 10;
const ADRESSE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[a-z]{2,63}$/i;

/** Destinataires des avis à l'équipe, relus à chaque avis : la liste de l'admin (reglages_transversaux.avis_equipe),
 * sinon EMAIL_OHT en secours ; [] si aucune des deux. */
export async function destinatairesAvis(): Promise<string[]> {
  let liste: string[] = [];
  if (baseConfiguree()) {
    try {
      const r = await base("reglages_transversaux?select=avis_equipe&id=eq.true");
      const v = r.ok ? ((await r.json()) as { avis_equipe?: unknown }[])[0]?.avis_equipe : null;
      if (Array.isArray(v)) liste = [...new Set(v.filter((x): x is string => typeof x === "string" && ADRESSE.test(x)).map((x) => x.toLowerCase()))].slice(0, MAX_AVIS);
    } catch {
      // base muette : secours EMAIL_OHT
    }
  }
  const secours = process.env.EMAIL_OHT?.trim();
  return liste.length ? liste : secours ? [secours] : [];
}

/** Avis interne à l'équipe (en français), un e-mail par destinataire ; true si au moins un est parti. La réponse va à
 * `repondreA` (le client). */
export async function envoyerAvis(m: { sujet: string; html: string; texte: string; cle: string; modele: string; repondreA?: string | null; pieces?: PieceJointe[] }) {
  const liste = await destinatairesAvis();
  const r = await Promise.all(liste.map((a, i) => envoyerCourriel({ ...m, a, cle: `${m.cle}-${i}` })));
  return r.some(Boolean);
}

export const echapper = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
