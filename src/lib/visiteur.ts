"use client";

import { useCallback, useEffect, useState } from "react";
import { choixActuel, useConsentement } from "@/lib/consentement";

// Ville du visiteur, partagée par les sections : choix enregistré, sinon géolocalisation de l'hébergeur (/api/position),
// sinon fuseau horaire du navigateur. Une seule détection par page ; « Modifier » met à jour toutes les sections.
export type Visiteur = { ville: string; coords: [number, number]; pays?: string }; // pays : code ISO 3166-1 alpha-2, s'il est connu
export const MEMOIRE_VILLE = "oht-ville";
let detection: Promise<Visiteur | null> | null = null;
let detectionAvecAccord = false; // la détection a-t-elle pu interroger l'hébergeur ? sinon on la refait après l'accord
const abonnes = new Set<(v: Visiteur) => void>();

// ville → coordonnées (Open-Meteo, sans clé)
export async function geocoder(nom: string): Promise<Visiteur | null> {
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nom)}&count=1&language=fr&format=json`);
    const d = (await r.json()) as { results?: { name: string; latitude: number; longitude: number; country_code?: string }[] };
    const v = d.results?.[0];
    return v ? { ville: v.name, coords: [v.longitude, v.latitude], ...(v.country_code ? { pays: v.country_code.toUpperCase() } : {}) } : null;
  } catch {
    return null;
  }
}

function detecter() {
  if (detection && !detectionAvecAccord && choixActuel()?.ville) detection = null;
  detection ??= (async () => {
    detectionAvecAccord = !!choixActuel()?.ville;
    try {
      const v = JSON.parse(localStorage.getItem(MEMOIRE_VILLE) ?? "null") as Visiteur | null;
      if (v?.ville && Array.isArray(v.coords)) return v;
    } catch {
      /* rien d'enregistré */
    }
    if (!choixActuel()?.ville) return null; // sans accord : le visiteur saisit sa ville lui-même
    try {
      const v = (await (await fetch("/api/position")).json()) as Visiteur | null;
      if (v) return v;
    } catch {
      /* hors ligne ou hors Vercel */
    }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone?.split("/").pop()?.replace(/_/g, " ");
    return tz ? geocoder(tz) : null;
  })();
  return detection;
}

/** `actif` : ne détecter qu'à l'approche de la section. */
export function useVisiteur(actif: boolean) {
  const [visiteur, setVisiteur] = useState<Visiteur | null>(null);
  const accordVille = useConsentement()?.ville === true;
  useEffect(() => {
    if (!actif) return;
    let annule = false;
    detecter().then((v) => {
      if (v && !annule) setVisiteur(v);
    });
    abonnes.add(setVisiteur);
    return () => {
      annule = true;
      abonnes.delete(setVisiteur);
    };
  }, [actif, accordVille]);
  const changer = useCallback(async (nom: string) => {
    const v = await geocoder(nom);
    if (!v) return false;
    try {
      localStorage.setItem(MEMOIRE_VILLE, JSON.stringify(v));
    } catch {
      /* non gardée */
    }
    detection = Promise.resolve(v);
    abonnes.forEach((f) => f(v));
    window.dispatchEvent(new Event(MEMOIRE_VILLE)); // le dossier de voyage (/devis) relit la ville
    return true;
  }, []);
  return { visiteur, changer };
}
