import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { verifierIndex, cheminAutorise } from "./livraison-verifier.mjs";
import { installerGardes } from "./installer-gardes-git.mjs";

function git(racine, args, input) {
  const r = spawnSync("git", ["-C", racine, ...args], { input, encoding: "utf8", windowsHide: true });
  assert.equal(r.status, 0, "Commande Git synthétique réussie, sorties masquées");
  return r.stdout.trim();
}
async function fichier(racine, chemin, texte) {
  const cible = resolve(racine, chemin);
  await mkdir(resolve(cible, ".."), { recursive: true });
  await writeFile(cible, texte);
}
async function depot() {
  const racine = await mkdtemp(join(tmpdir(), "oht-livraison-"));
  await fichier(racine, "package.json", '{"name":"oht-site"}\n');
  await fichier(racine, "next.config.ts", "export default {};\n");
  await fichier(racine, "src/app/page.tsx", "export default function Page() { return null; }\n");
  git(racine, ["init", "--quiet"]);
  git(racine, ["add", "package.json", "next.config.ts", "src/app/page.tsx"]);
  return racine;
}
const jetonSynthetique = "ghp_" + "aB3dE6gH9jK2mN5pQ8sT1vW4yZ7cF0iL3oR6uX9";

test("périmètre code et médias : documents opérateur refusés, routes métier et licences conservées", () => {
  for (const p of ["README.md", ".env.example", ".githooks/pre-commit", ".github/workflows/verification.yml", "src/app/admins/docs/page.tsx", "src/lib/rapport.ts", "src/lib/polices/OFL.txt", "public/photo.jpg", "supabase/migrations/20261111_emcf_connecteur.sql"]) assert.equal(cheminAutorise(p), true, p);
  for (const p of ["AGENTS.md", "CLAUDE.local.md", "docs/guide.md", "reprises/fiche.md", ".env.local", "src/.env.production", "public/facture.pdf", "public/rapport.zip", "public/vendor/maplibre-gl-worker.mjs", "public/instagram/photo.jpg", "floorplan/map.json", "node_modules/pkg/index.js", "../hors.ts", "src\\hors.ts"]) assert.equal(cheminAutorise(p), false, p);
});

test("index sain et exemple vide acceptés, nom de clone libre", async () => {
  const d = await depot();
  await fichier(d, ".env.example", "EMCF_JETON=\nSMTP_PASS=\n");
  await fichier(d, "README.md", "# Application\n");
  git(d, ["add", ".env.example", "README.md"]);
  const r = await verifierIndex(d);
  assert.equal(r.fichiers, 5);
  assert.deepEqual(r.echecs, []);
});

test("contenu indexé contrôlé même si le fichier de travail a été corrigé", async () => {
  const d = await depot();
  await fichier(d, "src/secret.ts", `export const cle = '${jetonSynthetique}';\n`);
  git(d, ["add", "src/secret.ts"]);
  await fichier(d, "src/secret.ts", "export const cle = process.env.CLE;\n");
  const r = await verifierIndex(d);
  assert(r.echecs.some((e) => e.chemin === "src/secret.ts" && e.type === "jeton-github"));
  assert(!JSON.stringify(r).includes(jetonSynthetique));
});

test("tout l'index reste contrôlé après un autre ajout, noms avec espaces préservés", async () => {
  const d = await depot();
  await fichier(d, "src/ancien secret.ts", `export const cle = '${jetonSynthetique}';\n`);
  git(d, ["add", "src/ancien secret.ts"]);
  await fichier(d, "src/autre.ts", "export const ok = true;\n");
  git(d, ["add", "src/autre.ts"]);
  assert((await verifierIndex(d)).echecs.some((e) => e.chemin === "src/ancien secret.ts"));
});

test("fichier ignoré ajouté de force et rapport opérateur refusés", async () => {
  const d = await depot();
  await fichier(d, ".gitignore", ".env*\n*.pdf\n");
  await fichier(d, ".env.local", "SMTP_PASS=\n");
  await fichier(d, "rapport confidentiel.pdf", "fixture\n");
  git(d, ["add", "--force", ".env.local", "rapport confidentiel.pdf"]);
  const r = await verifierIndex(d);
  assert(r.echecs.some((e) => e.chemin === ".env.local" && e.type === "hors-perimetre-code"));
  assert(r.echecs.some((e) => e.chemin === "rapport confidentiel.pdf"));
});

test("valeur locale inconnue des formats comparée en mémoire sans divulgation", async () => {
  const d = await depot();
  const valeur = "Valeur_synthetique_uniquement_70823";
  await fichier(d, ".env.local", `SMTP_PASS=${valeur}\n`);
  await fichier(d, "src/parametre.ts", `export const x = '${valeur}';\n`);
  git(d, ["add", "src/parametre.ts"]);
  const r = await verifierIndex(d);
  assert(r.echecs.some((e) => e.type === "valeur-environnement-sensible"));
  assert(!JSON.stringify(r).includes(valeur));
  assert(!JSON.stringify(r).includes("SMTP_PASS"));
});

test("secret affecté en dur et URL avec identifiants refusés sans .env local", async () => {
  const d = await depot();
  const morceau = ["Abc9", "xQ2m", "T7rV", "5pL8"].join("");
  const adresse = ["postgresql:", "", "utilisateur:pass-factice@localhost/base"].join("/");
  await fichier(d, "src/config.ts", `const SMTP_PASSWORD = '${morceau}';\nconst base = '${adresse}';\n`);
  git(d, ["add", "src/config.ts"]);
  const r = await verifierIndex(d);
  assert(r.echecs.some((e) => e.type === "secret-affecte-en-dur"));
  assert(r.echecs.some((e) => e.type === "identifiants-url"));
  assert(!JSON.stringify(r).includes("pass-factice"));
});

test("lien symbolique indexé refusé sans nécessité de privilège symlink Windows", async () => {
  const d = await depot();
  const objet = git(d, ["hash-object", "-w", "--stdin"], "../../secret-exterieur\n");
  git(d, ["update-index", "--add", "--cacheinfo", `120000,${objet},src/lien.ts`]);
  assert((await verifierIndex(d)).echecs.some((e) => e.type === "lien-ou-sous-module-refuse"));
});

test("sous-module et conflit indexés refusés", async () => {
  const d = await depot();
  const objet = git(d, ["hash-object", "-w", "--stdin"], "fixture\n");
  git(d, ["update-index", "--add", "--cacheinfo", `160000,${objet},src/module`]);
  git(d, ["update-index", "--index-info"], `100644 ${objet} 1\tsrc/conflit.ts\n100644 ${objet} 2\tsrc/conflit.ts\n`);
  const r = await verifierIndex(d);
  assert(r.echecs.some((e) => e.chemin === "src/module" && e.type === "lien-ou-sous-module-refuse"));
  assert(r.echecs.some((e) => e.chemin === "src/conflit.ts" && e.type === "conflit-non-resolu"));
});

test("limite de 50 Mio vérifiée avant lecture du blob", async () => {
  const d = await depot();
  await fichier(d, "public/trop-grand.mp4", Buffer.alloc(50 * 1024 * 1024 + 1, 65));
  git(d, ["add", "public/trop-grand.mp4"]);
  assert((await verifierIndex(d)).echecs.some((e) => e.type === "fichier-superieur-50-Mio"));
});

test("installation locale du hook et refus d'un dépôt initialisé au-dessus de l'app", async () => {
  const d = await depot();
  await fichier(d, ".githooks/pre-commit", "#!/bin/sh\nexit 0\n");
  await installerGardes(d);
  assert.equal(git(d, ["config", "--local", "--get", "core.hooksPath"]), ".githooks");
  const sous = join(d, "app-imbriquee");
  await fichier(sous, "package.json", '{"name":"oht-site"}\n');
  await fichier(sous, "next.config.ts", "export default {};\n");
  await fichier(sous, "src/app/page.tsx", "export default function Page() { return null; }\n");
  await fichier(sous, ".githooks/pre-commit", "#!/bin/sh\nexit 0\n");
  const avant = await readFile(join(d, ".git/config"), "utf8");
  await assert.rejects(installerGardes(sous), /racine Git/);
  assert.equal(await readFile(join(d, ".git/config"), "utf8"), avant);
});
