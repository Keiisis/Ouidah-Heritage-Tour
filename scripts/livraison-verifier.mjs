import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";

export const racineApplication = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const limiteFichier = 50 * 1024 * 1024;
const fichiersRacine = new Set([
  ".env.example", ".gitignore", ".gitattributes", "README.md", "LICENSE", "LICENSE.txt",
  "package.json", "package-lock.json", "next.config.ts", "eslint.config.mjs", "tsconfig.json", "vercel.json",
]);
const code = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".sql", ".ps1", ".sh"]);
const medias = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico", ".avif", ".ttf", ".woff", ".woff2", ".m4a", ".webm", ".mp3", ".mp4", ".glb", ".gltf", ".json"]);
const regles = [
  ["cle-privee", /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g],
  ["jeton-groq", /\bgsk_[A-Za-z0-9]{24,}\b/g],
  ["jeton-github", /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g],
  ["cle-supabase", /\b(?:sb_secret_[A-Za-z0-9_-]{20,}|sbp_[A-Za-z0-9]{20,})\b/g],
  ["cle-paiement", /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{12,}\b/g],
  ["jeton-slack", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
  ["jeton-openai", /\bsk-(?:proj-)?[A-Za-z0-9_-]{35,}\b/g],
  ["identifiant-aws", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ["identifiants-url", /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|https?):\/\/[^\s:/@]{1,128}:[^\s/@]{3,}@/g],
  ["jwt-encode", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g],
];

function git(racine, args, input) {
  const r = spawnSync("git", ["-C", racine, ...args], { input, maxBuffer: 512 * 1024 * 1024, windowsHide: true });
  if (r.status !== 0) throw new Error("Lecture Git impossible. Aucun contenu brut affiché.");
  return r.stdout;
}

export async function verifierRacineGit(racine = racineApplication) {
  const manifeste = JSON.parse(await readFile(resolve(racine, "package.json"), "utf8"));
  if (manifeste.name !== "oht-site" || !(await stat(resolve(racine, "src/app"))).isDirectory() || !(await stat(resolve(racine, "next.config.ts"))).isFile()) throw new Error("Dossier application OHT invalide.");
  const attendue = await realpath(racine);
  const effective = await realpath(git(racine, ["rev-parse", "--show-toplevel"]).toString("utf8").trim());
  const normaliser = (p) => process.platform === "win32" ? p.toLowerCase() : p;
  if (normaliser(attendue) !== normaliser(effective)) throw new Error("La racine Git doit être oht-site uniquement.");
}

export function cheminAutorise(chemin) {
  if (chemin.includes("\\") || chemin.split("/").some((p) => p === ".." || p === "." || p === "")) return false;
  if (fichiersRacine.has(chemin)) return true;
  if (chemin === ".githooks/pre-commit") return true;
  if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(chemin)) return true;
  const morceaux = chemin.split("/");
  if (morceaux.some((p) => /^(?:\.env(?:\..*)?|node_modules|\.next|\.git|\.vercel|\.claude|\.codex|\.temp|floorplan|graphify-out|reprises|maquettes|instagram|benintours?)$/i.test(p))) return false;
  if (/\/(?:OFL|LICENSE|LICENCE|COPYING|NOTICE)(?:\.txt|\.md)?$/i.test(chemin)) return /^(?:src|public)\//.test(chemin);
  const extension = extname(chemin).toLowerCase();
  if (chemin === "public/vendor/maplibre-gl-worker.mjs") return false;
  if (morceaux[0] === "public") return medias.has(extension);
  if (morceaux[0] === "src") return code.has(extension) || medias.has(extension);
  if (["scripts", "tests"].includes(morceaux[0])) return code.has(extension);
  if (morceaux[0] === "supabase") return [".sql", ".json"].includes(extension);
  return false;
}

async function secretsLocaux(racine) {
  let donnees;
  try { donnees = parseEnv(await readFile(resolve(racine, ".env.local"), "utf8")); }
  catch (erreur) {
    if (erreur.code === "ENOENT") return [];
    throw new Error("Lecture locale de l'environnement impossible. Valeurs masquées.");
  }
  return Object.entries(donnees).filter(([cle, valeur]) =>
    /SECRET|TOKEN|JETON|PASSWORD|PASS(?:$|_)|CLE(?:$|_)|(?:API|SERVICE_ROLE)_?KEYS?|PRIVATE/i.test(cle)
    && !cle.startsWith("NEXT_PUBLIC_") && valeur.trim().length >= 8
  ).flatMap(([cle, valeur]) => /KEYS$/.test(cle) ? valeur.split(/[\s,;]+/) : [valeur]).filter((v) => v.length >= 8);
}

export async function verifierIndex(racine = racineApplication) {
  await verifierRacineGit(racine);
  const secrets = await secretsLocaux(racine);
  const masquer = (texte) => {
    for (const valeur of secrets) texte = texte.replaceAll(valeur, "[MASQUE]");
    for (const [, regle] of regles) texte = texte.replace(regle, "[MASQUE]");
    return texte;
  };
  const echecs = [];
  const ajouter = (chemin, type, ligne) => echecs.push({ chemin: masquer(chemin), type, ...(ligne ? { ligne } : {}) });
  const entrees = git(racine, ["ls-files", "--stage", "-z"]).toString("utf8").split("\0").filter(Boolean).map((s) => {
    const m = /^(\d{6}) ([a-f0-9]+) ([0-3])\t([\s\S]*)$/.exec(s);
    if (!m) throw new Error("Index Git illisible. Aucun contenu brut affiché.");
    return { mode: m[1], objet: m[2], stage: m[3], chemin: m[4] };
  });
  const candidats = [];
  for (const e of entrees) {
    if (e.stage !== "0") ajouter(e.chemin, "conflit-non-resolu");
    else if (!["100644", "100755"].includes(e.mode)) ajouter(e.chemin, "lien-ou-sous-module-refuse");
    else if (!cheminAutorise(e.chemin)) ajouter(e.chemin, "hors-perimetre-code");
    else candidats.push(e);
  }
  if (candidats.length) {
    const tailles = git(racine, ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"], candidats.map((e) => e.objet).join("\n") + "\n").toString("utf8").trim().split("\n");
    const lisibles = candidats.filter((e, i) => {
      const [objet, type, taille] = tailles[i]?.trim().split(" ") || [];
      if (objet !== e.objet || type !== "blob" || !/^\d+$/.test(taille || "")) throw new Error("Objet Git invalide. Aucun contenu brut affiché.");
      if (Number(taille) > limiteFichier) { ajouter(e.chemin, "fichier-superieur-50-Mio"); return false; }
      return true;
    });
    if (lisibles.length) {
      const blobs = git(racine, ["cat-file", "--batch"], lisibles.map((e) => e.objet).join("\n") + "\n");
      let position = 0;
      for (const e of lisibles) {
        const fin = blobs.indexOf(10, position);
        const entete = blobs.subarray(position, fin).toString("utf8").split(" ");
        const taille = Number(entete[2]);
        if (fin < 0 || entete[0] !== e.objet || entete[1] !== "blob" || !Number.isSafeInteger(taille) || taille < 0 || fin + 1 + taille >= blobs.length) throw new Error("Contenu Git tronqué. Aucun contenu brut affiché.");
        const contenu = blobs.subarray(fin + 1, fin + 1 + taille);
        position = fin + taille + 2;
        const texte = contenu.toString("utf8");
        const numeroLigne = (i) => texte.slice(0, i).split("\n").length;
        for (const valeur of secrets) {
          const i = texte.indexOf(valeur);
          if (i >= 0) ajouter(e.chemin, "valeur-environnement-sensible", numeroLigne(i));
        }
        for (const [type, regle] of regles) {
          for (const m of texte.matchAll(regle)) ajouter(e.chemin, type, numeroLigne(m.index));
        }
        const affectations = /\b(?:[A-Z_]*(?:SECRET|TOKEN|PASSWORD|JETON|PRIVATE_KEY)[A-Z_]*|apiKey|accessToken|refreshToken|password|clientSecret|jeton)\s*[:=]\s*(["'])([^"'\r\n]{12,})\1/g;
        for (const m of texte.matchAll(affectations)) {
          const valeur = m[2];
          if (/\s|^process\.env|^\$\{|^<|^(?:example|exemple|test|fixture|placeholder|your_)/i.test(valeur)) continue;
          if (/^[A-Z_]+$/.test(valeur) && /_(?:SECRET|TOKEN|PASSWORD|JETON|KEY)/.test(valeur)) continue;
          const frequences = new Map();
          for (const c of valeur) frequences.set(c, (frequences.get(c) || 0) + 1);
          let entropie = 0;
          for (const n of frequences.values()) { const p = n / valeur.length; entropie -= p * Math.log2(p); }
          if (entropie >= 3.5) ajouter(e.chemin, "secret-affecte-en-dur", numeroLigne(m.index));
        }
      }
    }
  }
  return { fichiers: entrees.length, echecs };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).some((a) => a !== "--index")) throw new Error("Usage : node scripts/livraison-verifier.mjs --index");
    const resultat = await verifierIndex();
    console.log(JSON.stringify(resultat, null, 2));
    process.exitCode = resultat.echecs.length ? 1 : 0;
  } catch {
    console.error("Contrôle impossible. Vérifier que Git est initialisé dans oht-site uniquement. Aucune valeur ni sortie brute affichée.");
    process.exitCode = 1;
  }
}
