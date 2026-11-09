"use client";

import { useSyncExternalStore } from "react";
import type { ChoixOptions, LignePanier } from "./boutique-types";

// Panier et favoris de la boutique, gardés sur l'appareil du visiteur (même modèle que devise.ts : même onglet par
// événement, autre onglet par « storage »). Une ligne = une pièce et ses options : la même chemise en M et en L fait deux
// lignes. Une pièce unique ne peut entrer qu'une fois. Le serveur revérifie tout à la commande.
export const CLE_PANIER = "oht-panier";
export const CLE_FAVORIS = "oht-favoris";
export const QUANTITE_MAX = 10;

const VIDE_LIGNES: LignePanier[] = [];
const VIDE_FAVORIS: string[] = [];

const estLigne = (l: unknown): l is LignePanier => {
  const x = l as LignePanier | null;
  return !!x && typeof x.slug === "string" && Number.isInteger(x.quantite) && x.quantite > 0 && !!x.options && typeof x.options === "object";
};

// lecture mise en cache sur le texte gardé : useSyncExternalStore exige le même objet tant que rien n'a changé.
// Navigation privée (stockage refusé) : la valeur vit en mémoire le temps de la page.
function stockage<T>(cle: string, vide: T, valide: (v: unknown) => T) {
  let brut: string | null | undefined;
  let valeur = vide;
  let memoire = false;
  const lire = () => {
    if (memoire) return valeur;
    try {
      const b = localStorage.getItem(cle);
      if (b !== brut) {
        brut = b;
        valeur = b ? valide(JSON.parse(b)) : vide;
      }
    } catch {
      /* stockage illisible : dernière valeur connue */
    }
    return valeur;
  };
  const ecrire = (v: T) => {
    valeur = v;
    try {
      const b = JSON.stringify(v);
      localStorage.setItem(cle, b);
      brut = b;
    } catch {
      memoire = true;
    }
    window.dispatchEvent(new Event(cle));
  };
  const suivre = (cb: () => void) => {
    window.addEventListener(cle, cb);
    window.addEventListener("storage", cb);
    return () => {
      window.removeEventListener(cle, cb);
      window.removeEventListener("storage", cb);
    };
  };
  return { lire, ecrire, suivre };
}

const lignes = stockage<LignePanier[]>(CLE_PANIER, VIDE_LIGNES, (v) => (Array.isArray(v) ? v.filter(estLigne) : VIDE_LIGNES));
const favoris = stockage<string[]>(CLE_FAVORIS, VIDE_FAVORIS, (v) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : VIDE_FAVORIS));

/** Panier du moment, hors rendu (annonce juste après un ajout). */
export const lirePanier = () => lignes.lire();
export const usePanier = () => useSyncExternalStore(lignes.suivre, lignes.lire, () => VIDE_LIGNES);
export const useFavoris = () => useSyncExternalStore(favoris.suivre, favoris.lire, () => VIDE_FAVORIS);

/** Clé d'une ligne : la pièce et ses options remplies, dans un ordre fixe. */
export function cleLigne(slug: string, options: ChoixOptions) {
  const o = (["taille", "mesures", "broderie", "coloris"] as const).flatMap((k) => (options[k]?.trim() ? [`${k}=${options[k]!.trim()}`] : []));
  return [slug, ...o].join("|");
}
export const nbArticles = (l: LignePanier[]) => l.reduce((s, x) => s + x.quantite, 0);
export const dansLePanier = (l: LignePanier[], slug: string) => l.some((x) => x.slug === slug);

/** Ajoute une ligne (ou augmente la ligne identique). Faux si la pièce est unique et déjà au panier : rien ne change. */
export function ajouterAuPanier(slug: string, quantite: number, options: ChoixOptions, unique: boolean) {
  const actuel = lignes.lire();
  if (unique && dansLePanier(actuel, slug)) return false;
  const cle = cleLigne(slug, options);
  const n = unique ? 1 : Math.min(QUANTITE_MAX, Math.max(1, Math.round(quantite)));
  const deja = actuel.find((x) => cleLigne(x.slug, x.options) === cle);
  lignes.ecrire(deja ? actuel.map((x) => (x === deja ? { ...x, quantite: Math.min(QUANTITE_MAX, x.quantite + n) } : x)) : [...actuel, { slug, quantite: n, options }]);
  return true;
}

/** Nouvelle quantité d'une ligne (1 à QUANTITE_MAX) ; 0 la retire. */
export function changerQuantite(cle: string, quantite: number) {
  const actuel = lignes.lire();
  lignes.ecrire(quantite <= 0 ? actuel.filter((x) => cleLigne(x.slug, x.options) !== cle) : actuel.map((x) => (cleLigne(x.slug, x.options) === cle ? { ...x, quantite: Math.min(QUANTITE_MAX, quantite) } : x)));
}

export const viderPanier = () => lignes.ecrire(VIDE_LIGNES);

export function basculerFavori(slug: string) {
  const f = favoris.lire();
  favoris.ecrire(f.includes(slug) ? f.filter((s) => s !== slug) : [...f, slug]);
}
