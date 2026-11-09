import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { racineApplication, verifierRacineGit } from "./livraison-verifier.mjs";

export async function installerGardes(racine = racineApplication) {
  await verifierRacineGit(racine);
  await readFile(resolve(racine, ".githooks/pre-commit"));
  const r = spawnSync("git", ["-C", racine, "config", "--local", "core.hooksPath", ".githooks"], { windowsHide: true });
  if (r.status !== 0) throw new Error("Configuration locale du hook impossible.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await installerGardes(); console.log("Garde pre-commit installée pour oht-site uniquement."); }
  catch { console.error("Installation refusée. Initialiser d'abord Git dans oht-site uniquement. Aucune sortie brute affichée."); process.exitCode = 1; }
}
