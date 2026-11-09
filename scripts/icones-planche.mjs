// Planches (sprites) des objets 3D : une image WebP par résolution (128, 256, 512) au lieu d'un fichier par objet, pour
// qu'une page ne demande qu'une image par résolution. Ordre, colonnes et marge lus dans src/components/ui/Objet3D.tsx
// (une seule source) ; chaque objet est recopié tel quel dans sa case, sans redimensionnement.
// Usage : npm run icones:sprite   (relancer après tout ajout ou retouche d'un fichier public/icones-3d/<nom>-<taille>.webp)
// Les fichiers individuels restent dans public/icones-3d : des contenus en base peuvent les citer.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dossier = path.join(racine, "public", "icones-3d");
const source = await readFile(path.join(racine, "src", "components", "ui", "Objet3D.tsx"), "utf8");

const lire = (re, nom) => {
  const m = source.match(re);
  if (!m) throw new Error(`Objet3D.tsx : ${nom} introuvable`);
  return m[1];
};
const objets = [...lire(/export const OBJETS = \[([^\]]+)\]/, "OBJETS").matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);
const colonnes = Number(lire(/export const COLONNES = (\d+);/, "COLONNES"));
const gouttiere = Number(lire(/export const GOUTTIERE = ([\d.]+);/, "GOUTTIERE"));
const rangees = Math.ceil(objets.length / colonnes);

for (const taille of [128, 256, 512]) {
  const pas = taille * (1 + gouttiere);
  if (!Number.isInteger(pas)) throw new Error(`gouttière non entière à ${taille} px`);
  const largeur = colonnes * pas - taille * gouttiere;
  const hauteur = rangees * pas - taille * gouttiere;
  const cases = await Promise.all(
    objets.map(async (nom, i) => {
      const fichier = path.join(dossier, `${nom}-${taille}.webp`);
      const { width, height } = await sharp(fichier).metadata();
      if (width !== taille || height !== taille) throw new Error(`${nom}-${taille}.webp mesure ${width}×${height}`);
      return { input: fichier, left: (i % colonnes) * pas, top: Math.floor(i / colonnes) * pas };
    }),
  );
  const sortie = path.join(dossier, `planche-${taille}.webp`);
  await sharp({ create: { width: largeur, height: hauteur, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(cases)
    .webp({ quality: 92, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toFile(sortie);
  const { size } = await stat(sortie);
  console.log(`planche-${taille}.webp  ${largeur}×${hauteur}  ${objets.length} objets  ${(size / 1024).toFixed(1)} Ko`);
}
