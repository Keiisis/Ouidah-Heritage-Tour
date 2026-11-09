import "server-only";
import { base } from "../../base";
import { exigerDroit } from "../securite/droits";
import { exigerRole } from "../session";
import { objet, sourcePhoto, type PhotoAdmin, type CatalogueAdmin, type CategorieAdmin, type MatiereAdmin, type ProduitAdmin, type ZoneAdmin } from "./regles";

export const COLONNES_PRODUIT = "id,slug,nom,categorie,matiere,lieu,prix_xof,artisan,dimensions,description,entretien,coloris,piece_unique,options,photos,ordre,publie,modifie_le,stock,stock_reserve,delai_fabrication_jours,traductions";

function photoLue(v: unknown, origine: string): PhotoAdmin | null {
  const p = objet(v), src = sourcePhoto(v, origine);
  if (!p || !src) return null;
  // Un ancien texte alternatif vide reste dans l'éditeur : ne jamais faire disparaître une photo lors d'une sauvegarde.
  return { src, alt: typeof p.alt === "string" ? p.alt : "", largeur: Number(p.largeur) || 0, hauteur: Number(p.hauteur) || 0 };
}

/** Aucun cache : les versions utilisées par les mutations correspondent à la lecture affichée. */
export async function lireCatalogueAdmin(): Promise<CatalogueAdmin | null> {
  if (!await exigerDroit("boutique")) return null; // admins et agents ayant le droit « boutique »
  try {
    const reponses = await Promise.all([
      base(`boutique_produits?select=${COLONNES_PRODUIT}&order=ordre.asc,nom.asc`),
      base("boutique_categories?select=slug,nom,couleur,photo,ordre,modifie_le,traductions&order=ordre.asc,nom.asc"),
      base("boutique_matieres?select=slug,nom,modifie_le,traductions&order=nom.asc"),
    ]);
    if (reponses.some((r) => !r.ok)) return null;
    const [produits, categories, matieres] = await Promise.all(reponses.map((r) => r.json())) as [ProduitAdmin[], CategorieAdmin[], MatiereAdmin[]];
    if (![produits, categories, matieres].every(Array.isArray)) return null;
    const origine = process.env.SUPABASE_URL ?? "";
    const images = produits.map((p) => Array.isArray(p.photos) ? p.photos.map((v) => photoLue(v, origine)) : [null]);
    const couvertures = categories.map((c) => c.photo === null ? null : photoLue(c.photo, origine));
    // Une source historique illisible est une erreur de données, pas une invitation à enregistrer une liste tronquée.
    if (images.some((liste) => liste.some((p) => p === null)) || categories.some((c, i) => c.photo !== null && couvertures[i] === null)) return null;
    return {
      produits: produits.map((p, i) => ({ ...p, prix_xof: p.prix_xof === null ? null : Number(p.prix_xof), photos: images[i].filter((v): v is PhotoAdmin => v !== null) })),
      categories: categories.map((c, i) => ({ ...c, photo: couvertures[i] })),
      matieres,
    };
  } catch { return null; }
}

/** Grille de livraison, sans cache (les versions servent aux mutations). null : session ou base indisponible. */
export async function lireZonesAdmin(): Promise<ZoneAdmin[] | null> {
  if (!await exigerRole("admins")) return null;
  try {
    const r = await base("boutique_livraison_zones?select=code,libelle,pays,ville,reste_du_monde,frais_xof,delai_jours,actif,ordre,modifie_le&order=ordre.asc,code.asc");
    const zones: unknown = r.ok ? await r.json() : null;
    return Array.isArray(zones) ? zones as ZoneAdmin[] : null;
  } catch { return null; }
}
