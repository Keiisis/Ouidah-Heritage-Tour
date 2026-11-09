import { isAbsolute, relative, resolve } from "node:path";

// Voies locales de la connexion de l'équipe, JAMAIS en production. Fonction pure (aucune autre dépendance) pour être
// prouvée par tests-oht/equipe-mode-test.mjs.
// - demo (EQUIPE_DEMO=1) : parcours de la maquette G avec des valeurs fixes côté serveur, sans base ni e-mail.
// - boite (EQUIPE_BOITE=<chemin absolu .jsonl hors du dépôt>) : vraie liaison, mais les codes sont écrits dans ce fichier
//   au lieu de partir par SMTP, pour jouer le test L1 sans boîte réelle.
// Refusées dès que Vercel est détecté (VERCEL / VERCEL_ENV, posées par la plateforme) ou que l'hôte n'est pas la machine
// locale. `next start` tourne avec NODE_ENV=production en local : ce n'est donc pas le critère.
export type ModeLocal = { demo: boolean; boite: string | null };

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;

export function modeLocal(env: Record<string, string | undefined>, hote: string | null, racine: string): ModeLocal {
  if (env.VERCEL || env.VERCEL_ENV || !hote || !LOCAL.test(hote)) return { demo: false, boite: null };
  const b = env.EQUIPE_BOITE ?? "";
  // chemins lus à l'exécution, en local seulement : turbopackIgnore évite que la build embarque tout le projet (avertissement
  // « Dynamic filesystem access causes tracing of the whole project », build du 30/10)
  const r = b ? relative(resolve(/*turbopackIgnore: true*/ racine), resolve(/*turbopackIgnore: true*/ b)) : "";
  const dehors = r !== "" && (isAbsolute(r) || r.split(/[\\/]/)[0] === "..");
  return { demo: env.EQUIPE_DEMO === "1", boite: isAbsolute(b) && b.endsWith(".jsonl") && dehors ? resolve(/*turbopackIgnore: true*/ b) : null };
}
