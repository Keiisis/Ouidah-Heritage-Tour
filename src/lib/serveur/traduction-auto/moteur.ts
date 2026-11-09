import "server-only";
import { createHash } from "node:crypto";
import { estCle, formeDe, prefixesMedias, REGISTRE, traduisible, type CleContenu } from "@/lib/contenu-registre";
import { contenuPublic, donnees, fusionner, valider, type Forme, type Json } from "@/lib/contenu-regles";
import { texteTraduisible } from "@/lib/traductions";
import type { Langue } from "@/lib/langue";

export type LangueCible = Exclude<Langue, "FR">;
export type ChampAuto = { id: string; chemin: (string | number)[]; source: string; contexte: string; max: number; reperes?: { profondeur: number; cle: string; valeur: string }[] };
export type SegmentAuto = { id: string; source: string; contexte: string; max: number };
export type PlanChamp = { champ: ChampAuto; morceaux: { source: string; segment?: string }[] };
export type PlanSegments = { champs: PlanChamp[]; segments: SegmentAuto[] };
export type OptionsMemoire = { langueSource?: Langue; consignes?: string; glossaire?: string };
export const CONTENUS_IMBRIQUES = ["blog-site.copiesBlog", "services.copiesServices", "suivi.suivi", "suivi.signer", "documents.copiesDocuments", "espace-finances.copiesPayer", "assistant-site.assistantSite"] as const;
const CONTRAT = "oht-phrases-1";
const objet = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const cheminSur = (p: (string | number)[]) => p.every(c => typeof c === "number" ? Number.isSafeInteger(c) && c >= 0 : !["__proto__", "constructor", "prototype"].includes(c));
const imbrique = (cle: string) => (CONTENUS_IMBRIQUES as readonly string[]).includes(cle);
export const estContenuAuto = (cle: string): cle is CleContenu => estCle(cle) && (traduisible(cle) || imbrique(cle));

/** La source est toujours la valeur publiée, fusionnée avec son défaut. Jamais le brouillon. */
export function sourceContenu(cle: CleContenu, valeur: unknown): Json {
  return fusionner(formeDe(cle), REGISTRE[cle].defaut, valeur ?? undefined, cle, { medias: prefixesMedias() }).v;
}

export function extraireContenu(cle: string, valeur: unknown, langue?: Langue): { mode: "externe" | "imbrique"; champs: ChampAuto[] } {
  if (!estContenuAuto(cle)) throw new Error("Rubrique non traduisible");
  const mode = imbrique(cle) ? "imbrique" : "externe";
  const publie = contenuPublic(cle, sourceContenu(cle, valeur));
  const forme = formeDe(cle);
  const champs: ChampAuto[] = [];
  function formeCible(chemin: (string | number)[]): Forme | undefined {
    let f: Forme | undefined = langue && mode === "imbrique" && forme.k === "objet" ? forme.champs[langue]?.f : undefined;
    for (const c of chemin) {
      while (f?.k === "nul") f = f.de;
      if (f?.k === "objet") f = f.champs[String(c)]?.f;
      else if (f?.k === "liste") f = f.de ?? undefined;
      else if (f?.k === "paire") f = f.de[Number(c)];
      else if (f?.k === "dict") f = f.de;
      else f = undefined;
    }
    while (f?.k === "nul") f = f.de;
    return f;
  }
  function lire(f: Forme, v: unknown, chemin: (string | number)[], reperes: NonNullable<ChampAuto["reperes"]>) {
    if (v == null || !cheminSur(chemin)) return;
    const derniere = String(chemin.findLast(c => typeof c === "string") ?? "");
    if (f.k === "texte" && texteTraduisible(f, v, derniere)) {
      const ff = formeCible(chemin);
      if (langue && mode === "imbrique" && ff?.k !== "texte") return;
      const stable = chemin.map((c, i) => { const r = reperes.find(r => r.profondeur === i); return r ? { [r.cle]: r.valeur } : c; });
      champs.push({ id: `${cle}:${JSON.stringify(stable)}`, chemin, source: v, contexte: `${cle}:${JSON.stringify(chemin.map(c => typeof c === "number" ? "[]" : c))}`, max: mode === "externe" ? Math.max(f.max, v.length * 4 + 200) : ff?.k === "texte" ? ff.max : f.max, ...(reperes.length ? { reperes } : {}) });
    }
    if (f.k === "objet" && objet(v)) for (const [c, ch] of Object.entries(f.champs)) lire(ch.f, v[c], [...chemin, c], reperes);
    if ((f.k === "liste" || f.k === "paire") && Array.isArray(v)) v.forEach((x, i) => {
      const ff = f.k === "liste" ? f.de : f.de[i];
      const identite = objet(x) ? ["id", "slug", "code", "key", "chemin", "src"].find(k => typeof x[k] === "string" && v.filter(y => objet(y) && y[k] === x[k]).length === 1) : undefined;
      const rs = identite && objet(x) ? [...reperes, { profondeur: chemin.length, cle: identite, valeur: x[identite] as string }] : reperes;
      if (ff) lire(ff, x, [...chemin, i], rs);
    });
    if (f.k === "dict" && objet(v)) for (const [c, x] of Object.entries(v)) lire(f.de, x, [...chemin, c], reperes);
    if (f.k === "nul") lire(f.de, v, chemin, reperes);
    if (f.k === "un") {
      const ff = f.options.find(x => !valider(x, donnees(v), "", { medias: prefixesMedias() }).some(e => e.motif === "type" || e.motif === "inconnu"));
      if (ff) lire(ff, v, chemin, reperes);
    }
  }
  if (mode === "imbrique") {
    if (forme.k !== "objet" || !forme.champs.FR || !objet(publie)) throw new Error("Copie multilingue invalide");
    lire(forme.champs.FR.f, publie.FR, [], []);
  } else lire(forme, publie, [], []);
  return { mode, champs };
}

/** Les identités suivent les listes réordonnées ; un champ supprimé n'est jamais réintroduit. */
function lireChamp(champ: ChampAuto, valeur: unknown): unknown {
  let v = valeur;
  for (let i = 0; i < champ.chemin.length; i++) {
    const repere = champ.reperes?.find(r => r.profondeur === i);
    if (repere) v = Array.isArray(v) ? v.find(x => objet(x) && x[repere.cle] === repere.valeur) : undefined;
    else v = (objet(v) || Array.isArray(v)) && Object.hasOwn(v, champ.chemin[i]) ? v[champ.chemin[i] as keyof typeof v] : undefined;
  }
  return v;
}
export function lireValeursChamps(champs: ChampAuto[], cible: unknown): Record<string, string> {
  return Object.fromEntries(champs.filter(c => cheminSur(c.chemin)).flatMap(c => { const v = lireChamp(c, cible); return typeof v === "string" ? [[c.id, v]] : []; }));
}
export function appliquerChamps(champs: ChampAuto[], source: unknown, cible: unknown, valeurs: Record<string, string>): Json {
  let resultat = structuredClone(donnees(source) ?? null);
  const precedentes = lireValeursChamps(champs, cible);
  for (const champ of champs) {
    if (!cheminSur(champ.chemin)) throw new Error("Chemin de traduction invalide");
    const valeur = Object.hasOwn(valeurs, champ.id) ? valeurs[champ.id] : precedentes[champ.id];
    if (valeur === undefined) continue;
    if (Object.hasOwn(valeurs, champ.id) && !traductionValide(champ.source, valeur, champ.max)) throw new Error("Traduction invalide");
    if (!champ.chemin.length) { resultat = valeur; continue; }
    let parent: unknown = resultat;
    for (const c of champ.chemin.slice(0, -1)) parent = (objet(parent) || Array.isArray(parent)) ? parent[c as keyof typeof parent] : undefined;
    if (objet(parent) || Array.isArray(parent)) Object.defineProperty(parent, champ.chemin.at(-1)!, { value: valeur, writable: true, enumerable: true, configurable: true });
  }
  return resultat;
}

function structureEditoriale(f: Forme, source: unknown, cible: unknown, fCible?: Forme, cle = ""): unknown {
  // Les formes fixes (locale, format, mois absent en FR) restent propres à chaque langue.
  if (f.k === "fixe" || f.k === "code" || fCible?.k === "fixe" || fCible?.k === "code") return cible;
  if (fCible?.k === "nul") fCible = fCible.de;
  if (f.k === "nul") return source === null ? null : structureEditoriale(f.de, source, cible, fCible, cle);
  if (f.k === "texte") return texteTraduisible(f, source, cle) || (typeof source === "string" && !source.trim() && f.min === 0) ? source : cible ?? source;
  if (f.k === "objet" && objet(source)) {
    const propres = objet(cible) ? Object.entries(cible).filter(([c]) => !Object.hasOwn(f.champs, c)) : [];
    const communs = Object.entries(f.champs).filter(([c]) => Object.hasOwn(source, c) || (objet(cible) && Object.hasOwn(cible, c))).map(([c, ch]) => [c, structureEditoriale(ch.f, source[c], objet(cible) ? cible[c] : undefined, fCible?.k === "objet" ? fCible.champs[c]?.f : undefined, c)]);
    return Object.fromEntries([...propres, ...communs].filter(([, v]) => v !== undefined));
  }
  if (f.k === "dict" && objet(source)) return Object.fromEntries(Object.entries(source).map(([c, v]) => [c, structureEditoriale(f.de, v, objet(cible) ? cible[c] : undefined, fCible?.k === "dict" ? fCible.de : undefined, c)]));
  if ((f.k === "liste" || f.k === "paire") && Array.isArray(source)) return source.map((v, i) => {
    const ff = f.k === "liste" ? f.de : f.de[i];
    const id = objet(v) ? ["id", "slug", "code", "key", "chemin", "src"].find(c => typeof v[c] === "string") : undefined;
    const t = Array.isArray(cible) ? id && objet(v) ? cible.find(x => objet(x) && x[id] === v[id]) : cible[i] : undefined;
    return ff ? structureEditoriale(ff, v, t, fCible?.k === "liste" ? fCible.de ?? undefined : fCible?.k === "paire" ? fCible.de[i] : undefined, cle) : v;
  });
  if (f.k === "un") {
    const ff = f.options.find(x => !valider(x, donnees(source), "", { medias: prefixesMedias() }).some(e => e.motif === "type" || e.motif === "inconnu"));
    return ff ? structureEditoriale(ff, source, cible, fCible, cle) : cible;
  }
  return cible ?? source;
}

/** Imbriqué : valeur entière avec les six autres langues intactes, locales et mois cible compris. */
export function appliquerContenu(cle: CleContenu, source: unknown, cible: unknown, valeurs: Record<string, string>, langue: Langue): Json {
  const base = sourceContenu(cle, source);
  const { mode, champs } = extraireContenu(cle, base, langue);
  if (mode === "externe") return appliquerChamps(champs, base, cible, valeurs);
  if (!objet(base)) throw new Error("Copie multilingue invalide");
  const f = formeDe(cle);
  if (f.k !== "objet" || !f.champs[langue]) throw new Error("Langue invalide");
  const precedent = objet(cible) ? cible[langue] : base[langue];
  const structure = structureEditoriale(f.champs.FR.f, base.FR, base[langue], f.champs[langue].f);
  base[langue] = appliquerChamps(champs, structure, precedent, valeurs);
  const ecarts = valider(f.champs[langue].f, base[langue], "", { medias: prefixesMedias() });
  if (ecarts.length) throw new Error(`Copie traduite invalide : ${ecarts.map(e => `${e.chemin}:${e.motif}`).join(", ")}`);
  return base as Json;
}

export const empreinteSource = (champs: ChampAuto[]) => hash(champs.map(c => [c.id, c.source, c.max]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
export const cleMemoire = (segment: SegmentAuto, langue: Langue, options: OptionsMemoire = {}) => hash([CONTRAT, options.langueSource ?? "FR", langue, segment.contexte, segment.source, options.consignes ?? "", options.glossaire ?? ""]);

// Les adresses et variables sont masquées de même longueur pendant le découpage natif des phrases.
const ATOMES = /\{[A-Za-z_][A-Za-z_0-9]*\}|\]\([^\r\n)]*\)|https?:\/\/[^\s<>]+|(?:mailto:|tel:)[^\s<>]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|`[^`\r\n]*`/g;
const phrasier = new Intl.Segmenter("fr", { granularity: "sentence" });
function bornerPhrase(source: string): string[] {
  if (source.length <= 6000) return [source];
  const atomes = [...source.matchAll(ATOMES)].map(m => ({ debut: m.index, fin: m.index + m[0].length }));
  const blancs = [...source.matchAll(/\s+/g)].filter(m => !atomes.some(a => m.index >= a.debut && m.index < a.fin));
  const morceaux: string[] = [];
  let debut = 0;
  while (source.length - debut > 6000) {
    const blanc = blancs.findLast(m => m.index > debut && m.index <= debut + 6000);
    if (!blanc) break; // Un mot ou un atome indivisible trop long reste refusé, jamais tronqué.
    const fin = blanc.index + blanc[0].length;
    morceaux.push(source.slice(debut, fin)); debut = fin;
  }
  morceaux.push(source.slice(debut));
  return morceaux;
}
function morceauxTexte(source: string): string[] {
  const resultat: string[] = [];
  for (const ligne of source.split(/(\r?\n)/)) {
    if (/^\r?\n$/.test(ligne)) { resultat.push(ligne); continue; }
    const masque = ligne.replace(ATOMES, s => "x".repeat(s.length));
    let debut = 0;
    for (const partie of phrasier.segment(masque)) {
      const fin = partie.index + partie.segment.length;
      const morceau = ligne.slice(debut, fin);
      // Une emphase ouverte ou un lien ne se coupe pas entre deux appels au modèle.
      if ([/\*\*/g, /(?<!\*)\*(?!\*)/g, /__/g, /(?<!_)_(?!_)/g].some(re => (morceau.match(re)?.length ?? 0) % 2) || (morceau.match(/\[/g)?.length ?? 0) !== (morceau.match(/\]/g)?.length ?? 0)) continue;
      resultat.push(morceau); debut = fin;
    }
    if (debut < ligne.length) resultat.push(ligne.slice(debut));
  }
  return resultat.flatMap(bornerPhrase);
}

/** Une phrase identique dans le même champ sémantique partage sa mémoire, même après déplacement. */
export function preparerSegments(champs: ChampAuto[]): PlanSegments {
  const segments = new Map<string, SegmentAuto>();
  const plans = champs.map(champ => ({ champ, morceaux: morceauxTexte(champ.source).flatMap(source => {
    const debut = source.match(/^\s*(?:(?:#{1,6}|>|[-+*]|\d+\.)\s+)?/)?.[0] ?? "";
    const fin = source.slice(debut.length).match(/\s*$/)?.[0] ?? "";
    const coeur = source.slice(debut.length, source.length - fin.length || undefined);
    if (!coeur || !texteTraduisible({ k: "texte", min: 0, max: champ.max, long: true }, coeur)) return [{ source }];
    const id = hash([CONTRAT, champ.contexte, coeur]);
    const precedent = segments.get(id);
    segments.set(id, { id, source: coeur, contexte: champ.contexte, max: Math.min(precedent?.max ?? champ.max, champ.max) });
    return [...(debut ? [{ source: debut }] : []), { source: coeur, segment: id }, ...(fin ? [{ source: fin }] : [])];
  }) }));
  return { champs: plans, segments: [...segments.values()] };
}

const captures = (s: string, re: RegExp) => [...s.matchAll(re)].map(m => m[0]).sort();
const meme = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);
export function traductionValide(source: string, cible: unknown, max: number): cible is string {
  // Le suffixe français isolé des modèles peut devenir vide dans une langue sans ce pluriel.
  if (typeof cible !== "string" || (!cible.trim() && source !== "s") || cible.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(cible)) return false;
  const invariants = [
    /\{[A-Za-z_][A-Za-z_0-9]*\}/g,
    /\]\([^\r\n)]*\)|https?:\/\/[^\s<>]+|(?:mailto:|tel:)[^\s<>]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,
    /\d+(?:[.,:/-]\d+)*/g,
    /<\/?[A-Za-z][^>]*>|`[^`]*`/g,
    /\bOuidah(?: Heritage Tour)?\b|\bHeritage Tour\b|\b(?:XOF|EUR|USD|FCFA)\b/g,
    /\*\*|(?<!\*)\*(?!\*)|__|(?<!_)_(?!_)|!\[|(?<!!)\[|\]/g,
  ];
  return invariants.every(re => meme(captures(source, re), captures(cible, re))) && meme(captures(source, /\r?\n/g), captures(cible, /\r?\n/g));
}

export function assemblerChamps(plan: PlanSegments, traductions: Record<string, string>): Record<string, string> {
  const valeurs: Record<string, string> = {};
  for (const { champ, morceaux } of plan.champs) {
    const valeur = morceaux.map(m => {
      if (!m.segment) return m.source;
      const t = traductions[m.segment];
      if (!traductionValide(m.source, t, champ.max) || t.trim() !== t) throw new Error("Segment absent ou invalide");
      return t;
    }).join("");
    if (!traductionValide(champ.source, valeur, champ.max)) throw new Error("Champ traduit invalide");
    valeurs[champ.id] = valeur;
  }
  return valeurs;
}
