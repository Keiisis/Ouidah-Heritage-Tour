import { LANGUES_REGLAGES } from "@/content/espace-reglages";
import { champsDe, typeJustificatif } from "../finances/regles";
import { LANGUES, type Langue } from "../partage";

// Règles du lot « reglages », relues par le serveur à chaque action (mêmes bornes que la migration 20261103_reglages.sql).
// Fonctions pures : elles ne lisent que ce que le formulaire envoie et rendent les valeurs normalisées, ou la liste des
// champs refusés. Aucune clé ni aucun mot de passe n'est gardé ici.

export type Lu<T> = { ok: true; v: T } | { ok: false; champs: string[] };
export type Textes = Partial<Record<Langue, string>>;
export const IMAGE_MAX = 300_000;
export const MDP_MIN = 12;
export const THEMES = ["auto", "clair", "sombre"] as const;
export type ThemeProfil = (typeof THEMES)[number];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TELEPHONE = /^\+?[0-9][0-9 ().-]{5,31}$/;
const texte = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
// texte sur plusieurs lignes : espaces de chaque ligne resserrés, au plus deux sauts de ligne de suite
const bloc = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim().replace(/\s+/g, " ")).join("\n").replace(/\n{3,}/g, "\n\n").trim() : "");
const dans = <T extends string>(liste: readonly T[], v: unknown): v is T => typeof v === "string" && (liste as readonly string[]).includes(v);
/** Champ facultatif : null s'il est vide, la valeur si elle tient dans [1, max], sinon refusé (undefined). */
const facultatif = (v: string, max: number) => (!v ? null : v.length <= max ? v : undefined);

/** Textes par langue d'un formulaire (`<prefixe>_<LANGUE>`), vides retirés ; refusé si une langue dépasse `max`. */
function parLangue(o: Record<string, unknown>, prefixe: string, max: number): Textes | null {
  const t: Textes = {};
  for (const l of LANGUES_REGLAGES) {
    const v = bloc(o[`${prefixe}_${l}`]);
    if (v.length > max) return null;
    if (v) t[l] = v;
  }
  return t;
}

/** Fichier d'image envoyé (signature, cachet) : PNG, JPEG ou WebP lus dans les octets, 300 Ko au plus. */
export async function lireImage(f: unknown): Promise<{ octets: Uint8Array; type: string } | "aucune" | "invalide"> {
  if (typeof File === "undefined" || !(f instanceof File) || f.size === 0) return "aucune";
  if (f.size > IMAGE_MAX) return "invalide";
  const octets = new Uint8Array(await f.arrayBuffer());
  const type = typeJustificatif(octets);
  return type && type !== "application/pdf" ? { octets, type } : "invalide";
}

// ---------- mentions des documents ----------

export type Mentions = {
  raison_sociale: string | null;
  forme: string | null;
  adresse: string | null;
  ifu: string | null;
  rccm: string | null;
  telephone: string | null;
  email: string | null;
  pied: Textes;
  mentions: Textes;
  signataire: string | null;
  fonction: string | null;
};

export function lireMentions(brut: unknown): Lu<Mentions> & { retirer?: { signature: boolean; cachet: boolean } } {
  const o = champsDe(brut);
  const champs: string[] = [];
  const v = (cle: string, max: number) => {
    const x = facultatif(texte(o[cle]), max);
    if (x === undefined) champs.push(cle);
    return x ?? null;
  };
  const raison_sociale = v("raison_sociale", 120), forme = v("forme", 80), adresse = v("adresse", 200), rccm = v("rccm", 120), signataire = v("signataire", 80), fonction = v("fonction", 80);
  const ifu = texte(o.ifu).replace(/\s/g, "");
  if (ifu && !/^[0-9]{13}$/.test(ifu)) champs.push("ifu");
  const telephone = facultatif(texte(o.telephone), 80);
  if (telephone === undefined) champs.push("telephone_doc");
  const email = texte(o.email).toLowerCase();
  if (email && (email.length > 254 || !EMAIL.test(email))) champs.push("email");
  const pied = parLangue(o, "pied", 400), mentions = parLangue(o, "mentions", 600);
  if (!pied) champs.push("pied");
  if (!mentions) champs.push("mentions");
  if (champs.length) return { ok: false, champs };
  return {
    ok: true,
    v: { raison_sociale, forme, adresse, ifu: ifu || null, rccm, telephone: telephone ?? null, email: email || null, pied: pied ?? {}, mentions: mentions ?? {}, signataire, fonction },
    retirer: { signature: o.retirer_signature === "oui", cachet: o.retirer_cachet === "oui" },
  };
}

// ---------- dollar d'affichage ----------

/** Taux d'affichage du dollar (FCFA pour 1 $), saisi « 605,25 » ou « 605.25 » ; vide = USD masqué sur le site (null).
 * Bornes larges (100 à 5 000) contre une faute de frappe, 3 décimales au plus. */
export function lireTauxUsd(brut: unknown): Lu<number | null> {
  const t = texte(champsDe(brut).taux_usd).replace(/\s/g, "").replace(",", ".");
  if (!t) return { ok: true, v: null };
  if (!/^\d{1,4}(?:\.\d{1,3})?$/.test(t)) return { ok: false, champs: ["taux_usd"] };
  const n = Number(t);
  return n >= 100 && n <= 5000 ? { ok: true, v: n } : { ok: false, champs: ["taux_usd"] };
}

// ---------- mode économie (migration 20261105_mode_eco.sql) ----------

export const MODES_ECO = ["auto", "marche", "arret"] as const;
/** Mode choisi et plafond de pages vues par mois (vide : null, jamais d'allumage automatique ; 1 à 100 000 000). */
export function lireModeEco(brut: unknown): Lu<{ mode: (typeof MODES_ECO)[number]; plafond: number | null }> {
  const c = champsDe(brut);
  const t = texte(c.plafond).replace(/[\s.]/g, "");
  const champs = [...(dans(MODES_ECO, c.mode) ? [] : ["mode"]), ...(!t || (/^\d{1,9}$/.test(t) && Number(t) >= 1 && Number(t) <= 100_000_000) ? [] : ["plafond"])];
  return champs.length || !dans(MODES_ECO, c.mode) ? { ok: false, champs } : { ok: true, v: { mode: c.mode, plafond: t ? Number(t) : null } };
}

// ---------- e-MECeF, maintenance ----------

export function lireNim(brut: unknown): Lu<string | null> {
  const nim = texte(champsDe(brut).nim).toUpperCase();
  return !nim ? { ok: true, v: null } : /^[A-Z0-9-]{4,40}$/.test(nim) ? { ok: true, v: nim } : { ok: false, champs: ["nim"] };
}

/** Interrupteur et message de maintenance ; « message_FR » refusé seul = activation sans message en français. */
export function lireMaintenance(brut: unknown): Lu<{ actif: boolean; message: Textes }> {
  const o = champsDe(brut);
  const message = parLangue(o, "message", 500);
  if (!message) return { ok: false, champs: ["message"] };
  const actif = o.actif === "oui";
  if (actif && !message.FR) return { ok: false, champs: ["message_FR"] };
  return { ok: true, v: { actif, message } };
}

// ---------- profil ----------

export type Profil = { prenom: string; nom: string; telephone: string | null; langues: Langue[]; theme: ThemeProfil };

/** Coordonnées du profil : la langue des e-mails d'abord (`langue`), puis les autres langues cochées (`autres`). */
export function lireProfil(brut: unknown): Lu<Profil> {
  const o = champsDe(brut);
  const autres = typeof FormData !== "undefined" && brut instanceof FormData ? brut.getAll("autres") : Array.isArray(o.autres) ? o.autres : [];
  const champs: string[] = [];
  const prenom = texte(o.prenom), nom = texte(o.nom), telephone = texte(o.telephone);
  if (!prenom || prenom.length > 80) champs.push("prenom");
  if (!nom || nom.length > 80) champs.push("nom");
  if (telephone && !TELEPHONE.test(telephone)) champs.push("telephone");
  const premiere = o.langue;
  if (!dans(LANGUES, premiere) || !autres.every((l) => dans(LANGUES, l))) champs.push("langues");
  if (!dans(THEMES, o.theme)) champs.push("theme");
  if (champs.length) return { ok: false, champs };
  const langues = [...new Set([premiere as Langue, ...(autres as Langue[])])];
  return { ok: true, v: { prenom, nom, telephone: telephone || null, langues, theme: o.theme as ThemeProfil } };
}

/** Changement de mot de passe : mêmes exigences que la connexion (12 caractères au moins, différent de l'adresse et de sa
 * partie avant « @ »), différent de l'actuel, confirmation identique. Aucun mot de passe n'est renvoyé ni gardé. */
export function lireMotDePasse(brut: unknown, email: string): Lu<{ ancien: string; nouveau: string }> {
  const o = champsDe(brut);
  const ancien = typeof o.ancien === "string" ? o.ancien : "";
  const nouveau = typeof o.nouveau === "string" ? o.nouveau : "";
  const confirmation = typeof o.confirmation === "string" ? o.confirmation : "";
  const champs: string[] = [];
  if (!ancien || ancien.length > 200) champs.push("ancien");
  const bas = nouveau.toLowerCase();
  if (nouveau.length < MDP_MIN || nouveau.length > 200 || bas === email || bas.includes(email.split("@")[0]) || nouveau === ancien) champs.push("nouveau");
  if (confirmation !== nouveau) champs.push("confirmation");
  return champs.length ? { ok: false, champs } : { ok: true, v: { ancien, nouveau } };
}

/** Fiche contact vCard 3.0 (RFC 2426) de la carte de visite : seulement ce que le profil contient, rien d'inventé.
 * Échappement des valeurs : barre oblique inverse, virgule, point-virgule, saut de ligne ; lignes en CRLF. */
export function vcard(c: { prenom: string; nom: string; organisation: string; titre: string; telephone: string | null; email: string; langues: string }) {
  const e = (s: string) => s.replace(/[\\,;]/g, (x) => `\\${x}`).replace(/\r?\n/g, "\\n");
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${e(c.nom)};${e(c.prenom)};;;`,
    `FN:${e(`${c.prenom} ${c.nom}`)}`,
    `ORG:${e(c.organisation)}`,
    `TITLE:${e(c.titre)}`,
    ...(c.telephone ? [`TEL;TYPE=CELL:${e(c.telephone)}`] : []),
    `EMAIL;TYPE=INTERNET,WORK:${e(c.email)}`,
    ...(c.langues ? [`NOTE:${e(c.langues)}`] : []),
    "END:VCARD",
    "",
  ].join("\r\n");
}

/** Octets en littéral bytea de PostgREST (« \x… »), et l'inverse (lecture). */
export const versBytea = (o: Uint8Array) => `\\x${Buffer.from(o).toString("hex")}`;
export const depuisBytea = (x: unknown) => (typeof x === "string" && x.startsWith("\\x") ? Buffer.from(x.slice(2), "hex") : null);
