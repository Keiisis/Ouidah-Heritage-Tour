import "server-only";
import { CHAMPS_TRADUITS, validerTraductionsCatalogue, type TexteCatalogue, type TraductionCatalogue, type TypeCatalogue } from "@/lib/boutique-traductions";
import type { ArticleEquipe } from "../blog/lectures";
import { LIMITES_BLOG, lireChamps, manquePourPublier, tempsLecture, type ChampsArticle } from "../blog/regles";
import { sourcePhoto } from "../equipe/boutique/regles";
import { traductionValide, type ChampAuto } from "./moteur";

export type SourceBlog = Pick<ArticleEquipe, "id" | "slug" | "langue" | "etat" | "titre" | "chapo" | "corps" | "couverture_src" | "couverture_alt" | "categorie" | "mots_cles" | "seo_titre" | "seo_description">;
export type SourceCatalogue = Partial<Record<TexteCatalogue, string | null>> & { id?: string; slug: string; photos?: unknown; photo?: unknown };
export type TraductionBlog = Pick<SourceBlog, "titre" | "chapo" | "corps" | "couverture_alt" | "categorie" | "mots_cles" | "seo_titre" | "seo_description"> & { temps_lecture: number };

const CHAMPS_BLOG = {
  titre: LIMITES_BLOG.titre, chapo: LIMITES_BLOG.chapo, corps: LIMITES_BLOG.corps,
  couverture_alt: LIMITES_BLOG.alt, categorie: LIMITES_BLOG.categorie,
  seo_titre: LIMITES_BLOG.seoTitre, seo_description: LIMITES_BLOG.seoDescription,
} as const;

/** Les clés techniques, les états et les identités d'auteur ne quittent jamais l'adaptateur. */
export function extraireBlog(source: SourceBlog): ChampAuto[] {
  const champs: ChampAuto[] = [];
  for (const [cle, max] of Object.entries(CHAMPS_BLOG)) {
    const valeur = source[cle as keyof typeof CHAMPS_BLOG];
    if (cle === "couverture_alt" && !source.couverture_src) continue;
    if (typeof valeur === "string" && valeur.trim()) champs.push({ id: `blog:${source.id}/${cle}`, chemin: [cle], source: valeur, contexte: `blog.${cle}`, max });
  }
  source.mots_cles.forEach((sourceMot, i) => {
    if (sourceMot.trim()) champs.push({ id: `blog:${source.id}/mot:${JSON.stringify(sourceMot)}`, chemin: ["mots_cles", i], source: sourceMot, contexte: "blog.mots_cles", max: LIMITES_BLOG.motCle });
  });
  return champs;
}

function verifierValeurs(champs: ChampAuto[], valeurs: Record<string, string>) {
  if (Object.keys(valeurs).some(cle => !champs.some(c => c.id === cle))) throw new Error("Champ de traduction inconnu");
  if (new Set(champs.map(c => c.id)).size !== champs.length) throw new Error("Identité de traduction ambiguë");
  for (const champ of champs) if (!Object.hasOwn(valeurs, champ.id) || !traductionValide(champ.source, valeurs[champ.id], champ.max)) throw new Error("Traduction absente ou invalide");
}

/** Reconstruction sur la source fraîche : un champ vidé à la source reste vide dans les six variantes. */
export function reconstruireBlog(source: SourceBlog, valeurs: Record<string, string>, medias: readonly string[]): TraductionBlog {
  const champs = extraireBlog(source);
  verifierValeurs(champs, valeurs);
  const textes: Record<string, string | null> = {};
  for (const cle of Object.keys(CHAMPS_BLOG) as (keyof typeof CHAMPS_BLOG)[]) textes[cle] = source[cle];
  const mots = [...source.mots_cles];
  for (const champ of champs) {
    if (champ.chemin[0] === "mots_cles") mots[Number(champ.chemin[1])] = valeurs[champ.id];
    else textes[String(champ.chemin[0])] = valeurs[champ.id];
  }
  const brut: ChampsArticle = {
    titre: textes.titre ?? "", slug: source.slug, chapo: textes.chapo ?? "", corps: textes.corps ?? "",
    couverture: source.couverture_src ? { src: source.couverture_src, alt: textes.couverture_alt ?? "" } : null,
    categorie: textes.categorie, motsCles: mots, seoTitre: textes.seo_titre, seoDescription: textes.seo_description,
  };
  const relu = lireChamps(brut, { medias });
  // Le nettoyage de l'éditeur ne doit pas masquer une sortie HTML, tronquée ou dédoublonnée de l'IA.
  if (!relu.ok || JSON.stringify(relu.v) !== JSON.stringify(brut) || (source.etat === "publie" && manquePourPublier(relu.v).length)) throw new Error("Article traduit invalide");
  return {
    titre: relu.v.titre, chapo: relu.v.chapo, corps: relu.v.corps, couverture_alt: relu.v.couverture?.alt ?? null,
    categorie: relu.v.categorie, mots_cles: relu.v.motsCles, seo_titre: relu.v.seoTitre, seo_description: relu.v.seoDescription,
    temps_lecture: tempsLecture(relu.v.corps),
  };
}

/** Même forme que les traductions stockées ; les anciens chemins de photos deviennent leur URL publique existante. */
export function sourceCatalogue(type: TypeCatalogue, source: SourceCatalogue, origine = process.env.SUPABASE_URL ?? ""): TraductionCatalogue {
  const resultat: TraductionCatalogue = {};
  for (const cle of Object.keys(CHAMPS_TRADUITS[type]) as TexteCatalogue[]) {
    const texte = source[cle];
    if (typeof texte === "string" && texte.trim()) resultat[cle] = texte;
  }
  const photos = type === "produits" ? source.photos : type === "categories" && source.photo ? [source.photo] : [];
  if (!Array.isArray(photos)) throw new Error("Photos du catalogue invalides");
  const images: { src: string; alt: string }[] = [];
  for (const photo of photos) {
    const src = sourcePhoto(photo, origine);
    if (!src || !photo || typeof photo !== "object" || !("alt" in photo) || typeof photo.alt !== "string") throw new Error("Photo du catalogue invalide");
    const precedente = images.find(p => p.src === src);
    if (precedente && precedente.alt !== photo.alt) throw new Error("Photo du catalogue ambiguë");
    if (precedente) continue;
    images.push({ src, alt: photo.alt });
  }
  if (images.length) resultat.photos = images;
  return resultat;
}

export function extraireCatalogue(type: TypeCatalogue, source: SourceCatalogue, origine = process.env.SUPABASE_URL ?? ""): ChampAuto[] {
  const normalise = sourceCatalogue(type, source, origine);
  const identite = type === "produits" ? source.id : source.slug;
  if (!identite) throw new Error("Identité du catalogue absente");
  const champs: ChampAuto[] = [];
  for (const [cle, max] of Object.entries(CHAMPS_TRADUITS[type])) {
    const texte = normalise[cle as TexteCatalogue];
    if (texte) champs.push({ id: `${type}:${identite}/${cle}`, chemin: [cle], source: texte, contexte: `catalogue.${type}.${cle}`, max });
  }
  normalise.photos?.forEach((photo, i) => {
    if (photo.alt.trim()) champs.push({ id: `${type}:${identite}/photo:${photo.src}/alt`, chemin: ["photos", i, "alt"], source: photo.alt, contexte: `catalogue.${type}.photo.alt`, max: 300, reperes: [{ profondeur: 1, cle: "src", valeur: photo.src }] });
  });
  return champs;
}

/** Le résultat ne contient que les colonnes de traduction ; jamais prix, stock, slug, options ou publication. */
export function reconstruireCatalogue(type: TypeCatalogue, source: SourceCatalogue, valeurs: Record<string, string>, origine = process.env.SUPABASE_URL ?? ""): TraductionCatalogue {
  const champs = extraireCatalogue(type, source, origine);
  verifierValeurs(champs, valeurs);
  const resultat: TraductionCatalogue = {};
  for (const champ of champs) {
    if (champ.chemin[0] === "photos") {
      resultat.photos ??= [];
      resultat.photos.push({ src: champ.reperes![0].valeur, alt: valeurs[champ.id] });
    } else resultat[champ.chemin[0] as TexteCatalogue] = valeurs[champ.id];
  }
  const relu = validerTraductionsCatalogue({ EN: resultat }, type, sourceCatalogue(type, source, origine).photos?.map(p => p.src) ?? []);
  if (!relu || JSON.stringify(relu.EN ?? {}) !== JSON.stringify(resultat)) throw new Error("Catalogue traduit invalide");
  return resultat;
}
