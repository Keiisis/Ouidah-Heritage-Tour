import { estLangue, normaliserLangue, type Langue } from "./langue";

export const LANGUES_URL = ["en", "es", "de", "pt", "ht", "gcf"] as const;
const PRIVE = /^\/(?:api|admins|agents|suivi|payer|lettre|_next|maintenance)(?:\/|$)/;
const FICHIER = /\.[a-z\d]{2,8}(?:$|[?#])/i;

export function sansLangue(adresse: string): string {
  const chemin = adresse.replace(/^\/(?:fr|en|es|de|pt|ht|gcf)(?=\/|[?#]|$)/, "") || "/";
  return /^[?#]/.test(chemin) ? `/${chemin}` : chemin;
}

/** Les slugs restent communs. Les ressources, actions et liens privés gardent leur adresse. */
export function adresseLangue(adresse: string, langue: Langue): string {
  if (!adresse.startsWith("/") || adresse.startsWith("//")) return adresse;
  // Une langue explicite vient notamment du lien vers la traduction d'un article.
  if (/^\/(?:en|es|de|pt|ht|gcf)(?=\/|[?#]|$)/.test(adresse)) return adresse;
  const chemin = sansLangue(adresse);
  if (PRIVE.test(chemin) || FICHIER.test(chemin)) return chemin;
  const base = chemin.startsWith("/") ? chemin : `/${chemin}`;
  return langue === "FR" || !estLangue(langue) ? base : `/${langue.toLowerCase()}${base === "/" ? "" : base}`;
}

export function langueAdresse(adresse: string): Langue {
  return normaliserLangue(adresse.split("/")[1]);
}

/** Un article peut avoir un autre slug dans chaque langue. Sans version publiée, ouvrir sa liste. */
export function adresseChangementLangue(adresse: string, langue: Langue, variantes: Record<string, string> = {}): string {
  const u = new URL(adresse, "https://oht.invalid");
  u.searchParams.delete("langue");
  const chemin = sansLangue(u.pathname);
  if (/^\/blog\/[^/]+\/?$/.test(chemin) && langueAdresse(u.pathname) !== langue) {
    const variante = variantes[langue.toLowerCase()];
    if (variante) {
      try {
        const cible = new URL(variante, "https://oht.invalid");
        if (/^\/blog\/[^/]+\/?$/.test(sansLangue(cible.pathname))) return adresseLangue(sansLangue(cible.pathname), langue) + u.search + u.hash;
      } catch { /* Une alternance invalide ne crée pas de lien vers une page absente. */ }
    }
    return adresseLangue("/blog", langue);
  }
  return adresseLangue(chemin + u.search + u.hash, langue);
}
