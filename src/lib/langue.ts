// Langues du site. Langue proposée au visiteur (lettre, réponse à sa demande) : celle de la page si elle n'est pas le
// français, sinon la première langue de son navigateur que le site propose, sinon le français. Il peut toujours en changer.
export const LANGUES = ["FR", "EN", "ES", "DE", "PT", "HT", "GCF"] as const;
export type Langue = (typeof LANGUES)[number];
export const LOCALES: Record<Langue, string> = { FR: "fr-FR", EN: "en-GB", ES: "es-ES", DE: "de-DE", PT: "pt-PT", HT: "fr-HT", GCF: "fr-GP" };
export const estLangue = (v: unknown): v is Langue => typeof v === "string" && (LANGUES as readonly string[]).includes(v);
export const normaliserLangue = (v: unknown): Langue => typeof v === "string" && estLangue(v.toUpperCase()) ? v.toUpperCase() as Langue : "FR";

export function langueDetectee(langues: readonly string[] = LANGUES) {
  const page = document.documentElement.lang.split("-")[0].toUpperCase();
  if (page !== langues[0] && langues.includes(page)) return page;
  for (const l of navigator.languages ?? [navigator.language]) {
    const code = l.split("-")[0].toUpperCase();
    if (langues.includes(code)) return code;
  }
  return langues[0];
}

// Langue de la page seule (pour la réponse à une demande : « langue du site »)
export function langueDuSite(langues: readonly string[] = LANGUES) {
  const page = document.documentElement.lang.split("-")[0].toUpperCase();
  return langues.includes(page) ? page : langues[0];
}

// abonnement vide de useSyncExternalStore : valeur lue une fois côté client
export const rien = () => () => {};
