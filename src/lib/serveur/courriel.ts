import "server-only";
import nodemailer from "nodemailer";
import { expediteur } from "@/content/courriels";

// Envoi d'e-mails par le SMTP d'OHT (SMTP_HOTE, SMTP_PORT = 465 en SSL, SMTP_UTILISATEUR = l'adresse d'envoi, SMTP_MDP),
// module commun aux e-mails clients et à ceux de l'équipe. Sans configuration : rien ne part (false), et la page ne prétend
// pas le contraire. `cle` sert d'identifiant de message stable : un même envoi relancé garde le même Message-ID.
export const courrielConfigure = () => {
  const port = Number(process.env.SMTP_PORT);
  return Boolean(process.env.SMTP_HOTE?.trim() && Number.isInteger(port) && port > 0 && port <= 65535 && process.env.SMTP_UTILISATEUR?.trim() && process.env.SMTP_MDP);
};

export type PieceJointe = { nom: string; contenu: Uint8Array; type: string };

// pieces : vrais fichiers joints (PDF) ; entetes : en-têtes ajoutés (ex. List-Unsubscribe de la lettre).
export async function envoyerCourriel(m: { a: string; sujet: string; html: string; texte: string; repondreA?: string | null; cle: string; nom?: string; pieces?: PieceJointe[]; entetes?: Record<string, string> }) {
  if (!courrielConfigure()) return false;
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
    return true;
  } catch {
    return false;
  }
}

export const echapper = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
