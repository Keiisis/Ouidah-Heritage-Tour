import "server-only";
import { randomUUID } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { copiesCode, expediteurEquipe, type LangueEquipe } from "@/content/courriels-equipe";
import { courrielConfigure, envoyerCourriel } from "../courriel";
import { gabaritCode } from "../courriels/code";
import { langueDe, lireModele } from "../courriels/commun";
import { origine } from "./messages/envoi";

// E-mail du code à l'équipe, dans la première langue du compte, au gabarit « la lettre illustrée » (courriels/code.ts),
// avec le texte saisi par l'admin s'il existe (modèle « auto-code »), par le module d'envoi commun (SMTP d'OHT,
// ../courriel). Sans configuration : rien ne part (false). Voie de test locale seulement (mode.ts) : le code est écrit
// dans le fichier EQUIPE_BOITE, hors du dépôt, au lieu de partir.
export const smtpConfigure = courrielConfigure;

const MINUTES = 10; // validité fixée par la base (equipe_codes.expire_le)

export async function envoyerCode(m: { a: string; prenom: string; langue: string | undefined; code: string; premiere: boolean; boite: string | null }) {
  if (m.boite) {
    const c = copiesCode[m.langue as LangueEquipe] ?? copiesCode.FR;
    try {
      await appendFile(m.boite, `${JSON.stringify({ a: m.a, code: m.code, sujet: m.premiere ? c.sujetPremiere : c.sujetOubli, le: new Date().toISOString() })}\n`, "utf8");
      return true;
    } catch {
      return false;
    }
  }
  const L = langueDe(m.langue);
  const [o, modele] = await Promise.all([origine(), lireModele("auto-code", L)]);
  const c = gabaritCode(m.prenom, m.code, MINUTES, L, { premiere: m.premiere, origine: o ?? undefined, modele });
  // chaque code est un message distinct : identifiant neuf (jamais dérivé du code)
  return envoyerCourriel({ a: m.a, sujet: c.sujet, html: c.html, texte: c.texte, cle: `equipe-${randomUUID()}`, nom: expediteurEquipe, modele: "auto-code" });
}
