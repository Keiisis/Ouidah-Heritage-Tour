import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Les hooks et simulations globales des suites restent isolés par processus.
const racine = fileURLToPath(new URL("../", import.meta.url));
const chargeur = new URL("./ts-chargeur.mjs", import.meta.url).href;
const suites = readdirSync(new URL("./", import.meta.url)).filter(n => n.endsWith(".test.mjs")).sort();
if (!suites.length) throw new Error("Aucune suite de test trouvée.");
let echecs = 0;
for (const suite of suites) {
  console.log(`\nSuite : ${suite}`);
  const resultat = spawnSync(process.execPath, ["--conditions=react-server", "--import", chargeur, "--test", "--test-isolation=none", fileURLToPath(new URL(suite, import.meta.url))], {
    cwd: racine, stdio: "inherit", env: { ...process.env, NODE_ENV: "test", NODE_OPTIONS: "" }, timeout: 120_000, windowsHide: true,
  });
  if (resultat.error || resultat.status !== 0) {
    echecs++;
    console.error(`Échec de ${suite}${resultat.error ? ` : ${resultat.error.message}` : ""}`);
  }
}
console.log(`\nSuites : ${suites.length}, réussies : ${suites.length - echecs}, échecs : ${echecs}.`);
process.exitCode = echecs ? 1 : 0;
