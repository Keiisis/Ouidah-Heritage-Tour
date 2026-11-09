import { LANGUES, type Langue } from "@/lib/langue";

export type TypeCatalogue = "produits" | "categories" | "matieres";
export type TexteCatalogue = "nom" | "lieu" | "dimensions" | "description" | "entretien";
export type TraductionCatalogue = Partial<Record<TexteCatalogue, string>> & { photos?: { src: string; alt: string }[] };
export type TraductionsCatalogue = Partial<Record<Exclude<Langue, "FR">, TraductionCatalogue>>;
export const LANGUES_CATALOGUE = LANGUES.filter((l) => l !== "FR");
export const CHAMPS_TRADUITS: Record<TypeCatalogue, Partial<Record<TexteCatalogue, number>>> = {
  produits: { nom: 160, lieu: 120, dimensions: 160, description: 4000, entretien: 2000 },
  categories: { nom: 80 },
  matieres: { nom: 80 },
};
const objet = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const texte = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length <= max && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(v);

/** Une traduction ne peut changer ni un identifiant, ni une option, ni une image, ni un montant. */
export function validerTraductionsCatalogue(brut: unknown, type: TypeCatalogue, sources: readonly string[] = []): TraductionsCatalogue | null {
  if (brut === undefined) return {};
  if (!objet(brut)) return null;
  const resultat: TraductionsCatalogue = {};
  for (const [langue, valeur] of Object.entries(brut)) {
    if (!LANGUES_CATALOGUE.some((l) => l === langue) || !objet(valeur)) return null;
    const traduction: TraductionCatalogue = {};
    for (const [cle, v] of Object.entries(valeur)) {
      if (Object.hasOwn(CHAMPS_TRADUITS[type], cle)) {
        if (!texte(v, CHAMPS_TRADUITS[type][cle as TexteCatalogue]!)) return null;
        if (v.trim()) traduction[cle as TexteCatalogue] = v.trim();
      } else if (cle === "photos" && type !== "matieres") {
        if (!Array.isArray(v) || v.length > 30) return null;
        const photos: { src: string; alt: string }[] = [];
        for (const p of v) {
          if (!objet(p) || Object.keys(p).some((k) => k !== "src" && k !== "alt") || typeof p.src !== "string" || !sources.includes(p.src) || !texte(p.alt, 300) || photos.some((a) => a.src === p.src)) return null;
          if (p.alt.trim()) photos.push({ src: p.src, alt: p.alt.trim() });
        }
        if (photos.length) traduction.photos = photos;
      } else return null;
    }
    if (Object.keys(traduction).length) resultat[langue as Exclude<Langue, "FR">] = traduction;
  }
  return resultat;
}

export function traductionCatalogue(brut: unknown, langue: Langue, type: TypeCatalogue, sources: readonly string[] = []): TraductionCatalogue {
  if (langue === "FR") return {};
  return validerTraductionsCatalogue(brut, type, sources)?.[langue] ?? {};
}
