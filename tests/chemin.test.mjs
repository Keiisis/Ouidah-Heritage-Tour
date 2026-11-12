import { test } from "node:test";
import assert from "node:assert/strict";

// modifierChemin (lib/chemin.ts) : mémoire « oht-chemin » partagée par l'accueil et le billet /devis.
const stock = new Map();
const evenements = [];
globalThis.localStorage = { getItem: (k) => stock.get(k) ?? null, setItem: (k, v) => stock.set(k, String(v)) };
globalThis.window = { dispatchEvent: (e) => evenements.push(e) };
const { modifierChemin, CLE_CHEMIN } = await import("../src/lib/chemin.ts");
const poser = (gardes, index = 0) => stock.set(CLE_CHEMIN, JSON.stringify({ gardes, index }));
const lire = () => JSON.parse(stock.get(CLE_CHEMIN));

test("remplacer une sélection par un circuit qui la recoupe garde les étapes communes", () => {
  poser(["temple-des-pythons", "porte-du-non-retour", "foret-sacree-kpasse"], 3);
  const route = ["place-chacha", "arbre-de-l-oubli", "memorial-zoungbodji", "arbre-du-retour", "porte-du-non-retour"];
  modifierChemin(route, ["temple-des-pythons", "porte-du-non-retour", "foret-sacree-kpasse"]);
  assert.deepEqual(lire(), { gardes: route, index: 3 });
});

test("ajouter et retirer : ordre gardé, aucun doublon, index conservé", () => {
  poser(["musee-histoire"], 1);
  modifierChemin(["temple-des-pythons", "musee-histoire", "temple-des-pythons"], []);
  assert.deepEqual(lire(), { gardes: ["musee-histoire", "temple-des-pythons"], index: 1 });
  modifierChemin([], ["musee-histoire"]);
  assert.deepEqual(lire().gardes, ["temple-des-pythons"]);
});

test("mémoire absente : repart d'une liste vide et prévient l'accueil", () => {
  stock.delete(CLE_CHEMIN);
  evenements.length = 0;
  modifierChemin(["r:marche-de-zobe"], []);
  assert.deepEqual(lire(), { gardes: ["r:marche-de-zobe"], index: 0 });
  assert.equal(evenements.length, 1);
  assert.equal(evenements[0].type, CLE_CHEMIN);
});
