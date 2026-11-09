// Graine de la boutique : catalogue D'EXEMPLE de la maquette I (16 articles, 4 catégories, matières, 32 photos).
// Tous les articles restent en brouillon (publie = false) : ce ne sont pas de vrais articles. Prix, artisan, dimensions,
// description, entretien : null (rien d'inventé). Idempotente : upsert par slug, photos téléversées avec x-upsert.
// Relancer la graine réécrit ces 16 articles d'exemple (et eux seuls) avec les valeurs ci-dessous.
// Usage : npm run boutique:graine (lit SUPABASE_URL et SUPABASE_SECRET_KEY dans .env.local).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const MAQUETTES = "C:/Users/HP/Desktop/OHT/Assets OHT/Boutique/maquettes";
const { PRODUITS_I, MATIERES_I, CATEGORIES, LIEUX } = await import(pathToFileURL(join(MAQUETTES, "catalogue-i.js")).href);
const URL_BASE = process.env.SUPABASE_URL;
const CLE = process.env.SUPABASE_SECRET_KEY;
if (!URL_BASE || !CLE) throw new Error("SUPABASE_URL et SUPABASE_SECRET_KEY requis (.env.local)");

// couleur du bandeau de chaque catégorie dans la maquette, et l'article dont la vue 1 l'illustre
const CATEGORIE = { mode: ["laterite", "chemise-wax"], bijoux: ["ocean", "collier-perles"], maison: ["sun", "panier"], art: ["ochre", "toile-marche"] };
const COLORIS = { "#122460": "Bleu océan", "#ac3215": "Rouge latérite", "#fdbf28": "Jaune soleil", "#df9410": "Ocre", "#f7f1e8": "Ivoire", "#c9a23a": "Laiton", "#8a5a2b": "Brun bois" };
// longueur maximale de la broderie : valeurs de départ, réglables dans l'admin
const BRODERIE = { "tshirt-brode": 20, casquette: 6 };
for (const p of PRODUITS_I) if (p.options?.broderie && !BRODERIE[p.id]) throw new Error(`broderie sans longueur maximale : ${p.id}`);
const LIEU = Object.fromEntries(LIEUX.map((l) => [l.id, l.nom]));

const entetes = (autres = {}) => ({ apikey: CLE, ...autres });
async function rest(table, lignes) {
  const r = await fetch(`${URL_BASE}/rest/v1/${table}?on_conflict=slug`, {
    method: "POST",
    headers: entetes({ "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(lignes),
  });
  if (!r.ok) throw new Error(`${table} : ${r.status} ${await r.text()}`);
  console.log(`${table} : ${lignes.length} lignes`);
}

// largeur et hauteur lues dans l'en-tête WebP (VP8 avec perte, VP8L sans perte, VP8X étendu)
function tailleWebp(b) {
  const type = b.toString("ascii", 12, 16);
  if (type === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (type === "VP8L") { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >>> 14) & 0x3fff)]; }
  if (type === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  throw new Error(`en-tête WebP inconnu : ${type}`);
}

const photos = {};
for (const p of PRODUITS_I) {
  photos[p.id] = [];
  for (let n = 1; n <= p.vues; n++) {
    const fichier = readFileSync(join(MAQUETTES, "photos", `${p.id}-${n}.webp`));
    const chemin = `produits/${p.id}-${n}.webp`;
    const r = await fetch(`${URL_BASE}/storage/v1/object/boutique/${chemin}`, {
      method: "POST",
      headers: entetes({ "content-type": "image/webp", "x-upsert": "true", "cache-control": "max-age=3600" }),
      body: fichier,
    });
    if (!r.ok) throw new Error(`photo ${chemin} : ${r.status} ${await r.text()}`);
    const [largeur, hauteur] = tailleWebp(fichier);
    photos[p.id].push({ chemin, alt: `${p.nom}, ${n === 1 ? "vue d'ensemble" : "détail"}`, largeur, hauteur });
  }
}
console.log(`photos : ${Object.values(photos).flat().length} téléversées`);

await rest("boutique_matieres", MATIERES_I.map((m) => ({ slug: m.id, nom: m.nom })));
await rest("boutique_categories", CATEGORIES.map((c, i) => ({ slug: c.id, nom: c.nom, couleur: CATEGORIE[c.id][0], photo: photos[CATEGORIE[c.id][1]][0], ordre: (i + 1) * 10 })));
await rest("boutique_produits", PRODUITS_I.map((p, i) => {
  const tailles = p.options?.tailles ?? null;
  return {
    slug: p.id,
    nom: p.nom,
    categorie: p.categorie,
    matiere: p.matiere,
    lieu: LIEU[p.lieu] ?? null,
    prix_eur: p.prix,
    artisan: p.artisan,
    dimensions: p.dimensions,
    description: null,
    entretien: null,
    coloris: p.couleurs.map((hex) => {
      if (!COLORIS[hex]) throw new Error(`coloris sans nom : ${hex}`);
      return { nom: COLORIS[hex], hex };
    }),
    piece_unique: p.unique,
    options: p.options
      ? { tailles: tailles ? tailles.filter((t) => t !== "Sur mesure") : null, surMesure: Boolean(tailles?.includes("Sur mesure")), broderie: p.options.broderie ? { max: BRODERIE[p.id] } : null }
      : null,
    photos: photos[p.id],
    ordre: (i + 1) * 10,
    publie: false,
  };
}));
