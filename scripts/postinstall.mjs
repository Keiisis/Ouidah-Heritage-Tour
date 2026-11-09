import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const versionCorrigee = '16.4.1';
const avant = `for (let [key, value] of Object.entries(headers)){
                        if (typeof value === 'undefined') continue;
                        if (Array.isArray(value)) {`;
const apres = `for (let [key, value] of Object.entries(headers)){
                        if (typeof value === 'undefined') continue;
                        // OHT: Location est un singleton, déjà posé pendant le prérendu.
                        if (key.toLowerCase() === 'location') {
                            res.setHeader(key, value);
                            continue;
                        }
                        if (Array.isArray(value)) {`;

/** Next 16.4.1 réapplique avec appendHeader les métadonnées de sa propre réponse ISR.
 * Location doit remplacer l'en-tête existant ; Set-Cookie et les listes restent inchangés.
 * Retirer ce correctif après vérification d'une version Next qui corrige ce chemin. */
export function corrigerLocation(source, version) {
  if (version !== versionCorrigee) throw new Error(`Correctif Location à réexaminer pour Next ${version} (attendu ${versionCorrigee}).`);
  const nombre = (texte) => source.split(texte).length - 1;
  if (nombre(apres) === 1 && nombre(avant) === 0) return source;
  if (nombre(avant) !== 1 || nombre(apres) !== 0) throw new Error('Correctif Location : source Next inattendue, aucune modification.');
  return source.replace(avant, apres);
}

async function installer() {
  const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const next = resolve(site, 'node_modules/next');
  const { version } = JSON.parse(await readFile(resolve(next, 'package.json'), 'utf8'));
  // Turbopack utilise le template ESM ; la variante CommonJS est gardée identique.
  const fichiers = ['dist/esm/build/templates/app-page-runtime.js', 'dist/build/templates/app-page-runtime.js'];
  const prepares = await Promise.all(fichiers.map(async (fichier) => {
    const chemin = resolve(next, fichier), source = await readFile(chemin, 'utf8');
    return { chemin, source, corrige: corrigerLocation(source, version) };
  }));
  for (const { chemin, source, corrige } of prepares) if (source !== corrige) await writeFile(chemin, corrige);
  await mkdir(resolve(site, 'public/vendor'), { recursive: true });
  await copyFile(resolve(site, 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs'), resolve(site, 'public/vendor/maplibre-gl-worker.mjs'));
  console.log(`Next ${version} : Location singleton vérifié ; worker MapLibre copié.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await installer();
