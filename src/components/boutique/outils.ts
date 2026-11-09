import { LOCALES, type Langue } from "@/lib/langue";
import { boutique as BOUTIQUE } from "@/content/boutique";
import type { Catalogue, ChoixOptions, Produit } from "@/lib/boutique-types";

// Outils partagés de la boutique : prix dans la devise choisie, recherche sans accents, résumé des options.

// Parité fixe du franc CFA (BCEAO) : 1 € = 655,957 FCFA.
export const TAUX_FCFA = 655.957;

/** Prix affiché à partir du prix en FCFA (entier, seul à faire foi) ; null (pas encore saisi dans l'admin) donne « — € »,
 * « — FCFA » ou « — $ ». En dollars, `usd` est le taux du jour (FCFA pour 1 $) ; sans lui, le prix s'affiche en euros. */
export function prix(xof: number | null, devise: string, usd: number | null = null, langue: Langue = "FR") {
  const EUROS = new Intl.NumberFormat(LOCALES[langue], { style: "currency", currency: "EUR" });
  const DOLLARS = new Intl.NumberFormat(LOCALES[langue], { style: "currency", currency: "USD" });
  const ENTIER = new Intl.NumberFormat(LOCALES[langue], { maximumFractionDigits: 0 });
  if (devise === "USD" && usd) return xof == null ? "— $" : DOLLARS.format(xof / usd);
  if (xof == null) return devise === "FCFA" ? "— FCFA" : "— €";
  return devise === "FCFA" ? `${ENTIER.format(xof)} FCFA` : EUROS.format(xof / TAUX_FCFA);
}
/** Total en FCFA d'une liste (somme d'entiers, convertie une seule fois à l'affichage) ; null dès qu'un prix manque. */
export const total = (l: { p: Produit; n: number }[]) => (l.every((x) => x.p.prixXof != null) ? l.reduce((s, x) => s + x.p.prixXof! * x.n, 0) : null);

// recherche insensible aux accents, à la casse et au pluriel simple, sur le nom, la catégorie et la matière
export const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export const mots = (v: string) => norm(v).split(/\s+/).filter(Boolean).map((w) => (w.length > 3 ? w.replace(/s$/, "") : w));
export function cherche(p: Produit, v: string, c: Catalogue) {
  const texte = norm(`${p.nom} ${c.categories.find((x) => x.slug === p.categorie)?.nom ?? ""} ${c.matieres.find((x) => x.slug === p.matiere)?.nom ?? ""}`);
  return mots(v).every((w) => texte.includes(w));
}

/** Options choisies, en une ligne lisible (« Taille M · Broderie « Awa » · Coloris Bleu océan »). Taille OU mesures. */
export function resume(o: ChoixOptions, T = BOUTIQUE) {
  const R = T.options.resume;
  const taille = o.mesures?.trim() ? R.surMesure(o.mesures.trim()) : o.taille ? R.taille(o.taille) : "";
  return [taille, o.broderie?.trim() && R.broderie(o.broderie.trim()), o.coloris && R.coloris(o.coloris)].filter(Boolean).join(" · ");
}
/** « Fabriqué pour vous » (09/11) : délai saisi par l'admin (« prêt sous X jours »), sinon « délai précisé par l'équipe »
 * pour un article sur mesure ou brodé ; rien pour un article prêt. `o` : options choisies (panier), absentes sur la fiche. */
export function fabrication(p: Produit, T = BOUTIQUE, o?: ChoixOptions): string | null {
  if (p.delaiFabrication != null) return T.fiche.fabrication.replace("{n}", String(p.delaiFabrication));
  const surMesure = o ? Boolean(o.mesures?.trim() || o.broderie?.trim()) : Boolean(p.options?.surMesure || p.options?.broderie);
  return surMesure ? T.fiche.fabricationEquipe : null;
}
/** Quantité maximale d'un article : 10 par ligne, et jamais plus que le stock disponible (null : non suivi, sans limite). */
export const quantiteMax = (p: Produit, max: number) => (p.stockDisponible == null ? max : Math.min(max, p.stockDisponible));
/** Il faut choisir avant d'ajouter : taille, sur mesure, broderie, ou coloris parmi plusieurs (exigé par la commande). */
export const aChoisir = (p: Produit) => p.personnalisable || p.coloris.length > 1;

export const ficheHref = (slug: string) => `/boutique/${encodeURIComponent(slug)}`;
export const boutiqueHref = (f: { cat?: string; mat?: string; q?: string } = {}) => {
  const u = new URLSearchParams(Object.entries({ categorie: f.cat ?? "", matiere: f.mat ?? "", q: f.q ?? "" }).filter(([, v]) => v));
  return `/boutique${u.size ? `?${u}` : ""}#boutique`;
};
