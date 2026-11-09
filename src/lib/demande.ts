import { conciergerie, destinations, devisPage as T, nav, tenReasons, tours } from "@/content/fr";
import PAYS from "@/content/pays.json";

// Demande envoyée par /devis : le dossier de voyage (composé sur l'accueil) et les réponses de la page. Même contrat côté
// navigateur (ce qui manque encore) et côté serveur (tout est revérifié : rien de ce qui vient de l'appareil n'est cru).
export type Intention = "voyage" | "groupe" | "question";
export type DossierEnvoye = { sejour: { arrivee: number; depart: number } | null; lieux: string[]; raisons: string[]; services: Record<string, string[]>; devise: string | null; ville: string | null };
export type ReponsesDevis = { qui: string | null; adultes: number; enfants: number; occasion: string | null; pays: string | null; langue: string; conseilDates: boolean; conseilLieux: boolean };
export type ChampsDevis = { nom: string; email: string; whatsapp: string; message: string };
export type Demande = { intention: Intention; circuit: string | null; dossier: DossierEnvoye; reponses: ReponsesDevis; champs: ChampsDevis; consentement: boolean; piege: string; duree: number }; // duree : millisecondes passées sur la page (horloge du navigateur, pas son heure)

export const LIMITES = { nom: 120, email: 254, whatsapp: 32, message: 4000, ville: 80, lieux: 60, personnes: 99, sejourMax: 120 };
export const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/;
export const INTENTIONS: Intention[] = ["voyage", "groupe", "question"];
const CODES_PAYS = new Set<string>(PAYS);
const DEFAUTS = { conciergerie, destinations, devisPage: T, nav, tenReasons, tours };
export type ContenuDemande = typeof DEFAUTS;

/** Ce qui manque encore, dans l'ordre de la page (clés de devisPage.talon.noms). */
export function manques(d: Pick<Demande, "intention" | "circuit" | "dossier" | "reponses" | "champs" | "consentement">): string[] {
  const m: string[] = [];
  const r = d.reponses;
  if (d.intention !== "question") {
    if (!d.dossier.sejour && !r.conseilDates) m.push("dates");
    if (!d.dossier.lieux.length && !d.circuit && !r.conseilLieux) m.push("lieux");
    if (!r.qui) m.push("qui");
    if (!r.pays) m.push("pays");
  }
  if (!d.champs.nom.trim()) m.push("nom");
  if (!EMAIL.test(d.champs.email.trim())) m.push("email");
  if (d.intention === "question" && !d.champs.message.trim()) m.push("message");
  if (!d.consentement) m.push("consent");
  return m;
}

// ——— côté serveur : nettoyage strict du corps reçu ———
const texte = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max) : "");
const entier = (v: unknown, min: number, max: number) => (Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : null);
const objet = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * Corps JSON → demande propre. `releve` : identifiants « r:… » du relevé des lieux. `aujourdhui` : numéro du jour.
 * Lieux, services, raisons, circuit, pays, langue inconnus du contenu : retirés (jamais recopiés tels quels).
 */
export function nettoyer(corps: unknown, releve: Set<string>, aujourdhui: number, contenu: ContenuDemande = DEFAUTS): Demande {
  const { conciergerie, destinations, devisPage: T, nav, tenReasons, tours } = contenu;
  const LANGUES = new Set(nav.languages.map((l) => l.code));
  const QUI = new Set(T.qui.options.map((o) => o.id));
  const OCCASIONS = new Set(T.occasion.options.map((o) => o.id));
  const c = objet(corps);
  const d = objet(c.dossier), r = objet(c.reponses), ch = objet(c.champs), s = objet(d.sejour);
  const intention = INTENTIONS.includes(c.intention as Intention) ? (c.intention as Intention) : "voyage";
  const arrivee = entier(s.arrivee, aujourdhui - 1, aujourdhui + 3 * 366), depart = entier(s.depart, aujourdhui, aujourdhui + 3 * 366 + LIMITES.sejourMax);
  const slugs = new Set(destinations.map((x) => x.slug));
  const services: Record<string, string[]> = {};
  const sv = objet(d.services);
  for (const q of conciergerie) {
    const v = sv[q.id];
    const ok = Array.isArray(v) ? [...new Set(v.filter((l): l is string => typeof l === "string" && q.options.some((o) => o.label === l)))] : [];
    if (ok.length) services[q.id] = q.multi ? ok : ok.slice(0, 1);
  }
  const adultes = entier(r.adultes, 0, LIMITES.personnes) ?? 0, enfants = entier(r.enfants, 0, LIMITES.personnes) ?? 0;
  return {
    intention,
    circuit: typeof c.circuit === "string" && tours.some((t) => t.slug === c.circuit) ? c.circuit : null,
    dossier: {
      sejour: arrivee !== null && depart !== null && depart > arrivee && depart - arrivee <= LIMITES.sejourMax ? { arrivee, depart } : null,
      lieux: Array.isArray(d.lieux) ? [...new Set(d.lieux.filter((l): l is string => typeof l === "string" && (slugs.has(l) || releve.has(l))))].slice(0, LIMITES.lieux) : [],
      raisons: Array.isArray(d.raisons) ? [...new Set(d.raisons.filter((l): l is string => typeof l === "string" && tenReasons.some((x) => x.slug === l)))] : [],
      services,
      devise: nav.currencies.some((x) => x.code === d.devise) ? (d.devise as string) : null,
      ville: texte(d.ville, LIMITES.ville) || null,
    },
    reponses: {
      qui: QUI.has(r.qui as string) ? (r.qui as string) : null,
      adultes,
      enfants,
      occasion: OCCASIONS.has(r.occasion as string) ? (r.occasion as string) : null,
      pays: CODES_PAYS.has(r.pays as string) ? (r.pays as string) : null,
      langue: LANGUES.has(r.langue as string) ? (r.langue as string) : nav.languages[0].code,
      conseilDates: r.conseilDates === true,
      conseilLieux: r.conseilLieux === true,
    },
    champs: {
      nom: texte(ch.nom, LIMITES.nom),
      email: texte(ch.email, LIMITES.email).toLowerCase(),
      whatsapp: texte(ch.whatsapp, LIMITES.whatsapp).replace(/[^\d+ ().-]/g, ""),
      message: texte(ch.message, LIMITES.message),
    },
    consentement: c.consentement === true,
    piege: texte(c.piege, 200),
    duree: Number.isFinite(c.duree) ? Number(c.duree) : 0,
  };
}
