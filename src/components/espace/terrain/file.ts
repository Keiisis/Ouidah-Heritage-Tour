"use client";

import type { EntreeFile } from "@/lib/serveur/equipe/terrain/regles";

// File des entrées sur le téléphone (hors ligne toléré) : chaque billet scanné y entre AVANT l'envoi et n'en sort qu'une
// fois que le serveur a tranché (entrée, déjà entré, refus définitif). Gardée dans localStorage : une page rechargée ou
// fermée sans réseau garde ses entrées, qui repartent au retour du réseau. Lue par useSyncExternalStore : la même chaîne
// donne le même tableau (aucune boucle de rendu), une autre page du même téléphone est suivie par l'évènement « storage ».

const CLE = "oht-terrain-file";
const CLE_APPAREIL = "oht-appareil";
const VIDE: EntreeFile[] = [];
let brut: string | null = null;
let cache: EntreeFile[] = VIDE;
const abonnes = new Set<() => void>();

const valide = (x: unknown): x is EntreeFile => {
  const o = x as Partial<EntreeFile> | null;
  return Boolean(o && typeof o.cle === "string" && typeof o.code === "string" && typeof o.evenement === "string" && typeof o.occurrence === "string" && typeof o.entre_le === "number");
};

function lire(): EntreeFile[] {
  let s: string | null = null;
  try {
    s = localStorage.getItem(CLE);
  } catch {
    return cache;
  }
  if (s === brut) return cache;
  brut = s;
  try {
    const v: unknown = JSON.parse(s ?? "[]");
    cache = Array.isArray(v) ? v.filter(valide) : VIDE;
  } catch {
    cache = VIDE;
  }
  return cache;
}

function ecrire(l: EntreeFile[]) {
  try {
    localStorage.setItem(CLE, JSON.stringify(l));
  } catch {
    // stockage plein ou refusé : la file vit au moins pour cette page
  }
  brut = null;
  cache = l;
  abonnes.forEach((f) => f());
}

export const file = {
  abonner(cb: () => void) {
    abonnes.add(cb);
    const ailleurs = (e: StorageEvent) => e.key === CLE && cb();
    window.addEventListener("storage", ailleurs);
    return () => {
      abonnes.delete(cb);
      window.removeEventListener("storage", ailleurs);
    };
  },
  lire,
  serveur: () => VIDE,
  ajouter: (e: EntreeFile) => ecrire([...lire().filter((x) => x.cle !== e.cle), e]),
  retirer: (cle: string) => ecrire(lire().filter((x) => x.cle !== cle)),
  horsLigne: () => ecrire(lire().map((x) => ({ ...x, hors_ligne: true }))),
};

/** Identifiant aléatoire de ce téléphone (gardé dans localStorage), jamais une empreinte du navigateur. */
export function appareil(): string {
  try {
    const a = localStorage.getItem(CLE_APPAREIL);
    if (a && /^[A-Za-z0-9_-]{8,64}$/.test(a)) return a;
  } catch {
    // stockage refusé : un identifiant pour cette page seulement
  }
  const octets = crypto.getRandomValues(new Uint8Array(16));
  const neuf = btoa(String.fromCharCode(...octets)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  try {
    localStorage.setItem(CLE_APPAREIL, neuf);
  } catch {
    // idem
  }
  return neuf;
}
