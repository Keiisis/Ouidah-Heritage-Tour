import type { Forme, Json } from "./contenu-regles";
import { avecCode, donnees, valider } from "./contenu-regles";
import { fonctionsTraduites, MODELES_MESSAGES, type MessagesTraduits } from "./traductions-messages";
import type { Langue } from "./langue";

const objet = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
const identite = (v: unknown) => objet(v) ? ["id", "slug", "code", "key"].find((c) => typeof v[c] === "string") : undefined;

/** L'ancien contenu utilise aussi des chaînes pour ses identifiants et coordonnées. */
export function texteTraduisible(f: Forme, source: unknown, cle = ""): source is string {
  return f.k === "texte" && !f.motif && f.traduire !== false && typeof source === "string" && Boolean(source.trim())
    && !["id", "key", "code", "cadre", "position", "ids", "stops", "fichier", "auteur", "wordmark", "v", "leadReleve", "releve", "cuisine", "composant"].includes(cle)
    && !(["destination", "lieux", "fiche"].includes(cle) && /^(?:r:)?[a-z0-9-]+$/.test(source))
    && !(cle === "horaires" && /^(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)(?:[-,;\s]|$)/.test(source))
    && !/^(?:\/(?!\/)|https?:\/\/|mailto:|tel:|#)/.test(source)
    && !/^[\d\s+\-.,/()%:€$–—·]+$/.test(source)
    && !/^(?:EUR|USD|XOF|FCFA)(?:[\s()€$A-Z]*)$/.test(source)
    && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(source)
    && !/^(?:Ouidah(?: Heritage Tour)?|Heritage Tour|CC BY(?:-SA)? [\d.]+|ODbL)$/i.test(source);
}

function texteTraduction(f: Extract<Forme, { k: "texte" }>, source: string): Forme {
  return { ...f, max: Math.max(f.max, source.length * 4 + 200), long: true, liensFiges: [...source.matchAll(/\]\(([^)]*)\)/g)].map((m) => m[1]).sort() };
}

/** Une traduction ne change aucun prix, slug, identifiant, lien ou média. Les listes identifiées suivent leurs IDs. */
export function traduireValeur(f: Forme, source: unknown, traduction: unknown, cle = ""): unknown {
  if (traduction === undefined || source === null || source === undefined) return source;
  if (f.k === "nul") return traduireValeur(f.de, source, traduction, cle);
  if (f.k === "texte") return texteTraduisible(f, source, cle) && !valider(texteTraduction(f, source), traduction, "", { medias: [] }).length ? traduction : source;
  if (f.k === "objet" && objet(source) && objet(traduction)) return Object.fromEntries(Object.entries(source).map(([c, v]) => [c, Object.hasOwn(f.champs, c) && Object.hasOwn(traduction, c) ? traduireValeur(f.champs[c].f, v, traduction[c], c) : v]));
  if ((f.k === "liste" || f.k === "paire") && Array.isArray(source) && Array.isArray(traduction)) return source.map((v, i) => {
    const id = identite(v);
    const t = id && objet(v) ? traduction.find((x) => objet(x) && x[id] === v[id]) : traduction[i];
    const forme = f.k === "liste" ? f.de : f.de[i];
    return forme ? traduireValeur(forme, v, t, cle) : v;
  });
  if (f.k === "dict" && objet(source) && objet(traduction)) return Object.fromEntries(Object.entries(source).map(([c, v]) => [c, traduireValeur(f.de, v, Object.hasOwn(traduction, c) ? traduction[c] : undefined, c)]));
  if (f.k === "un") {
    const forme = f.options.find((x) => !valider(x, donnees(source), "", { medias: [] }).some((e) => e.motif === "type" || e.motif === "inconnu"));
    return forme ? traduireValeur(forme, source, traduction, cle) : source;
  }
  return source;
}

/** Forme de l'éditeur de traduction, reconstruite sur le contenu français actuel. Les données techniques sont fixes. */
export function formeTraduction(f: Forme, source: unknown, cle = ""): Forme {
  if (f.k === "nul") return source === null ? { k: "fixe", v: null } : formeTraduction(f.de, source, cle);
  if (texteTraduisible(f, source, cle) && f.k === "texte") return texteTraduction(f, source);
  if (f.k === "objet" && objet(source)) return { k: "objet", champs: Object.fromEntries(Object.entries(f.champs).filter(([c]) => Object.hasOwn(source, c)).map(([c, ch]) => [c, { f: formeTraduction(ch.f, source[c], c), opt: true }])) };
  if ((f.k === "liste" || f.k === "paire") && Array.isArray(source)) return { k: "paire", de: source.map((v, i) => formeTraduction((f.k === "liste" ? f.de : f.de[i]) ?? { k: "fixe", v: donnees(v) ?? null }, v, cle)) };
  if (f.k === "dict" && objet(source)) return { k: "objet", champs: Object.fromEntries(Object.entries(source).map(([c, v]) => [c, { f: formeTraduction(f.de, v, c), opt: true }])) };
  if (f.k === "un") {
    const forme = f.options.find((x) => !valider(x, donnees(source), "", { medias: [] }).some((e) => e.motif === "type" || e.motif === "inconnu"));
    return forme ? formeTraduction(forme, source, cle) : { k: "fixe", v: donnees(source) ?? null };
  }
  return f.k === "code" ? f : { k: "fixe", v: donnees(source) ?? null };
}

/** Les fonctions restent du code contrôlé. Leurs phrases seules viennent de modèles traduisibles. */
export function avecMessages<T>(cle: string, defaut: T, valeur: Json | undefined, langue: Langue, messages: MessagesTraduits = {}): T {
  const contenu = valeur === undefined ? defaut : avecCode(defaut, valeur);
  const fonctions = fonctionsTraduites(langue, messages) as Record<string, unknown>;
  const parcourir = (v: unknown, chemin: string): unknown => {
    if (typeof v === "function") return fonctions[chemin] ?? v;
    if (Array.isArray(v)) return v.map((x, i) => parcourir(x, `${chemin}.${i}`));
    if (objet(v)) return Object.fromEntries(Object.entries(v).map(([c, x]) => [c, parcourir(x, `${chemin}.${c}`)]));
    return v;
  };
  return parcourir(contenu, cle) as T;
}

export function messagesValides(v: unknown): MessagesTraduits {
  if (!objet(v)) return {};
  const resultat: MessagesTraduits = {};
  for (const [cle, texte] of Object.entries(v)) {
    if (!Object.hasOwn(MODELES_MESSAGES, cle) || typeof texte !== "string" || texte.length > 5000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(texte)) continue;
    const jetons = (s: string) => [...(s.match(/\{[A-Za-z_][A-Za-z_0-9]*\}/g) ?? [])].sort().join("|");
    if (jetons(texte) === jetons(MODELES_MESSAGES[cle])) resultat[cle] = texte;
  }
  return resultat;
}
