import { Unzip, UnzipInflate } from "fflate";
import { extractText, getDocumentProxy } from "unpdf";
import { LIMITES_BASE as L } from "@/content/assistant-base";

// Règles pures de la base de connaissances de l'assistant (aucun accès réseau, base ni secret ; pas de server-only, pour
// les tests : tests-oht/assistant-base-regles.test.mjs). Le texte d'un document est une DONNÉE NON FIABLE : il ne devient
// jamais une consigne. Il n'entre dans l'invite que par les fiches (section CONNAISSANCES de connaissance.ts) ; ici, il est
// seulement lu, nettoyé (caractères de contrôle et marques invisibles retirés, balises de section neutralisées), découpé
// et contrôlé (données personnelles ou secrètes que l'assistant pourrait répéter aux visiteurs). Le fichier lui-même
// n'est jamais gardé : seul le texte extrait sort d'ici.

export type Genre = "pdf" | "docx" | "txt";
export type RefusExtraction = "vide" | "taille" | "signature" | "pages" | "illisible" | "bombe" | "encodage" | "long";
export type Extrait = { genre: Genre; texte: string; pages: number | null };

export const RETIRE = "[retiré]";

const commence = (o: Uint8Array, ...b: number[]) => b.every((x, i) => o[i] === x);
const EST_PDF = (o: Uint8Array) => commence(o, 0x25, 0x50, 0x44, 0x46, 0x2d); // « %PDF- »
const EST_ZIP = (o: Uint8Array) => commence(o, 0x50, 0x4b, 0x03, 0x04); // « PK\3\4 »

/** Genre attendu d'après l'extension (.pdf, .docx, .txt, .md), sinon null. */
export function genreAttendu(nom: string): Genre | null {
  const m = /\.(pdf|docx|txt|md|markdown)$/i.exec(nom.trim());
  if (!m) return null;
  const e = m[1].toLowerCase();
  return e === "pdf" ? "pdf" : e === "docx" ? "docx" : "txt";
}

/** Genre d'après les premiers octets (signature), jamais d'après le nom ni le type annoncé par le navigateur. */
export const genreDesOctets = (o: Uint8Array): Genre => (EST_PDF(o) ? "pdf" : EST_ZIP(o) ? "docx" : "txt");

// ---------- nettoyage ----------

// caractères de contrôle (sauf tabulation et saut de ligne), BOM, trait d'union conditionnel et marques de sens
// invisibles (texte caché, inversion d'affichage)
const CONTROLE = /[\u0000-\u0008\u000b\u000e-\u001f\u007f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;
// balises des sections de données de l'invite : un texte ne peut ni fermer sa section ni en ouvrir une autre
const BALISES = /<\s*\/?\s*(?:connaissances|argumentaire)\s*>/gi;

/** Texte prêt à être découpé : NFC, sauts de ligne unifiés, contrôles retirés, espaces resserrés, « @@ » (marque de la
 * ligne finale du modèle) et balises de section neutralisées, trois sauts de ligne ou plus ramenés à deux. */
export function nettoyer(t: string): string {
  return t
    .normalize("NFC")
    .replace(/\r\n?|\u2028|\u2029/g, "\n")
    .replace(/\f/g, "\n\n")
    .replace(CONTROLE, "")
    .replace(BALISES, "")
    .replace(/@{2,}/g, "@")
    .replace(/[\t\u00a0\u2000-\u200a\u202f\u205f\u3000 ]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------- extraction ----------

async function textePdf(octets: Uint8Array): Promise<{ texte: string; pages: number } | "pages" | "illisible"> {
  let doc: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    // copie : pdf.js peut détacher le tampon reçu ; polices jamais chargées (le texte seul est lu), journal muet
    doc = await getDocumentProxy(new Uint8Array(octets), { disableFontFace: true, verbosity: 0 });
  } catch {
    return "illisible";
  }
  try {
    if (doc.numPages > L.pages) return "pages";
    const { text } = await extractText(doc, { mergePages: false });
    return { texte: text.join("\n\n"), pages: doc.numPages };
  } catch {
    return "illisible";
  } finally {
    await doc.loadingTask.destroy().catch(() => undefined);
  }
}

// DOCX = zip ; seul word/document.xml est lu, en flux, par tranches de 16 ko compressés : le texte décompressé est compté
// au fil de l'eau et la lecture s'arrête dès qu'il dépasse L.xml (une tranche ne peut pas en produire plus de ~17 Mo)
const TRANCHE = 16 * 1024;

/** XML du corps d'un DOCX, ou le motif du refus. `max` : octets décompressés au plus. */
export function xmlDocx(octets: Uint8Array, max: number = L.xml): Uint8Array | "signature" | "illisible" | "bombe" {
  const parts: Uint8Array[] = [];
  let total = 0, vu = false, fini = false, trop = false, erreur = false;
  const uz = new Unzip((f) => {
    if (f.name !== "word/document.xml" || vu) return;
    vu = true;
    f.ondata = (e, d, final) => {
      if (e) erreur = true;
      if (e || trop) return;
      total += d.length;
      if (total > max) {
        trop = true;
        f.terminate();
        return;
      }
      parts.push(d);
      if (final) fini = true;
    };
    f.start();
  });
  uz.register(UnzipInflate);
  try {
    for (let i = 0; i < octets.length && !trop && !erreur && !fini; i += TRANCHE) uz.push(octets.subarray(i, i + TRANCHE), i + TRANCHE >= octets.length);
  } catch {
    return trop ? "bombe" : "illisible";
  }
  if (trop) return "bombe";
  if (!vu) return "signature"; // zip sans corps de document Word (tableur, archive renommée)
  if (erreur || !fini) return "illisible";
  const out = new Uint8Array(total);
  let k = 0;
  for (const p of parts) out.set(p, (k += p.length) - p.length);
  return out;
}

const ENTITES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const pointCode = (n: number) => (Number.isInteger(n) && n > 0 && n <= 0x10ffff && (n < 0xd800 || n > 0xdfff) ? String.fromCodePoint(n) : "");
const decoder = (s: string) =>
  s.replace(/&(?:#x([0-9a-f]{1,6})|#(\d{1,7})|(amp|lt|gt|quot|apos));/gi, (_, h: string | undefined, d: string | undefined, n: string | undefined) => (h ? pointCode(parseInt(h, 16)) : d ? pointCode(Number(d)) : ENTITES[n!.toLowerCase()]));

/** Texte d'un word/document.xml : contenu des <w:t>, paragraphe = ligne vide, tabulation = espace, saut = ligne. Le
 * texte barré en suivi des modifications (<w:delText>) et les codes de champ (<w:instrText>) ne sont pas lus. */
export function texteDocx(xml: string): string {
  let out = "";
  for (const m of xml.matchAll(/<\/w:p>|<w:p\/>|<w:p\s[^>]*\/>|<w:tab\/>|<w:(?:br|cr)\b[^>]*\/>|<\/w:tc>|<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)) {
    const t = m[0];
    if (m[1] !== undefined) out += decoder(m[1]);
    else if (t.startsWith("</w:p") || t.startsWith("<w:p")) out += "\n\n";
    else if (t === "</w:tc>" || t === "<w:tab/>") out += " ";
    else out += "\n";
  }
  return out;
}

/** Texte d'un fichier envoyé, ou le motif du refus. Type vérifié par les premiers octets ET par l'extension ; fichier
 * borné à L.fichier octets, PDF à L.pages pages, XML d'un DOCX à L.xml octets, texte final à L.caracteres caractères. */
export async function extraire(nom: string, octets: Uint8Array): Promise<{ ok: true; v: Extrait } | { ok: false; erreur: RefusExtraction }> {
  if (!octets.length) return { ok: false, erreur: "vide" };
  if (octets.length > L.fichier) return { ok: false, erreur: "taille" };
  const attendu = genreAttendu(nom);
  const genre = genreDesOctets(octets);
  if (!attendu || attendu !== genre) return { ok: false, erreur: "signature" };
  let brut: string;
  let pages: number | null = null;
  if (genre === "pdf") {
    const p = await textePdf(octets);
    if (typeof p === "string") return { ok: false, erreur: p };
    brut = p.texte;
    pages = p.pages;
  } else if (genre === "docx") {
    const x = xmlDocx(octets);
    if (typeof x === "string") return { ok: false, erreur: x };
    try {
      brut = texteDocx(new TextDecoder("utf-8", { fatal: true }).decode(x));
    } catch {
      return { ok: false, erreur: "illisible" };
    }
  } else {
    try {
      brut = new TextDecoder("utf-8", { fatal: true }).decode(octets);
    } catch {
      return { ok: false, erreur: "encodage" };
    }
    if (brut.includes("\u0000")) return { ok: false, erreur: "signature" }; // binaire déguisé en texte
  }
  const texte = nettoyer(brut);
  if (!texte) return { ok: false, erreur: "vide" };
  if (texte.length > L.caracteres) return { ok: false, erreur: "long" };
  return { ok: true, v: { genre, texte, pages } };
}

/** Titre tiré d'un nom de fichier : sans dossier ni extension, tirets bas en espaces, 160 caractères au plus. */
export const titreDuFichier = (nom: string) =>
  nettoyer(nom.split(/[\\/]/).pop() ?? "").replace(/\.[a-z0-9]{1,8}$/i, "").replace(/[_\s]+/g, " ").trim().slice(0, L.titre) || "Document";

/** Nom de fichier gardé pour la liste (une ligne, sans dossier), 200 caractères au plus. */
export const nomDuFichier = (nom: string) => nettoyer(nom.split(/[\\/]/).pop() ?? "").replace(/\s+/g, " ").slice(0, 200) || "document";

// ---------- découpage ----------

export type Morceau = { titre: string; texte: string };

// séparateurs, du plus grand au plus fin : paragraphe, ligne, fin de phrase, mot
const NIVEAUX: [RegExp, string][] = [
  [/\n{2,}/, "\n\n"],
  [/\n/, "\n"],
  [/(?<=[.!?…;:])\s+/, " "],
  [/\s+/, " "],
];

function pieces(t: string, max: number, niveau = 0): string[] {
  if (t.length <= max) return [t];
  const n = NIVEAUX[niveau];
  if (!n) {
    const out: string[] = [];
    for (let i = 0; i < t.length; i += max) out.push(t.slice(i, i + max));
    return out;
  }
  const [sep, joint] = n;
  const out: string[] = [];
  let cur = "";
  for (const p of t.split(sep)) {
    if (!p) continue;
    for (const x of p.length > max ? pieces(p, max, niveau + 1) : [p]) {
      const essai = cur ? cur + joint + x : x;
      if (essai.length <= max) cur = essai;
      else {
        if (cur) out.push(cur);
        cur = x;
      }
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Morceaux d'environ `max` caractères (jamais plus), coupés aux paragraphes, puis aux lignes, aux phrases, aux mots ;
 * titrés « <titre> (n/N) » quand il y en a plusieurs. */
export function decouper(titre: string, texte: string, max: number = L.morceau): Morceau[] {
  const p = pieces(texte.trim(), max).map((x) => x.trim()).filter(Boolean);
  const t = titre.trim() || "Document";
  if (p.length === 1) return [{ titre: t.slice(0, L.titre), texte: p[0] }];
  return p.map((x, i) => {
    const suffixe = ` (${i + 1}/${p.length})`;
    return { titre: t.slice(0, L.titre - suffixe.length).trimEnd() + suffixe, texte: x };
  });
}

// ---------- contrôle de confidentialité ----------

export type GenreAlerte = "email" | "telephone" | "iban" | "carte" | "secret" | "cle";
export type Zone = { debut: number; fin: number; genre: GenreAlerte; texte: string };
export type Alerte = { genre: GenreAlerte; texte: string; confirmable: boolean };

// un e-mail, un téléphone ou un IBAN peut être public (ceux d'OHT) : l'admin le confirme ; un numéro de carte, un mot de
// passe ou une clé ne l'est jamais : il doit être retiré du texte
const CONFIRMABLE: Record<GenreAlerte, boolean> = { email: true, telephone: true, iban: true, carte: false, secret: false, cle: false };

const CLES = [
  /\bgsk_[A-Za-z0-9]{16,}/g, // Groq
  /\b(?:sk|pk|rk)_(?:live|test|sandbox)_[A-Za-z0-9]{10,}/g, // Stripe, FedaPay
  /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}/g, // OpenAI, Anthropic
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+)?/g, // jeton JWT
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, // GitHub
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, // Slack
  /\bAIza[0-9A-Za-z_-]{30,}/g, // Google
  /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{10,}/g, // Supabase
  /\bre_[A-Za-z0-9_]{20,}/g, // Resend
  /\bFLWSECK(?:_TEST)?-[A-Za-z0-9]{10,}(?:-X)?/g, // Flutterwave
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
];
const SECRET = /\b(?:mots? de passe|mot-de-passe|mdp|password|passwd|pwd|passcode|code secret|code pin|contraseña|senha|passwort|kennwort)\s*[:=]\s*\S+/giu;
const EMAIL = /[^\s@<>()[\]"',;:]+@[^\s@<>()[\]"',;:]+\.[a-z]{2,}/gi;
const IBAN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g;
// carte : 13 à 19 chiffres d'un bloc ou par groupes de 4 (American Express 4-6-5), jamais après « + » (téléphone)
const CARTE = /(?<![+\d])\b(?:\d{4}(?:[ -]?\d{4}){2,3}(?:[ -]?\d{1,3})?|\d{4}[ -]?\d{6}[ -]?\d{5})\b/g;
const NUMERO = /(?:\+|\b00)?\d[\d .()-]{6,}\d/g;
// pas un téléphone : années (« 1727-1892 »), dates (« 12.03.2026 »), montant suivi d'une devise
const ANNEES = /^\d{4}\s*[-–]\s*\d{4}$/;
const DATE = /^\d{1,2}[.-]\d{1,2}[.-]\d{2,4}$/;
const DEVISE = /^\s*(?:F\s?CFA|FCFA|CFA|XOF|€|EUR|euros?|USD|\$|francs?)/i;

const chiffres = (s: string) => s.replace(/\D/g, "");
function luhn(n: string) {
  let s = 0;
  for (let i = 0; i < n.length; i++) {
    let d = Number(n[n.length - 1 - i]);
    if (i % 2) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    s += d;
  }
  return s % 10 === 0;
}
function ibanValide(brut: string) {
  const i = brut.replace(/\s/g, "");
  if (i.length < 15 || i.length > 34) return false;
  const r = (i.slice(4) + i.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let m = 0;
  for (const c of r) m = (m * 10 + Number(c)) % 97;
  return m === 1;
}
const normale = (a: string) => a.toLowerCase().replace(/[.]+$/, "");

/** Passages sensibles d'un texte, sans chevauchement (clé et mot de passe d'abord, puis e-mail, IBAN, carte, téléphone).
 * Les adresses e-mail `publiques` d'OHT (EMAILS_PUBLICS de connaissance.ts, en minuscules) ne sont pas signalées. */
export function reperer(texte: string, publiques: readonly string[] = []): Zone[] {
  const zones: Zone[] = [];
  const libre = (d: number, f: number) => zones.every((z) => f <= z.debut || d >= z.fin);
  const ajouter = (re: RegExp, genre: GenreAlerte, garder: (m: string, fin: number) => boolean = () => true) => {
    for (const m of texte.matchAll(re)) {
      let t = m[0];
      if (genre === "email") t = t.replace(/[.]+$/, "");
      const d = m.index, f = d + t.length;
      if (t && libre(d, f) && garder(t, f)) zones.push({ debut: d, fin: f, genre, texte: t });
    }
  };
  for (const re of CLES) ajouter(re, "cle");
  ajouter(SECRET, "secret");
  ajouter(EMAIL, "email", (t) => !publiques.includes(normale(t)));
  ajouter(IBAN, "iban", ibanValide);
  ajouter(CARTE, "carte", (t) => {
    const c = chiffres(t);
    return c.length >= 13 && c.length <= 19 && luhn(c);
  });
  ajouter(NUMERO, "telephone", (t, f) => {
    const n = chiffres(t).length;
    return n >= 8 && n <= 15 && !ANNEES.test(t) && !DATE.test(t) && !DEVISE.test(texte.slice(f, f + 8));
  });
  return zones.sort((a, b) => a.debut - b.debut);
}

/** Passages sensibles distincts de plusieurs textes (ordre de première apparition). */
export function controler(textes: readonly string[], publiques: readonly string[] = []): Alerte[] {
  const vus = new Map<string, Alerte>();
  for (const t of textes) for (const z of reperer(t, publiques)) if (!vus.has(z.texte)) vus.set(z.texte, { genre: z.genre, texte: z.texte, confirmable: CONFIRMABLE[z.genre] });
  return [...vus.values()];
}

/** Alertes qui bloquent encore : jamais confirmables, ou confirmables mais pas confirmées (`confirmes` : passages exacts). */
export const bloquants = (alertes: readonly Alerte[], confirmes: readonly string[]) => alertes.filter((a) => !a.confirmable || !confirmes.includes(a.texte));

/** Texte découpé pour l'aperçu : morceaux de texte simple et passages sensibles (genre). */
export function surligner(texte: string, publiques: readonly string[] = []): { t: string; g: GenreAlerte | null }[] {
  const out: { t: string; g: GenreAlerte | null }[] = [];
  let i = 0;
  for (const z of reperer(texte, publiques)) {
    if (z.debut > i) out.push({ t: texte.slice(i, z.debut), g: null });
    out.push({ t: z.texte, g: z.genre });
    i = z.fin;
  }
  if (i < texte.length) out.push({ t: texte.slice(i), g: null });
  return out;
}

/** Toutes les occurrences d'un passage remplacées par [retiré]. */
export const retirerPassage = (texte: string, passage: string) => (passage ? texte.split(passage).join(RETIRE) : texte);

// ---------- questions sans réponse : anonymisées, puis normalisées ----------

const PRESENTATION = /(je m['’]appelle|moi c['’]est|mon nom (?:est|c['’]est)|my name is|i am called|me llamo|mi nombre es|ich hei(?:ß|ss)e|mein name ist|meu nome é|(?:eu )?me chamo|mwen rele|non mwen se)(\s+)((?:[^\s,.;:!?()"«»]+)(?:\s+[^\s,.;:!?()"«»]+){0,2})/giu;
const APRES_NOM = new Set("et and y und e i je j ich yo eu mwen an moi me et/ou mais but pero aber mas pou pour for para fur für de du des la le les a à au aux ce cette c je".split(" "));

/** Question d'un visiteur sans donnée personnelle : e-mails, IBAN, numéros longs (8 chiffres ou plus, téléphone compris),
 * mots de 6 chiffres ou plus (dossier, passeport), clés et mots de passe, et nom donné après « je m'appelle » (et ses
 * équivalents dans les langues du site) remplacés par [retiré]. */
export function anonymiser(t: string): string {
  let s = t
    .replace(PRESENTATION, (_, intro: string, esp: string, nom: string) => {
      const mots = nom.split(/\s+/);
      const k = mots.findIndex((m) => APRES_NOM.has(m.toLowerCase()));
      const garde = k < 0 ? [] : mots.slice(k);
      return k === 0 ? `${intro}${esp}${nom}` : `${intro}${esp}${RETIRE}${garde.length ? ` ${garde.join(" ")}` : ""}`;
    });
  for (const re of CLES) s = s.replace(re, RETIRE);
  s = s.replace(SECRET, RETIRE).replace(EMAIL, RETIRE).replace(IBAN, (x) => (ibanValide(x) ? RETIRE : x));
  s = s.replace(NUMERO, (x) => (chiffres(x).length >= 8 ? RETIRE : x));
  s = s.replace(/[\p{L}\d-]*\d{6,}[\p{L}\d-]*/gu, RETIRE);
  return s;
}

/** Forme comparée et gardée d'une question : une ligne, minuscules, sans ponctuation finale, L.question caractères au plus. */
export const normaliserQuestion = (t: string) =>
  [...nettoyer(t).replace(/\s+/g, " ").toLowerCase().replace(/^[\s¿¡\-–—.,;:!?…"«»]+|[\s.,;:!?…"«»]+$/g, "")].slice(0, L.question).join("").trim();
