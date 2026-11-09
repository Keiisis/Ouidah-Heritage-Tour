"use server";

import { refresh, updateTag } from "next/cache";
import { planifierTraductions } from "@/lib/serveur/traduction-auto/planifier";
import { base } from "../../base";
import { journaliser } from "../journal";
import { exigerRole } from "../session";
import { idValide, objet, slugValide, validerCategorie, validerMatiere, validerProduit, validerZone, versionValide, type RetourBoutique } from "./regles";

type Table = "produits" | "categories" | "matieres";
const ACTION = { produits: "boutique.produit", categories: "boutique.categorie", matieres: "boutique.matiere" } as const;
const ORIGINE = () => process.env.SUPABASE_URL ?? "";

async function erreurBase(r: Response): Promise<RetourBoutique> {
  const refus = await r.json().then(objet).catch(() => null);
  const code = refus?.code;
  if (code === "23505") return { erreur: "existe" };
  if (code === "23503") return { erreur: "reference" };
  if (code === "23514" || (code === "P0001" && ["stock_reserve", "piece_unique"].includes(String(refus?.message)))) return { erreur: "stock" };
  return { erreur: "panne" };
}

async function enregistrer(table: Table, brut: unknown): Promise<RetourBoutique> {
  const s = await exigerRole("admins");
  if (!s) return { erreur: "acces" };
  const b = objet(brut);
  if (!b) return { erreur: "champs", champs: ["formulaire"] };
  const validation = table === "produits" ? validerProduit(b, ORIGINE()) : table === "categories" ? validerCategorie(b, ORIGINE()) : validerMatiere(b);
  if (!("ok" in validation)) return validation;
  const nouveau = b.version === null;
  if (!nouveau && !versionValide(b.version)) return { erreur: "champs", champs: ["version"] };
  if (table === "produits" && !nouveau && !idValide(b.id)) return { erreur: "champs", champs: ["id"] };
  const cle = table === "produits" ? "id" : "slug";
  const identifiant = table === "produits" ? b.id : b.slug;
  const version = new Date(Math.max(Date.now(), nouveau ? 0 : Date.parse(String(b.version)) + 1)).toISOString();
  // Slug immuable d'un produit : inclus au filtre, jamais modifié par un PATCH. Une réservation change aussi la version.
  const filtre = nouveau ? "" : `${cle}=eq.${encodeURIComponent(String(identifiant))}&modifie_le=eq.${encodeURIComponent(String(b.version))}&${table === "produits" ? `slug=eq.${validation.valeur.slug}&` : ""}`;
  const corps: Record<string, unknown> = { ...validation.valeur, modifie_le: version };
  if (!nouveau) delete corps.slug;
  try {
    const r = await base(`boutique_${table}?${filtre}select=${cle},modifie_le`, { method: nouveau ? "POST" : "PATCH", corps, prefer: "return=representation" });
    if (!r.ok) return erreurBase(r);
    const lignes = await r.json() as Record<string, unknown>[];
    const ligne = Array.isArray(lignes) ? lignes[0] : null;
    if (!ligne) return { erreur: "conflit" };
    if (typeof ligne[cle] !== "string" || !versionValide(ligne.modifie_le)) return { erreur: "panne" };
    await journaliser(ACTION[table], s.profilId, null, { cible: ligne[cle], type: table });
    updateTag("boutique");
    planifierTraductions();
    refresh();
    return { ok: true, id: ligne[cle], version: ligne.modifie_le };
  } catch { return { erreur: "panne" }; }
}

export async function enregistrerProduit(brut: unknown): Promise<RetourBoutique> { return enregistrer("produits", brut); }
export async function enregistrerCategorie(brut: unknown): Promise<RetourBoutique> { return enregistrer("categories", brut); }
export async function enregistrerMatiere(brut: unknown): Promise<RetourBoutique> { return enregistrer("matieres", brut); }

export async function publierProduit(id: unknown, version: unknown, publie: unknown): Promise<RetourBoutique> {
  const s = await exigerRole("admins");
  if (!s) return { erreur: "acces" };
  if (!idValide(id) || !versionValide(version) || typeof publie !== "boolean") return { erreur: "champs" };
  try {
    const r = await base(`boutique_produits?id=eq.${id}&modifie_le=eq.${encodeURIComponent(version)}&select=id,modifie_le`, {
      method: "PATCH", corps: { publie, modifie_le: new Date(Math.max(Date.now(), Date.parse(version) + 1)).toISOString() }, prefer: "return=representation",
    });
    if (!r.ok) return erreurBase(r);
    const lignes = await r.json() as { id: string; modifie_le: string }[];
    const ligne = Array.isArray(lignes) ? lignes[0] : null;
    if (!ligne) return { erreur: "conflit" };
    if (!idValide(ligne.id) || !versionValide(ligne.modifie_le)) return { erreur: "panne" };
    await journaliser("boutique.publication", s.profilId, null, { cible: id, actif: publie });
    updateTag("boutique");
    planifierTraductions();
    refresh();
    return { ok: true, id, version: ligne.modifie_le };
  } catch { return { erreur: "panne" }; }
}

/** Zone de la grille de livraison (admin). Conflit d'édition par modifie_le ; le type de zone (reste du monde) ne change
 * pas : il fait partie du filtre. Le catalogue public (frais affichés au panier) est relu ensuite. */
export async function enregistrerZone(brut: unknown): Promise<RetourBoutique> {
  const s = await exigerRole("admins");
  if (!s) return { erreur: "acces" };
  const b = objet(brut);
  if (!b || typeof b.reste_du_monde !== "boolean" || !versionValide(b.version) || !slugValide(b.code, 40)) return { erreur: "champs", champs: ["formulaire"] };
  const validation = validerZone(b, b.reste_du_monde);
  if (!("ok" in validation)) return validation;
  const { code, ...corps } = validation.valeur;
  const version = new Date(Math.max(Date.now(), Date.parse(b.version) + 1)).toISOString();
  try {
    const r = await base(`boutique_livraison_zones?code=eq.${code}&reste_du_monde=is.${b.reste_du_monde}&modifie_le=eq.${encodeURIComponent(b.version)}&select=code,modifie_le`, { method: "PATCH", corps: { ...corps, modifie_le: version }, prefer: "return=representation" });
    if (!r.ok) return erreurBase(r);
    const ligne = (await r.json() as { code: string; modifie_le: string }[])[0];
    if (!ligne) return { erreur: "conflit" };
    await journaliser("boutique.livraison", s.profilId, null, { cible: code });
    updateTag("boutique");
    refresh();
    return { ok: true, id: code, version: ligne.modifie_le };
  } catch { return { erreur: "panne" }; }
}
