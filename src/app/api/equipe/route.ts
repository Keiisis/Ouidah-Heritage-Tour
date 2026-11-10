import { cookies } from "next/headers";
import { after } from "next/server";
import type { Role } from "@/content/equipe";
import { baseConfiguree } from "@/lib/serveur/base";
import { empreinteIp, lireCorps, reponse } from "@/lib/serveur/garde";
import { consommerJeton, emettreCode, verifierCode } from "@/lib/serveur/equipe/codes";
import { changerMotDePasse, lireProfil, modifierProfil, verifierMotDePasse } from "@/lib/serveur/equipe/comptes";
import { envoyerCode, smtpConfigure } from "@/lib/serveur/equipe/courriel";
import { essaiReussi, noterEssai } from "@/lib/serveur/equipe/essais";
import { journaliser } from "@/lib/serveur/equipe/journal";
import { modeLocal } from "@/lib/serveur/equipe/mode";
import { autorise, COOKIE_CODE, empreinteEmail, iso, JETON_CODE_MS, optionsCookie, type Profil, selConfigure } from "@/lib/serveur/equipe/outils";
import { fermerSession, ouvrirSession, revoquerSessions } from "@/lib/serveur/equipe/session";
import { ipBloquee } from "@/lib/serveur/equipe/securite/ip";

// Connexion de l'équipe (/agents, /admins), lots L0-L1 du plan de liaison (30/10/2026).
// Actions : connexion { role, email, mdp } · code { role, email } · verifier { role, email, code } · nouveau { role, email, mdp }
// · deconnexion { role }.
// - Requête acceptée seulement en JSON et depuis le site lui-même (Origin = hôte) : pas de requête intersite.
// - Réponse identique que l'adresse corresponde à un compte ou non ; verrou de 5 échecs par e-mail ou par IP en 15 min.
// - « nouveau » exige le jeton court posé par « verifier » (cookie httpOnly, usage unique, 10 min) et révoque toutes les
//   sessions du compte.
// - Sans Supabase ni EQUIPE_SEL : 503 « pas_encore » ; sans SMTP, même réponse pour « code » (seule action qui envoie).
// - En local seulement (mode.ts) : EQUIPE_DEMO=1 rejoue la maquette G avec des valeurs qui ne quittent pas le serveur ;
//   EQUIPE_BOITE écrit les codes dans un fichier hors du dépôt au lieu de les envoyer.
const ROLES: Role[] = ["agents", "admins"];
const ACTIONS = ["connexion", "code", "verifier", "nouveau", "deconnexion"] as const;
type Action = (typeof ACTIONS)[number];
const DEMO = { mdp: "ouidah-maquette", code: "482915", jeton: "maquette-verifiee" };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const texte = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
// mêmes exigences que l'écran : 12 caractères au moins, différent de l'adresse et de sa partie avant « @ »
const motDePasseFaible = (mdp: string, email: string) => mdp.length < 12 || mdp.toLowerCase() === email || mdp.toLowerCase().includes(email.split("@")[0]);

function origineSure(req: Request) {
  const origine = req.headers.get("origin");
  const hote = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origine || !hote) return false;
  try {
    return new URL(origine).host === hote;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!origineSure(req)) return reponse({ erreur: "origine" }, 403);
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return reponse({ erreur: "illisible" }, 415);
  const c = (await lireCorps(req, 2_000)) as Record<string, unknown> | null;
  if (!c || !ROLES.includes(c.role as Role) || !ACTIONS.includes(c.action as Action)) return reponse({ erreur: "illisible" }, 400);
  const role = c.role as Role;
  const action = c.action as Action;
  const local = modeLocal(process.env, req.headers.get("host"), process.cwd());
  if (local.demo) return demo(action, c);

  if (action === "deconnexion") {
    await fermerSession();
    return reponse({ ok: true }, 200);
  }
  if (!baseConfiguree() || !selConfigure()) return reponse({ erreur: "pas_encore" }, 503);
  if (action === "code" && !smtpConfigure() && !local.boite) return reponse({ erreur: "pas_encore" }, 503);

  const email = texte(c.email, 254).trim().toLowerCase();
  if (!EMAIL.test(email)) return reponse({ erreur: "illisible" }, 400);
  if (action === "nouveau" && (typeof c.mdp !== "string" || c.mdp.length > 200 || motDePasseFaible(c.mdp, email))) return reponse({ erreur: "faible" }, 400);

  const ipH = empreinteIp(req);
  // adresse bloquée par un admin (lot « securite ») : refusée avant tout essai, même avec le bon mot de passe
  if (await ipBloquee(ipH)) return reponse({ erreur: "bloquee" }, 403);
  const essai = await noterEssai(action, empreinteEmail(email), ipH);
  if (!essai) return reponse({ erreur: "indisponible" }, 503);
  if (essai.etat !== "libre") return reponse({ erreur: essai.etat === "trop_tot" ? "trop_tot" : "trop" }, 429);

  switch (action) {
    case "connexion": {
      const mdp = texte(c.mdp, 200);
      const id = mdp ? await verifierMotDePasse(email, mdp) : null;
      const p = id ? await lireProfil({ id }) : null;
      if (!p || p.email !== email || p.etat !== "actif" || !autorise(p.role, role)) {
        if (p) await journaliser("connexion.refus", p.id, ipH, { role: p.role, etat: p.etat, motif: p.etat !== "actif" ? "etat" : "role" });
        return reponse({ erreur: "identifiants" }, 401);
      }
      return entrer(p, essai.id, ipH);
    }
    case "code": {
      // tout le travail propre aux comptes existants part après la réponse : même réponse, même délai pour une adresse inconnue
      after(async () => {
        const p = await lireProfil({ email });
        if (!p || p.etat === "suspendu" || p.etat === "supprime" || !autorise(p.role, role)) return;
        const code = await emettreCode(p.id);
        const envoye = code ? await envoyerCode({ a: p.email, prenom: p.prenom, langue: p.langues[0], code, premiere: p.etat === "invite", boite: local.boite }) : false;
        await journaliser(envoye ? "code.envoye" : "code.echec", p.id, ipH, { etat: p.etat, ...(envoye ? {} : { motif: "envoi" as const }) });
      });
      return reponse({ ok: true }, 200);
    }
    case "verifier": {
      const code = texte(c.code, 6);
      const p = await lireProfil({ email });
      const r = p && p.etat !== "suspendu" && p.etat !== "supprime" && autorise(p.role, role) && /^\d{6}$/.test(code) ? await verifierCode(p.id, code) : "faux";
      if (r === "panne") return reponse({ erreur: "indisponible" }, 503);
      if (r === "faux") return reponse({ erreur: "code" }, 401);
      await essaiReussi(essai.id);
      (await cookies()).set(COOKIE_CODE, r.jeton, optionsCookie(JETON_CODE_MS / 1000, "strict"));
      return reponse({ ok: true }, 200);
    }
    case "nouveau": {
      const store = await cookies();
      const jeton = store.get(COOKIE_CODE)?.value;
      store.set(COOKIE_CODE, "", optionsCookie(0, "strict"));
      const profilId = jeton ? await consommerJeton(jeton) : null;
      const p = profilId ? await lireProfil({ id: profilId }) : null;
      if (!p || p.email !== email || p.etat === "suspendu" || p.etat === "supprime" || !autorise(p.role, role)) return reponse({ erreur: "expire" }, 401);
      // Les anciennes sessions doivent être fermées avant de changer le mot de passe. Si la base refuse,
      // l'ancien mot de passe reste valable et aucune nouvelle session n'est annoncée.
      if (!(await revoquerSessions(p.id))) return reponse({ erreur: "indisponible" }, 503);
      if (!(await changerMotDePasse(p.id, c.mdp as string))) return reponse({ erreur: "indisponible" }, 503);
      if (p.etat === "invite" && !(await modifierProfil(p.id, { etat: "actif", modifie_le: iso(Date.now()) }))) return reponse({ erreur: "indisponible" }, 503);
      await journaliser("mot_de_passe.change", p.id, ipH, { role: p.role, etat: p.etat });
      return entrer({ ...p, etat: "actif" }, essai.id, ipH);
    }
  }
}

async function entrer(p: Profil, essaiId: number, ipH: string) {
  await essaiReussi(essaiId);
  if (!(await ouvrirSession(p.id, ipH))) return reponse({ erreur: "indisponible" }, 503);
  await modifierProfil(p.id, { derniere_connexion: iso(Date.now()) });
  await journaliser("connexion", p.id, ipH, { role: p.role });
  return reponse({ ok: true, prenom: p.prenom }, 200);
}

// maquette G en local : valeurs fixes, aucune base, aucun e-mail ; « nouveau » exige quand même le passage par « verifier »
async function demo(action: Action, c: Record<string, unknown>) {
  const store = await cookies();
  switch (action) {
    case "connexion":
      return texte(c.mdp, 200) === DEMO.mdp ? reponse({ ok: true, prenom: null }, 200) : reponse({ erreur: "identifiants" }, 401);
    case "code":
    case "deconnexion":
      return reponse({ ok: true }, 200);
    case "verifier":
      if (texte(c.code, 6) !== DEMO.code) return reponse({ erreur: "code" }, 401);
      store.set(COOKIE_CODE, DEMO.jeton, optionsCookie(JETON_CODE_MS / 1000, "strict"));
      return reponse({ ok: true }, 200);
    case "nouveau": {
      if (texte(c.mdp, 200).length < 12) return reponse({ erreur: "faible" }, 400);
      const verifie = store.get(COOKIE_CODE)?.value === DEMO.jeton;
      store.set(COOKIE_CODE, "", optionsCookie(0, "strict"));
      return verifie ? reponse({ ok: true, prenom: null }, 200) : reponse({ erreur: "expire" }, 401);
    }
  }
}
