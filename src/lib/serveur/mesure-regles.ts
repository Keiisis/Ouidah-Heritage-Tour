import { FICHES_LIEU, tours } from "@/content/fr";
import { estLangue } from "@/lib/langue";
import { sansLangue } from "@/lib/adresses-langues";

// Règles pures de la mesure d'audience maison (sans server-only : testées par node --test, tests-oht/mesure-regles.test.mjs).
// Rien de ce que le navigateur envoie n'est gardé tel quel : le chemin est ramené à une page publique connue (ou « autre »),
// le référent à sa seule catégorie, la langue à l'une des 7 du site. Les chemins privés ne sont jamais comptés.

export const SOURCES = ["direct", "recherche", "social", "site", "autre"] as const;
export type Source = (typeof SOURCES)[number];

// pages publiques du site (src/app), sans paramètre
const PUBLIQUES = new Set(["/", "/a-propos", "/blog", "/boutique", "/conditions-generales-de-vente", "/devis", "/mentions-legales", "/ouidah/histoire", "/politique-de-confidentialite", "/rendez-vous", "/partenaires"]);
const DEFAUTS = { tours, FICHES_LIEU };
// espace de l'équipe, API, suivi et paiement des clients, pages à jeton personnel (reprise d'un devis, désinscription)
const PRIVE = /^\/(?:agents|admins|api|suivi|payer|devis\/reprendre|lettre|mes-donnees|maintenance)(?:\/|$)/;
const FICHE = /^\/(?:(circuits)|ouidah\/(lieux)|(boutique))\/([a-z0-9-]{1,80})$/;

/** Page publique connue (une fiche garde son slug, public), « autre » pour une adresse inconnue, null pour un chemin privé
 * (jamais compté). Query et hash retirés. `produits` : slugs des articles visibles de la boutique. */
export function normaliserChemin(brut: string, produits: readonly string[] = [], contenu = DEFAUTS): string | null {
  if (!brut.startsWith("/")) return null;
  const p = sansLangue(brut.split(/[?#]/, 1)[0].replace(/(.)\/+$/, "$1"));
  if (PRIVE.test(p)) return null;
  if (PUBLIQUES.has(p)) return p;
  // articles du blog : comptés ensemble (leurs slugs viennent de la base ; un slug inventé ne crée jamais de ligne)
  if (/^\/blog\/[a-z0-9-]{1,90}$/.test(p)) return "/blog/article";
  const f = p.match(FICHE);
  if (f && (f[1] ? contenu.tours.some((t) => t.slug === f[4]) : f[2] ? Object.hasOwn(contenu.FICHES_LIEU, f[4]) : produits.includes(f[4]))) return p;
  return "autre";
}

const domaine = (noms: string) => new RegExp(`(?:^|\\.)(?:${noms})\\.[a-z]{2,6}(?:\\.[a-z]{2})?$`);
const RECHERCHE = domaine("google|bing|yahoo|yandex|baidu|duckduckgo|ecosia|qwant|startpage|search\\.brave|naver|seznam|ask");
const SOCIAL = domaine("facebook|fb|messenger|instagram|twitter|x|t|linkedin|lnkd|youtube|youtu|tiktok|pinterest|reddit|whatsapp|wa|telegram|snapchat|threads|bsky|mastodon");
const sansWww = (h: string) => h.toLowerCase().replace(/^www\./, "");

/** Catégorie de provenance d'une vue : rien de plus n'est gardé du référent. `hote` : en-tête Host de la requête. */
export function sourceDe(referent: unknown, hote: string | null): Source {
  if (typeof referent !== "string" || !referent) return "direct";
  let u: URL;
  try {
    u = new URL(referent);
  } catch {
    return "autre";
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "autre";
  const h = sansWww(u.hostname);
  if (hote && sansWww(u.host) === sansWww(hote)) return "site";
  if (RECHERCHE.test(h)) return "recherche";
  if (SOCIAL.test(h)) return "social";
  return "autre";
}

export const langueValide = (l: unknown): l is string => estLangue(l);

export type Vue = { chemin: string; langue: string; ref?: string };
/** Vues d'un envoi groupé, au plus (le navigateur envoie les pages de la visite en un seul beacon). */
export const VUES_MAX = 20;
/** Corps de /api/mesure : une vue { chemin, langue, ref? } (ancien format) ou un lot { vues: [...] } de 1 à VUES_MAX vues.
 * Chemin de 300 caractères au plus, référent de 1 000 ; une seule vue illisible refuse tout le lot (null). */
export function lireVues(corps: unknown): Vue[] | null {
  if (!corps || typeof corps !== "object") return null;
  const lot = "vues" in corps ? corps.vues : [corps];
  if (!Array.isArray(lot) || !lot.length || lot.length > VUES_MAX) return null;
  const vues: Vue[] = [];
  for (const v of lot as unknown[]) {
    const { chemin, langue, ref } = (v && typeof v === "object" ? v : {}) as { chemin?: unknown; langue?: unknown; ref?: unknown };
    if (typeof chemin !== "string" || chemin.length > 300 || !langueValide(langue) || (ref !== undefined && (typeof ref !== "string" || ref.length > 1_000))) return null;
    vues.push({ chemin, langue, ...(ref === undefined ? {} : { ref }) });
  }
  return vues;
}

// robots, aperçus de liens, sondes, navigateurs pilotés, clients HTTP : jamais comptés (user-agent absent compris)
const ROBOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|lighthouse|pagespeed|pingdom|uptime|monitor|curl|wget|python|httpclient|axios|node-fetch|undici|^node$|go-http|java\/|okhttp|scrapy|phantom|selenium|puppeteer|playwright/i;
export const estRobot = (ua: string | null) => !ua || ROBOT.test(ua);

/** Le visiteur demande à ne pas être suivi (Global Privacy Control ou Do Not Track) : refus silencieux. */
export const refusSuivi = (h: Headers) => h.get("sec-gpc") === "1" || h.get("dnt") === "1";

/** Envoi depuis une page du site : sans en-tête Origin (client sans navigateur) accepté, sinon même hôte exigé. */
export function origineAcceptee(origine: string | null, hote: string | null) {
  if (!origine) return true;
  try {
    return Boolean(hote) && new URL(origine).host === hote;
  } catch {
    return false;
  }
}

/** Limite de fréquence en mémoire du processus seulement, jamais stockée : vrai quand `cle` a déjà fait `max` appels dans
 * la fenêtre en cours (fenêtre fixe de `fenetre` ms, entrées échues retirées quand la table grossit). */
export function limiteur(max: number, fenetre: number) {
  const vus = new Map<string, { debut: number; n: number }>();
  return (cle: string, t = Date.now()) => {
    if (vus.size > 10_000) for (const [k, v] of vus) if (t - v.debut >= fenetre) vus.delete(k);
    const v = vus.get(cle);
    if (!v || t - v.debut >= fenetre) {
      vus.set(cle, { debut: t, n: 1 });
      return false;
    }
    return ++v.n > max;
  };
}
