import { LANGUES_MSG, LIMITES_COURRIEL, type LangueMsg, REPERES, type Variable, VARIABLES } from "@/content/espace-messages";

// Rendu des e-mails du lot « messages », partagé par l'aperçu (navigateur) et l'envoi (serveur) : le même texte dans les
// deux. Aucun secret, aucun accès à la base, aucune dépendance serveur : le navigateur peut embarquer ce fichier. Le
// serveur ne reçoit du navigateur que l'objet et le message tapés ; les valeurs des champs variables, il les relit lui-même.

export type Valeurs = Partial<Record<Variable, string>>;
/** Ce que le serveur sait d'un client pour remplir les champs variables (jamais saisi dans le navigateur). */
export type Faits = { prenom: string; sejour: { arrivee: string; depart: string } | null; reference: string | null; lien: string | null };

export const estLangue = (v: unknown): v is LangueMsg => typeof v === "string" && (LANGUES_MSG as readonly string[]).includes(v);
export const CLE = /^[a-z0-9][a-z0-9-]{1,39}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// dates écrites dans la langue de l'e-mail ; créoles : format français (même choix que la maquette E)
const LOC: Record<LangueMsg, string> = { FR: "fr-FR", EN: "en-GB", ES: "es-ES", DE: "de-DE", PT: "pt-PT", HT: "fr-FR", GCF: "fr-FR" };

export function datesEn(s: Faits["sejour"], langue: LangueMsg): string | null {
  if (!s) return null;
  const f = new Intl.DateTimeFormat(LOC[langue], { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const a = new Date(`${s.arrivee}T12:00:00Z`), b = new Date(`${s.depart}T12:00:00Z`);
  return s.arrivee === s.depart ? f.format(a) : f.formatRange(a, b);
}

export const valeursDe = (f: Faits, langue: LangueMsg): Valeurs => ({
  prenom: f.prenom || undefined,
  dates: datesEn(f.sejour, langue) ?? undefined,
  lien: f.lien ?? undefined,
  reference: f.reference ?? undefined,
});

// ---------- clés réservées aux e-mails automatiques du site (session oht-ce) ----------
/** Lues par les e-mails automatiques (repli sur leurs textes par défaut) ; jamais dans le composeur ni dans la liste des
 * modèles de l'équipe. Seul un admin les écrit, dans le groupe « E-mails automatiques ». */
export const AUTO_CLES = ["auto-billets", "auto-demande", "auto-devis-pret", "auto-boutique", "auto-lettre", "auto-code", "auto-relance"] as const;
export type CleAuto = (typeof AUTO_CLES)[number];
export const estAuto = (cle: string) => cle.startsWith("auto-");
export const autoConnue = (cle: string): cle is CleAuto => (AUTO_CLES as readonly string[]).includes(cle);
/** Champs variables que chaque e-mail automatique remplit (valeurs passées à `textes()` par son module d'envoi) : un
 * modèle qui en emploie un autre est refusé à l'enregistrement, au lieu de retomber sans bruit sur le texte par défaut. */
export const VARIABLES_AUTO: Record<CleAuto, readonly Variable[]> = {
  "auto-billets": ["prenom", "dates", "lien", "reference"],
  "auto-demande": ["prenom", "dates", "lien", "reference"],
  "auto-devis-pret": ["prenom", "dates", "lien", "reference"],
  "auto-boutique": ["prenom", "lien", "reference"],
  "auto-lettre": ["lien"],
  "auto-code": ["prenom"],
  "auto-relance": ["prenom", "lien", "reference"],
};
/** Jetons « {…} » qui ne sont pas l'un des quatre champs variables (refusés dans un e-mail automatique). */
export const jetonsInconnus = (t: string) => [...new Set((t.match(/\{[^{}\n]{0,40}\}/g) ?? []).filter((j) => !(Object.values(VARIABLES) as string[]).includes(j)))];
/** Champs variables employés dans le texte que cet e-mail automatique ne remplit pas (refusés). */
export const variablesHors = (cle: CleAuto, t: string) => (Object.entries(VARIABLES) as [Variable, string][]).filter(([k, j]) => t.includes(j) && !VARIABLES_AUTO[cle].includes(k)).map(([k]) => k);
/** Champs variables connus (parmi `parmi`) absents du texte (avertissement, jamais bloquant). */
export const variablesAbsentes = (t: string, parmi: readonly Variable[] = Object.keys(VARIABLES) as Variable[]) => parmi.filter((k) => !t.includes(VARIABLES[k]));

/** Valeurs de l'aperçu d'un modèle et de son test à soi-même : le prénom de l'admin connecté (il reçoit le test), les
 * autres champs en repères traduits (REPERES). Jamais les données d'un client, jamais une donnée inventée. */
export const valeursApercu = (prenom: string, langue: LangueMsg): Valeurs => ({ prenom, ...REPERES[langue] });

// adresse saisie à la main : partie locale (caractères permis par la RFC 5322, sans guillemets ni espaces, points
// isolés), domaine en labels DNS et extension alphabétique ; comparée en minuscules
const ADRESSE = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
/** Adresses saisies à la main (séparées par une virgule ou un point-virgule), en minuscules, sans doublon ; null si l'une
 * n'est pas valable, s'il n'y en a aucune ou s'il y en a plus de `max`. */
export function lireAdresses(v: unknown, max: number): string[] | null {
  if (typeof v !== "string" || v.length > 260 * max) return null;
  const l = [...new Set(v.split(/[,;]/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
  return l.length && l.length <= max && l.every((a) => a.length <= 254 && a.indexOf("@") <= 64 && ADRESSE.test(a)) ? l : null;
}

/** Texte une fois les champs variables remplacés, et les champs employés sans valeur (laissés tels quels). */
export function remplir(texte: string, v: Valeurs): { texte: string; manque: Variable[] } {
  const manque: Variable[] = [];
  let t = texte;
  for (const [k, jeton] of Object.entries(VARIABLES) as [Variable, string][]) {
    if (!t.includes(jeton)) continue;
    const val = v[k];
    if (val) t = t.replaceAll(jeton, val);
    else manque.push(k);
  }
  return { texte: t, manque };
}

/** Texte sur une ligne (objet) : caractères de contrôle retirés, espaces ramenées à une. */
export const uneLigne = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "");
/** Texte sur plusieurs lignes (message) : retours unifiés, autres caractères de contrôle retirés. */
export const plusieursLignes = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim() : "");
export const paragraphes = (t: string) => t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

/** Objet et message saisis relus selon les limites ; « objet » et « corps » en champs refusés. */
export function lireTexte(objet: unknown, corps: unknown, objetRequis: boolean) {
  const o = uneLigne(objet), c = plusieursLignes(corps);
  const champs: ("objet" | "corps")[] = [];
  if ((objetRequis && !o) || o.length > LIMITES_COURRIEL.objet) champs.push("objet");
  if (typeof corps !== "string" || c.length > LIMITES_COURRIEL.corps) champs.push("corps");
  return { objet: o, corps: c, champs };
}

/** Adresse masquée pour la page publique (« a***@exemple.com »). */
export const masquer = (email: string) => email.replace(/^(.)[^@]*(@.*)$/, "$1***$2");
