import { communs, contact, copies, type LangueCourriel, type PhotoCourriel } from "@/content/courriels";
import { suivi } from "@/content/suivi";
import { langueDoc } from "@/lib/suivi";
import { base } from "../base";
import { paragraphes as decouper, remplir, type CleAuto, type Valeurs } from "../equipe/messages/rendu";
import { entete, fin, photo, pied, type Bloc, type Lien } from "./gabarit";

// Outils communs des e-mails clients : langue, dates et montants dans la langue du client (libellés et mois de
// content/suivi.ts, comme le ticket), modèle de l'admin (table modeles_courriels), début et fin de chaque e-mail.
export const langueDe = (l: string | null | undefined): LangueCourriel => langueDoc(l);
export const prenomDe = (nom: string) => nom.trim().split(/\s+/)[0] ?? "";

const FUSEAU = "Africa/Porto-Novo";
const locale = (L: LangueCourriel, contenu = suivi) => contenu[L].locale ?? "fr-FR";

/** « 28 mars 2027 » ; avec `jour` : « Dimanche 28 mars 2027 » (créoles : mois écrits à la main, sans jour). */
export function dateLongue(iso: string, L: LangueCourriel, jour = false, contenu = suivi) {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  const mois = contenu[L].mois;
  if (mois) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: FUSEAU, day: "numeric", month: "numeric", year: "numeric" }).formatToParts(d).map((x) => [x.type, x.value]));
    return `${p.day} ${mois[Number(p.month) - 1]} ${p.year}`;
  }
  const t = new Intl.DateTimeFormat(locale(L, contenu), { timeZone: FUSEAU, ...(jour ? { weekday: "long" as const } : {}), day: "numeric", month: "long", year: "numeric" }).format(d);
  return jour ? t.charAt(0).toLocaleUpperCase(locale(L, contenu)) + t.slice(1) : t;
}

export const fcfa = (n: number, L: LangueCourriel, contenu = suivi) => `${new Intl.NumberFormat(locale(L, contenu), { maximumFractionDigits: 0 }).format(n)} FCFA`;
export const euros = (n: number, L: LangueCourriel, contenu = suivi) => new Intl.NumberFormat(locale(L, contenu), { style: "currency", currency: "EUR" }).format(n);
export const dollars = (n: number, L: LangueCourriel, contenu = suivi) => new Intl.NumberFormat(locale(L, contenu), { style: "currency", currency: "USD" }).format(n);

// ---------- modèle de l'admin ----------
export type Modele = { sujet: string; corps: string } | null;

/** Texte d'un e-mail automatique saisi par un admin pour cette langue ; null : texte par défaut du site. */
export async function lireModele(cle: CleAuto, L: LangueCourriel): Promise<Modele> {
  try {
    const r = await base(`modeles_courriels?select=sujet,corps&cle=eq.${cle}&langue=eq.${L}&limit=1`);
    return r.ok ? (((await r.json()) as { sujet: string; corps: string }[])[0] ?? null) : null;
  } catch {
    return null;
  }
}

/** Objet et paragraphes libres : ceux du modèle si chacun de ses champs variables a une valeur, sinon le texte par défaut
 * de la langue. Les données (montants, numéros, lignes) ne passent jamais par le modèle. */
export function textes(m: Modele, v: Valeurs, defaut: { sujet: string; corps: string[] }) {
  if (!m) return defaut;
  const s = remplir(m.sujet, v), c = remplir(m.corps, v);
  if (s.manque.length || c.manque.length) return defaut;
  const sujet = s.texte.replace(/\s+/g, " ").trim(), corps = decouper(c.texte);
  return { sujet: sujet || defaut.sujet, corps: corps.length ? corps : defaut.corps };
}

// ---------- début et fin de chaque e-mail ----------
export const debut = (origine: string, image: PhotoCourriel | null, L: LangueCourriel): Bloc[] => (!origine ? [] : [entete(origine), ...(image ? [photo(origine, `${image}.jpg`, communs[L].photos[image])] : [])]);

export const cloture = (L: LangueCourriel, phrase: string | null, raison: string, o: { lien?: Lien | null; consigne?: string | null } = {}, pad?: string): Bloc[] => [
  fin({ phrase, salutation: communs[L].salutation, equipe: communs[L].equipe }, L, pad),
  pied({ adresse: copies[L].signature, email: contact, raison, ...o }, L, copies[L].sep),
];
