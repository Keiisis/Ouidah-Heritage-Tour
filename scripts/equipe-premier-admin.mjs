// Crée le premier administrateur de l'espace de l'équipe : compte dans Supabase Auth (mot de passe aléatoire que personne
// ne connaît), profil « invité » dans equipe_profils, puis code de première connexion envoyé par le SMTP d'OHT. L'admin
// ouvre ensuite /admins › « Première connexion ? », saisit le code et choisit son mot de passe.
// Usage : npm run equipe:premier-admin -- --prenom "Prénom" --nom "Nom" --email adresse@domaine --langues FR,EN
// Lit SUPABASE_URL, SUPABASE_SECRET_KEY, EQUIPE_SEL et SMTP_* dans .env.local ; refuse de tourner sans SMTP configuré.
// N'affiche jamais le code, le mot de passe ni une clé. Clé secrète dans l'en-tête « apikey » (doc Supabase « API keys »).
import { createHmac, randomInt } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import nodemailer from "nodemailer";

const { copiesCode, expediteurEquipe } = await import(pathToFileURL(join(import.meta.dirname, "../src/content/courriels-equipe.ts")).href);
// validation et création partagées avec l'écran Équipe de /admins (mêmes règles, même ordre : Auth, puis profil « invité »)
const { creerInvite, LANGUES, lireInvitation } = await import(pathToFileURL(join(import.meta.dirname, "../src/lib/serveur/equipe/partage.ts")).href);
const arreter = (m) => {
  console.error(`Arrêt : ${m}`);
  process.exit(1);
};

const env = process.env;
const manque = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "EQUIPE_SEL", "SMTP_HOTE", "SMTP_PORT", "SMTP_UTILISATEUR", "SMTP_MDP"].filter((k) => !env[k]);
if (manque.length) arreter(`variables absentes de .env.local : ${manque.join(", ")} (aucun envoi sans SMTP configuré).`);
if (env.EQUIPE_SEL.length < 32) arreter("EQUIPE_SEL doit compter au moins 32 caractères aléatoires.");

const { values: a } = parseArgs({ options: { prenom: { type: "string" }, nom: { type: "string" }, email: { type: "string" }, langues: { type: "string", default: "FR" } } });
const lu = lireInvitation({ prenom: a.prenom, nom: a.nom, email: a.email, langues: a.langues.split(",").map((l) => l.trim().toUpperCase()).filter(Boolean), role: "admin" });
if (!lu.ok) arreter(`champs refusés : ${lu.champs.join(", ")} (--prenom et --nom requis, 80 caractères au plus ; --email valide ; --langues parmi ${LANGUES.join(", ")}, séparées par des virgules).`);
const { prenom, email, langues } = lu.v;

const hmac = (s) => createHmac("sha256", env.EQUIPE_SEL).update(s).digest("hex"); // même format que src/lib/serveur/equipe/outils.ts
const entetes = { apikey: env.SUPABASE_SECRET_KEY, "content-type": "application/json" };
const rest = (chemin, init = {}) => fetch(`${env.SUPABASE_URL}/rest/v1/${chemin}`, { ...init, headers: { ...entetes, prefer: "return=minimal", ...init.headers } });

// 1-3. compte Supabase Auth (adresse confirmée, mot de passe aléatoire jamais affiché) puis profil administrateur « invité »
const cree = await creerInvite({ url: env.SUPABASE_URL, cle: env.SUPABASE_SECRET_KEY }, lu.v);
if (cree === "existe") arreter("un compte existe déjà pour cette adresse : rien n'a été modifié.");
if (cree === "panne") arreter("création refusée par Supabase (la migration 20261030_equipe.sql est-elle appliquée ?) : rien n'a été gardé.");
const compte = cree;

// 4. code de première connexion (10 min, fixées par la base) puis envoi
const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
const ligne = await rest("equipe_codes", { method: "POST", body: JSON.stringify({ profil_id: compte.id, code_hmac: hmac(`code|${compte.id}|${code}`) }) });
if (!ligne.ok) arreter(`profil créé mais code refusé (HTTP ${ligne.status}) : l'admin peut demander un code depuis /admins › « Première connexion ? ».`);
const c = copiesCode[langues[0]] ?? copiesCode.FR;
const port = Number(env.SMTP_PORT);
try {
  await nodemailer
    .createTransport({ host: env.SMTP_HOTE, port, secure: port === 465, requireTLS: port !== 465, auth: { user: env.SMTP_UTILISATEUR, pass: env.SMTP_MDP } })
    .sendMail({ from: { name: expediteurEquipe, address: env.SMTP_UTILISATEUR }, to: email, subject: c.sujetPremiere, text: [c.bonjour(prenom), c.premiere, code, c.validite, c.ignorer, c.signature].join("\n\n") });
} catch (e) {
  arreter(`profil créé, mais l'e-mail n'est pas parti (${e?.code ?? "erreur SMTP"}) : l'admin peut redemander un code depuis /admins › « Première connexion ? ».`);
}
await rest("equipe_journal", { method: "POST", body: JSON.stringify({ action: "code.envoye", profil_id: compte.id, details: { role: "admin", etat: "invite" } }) });
console.log(`Administrateur invité : ${email}. Code de première connexion envoyé (valable 10 minutes) : ouvrir /admins › « Première connexion ? ».`);
