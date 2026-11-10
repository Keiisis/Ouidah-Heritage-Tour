import { LIMITES_DEVIS } from "@/content/documents";

// Règles des dossiers voyage (lot L4), partagées par l'écran (compteurs et refus pendant la saisie) et par les actions
// serveur (dossiers-actions.ts), qui seules décident : tout ce qui arrive du navigateur est relu ici. Aucun secret, aucun
// accès à la base : le navigateur peut embarquer ce fichier. Heures à Ouidah : UTC+1 toute l'année.

export const ETAPES = ["nouvelle", "devis_envoye", "payee", "en_voyage", "terminee", "perdue"] as const;
export type Etape = (typeof ETAPES)[number];
/** Étapes posées à la main. « Devis envoyé » vient de l'envoi du devis, « Payée » du paiement (jamais à la main). */
export const ETAPES_MANUELLES: readonly Etape[] = ["nouvelle", "en_voyage", "terminee", "perdue"];

export const TYPES_MOMENT = ["visite", "depart", "rdv", "appel", "retrait"] as const;
export type TypeMoment = (typeof TYPES_MOMENT)[number];
/** Une visite ou un départ passe sous l'horizon à sa fin ; un appel, un rendez-vous ou un retrait attend d'être clos. */
export const CLOS_A_LA_FIN: readonly TypeMoment[] = ["visite", "depart"];
export const LIMITES_MOMENT = { note: 280, retours: 3, dureeMin: 5, dureeMax: 720 } as const;
export const LIMITES_NOTE = 2000;
export const MONTANT_MAX = 2_147_483_647; // colonne devis.montant (entier 32 bits)

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HEURE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MIN = 60_000;
const DECALAGE = 60 * MIN; // Ouidah, UTC+1

const dans = <T extends string>(liste: readonly T[], v: unknown): v is T => typeof v === "string" && (liste as readonly string[]).includes(v);
const objet = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
/** Texte sur une ligne : caractères de contrôle retirés, espaces et retours ramenés à une espace. */
export const uneLigne = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "");
/** Texte sur plusieurs lignes : retours unifiés, autres caractères de contrôle retirés. */
export const plusieursLignes = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim() : "");
export const retours = (s: string) => (s.match(/\n/g) ?? []).length;

/** « 2026-11-02 » + « 09:30 » à Ouidah → instant (ms), ou null. */
export function instantOuidah(date: unknown, heure: unknown): number | null {
  const d = typeof date === "string" ? DATE.exec(date) : null;
  const h = typeof heure === "string" ? HEURE.exec(heure) : null;
  if (!d || !h) return null;
  const [y, m, j] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const t = Date.UTC(y, m - 1, j, Number(h[1]), Number(h[2]));
  const v = new Date(t);
  return v.getUTCFullYear() === y && v.getUTCMonth() === m - 1 && v.getUTCDate() === j ? t - DECALAGE : null;
}
/** Instant → { date: « 2026-11-02 », heure: « 09:30 » } à Ouidah. */
export function enOuidah(ms: number) {
  const s = new Date(ms + DECALAGE).toISOString();
  return { date: s.slice(0, 10), heure: s.slice(11, 16) };
}

// ---------- devis ----------

export type LigneSaisie = { libelle: string; quantite: number; prix_unitaire: number };
export type DevisSaisi = { lignes: LigneSaisie[]; note: string | null; valable: string | null };
/** Champs refusés : « lignes » (aucune ou trop), « libelle:3 », « quantite:3 », « prix:3 », « note », « retours »,
 * « valable », « total » (somme hors de la colonne). */
export type LectureDevis = { ok: true; v: DevisSaisi; montant: number } | { ok: false; champs: string[] };

const entier = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && /^\d{1,12}$/.test(v.trim()) ? Number(v) : NaN);

/** Somme des lignes : le seul montant d'un devis (jamais d'acompte, jamais de montant libre). */
export const totalDevis = (lignes: { quantite: number; prix_unitaire: number }[]) => lignes.reduce((t, l) => t + l.quantite * l.prix_unitaire, 0);

/** Première ligne du devis d'un dossier avec circuit : le prix par personne saisi dans la fiche du circuit (contenu
 * publié, FCFA), une par voyageur. Aucun prix saisi : null (rien d'inventé, la ligne reste à remplir). */
export function ligneCircuit(c: { title: string; price: number | null } | null | undefined, voyageurs: number) {
  if (!c || c.price === null) return null;
  return { libelle: c.title.slice(0, LIMITES_DEVIS.libelle), quantite: Math.min(Math.max(1, voyageurs), LIMITES_DEVIS.quantite), prix_unitaire: c.price };
}

/**
 * Devis saisi relu selon LIMITES_DEVIS (content/documents.ts). Seuls libellé, quantité et prix unitaire de chaque ligne
 * sont gardés : tout autre champ (total, acompte…) est ignoré, et le montant est recalculé ici. `aujourdhui` : date du
 * jour à Ouidah (AAAA-MM-JJ), pour la date de validité. `vide` : un brouillon peut n'avoir aucune ligne, pas un devis prêt.
 */
export function lireDevis(brut: unknown, aujourdhui: string, vide = true): LectureDevis {
  const o = objet(brut);
  const champs: string[] = [];
  const entree = Array.isArray(o.lignes) ? o.lignes : null;
  if (!entree || entree.length > LIMITES_DEVIS.lignes || (!vide && entree.length === 0)) champs.push("lignes");
  const lignes: LigneSaisie[] = [];
  (entree ?? []).slice(0, LIMITES_DEVIS.lignes).forEach((x, i) => {
    const l = objet(x);
    const libelle = uneLigne(l.libelle);
    const quantite = entier(l.quantite);
    const prix = entier(l.prix_unitaire);
    if (!libelle || libelle.length > LIMITES_DEVIS.libelle) champs.push(`libelle:${i}`);
    if (!Number.isInteger(quantite) || quantite < 1 || quantite > LIMITES_DEVIS.quantite) champs.push(`quantite:${i}`);
    if (!Number.isInteger(prix) || prix < 0 || prix > LIMITES_DEVIS.prixUnitaire) champs.push(`prix:${i}`);
    lignes.push({ libelle, quantite, prix_unitaire: prix });
  });
  const note = plusieursLignes(o.note);
  if (note.length > LIMITES_DEVIS.note) champs.push("note");
  if (retours(note) > LIMITES_DEVIS.retours) champs.push("retours");
  const valable = typeof o.valable === "string" && o.valable ? o.valable : null;
  if (valable !== null && (!instantOuidah(valable, "12:00") || valable < aujourdhui)) champs.push("valable");
  if (champs.length) return { ok: false, champs };
  const montant = totalDevis(lignes);
  if (montant > MONTANT_MAX) return { ok: false, champs: ["total"] };
  return { ok: true, v: { lignes, note: note || null, valable }, montant };
}

// ---------- moments ----------

export type MomentSaisi = { debut: number; fin: number; type: TypeMoment; lieu: string | null; note: string | null };
export type ChampMoment = "date" | "heure" | "duree" | "type" | "lieu" | "note";

/** Moment saisi (date et heure à Ouidah, durée en minutes) relu. `lieux` : identifiants connus du contenu. */
export function lireMoment(brut: unknown, lieux: ReadonlySet<string>): { ok: true; v: MomentSaisi } | { ok: false; champs: ChampMoment[] } {
  const o = objet(brut);
  const champs: ChampMoment[] = [];
  const date = typeof o.date === "string" ? o.date : "";
  const debut = instantOuidah(date, o.heure);
  if (instantOuidah(date, "12:00") === null) champs.push("date");
  else if (debut === null) champs.push("heure");
  const duree = entier(o.duree);
  if (!Number.isInteger(duree) || duree < LIMITES_MOMENT.dureeMin || duree > LIMITES_MOMENT.dureeMax) champs.push("duree");
  if (!dans(TYPES_MOMENT, o.type)) champs.push("type");
  const lieu = typeof o.lieu === "string" && o.lieu ? o.lieu : null;
  if (lieu !== null && !lieux.has(lieu)) champs.push("lieu");
  const note = plusieursLignes(o.note);
  if (note.length > LIMITES_MOMENT.note || retours(note) > LIMITES_MOMENT.retours) champs.push("note");
  if (champs.length || debut === null) return { ok: false, champs };
  return { ok: true, v: { debut, fin: debut + duree * MIN, type: o.type as TypeMoment, lieu, note: note || null } };
}

/** Où se pose un moment à l'instant `maintenant` : sur l'arc (à venir, en cours), sous l'horizon (fait) ou « À clore »
 * (passé, pas encore traité). */
export type EtatMoment = "avenir" | "encours" | "fait" | "aclore";
export function etatMoment(m: { debut: number; fin: number; type: TypeMoment; fait: boolean }, maintenant: number): EtatMoment {
  if (m.fait) return "fait";
  if (maintenant < m.debut) return "avenir";
  if (maintenant < m.fin) return "encours";
  return CLOS_A_LA_FIN.includes(m.type) ? "fait" : "aclore";
}

// ---------- créneaux proposés ----------

/** Distance à vol d'oiseau, en kilomètres. */
export function kmEntre(a: readonly [number, number], b: readonly [number, number]) {
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/**
 * Programme proposé (maquette E, « Le parcours ») : une visite par lieu, dans l'ordre donné, calée sur le soleil du jour.
 * La première commence une heure après le lever (au quart d'heure), chaque trajet ajoute 4 min par km + 10 min (au quart
 * d'heure) ; une visite qui finirait après le coucher passe au jour suivant du séjour. Minutes depuis minuit à Ouidah.
 * `soleilDu(j)` : lever et coucher du jour j du séjour (0 = arrivée). null si le séjour est trop court.
 */
export function proposerCreneaux(lieux: { coords: readonly [number, number] }[], soleilDu: (jour: number) => { lever: number; coucher: number }, jours: number, duree: number) {
  const quart = (m: number) => Math.ceil(m / 15) * 15;
  const sortie: { jour: number; de: number; a: number }[] = [];
  let jour = 0, h = quart(soleilDu(0).lever + 60);
  for (let i = 0; i < lieux.length; i++) {
    if (i > 0) h += quart(kmEntre(lieux[i - 1].coords, lieux[i].coords) * 4 + 10);
    if (h + duree > soleilDu(jour).coucher) {
      jour += 1;
      if (jour >= jours) return null;
      h = quart(soleilDu(jour).lever + 60);
    }
    sortie.push({ jour, de: h, a: h + duree });
    h += duree;
  }
  return sortie;
}
