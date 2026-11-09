"use client";

import { useMemo, useSyncExternalStore } from "react";
import { conciergerie as CONCIERGERIE, destinations as DESTINATIONS, evenements as EVENEMENTS, tenReasons as TEN_REASONS } from "@/content/fr";
import { useContenu } from "@/components/ui/ContenuSite";
import { CLE_SEJOUR, lireSejour, type Sejour } from "./sejour";
import { CLE_CHEMIN } from "./chemin";
import { CLE_RAISONS, lireRaisons } from "./raisons";
import { CLE_CONCIERGERIE, lireConciergerie, servicesDemandes, type Reponses } from "./conciergerie";
import { CLE_DEVISE } from "./devise";
import { MEMOIRE_VILLE } from "./visiteur";
import { CLE_BILLETS, lireBillets, type BilletChoisi } from "./billets";

// Dossier de voyage : tout ce que le visiteur a composé sur l'accueil, lu ensemble. Les mémoires de chaque section restent
// les sources (aucune copie) ; chaque section prévient par un événement du même nom que sa clé, un autre onglet par
// « storage ». /devis et l'en-tête relisent donc en direct.
export type Dossier = { sejour: Sejour | null; lieux: string[]; raisons: string[]; services: Reponses; devise: string | null; ville: string | null; billets: BilletChoisi[] };
const CLES = [CLE_SEJOUR, CLE_CHEMIN, CLE_RAISONS, CLE_CONCIERGERIE, CLE_DEVISE, MEMOIRE_VILLE, CLE_BILLETS] as const;
// « Votre chemin » écoute déjà son propre événement (une raison entourée l'y prévient) : après avoir écrit, il prévient le
// dossier par cet événement-ci, sans se relancer lui-même.
export const EVENEMENT_VOYAGE = "oht-voyage";
export const signalerVoyage = () => window.dispatchEvent(new Event(EVENEMENT_VOYAGE));
const SEP = "\u0001";

const lire = () => {
  try {
    return CLES.map((k) => localStorage.getItem(k) ?? "").join(SEP);
  } catch {
    return CLES.map(() => "").join(SEP); // navigation privée : dossier vide
  }
};
const suivre = (cb: () => void) => {
  for (const k of [...CLES, EVENEMENT_VOYAGE]) window.addEventListener(k, cb);
  window.addEventListener("storage", cb);
  return () => {
    for (const k of [...CLES, EVENEMENT_VOYAGE]) window.removeEventListener(k, cb);
    window.removeEventListener("storage", cb);
  };
};
const json = <T,>(s: string): T | null => {
  try {
    return JSON.parse(s || "null") as T | null;
  } catch {
    return null;
  }
};

export function lireDossier(brut: string, contenu = { destinations: DESTINATIONS, raisons: TEN_REASONS, conciergerie: CONCIERGERIE, evenements: EVENEMENTS }): Dossier {
  const slugs = new Set(contenu.destinations.map((d) => d.slug));
  const [dates, chemin, raisons, conciergerie, devise, ville, billets] = brut.split(SEP);
  const gardes = json<{ gardes?: unknown }>(chemin)?.gardes;
  return {
    sejour: lireSejour(dates || null),
    // lieux à voir connus, et lieux du relevé (« r:… », vérifiés à l'affichage puis par le serveur)
    lieux: Array.isArray(gardes) ? gardes.filter((s): s is string => typeof s === "string" && (slugs.has(s) || /^r:[\w-]{1,80}$/.test(s))) : [],
    raisons: lireRaisons(raisons || null, contenu.raisons),
    services: lireConciergerie(conciergerie || null, contenu.conciergerie).reponses,
    devise: devise || null,
    ville: json<{ ville?: unknown }>(ville)?.ville?.toString().slice(0, 80) ?? null,
    billets: lireBillets(billets || null, contenu.evenements),
  };
}

/** null avant l'hydratation (rendu serveur) : rien n'est encore lu. */
export function useDossier(): Dossier | null {
  const destinations = useContenu("fr.destinations", DESTINATIONS);
  const raisons = useContenu("fr.tenReasons", TEN_REASONS);
  const conciergerie = useContenu("fr.conciergerie", CONCIERGERIE);
  const evenements = useContenu("fr.evenements", EVENEMENTS);
  const brut = useSyncExternalStore(suivre, lire, () => null);
  return useMemo(() => (brut === null ? null : lireDossier(brut, { destinations, raisons, conciergerie, evenements })), [brut, destinations, raisons, conciergerie, evenements]);
}

/** Éléments du voyage : les dates, chaque lieu gardé, chaque service demandé, chaque événement réservé. */
export const compterDossier = (d: Dossier, conciergerie = CONCIERGERIE) => (d.sejour ? 1 : 0) + d.lieux.length + servicesDemandes(d.services, conciergerie).length + d.billets.length;

/** Remet un dossier sur l'appareil (reprise sur un autre appareil) et prévient chaque section. */
export function ecrireDossier(d: Pick<Dossier, "sejour" | "lieux" | "raisons" | "services">) {
  const ecrire: [string, string | null][] = [
    [CLE_SEJOUR, d.sejour ? JSON.stringify(d.sejour) : null],
    [CLE_CHEMIN, JSON.stringify({ gardes: d.lieux, index: 0 })],
    [CLE_RAISONS, JSON.stringify(d.raisons)],
    [CLE_CONCIERGERIE, JSON.stringify({ reponses: d.services, rang: 0 })],
  ];
  try {
    for (const [k, v] of ecrire) {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    }
  } catch {
    /* navigation privée : rien n'est gardé */
  }
  for (const [k] of ecrire) window.dispatchEvent(new Event(k));
}
