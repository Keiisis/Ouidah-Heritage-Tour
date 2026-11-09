// Règles du lot « securite » (vague 2), relues par les actions serveur (actions.ts) et les routes d'export, qui seules
// décident : tout ce qui arrive du navigateur passe ici. Aucun secret, aucun accès à la base, aucun import à l'exécution :
// le navigateur peut embarquer ce fichier (limites des champs).

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const JOUR = 86_400_000;
const DECALAGE_OUIDAH = 3_600_000; // UTC+1 toute l'année
const EMPREINTE = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// adresse simple : sans espace, un seul @, pas de caractère joker de PostgREST (* %) ni de guillemet
const EMAIL = /^[^\s@*%"\\(),]+@[^\s@*%"\\(),]+\.[^\s@*%"\\(),]{2,}$/;

type Lu<V> = { ok: true; v: V } | { ok: false; champs: string[] };
export const champsDe = (brut: unknown): Record<string, unknown> => {
  if (typeof FormData !== "undefined" && brut instanceof FormData) return Object.fromEntries(brut.entries());
  return brut && typeof brut === "object" && !Array.isArray(brut) ? (brut as Record<string, unknown>) : {};
};
const ligne = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
const texte = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim() : "");

/** Empreinte réduite à 8 caractères, pour l'écran (jamais l'adresse elle-même, que personne ne garde). */
export const masque = (h: string | null) => (h ? `#${h.slice(0, 8)}` : "–");

// ---------- dates à Ouidah ----------
export const jourDuIso = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / JOUR);
export const minuit = (jour: number) => new Date(jour * JOUR - DECALAGE_OUIDAH).toISOString();
export const aujourdhui = (ms: number) => new Date(ms + DECALAGE_OUIDAH).toISOString().slice(0, 10);
const dateValide = (d: unknown): d is string => typeof d === "string" && DATE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

// ---------- blocage d'une adresse ----------
export const DUREES = { "1h": 3_600_000, "24h": JOUR, "7j": 7 * JOUR, "30j": 30 * JOUR, sans_fin: null } as const;
export type Duree = keyof typeof DUREES;
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^(?=.*:.*:)[0-9a-f:.]{2,45}$/;

/** Blocage : une empreinte relevée à l'écran OU une adresse saisie (transformée en empreinte par le serveur). */
export function lireBlocage(brut: unknown): Lu<{ empreinte: string | null; ip: string | null; motif: string; duree: Duree }> {
  const o = champsDe(brut);
  const empreinte = ligne(o.empreinte).toLowerCase();
  const ip = ligne(o.ip).toLowerCase();
  const motif = ligne(o.motif);
  const champs: string[] = [];
  if (empreinte ? !EMPREINTE.test(empreinte) || ip : !IPV4.test(ip) && !IPV6.test(ip)) champs.push(empreinte ? "empreinte" : "ip");
  if (motif.length < 3 || motif.length > 200) champs.push("motif");
  if (typeof o.duree !== "string" || !Object.hasOwn(DUREES, o.duree)) champs.push("duree");
  return champs.length ? { ok: false, champs } : { ok: true, v: { empreinte: empreinte || null, ip: empreinte ? null : ip, motif, duree: o.duree as Duree } };
}

// ---------- droits d'un agent ----------
const NOMS_DROITS = ["demandes", "liens", "billets", "boutique", "site"] as const; // partage.ts › DROITS
/** Les 5 droits, chacun vrai ou faux (cases cochées d'un formulaire, ou objet { droit: booléen }). */
export function lireDroits(brut: unknown): Lu<Record<(typeof NOMS_DROITS)[number], boolean>> {
  if (typeof FormData !== "undefined" && brut instanceof FormData) {
    const coches = brut.getAll("droits");
    if (coches.some((c) => typeof c !== "string" || !(NOMS_DROITS as readonly string[]).includes(c))) return { ok: false, champs: ["droits"] };
    return { ok: true, v: Object.fromEntries(NOMS_DROITS.map((k) => [k, coches.includes(k)])) as Record<(typeof NOMS_DROITS)[number], boolean> };
  }
  const o = champsDe(brut);
  const cles = Object.keys(o);
  if (cles.length !== NOMS_DROITS.length || !NOMS_DROITS.every((k) => typeof o[k] === "boolean")) return { ok: false, champs: ["droits"] };
  return { ok: true, v: Object.fromEntries(NOMS_DROITS.map((k) => [k, o[k] as boolean])) as Record<(typeof NOMS_DROITS)[number], boolean> };
}

// ---------- registre des traitements ----------
export const BASES = ["consentement", "contrat", "obligation_legale", "interet_legitime", "mission_publique", "interets_vitaux"] as const;
// [champ du formulaire, colonne, longueur min, max] (mêmes bornes que la migration 20261103_securite.sql)
export const CHAMPS_REGISTRE: [string, string, number, number][] = [
  ["nom", "nom", 3, 140],
  ["finalite", "finalite", 3, 1000],
  ["personnes", "personnes", 3, 500],
  ["donnees", "donnees", 3, 1000],
  ["destinataires", "destinataires", 3, 1000],
  ["transferts", "transferts", 0, 500],
  ["duree_conservation", "duree", 2, 300],
  ["mesures", "mesures", 0, 1000],
];
export type Traitement = { nom: string; finalite: string; base_legale: string; personnes: string; donnees: string; destinataires: string; transferts: string | null; duree: string; mesures: string | null };

export function lireTraitement(brut: unknown): Lu<Traitement> {
  const o = champsDe(brut);
  const champs: string[] = [];
  const v: Record<string, string | null> = {};
  for (const [champ, col, min, max] of CHAMPS_REGISTRE) {
    const t = texte(o[champ]);
    if (t.length < min || t.length > max || (min > 0 && !t)) champs.push(champ);
    v[col] = t || null;
  }
  if (!(BASES as readonly string[]).includes(o.base_legale as string)) champs.push("base_legale");
  return champs.length ? { ok: false, champs } : { ok: true, v: { ...(v as Omit<Traitement, "base_legale">), base_legale: o.base_legale as string } };
}

// ---------- incidents ----------
export type Incident = { decouvert_le: string; nature: string; donnees: string; personnes: string | null; mesures: string | null };
/** Date et heure de découverte (heure de Ouidah, « AAAA-MM-JJTHH:MM »), jamais dans le futur ni plus d'un an avant. */
export function lireIncident(brut: unknown, ms: number): Lu<Incident> {
  const o = champsDe(brut);
  const champs: string[] = [];
  const quand = ligne(o.decouvert_le);
  const t = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(quand) ? Date.parse(`${quand}:00Z`) - DECALAGE_OUIDAH : NaN;
  if (!Number.isFinite(t) || t > ms + 60_000 || t < ms - 366 * JOUR) champs.push("decouvert_le");
  const nature = texte(o.nature), donnees = texte(o.donnees_incident), personnes = ligne(o.personnes_incident), mesures = texte(o.mesures_incident);
  if (nature.length < 3 || nature.length > 2000) champs.push("nature");
  if (donnees.length < 3 || donnees.length > 1000) champs.push("donnees_incident");
  if (personnes.length > 300) champs.push("personnes_incident");
  if (mesures.length > 2000) champs.push("mesures_incident");
  return champs.length ? { ok: false, champs } : { ok: true, v: { decouvert_le: new Date(t).toISOString(), nature, donnees, personnes: personnes || null, mesures: mesures || null } };
}
export const SUIVIS = { apdp: "apdp_le", informees: "informees_le", clos: "clos_le" } as const;

// ---------- demandes d'une personne ----------
/** Adresse e-mail (en minuscules) et date de réception de la demande (aujourd'hui par défaut, jamais dans le futur). */
export function lirePersonne(brut: unknown, ms: number): Lu<{ email: string; recue: string; confirmation: string }> {
  const o = champsDe(brut);
  const email = ligne(o.email).toLowerCase();
  const recue = ligne(o.recue_le) || aujourdhui(ms);
  const champs: string[] = [];
  if (email.length > 254 || !EMAIL.test(email)) champs.push("email");
  if (!dateValide(recue) || recue > aujourdhui(ms) || jourDuIso(recue) < jourDuIso(aujourdhui(ms)) - 366) champs.push("recue_le");
  return champs.length ? { ok: false, champs } : { ok: true, v: { email, recue, confirmation: ligne(o.confirmation).toLowerCase() } };
}
/** Motif LIKE échappé (\, %, _) : l'adresse est comparée telle quelle, sans tenir compte de la casse. */
export const exact = (v: string) => encodeURIComponent(v.replace(/[\\%_]/g, (c) => `\\${c}`));

// ---------- journal ----------
export type Filtres = { auteur: string; action: string; du: string; au: string };
/** Filtres du journal lus dans l'adresse ; une valeur mal formée est ignorée (comme absente). */
export function lireFiltres(p: Record<string, string | string[] | undefined> | URLSearchParams): Filtres {
  const v = (k: string) => {
    const x = p instanceof URLSearchParams ? p.get(k) : p[k];
    return typeof x === "string" ? x : "";
  };
  const auteur = UUID.test(v("auteur")) ? v("auteur") : "";
  const action = /^[fa]:[a-z_.]{1,60}$/.test(v("action")) ? v("action") : "";
  const du = dateValide(v("du")) ? v("du") : "";
  const au = dateValide(v("au")) ? v("au") : "";
  return { auteur, action, du, au };
}
/** Filtres PostgREST du journal (familles : [identifiant, libellé, préfixes]). */
export function requeteJournal(f: Filtres, familles: [string, string, string[]][]) {
  const q: string[] = [];
  if (f.auteur) q.push(`profil_id=eq.${f.auteur}`);
  if (f.action.startsWith("a:")) q.push(`action=eq.${f.action.slice(2)}`);
  else if (f.action.startsWith("f:")) {
    const fam = familles.find(([id]) => id === f.action.slice(2));
    if (fam) q.push(`or=(${fam[2].flatMap((p) => [`action.eq.${p}`, `action.like.${p}.*`]).join(",")})`);
  }
  if (f.du) q.push(`cree_le=gte.${encodeURIComponent(minuit(jourDuIso(f.du)))}`);
  if (f.au) q.push(`cree_le=lt.${encodeURIComponent(minuit(jourDuIso(f.au) + 1))}`);
  return q.join("&");
}
export const adresseFiltres = (f: Filtres) => new URLSearchParams(Object.entries(f).filter(([, x]) => x)).toString();

// ---------- sauvegardes ----------
// tables exportables et leur ordre stable (pagination) ; les tables de connexion (sessions, codes, essais) n'y sont pas
export const TABLES: Record<string, string> = {
  demandes: "cree_le,id", clients: "cree_le,id", dossier_moments: "cree_le,id", devis: "cree_le,id", factures: "cree_le,id", avoirs: "cree_le,id",
  liens_paiement: "cree_le,id", paiements_manuels: "cree_le,id", depenses: "cree_le,id", finances_justificatifs: "cree_le,id", finances_clotures: "mois",
  grille_tarifaire: "cree_le,id", reglages_paiement: "id", passerelles_paiement: "nom", reservations: "cree_le,id", billets_entrees: "id",
  boutique_commandes: "cree_le,id", boutique_produits: "cree_le,id", boutique_categories: "slug", boutique_matieres: "slug",
  abonnes_lettre: "cree_le,id", lettre_numeros: "cree_le,id", lettre_envois: "id", courriels_envoyes: "cree_le,id", modeles_courriels: "cree_le,id",
  notifications: "cree_le,id", documents: "cree_le,id", equipe_profils: "cree_le,id", equipe_journal: "id",
  ip_bloquees: "cree_le,id", registre_traitements: "cree_le,id", donnees_demandes: "cree_le,id", donnees_incidents: "cree_le,id",
  // lots « pilotage » et « reglages » (vague 2)
  equipe_documents: "cree_le,id", pistes_suivi: "demande_id", wiki_pages: "cree_le,id", reglages_documents: "id", reglages_maintenance: "id", reglages_site: "id",
};
export const FORMATS = ["json", "csv"] as const;
/** Colonne jamais exportée : mot de passe, code, jeton, empreinte, sel, clé, contenu binaire d'un justificatif. */
export const SENSIBLE = /(hash|hmac|empreinte|jeton|token|secret|sel$|mot_de_passe|mdp|password|^cle$|sha256|contenu)/;
export const sansSensible = (l: Record<string, unknown>) => Object.fromEntries(Object.entries(l).filter(([k]) => !SENSIBLE.test(k)));
