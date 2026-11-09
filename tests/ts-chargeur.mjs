// Chargeur pour tester les vrais modules TypeScript du site avec `node --test` (Node 24 retire les types lui-même) :
// résout l'alias « @/ » vers src/, les imports sans extension vers .ts / .tsx / index.ts, et charge les .json comme
// modules (le site les importe sans attribut « with { type: 'json' } »). Usage : node --import ./ts-chargeur.mjs --test …
import { registerHooks } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Socket } from "node:net";

// Chaque test remplace fetch par son transport simulé. Toute sortie TCP oubliée
// (dont SMTP/TLS) et tout fetch non simulé échouent avant une connexion réelle.
const reseauInterdit = () => { throw new Error("Accès réseau interdit dans les tests unitaires."); };
globalThis.fetch = async () => reseauInterdit();
Socket.prototype.connect = reseauInterdit;

const SRC = fileURLToPath(new URL("../src/", import.meta.url)).replaceAll("\\", "/");

function fichierTs(url) {
  const p = fileURLToPath(url);
  for (const c of [p, `${p}.ts`, `${p}.tsx`, `${p}/index.ts`]) if (existsSync(c) && statSync(c).isFile()) return pathToFileURL(c).href;
  return null;
}

registerHooks({
  resolve(spec, ctx, suivant) {
    if (spec === "next/root-params") return { url: new URL("./next-langue-simule.mjs", import.meta.url).href, shortCircuit: true };
    if (ctx.parentURL?.endsWith("/src/lib/contenu.ts") && (spec === "next/cache" || spec === "next/headers")) return { url: new URL("./next-contenu-simule.mjs", import.meta.url).href, shortCircuit: true };
    const depuisTs = ctx.parentURL && /\.tsx?$/.test(ctx.parentURL);
    if (spec.startsWith("@/")) return { url: fichierTs(pathToFileURL(SRC + spec.slice(2)).href) ?? spec, shortCircuit: true };
    if (depuisTs && spec.startsWith(".")) {
      const url = fichierTs(new URL(spec, ctx.parentURL).href);
      if (url) return { url, shortCircuit: true };
    }
    return suivant(spec, ctx);
  },
  load(url, ctx, suivant) {
    // seulement les .json du site, importés comme modules : ceux d'une dépendance (package.json de playwright-core,
    // lus par require) restent du JSON
    if (url.endsWith(".json") && fileURLToPath(url).replaceAll("\\", "/").startsWith(SRC)) return { format: "module", source: `export default ${readFileSync(fileURLToPath(url), "utf8")};`, shortCircuit: true };
    if (/\.tsx?$/.test(url)) return suivant(url, { ...ctx, format: "module-typescript" });
    return suivant(url, ctx);
  },
});
