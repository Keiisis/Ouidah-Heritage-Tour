// Règles du contenu modifiable du site (lib/contenu.ts, actions de l'équipe, éditeur, tests) : aucune dépendance, aucun
// secret, lisible par Node, le serveur et le navigateur. La forme d'une rubrique se déduit de sa valeur par défaut (le
// code) : une chaîne reste une chaîne, un nombre un nombre, une liste garde la forme de ses éléments, une clé inconnue est
// refusée. Quelques chemins ont une forme écrite à la main (indices du registre) quand le défaut ne suffit pas : champ
// toujours vide (null), liste vide, dictionnaire de fiches. Les fonctions du code ne sont jamais modifiables.

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type Motif = "slug" | "lien" | "src" | "couleur" | "date" | "id";
export type Forme =
  | { k: "texte"; min: number; max: number; long: boolean; motif?: Motif; jetons?: string[]; traduire?: false; liensFiges?: string[] }
  | { k: "nombre"; entier: boolean; min?: number }
  | { k: "booleen" }
  | { k: "choix"; options: string[] }
  | { k: "liste"; de: Forme | null; min: number; max: number; identite?: { cle: string; valeurs: string[] } }
  | { k: "paire"; de: Forme[] }
  | { k: "objet"; champs: Record<string, Champ> }
  | { k: "dict"; de: Forme; max: number }
  | { k: "un"; options: Forme[] }
  | { k: "nul"; de: Forme }
  | { k: "fixe"; v: Json }
  | { k: "code" };
export type Champ = { f: Forme; opt?: true };
export type Ecart = { chemin: string; motif: "type" | "inconnu" | "manquant" | "long" | "court" | "format" | "choix" | "nombre" | "doublon" | "identite" | "fixe" | "jeton" | "lien" | "image" };
export type OptionsValidation = { medias: string[] };
type Indices = Record<string, Forme | "choix">;
// vus : valeurs déjà présentes par chemin (« [] » pour tout élément de liste), pour les choix
export type Contexte = { indices: Indices; protege: boolean; vus?: Map<string, Set<string>> };

const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const LIEN = /^(?:\/(?!\/)|#|https?:\/\/|mailto:|tel:)[^\s<>"'`]*$/;
const COULEUR = /^#[0-9a-f]{6}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const IMAGE = /\.(?:jpe?g|png|webp|avif|gif)(?:\?.*)?$/i;
const CONTROLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const JETON = /\{[A-Za-z_][A-Za-z_0-9]*\}/g;
const LIEN_MD = /\]\(([^)]*)\)/g;
// clés dont la valeur est un choix parmi les valeurs déjà présentes au même endroit (couleur de tuile, objet 3D, vue…),
// quand ces valeurs sont des identifiants (minuscules, sans espace) et non des phrases
const CHOIX = new Set(["couleur", "ring", "objet", "vue", "verification", "categorie", "group", "fiche"]);
const IDENTIFIANT = /^[a-z0-9+-]+$/;
const IDENTITE = ["id", "key", "code"];

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const derniere = (chemin: string) => chemin.slice(Math.max(chemin.lastIndexOf("."), chemin.lastIndexOf("}"), chemin.lastIndexOf("]")) + 1);
const lienOk = (t: string) => LIEN.test(t);

// ---------- formes écrites à la main (indices) ----------

export const F = {
  texte: (max = 200, o: { long?: boolean; min?: number; motif?: Motif; traduire?: false } = {}): Forme => ({ k: "texte", max, min: o.min ?? 0, long: o.long ?? false, ...(o.motif ? { motif: o.motif } : {}), ...(o.traduire === false ? { traduire: false as const } : {}) }),
  nombre: (entier = false, min?: number): Forme => ({ k: "nombre", entier, ...(min === undefined ? {} : { min }) }),
  booleen: (): Forme => ({ k: "booleen" }),
  nul: (de: Forme): Forme => ({ k: "nul", de }),
  liste: (de: Forme, max = 40, min = 0): Forme => ({ k: "liste", de, max, min }),
  dict: (de: Forme, max = 200): Forme => ({ k: "dict", de, max }),
  fixe: (v: Json): Forme => ({ k: "fixe", v }),
  objet: (champs: Record<string, Forme | [Forme, "opt"]>): Forme => ({ k: "objet", champs: Object.fromEntries(Object.entries(champs).map(([c, f]) => [c, Array.isArray(f) ? { f: f[0], opt: true } : { f }])) }),
  media: (): Forme => F.objet({ src: F.texte(500, { min: 1, motif: "src" }), alt: F.texte(300, { min: 1 }) }),
};

// ---------- déduction de la forme depuis le défaut ----------

const genre = (v: unknown) => (typeof v === "function" ? "code" : Array.isArray(v) ? "liste" : v === null ? "nul" : typeof v);

/** Longueur maximale d'un texte : 1,5 fois la plus longue valeur actuelle (40 au moins) ; dans une section protégée,
 * 1,2 fois (4 caractères de plus au moins), pour que le texte tienne dans le dessin. */
export const longueurMax = (actuelle: number, protege: boolean) => (protege ? Math.max(Math.ceil(actuelle * 1.2), actuelle + 4) : Math.max(Math.ceil(actuelle * 1.5), 40));

function texteDe(vals: string[], cle: string, ctx: Contexte): Forme {
  const L = Math.max(0, ...vals.map((v) => v.length));
  const min = vals.length && vals.every((v) => v.trim().length > 0) ? 1 : 0;
  const jetons = [...new Set(vals.flatMap((v) => v.match(JETON) ?? []))];
  const avec = (f: Forme) => (jetons.length && f.k === "texte" ? { ...f, jetons } : f);
  if (cle === "slug") return F.texte(80, { min: 1, motif: "slug" });
  if (vals.length && vals.every((v) => COULEUR.test(v))) return F.texte(7, { min: 1, motif: "couleur" });
  if (vals.length && vals.every((v) => DATE.test(v))) return F.texte(10, { min: 1, motif: "date" });
  if (cle === "src" || (vals.length && vals.every((v) => IMAGE.test(v) && lienOk(v)))) return F.texte(500, { min: 1, motif: "src" });
  if (cle === "href" || cle === "action" || (vals.length && vals.every((v) => lienOk(v) && !/\s/.test(v)))) return F.texte(300, { min, motif: "lien" });
  const long = L > 90 || vals.some((v) => v.includes("\n"));
  return avec(F.texte(longueurMax(L, ctx.protege), { long, min }));
}

/** Forme déduite des échantillons (toutes les valeurs du défaut à ce chemin). */
export function inferer(echantillons: unknown[], chemin: string, ctx: Contexte): Forme {
  const indice = ctx.indices[chemin];
  const cle = derniere(chemin);
  if (indice && indice !== "choix") return indice;
  const nuls = echantillons.some((v) => v === null);
  const vals = echantillons.filter((v) => v !== null && v !== undefined);
  const envelopper = (f: Forme): Forme => (nuls ? { k: "nul", de: f } : f);
  if (!vals.length) return { k: "fixe", v: null }; // toujours vide dans le code et aucune forme écrite : figé
  const genres = [...new Set(vals.map(genre))];
  if (genres.includes("code")) return { k: "code" };
  if (indice === "choix" || (CHOIX.has(cle) && genres.length === 1 && genres[0] === "string" && (vals as string[]).every((v) => IDENTIFIANT.test(v)))) {
    return envelopper({ k: "choix", options: [...(ctx.vus?.get(chemin) ?? new Set(vals as string[]))] });
  }
  if (genres.length > 1) return envelopper({ k: "un", options: genres.map((g) => inferer(vals.filter((v) => genre(v) === g), chemin, ctx)) });
  switch (genres[0]) {
    case "string":
      return envelopper(texteDe(vals as string[], cle, ctx));
    case "number":
      return envelopper({ k: "nombre", entier: (vals as number[]).every(Number.isInteger) });
    case "boolean":
      return envelopper({ k: "booleen" });
    case "liste":
      return envelopper(listeDe(vals as unknown[][], chemin, ctx));
    default:
      return envelopper(objetDe(vals as Record<string, unknown>[], chemin, ctx));
  }
}

function listeDe(listes: unknown[][], chemin: string, ctx: Contexte): Forme {
  const elements = listes.flat();
  // couple de valeurs simples (coordonnées, titre en deux lignes, dates « du … au … ») : toujours deux valeurs
  if (listes.every((l) => l.length === 2 && l.every((x) => typeof x !== "object" && typeof x !== "function"))) {
    return { k: "paire", de: [0, 1].map((i) => inferer(listes.map((l) => l[i]), `${chemin}[${i}]`, ctx)) };
  }
  const n = Math.max(...listes.map((l) => l.length));
  const court = Math.min(...listes.map((l) => l.length));
  if (!elements.length) return { k: "liste", de: null, min: 0, max: 0 }; // liste vide sans forme écrite : reste vide
  const de = inferer(elements, `${chemin}[]`, ctx);
  const ident = elements.every(estObjet) ? IDENTITE.find((c) => elements.every((e) => typeof (e as Record<string, unknown>)[c] === "string")) : undefined;
  // liste d'éléments repérés par un identifiant lu par le code (onglets, catégories, chapitres) : ni ajout ni retrait
  if (ident && listes.length === 1) return { k: "liste", de, min: n, max: n, identite: { cle: ident, valeurs: elements.map((e) => (e as Record<string, string>)[ident]) } };
  // section protégée : autant d'éléments que le dessin en prévoit
  if (ctx.protege) return { k: "liste", de, min: court, max: n };
  return { k: "liste", de, min: court ? 1 : 0, max: Math.max(2 * n, n + 10) };
}

function objetDe(objets: Record<string, unknown>[], chemin: string, ctx: Contexte): Forme {
  // objets de même jeu de clés regroupés ; plusieurs jeux = plusieurs variantes (une tuile photo ou une tuile couleur…)
  const groupes = new Map<string, Record<string, unknown>[]>();
  for (const o of objets) {
    const sig = Object.keys(o).sort().join("|");
    groupes.set(sig, [...(groupes.get(sig) ?? []), o]);
  }
  const variantes = [...groupes.values()].map((g): Forme => {
    const champs: Record<string, Champ> = {};
    for (const c of Object.keys(g[0])) {
      const vus = g.map((o) => o[c]);
      // « type » d'une variante (oht / externe, sejour / billet…) : la valeur de la variante, figée
      champs[c] = c === "type" && vus.every((v) => typeof v === "string" && v === vus[0]) && groupes.size > 1 ? { f: { k: "fixe", v: vus[0] as string } } : { f: inferer(vus, `${chemin}.${c}`, ctx) };
    }
    return { k: "objet", champs };
  });
  return variantes.length === 1 ? variantes[0] : { k: "un", options: variantes };
}

/** Valeurs textuelles du défaut, par chemin (élément de liste = « [] ») : options des choix. */
export function collecter(v: unknown, chemin: string, acc = new Map<string, Set<string>>()) {
  if (typeof v === "string") acc.set(chemin, (acc.get(chemin) ?? new Set()).add(v));
  else if (Array.isArray(v)) for (const x of v) collecter(x, `${chemin}[]`, acc);
  else if (estObjet(v)) for (const [c, x] of Object.entries(v)) collecter(x, `${chemin}.${c}`, acc);
  return acc;
}

// ---------- validation ----------

const texteValide = (f: Extract<Forme, { k: "texte" }>, v: string, chemin: string, o: OptionsValidation, e: Ecart[]) => {
  const n = v.length;
  if (n > f.max) return e.push({ chemin, motif: "long" });
  if (v.trim().length < f.min) return e.push({ chemin, motif: "court" });
  if (CONTROLE.test(v) || (!f.long && /[\r\n]/.test(v))) return e.push({ chemin, motif: "format" });
  if (!n) return;
  if (f.motif === "slug" && !SLUG.test(v)) return e.push({ chemin, motif: "format" });
  if (f.motif === "id" && !/^[a-z0-9][a-z0-9_-]*$/i.test(v)) return e.push({ chemin, motif: "format" });
  if (f.motif === "couleur" && !COULEUR.test(v)) return e.push({ chemin, motif: "format" });
  if (f.motif === "date" && (!DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v)) return e.push({ chemin, motif: "format" });
  if (f.motif === "lien" && !lienOk(v)) return e.push({ chemin, motif: "lien" });
  if (f.motif === "src" && !((v.startsWith("/") && !v.startsWith("//") && lienOk(v)) || o.medias.some((p) => v.startsWith(p) && lienOk(v)))) return e.push({ chemin, motif: "image" });
  for (const m of v.matchAll(LIEN_MD)) if (!lienOk(m[1])) return e.push({ chemin, motif: "lien" });
  if (f.liensFiges && JSON.stringify([...v.matchAll(LIEN_MD)].map((m) => m[1]).sort()) !== JSON.stringify(f.liensFiges)) return e.push({ chemin, motif: "lien" });
  if (f.jetons) for (const j of v.match(JETON) ?? []) if (!f.jetons.includes(j)) return e.push({ chemin, motif: "jeton" });
};

/** Écarts d'une valeur avec sa forme (liste vide = valeur acceptée). */
export function valider(f: Forme, v: unknown, chemin: string, o: OptionsValidation): Ecart[] {
  const e: Ecart[] = [];
  verifier(f, v, chemin, o, e);
  return e;
}

function verifier(f: Forme, v: unknown, chemin: string, o: OptionsValidation, e: Ecart[]): void {
  switch (f.k) {
    case "code":
      if (v !== undefined) e.push({ chemin, motif: "fixe" });
      return;
    case "fixe":
      if (JSON.stringify(v) !== JSON.stringify(f.v)) e.push({ chemin, motif: "fixe" });
      return;
    case "nul":
      if (v !== null) verifier(f.de, v, chemin, o, e);
      return;
    case "texte":
      if (typeof v !== "string") e.push({ chemin, motif: "type" });
      else texteValide(f, v, chemin, o, e);
      return;
    case "nombre":
      if (typeof v !== "number" || !Number.isFinite(v)) e.push({ chemin, motif: "type" });
      else if (f.entier && !Number.isInteger(v)) e.push({ chemin, motif: "nombre" });
      else if (Math.abs(v) > 1e9 || (f.min !== undefined && v < f.min)) e.push({ chemin, motif: "nombre" });
      return;
    case "booleen":
      if (typeof v !== "boolean") e.push({ chemin, motif: "type" });
      return;
    case "choix":
      if (typeof v !== "string" || !f.options.includes(v)) e.push({ chemin, motif: "choix" });
      return;
    case "paire":
      if (!Array.isArray(v) || v.length !== f.de.length) e.push({ chemin, motif: "type" });
      else f.de.forEach((x, i) => verifier(x, v[i], `${chemin}[${i}]`, o, e));
      return;
    case "liste": {
      if (!Array.isArray(v)) return void e.push({ chemin, motif: "type" });
      if (v.length > f.max) return void e.push({ chemin, motif: "long" });
      if (v.length < f.min) return void e.push({ chemin, motif: "court" });
      if (f.de) v.forEach((x, i) => verifier(f.de as Forme, x, `${chemin}[${i}]`, o, e));
      if (f.identite) {
        const vus = v.map((x) => (estObjet(x) ? x[f.identite!.cle] : undefined));
        if (vus.length !== f.identite.valeurs.length || [...f.identite.valeurs].sort().join("\n") !== [...vus].sort().join("\n")) e.push({ chemin, motif: "identite" });
      }
      // slugs uniques dans une même liste
      const slugs = v.map((x) => (estObjet(x) && typeof x.slug === "string" ? x.slug : null)).filter((s): s is string => s !== null);
      if (new Set(slugs).size !== slugs.length) e.push({ chemin, motif: "doublon" });
      return;
    }
    case "dict": {
      if (!estObjet(v)) return void e.push({ chemin, motif: "type" });
      const cles = Object.keys(v);
      if (cles.length > f.max) return void e.push({ chemin, motif: "long" });
      for (const c of cles) {
        if (!SLUG.test(c)) e.push({ chemin: `${chemin}{${c}}`, motif: "format" });
        else verifier(f.de, v[c], `${chemin}{${c}}`, o, e);
      }
      return;
    }
    case "objet": {
      if (!estObjet(v)) return void e.push({ chemin, motif: "type" });
      for (const c of Object.keys(v)) if (!Object.hasOwn(f.champs, c) || f.champs[c].f.k === "code") e.push({ chemin: `${chemin}.${c}`, motif: "inconnu" });
      for (const [c, ch] of Object.entries(f.champs)) {
        if (ch.f.k === "code") continue;
        if (!Object.hasOwn(v, c) || v[c] === undefined) {
          if (!ch.opt) e.push({ chemin: `${chemin}.${c}`, motif: "manquant" });
          continue;
        }
        verifier(ch.f, v[c], `${chemin}.${c}`, o, e);
      }
      // Les nombres et les dates ISO seuls ne suffisent pas : Date.UTC normaliserait silencieusement un 31 avril
      // ou un mois 13. Ces règles s'appliquent à l'éditeur ET à la lecture d'une surcharge enregistrée.
      if (/^fr\.evenements\[\d+\]\.quand$/.test(chemin)) {
        const borne = (cle: string, min: number, max: number) => {
          const n = v[cle];
          if (typeof n === "number" && (n < min || n > max)) e.push({ chemin: `${chemin}.${cle}`, motif: "nombre" });
        };
        if (v.type === "annuel") {
          borne("mois", 1, 12);
          borne("jour", 1, 31);
          borne("jours", 1, 366);
          if (typeof v.mois === "number" && typeof v.jour === "number" && v.mois >= 1 && v.mois <= 12) {
            const dernierJour = new Date(Date.UTC(2000, v.mois, 0)).getUTCDate();
            if (v.jour > dernierJour) e.push({ chemin: `${chemin}.jour`, motif: "format" });
          }
        } else if (v.type === "paques") {
          borne("debut", -366, 366);
          borne("fin", -366, 366);
          if (typeof v.debut === "number" && typeof v.fin === "number" && v.fin < v.debut) e.push({ chemin: `${chemin}.fin`, motif: "format" });
        } else if (v.type === "editions" && Array.isArray(v.dates)) {
          let precedent = "";
          for (let i = 0; i < v.dates.length; i++) {
            const p: unknown = v.dates[i];
            if (!Array.isArray(p) || typeof p[0] !== "string" || typeof p[1] !== "string") continue;
            if (p[1] < p[0]) e.push({ chemin: `${chemin}.dates[${i}][1]`, motif: "format" });
            if (precedent && p[0] <= precedent) e.push({ chemin: `${chemin}.dates[${i}][0]`, motif: "format" });
            precedent = p[0];
          }
        }
      }
      return;
    }
    case "un": {
      const essais = f.options.map((x) => valider(x, v, chemin, o));
      const meilleur = essais.reduce((a, b) => (b.length < a.length ? b : a));
      if (meilleur.length) e.push(...meilleur);
    }
  }
}

// ---------- fusion avec le défaut ----------

/** Surcharge fusionnée au défaut : chaque champ d'objet valable remplace celui du défaut, une liste ou une valeur
 * simple valable remplace la sienne ; tout le reste garde le défaut et devient un écart. Rend des données sans fonction. */
export function fusionner(f: Forme, defaut: unknown, surcharge: unknown, chemin: string, o: OptionsValidation): { v: Json; ecarts: Ecart[] } {
  const ecarts: Ecart[] = [];
  const v = fondre(f, defaut, surcharge, chemin, o, ecarts);
  return { v: v as Json, ecarts };
}

function fondre(f: Forme, d: unknown, s: unknown, chemin: string, o: OptionsValidation, ecarts: Ecart[]): unknown {
  if (s === undefined) return donnees(d);
  if (f.k === "objet" && estObjet(s) && estObjet(d)) {
    const r: Record<string, unknown> = {};
    for (const c of Object.keys(s)) if (!Object.hasOwn(f.champs, c)) ecarts.push({ chemin: `${chemin}.${c}`, motif: "inconnu" });
    for (const [c, ch] of Object.entries(f.champs)) {
      if (ch.f.k === "code") continue;
      const x = fondre(ch.f, d[c], s[c], `${chemin}.${c}`, o, ecarts);
      if (x !== undefined) r[c] = x;
    }
    return r;
  }
  const e = valider(f, s, chemin, o);
  if (!e.length) return s;
  ecarts.push(...e);
  return donnees(d);
}

/** Copie JSON d'une valeur du code, sans ses fonctions (ce que l'éditeur et la base manipulent). */
export function donnees(v: unknown): Json | undefined {
  if (typeof v === "function" || v === undefined) return undefined;
  if (Array.isArray(v)) return v.map((x) => donnees(x) ?? null);
  if (estObjet(v)) {
    const r: Record<string, Json> = {};
    for (const [c, x] of Object.entries(v)) {
      const y = donnees(x);
      if (y !== undefined) r[c] = y;
    }
    return r;
  }
  return v as Json;
}

/** Les champs légaux masqués restent dans l'éditeur, mais leur valeur ne part pas au navigateur. */
export function contenuPublic(cle: string, valeur: Json): Json {
  if (cle !== "legal" || !estObjet(valeur)) return valeur;
  const societe = valeur.societe;
  return {
    ...valeur,
    _note: "",
    ...(estObjet(societe) ? { societe: Object.fromEntries(Object.entries(societe).map(([nom, info]) => [
      nom, estObjet(info) && info.visible === false ? { ...info, valeur: null } : info,
    ])) } : {}),
  };
}

/** Données fusionnées, avec les fonctions du défaut remises à leur place (champs d'objets). */
export function avecCode<T>(defaut: T, v: Json): T {
  const d = defaut as unknown;
  if (estObjet(d) && estObjet(v)) {
    const r: Record<string, unknown> = { ...v };
    for (const [c, x] of Object.entries(d)) if (typeof x === "function") r[c] = x;
    for (const c of Object.keys(v)) if (Object.hasOwn(d, c) && typeof d[c] !== "function") r[c] = avecCode(d[c], v[c]);
    return r as T;
  }
  return v as T;
}

// ---------- adresses publiques (slugs) ----------

/** Slugs d'une valeur : champs « slug » à toute profondeur et clés des dictionnaires de fiches. */
export function slugs(f: Forme, v: unknown, acc = new Set<string>()): Set<string> {
  if (f.k === "nul") return v === null ? acc : slugs(f.de, v, acc);
  if (f.k === "liste" && Array.isArray(v) && f.de) for (const x of v) slugs(f.de, x, acc);
  if (f.k === "dict" && estObjet(v)) for (const [c, x] of Object.entries(v)) slugs(f.de, x, acc.add(c));
  if (f.k === "un") for (const x of f.options) if (!valider(x, v, "", { medias: [] }).some((e) => e.motif === "type" || e.motif === "inconnu")) return slugs(x, v, acc);
  if (f.k === "objet" && estObjet(v)) {
    for (const [c, ch] of Object.entries(f.champs)) {
      if (c === "slug" && typeof v[c] === "string") acc.add(v[c] as string);
      else if (v[c] !== undefined) slugs(ch.f, v[c], acc);
    }
  }
  return acc;
}

/** Adresses publiques qui disparaîtraient (slug changé ou élément retiré). */
export const adressesPerdues = (f: Forme, avant: unknown, apres: unknown) => {
  const garde = slugs(f, apres);
  return [...slugs(f, avant)].filter((s) => !garde.has(s));
};

// ---------- éditeur : valeur neuve, différences, libellés ----------

/** Valeur vide d'une forme : un élément ajouté à une liste part de là (texte vide, liste vide, champ facultatif vide…). */
export function vide(f: Forme): Json | undefined {
  switch (f.k) {
    case "texte":
      return "";
    case "nombre":
      return 0;
    case "booleen":
      return false;
    case "choix":
      return f.options[0] ?? "";
    case "liste":
      return f.de && f.min > 0 && !f.identite ? Array.from({ length: f.min }, () => vide(f.de as Forme) ?? null) : [];
    case "paire":
      return f.de.map((x) => vide(x) ?? null);
    case "objet":
      return Object.fromEntries(Object.entries(f.champs).filter(([, c]) => !c.opt && c.f.k !== "code").map(([c, ch]) => [c, vide(ch.f) ?? null]));
    case "dict":
      return {};
    case "un":
      return vide(f.options[0]);
    case "nul":
      return null;
    case "fixe":
      return f.v;
    case "code":
      return undefined;
  }
}

/** Chemins dont la valeur diffère (aperçu avant publication), au plus `max`. */
export function differences(avant: unknown, apres: unknown, chemin = "", max = 200, acc: { chemin: string; avant: Json | undefined; apres: Json | undefined }[] = []) {
  if (acc.length >= max || JSON.stringify(avant) === JSON.stringify(apres)) return acc;
  if (estObjet(avant) && estObjet(apres)) {
    for (const c of new Set([...Object.keys(avant), ...Object.keys(apres)])) differences(avant[c], apres[c], `${chemin}.${c}`, max, acc);
    return acc;
  }
  if (Array.isArray(avant) && Array.isArray(apres) && avant.length === apres.length) {
    avant.forEach((x, i) => differences(x, apres[i], `${chemin}[${i}]`, max, acc));
    return acc;
  }
  acc.push({ chemin, avant: donnees(avant), apres: donnees(apres) });
  return acc;
}

/** Libellé lisible d'une clé : la table si elle la connaît, sinon la clé découpée (« priceVisible » → « Price visible »). */
export function libelle(cle: string, table: Record<string, string>) {
  if (table[cle]) return table[cle];
  const mots = cle.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().toLowerCase();
  return mots ? mots[0].toUpperCase() + mots.slice(1) : cle;
}

// ---------- images téléversées ----------

export const IMAGE_MAX = 8 * 1024 * 1024; // 8 Mo, la limite du compartiment privé site-medias-depot
export const LARGEUR_IMAGE = 2400; // largeur maximale après conversion (les photos plein écran du site font 2400 px)
export const MIMES_IMAGE = ["image/jpeg", "image/png", "image/webp"] as const;
export type MimeImage = (typeof MIMES_IMAGE)[number];

/** Type réel d'une image d'après ses premiers octets (JPEG, PNG, WebP), ou null. */
export function typeImage(o: Uint8Array): MimeImage | null {
  const a = (debut: number, ...b: number[]) => b.every((x, i) => o[debut + i] === x);
  if (a(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (a(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (a(0, 0x52, 0x49, 0x46, 0x46) && a(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp"; // « RIFF » … « WEBP »
  return null;
}

/** Texte alternatif d'une image : obligatoire, une ligne, 300 caractères au plus. */
export const altValide = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 300 && !CONTROLE.test(v) && !/[\r\n]/.test(v);
