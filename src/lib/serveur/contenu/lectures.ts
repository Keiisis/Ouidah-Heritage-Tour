import "server-only";
import { type CleContenu, type CleEdition, decomposerCle, formeDe, prefixesMedias, REGISTRE } from "@/lib/contenu-registre";
import { donnees, fusionner, type Json } from "@/lib/contenu-regles";
import { formeTraduction, traduireValeur } from "@/lib/traductions";
import { base } from "../base";

// Lectures de l'éditeur du contenu (espace de l'équipe), sans cache : la ligne de la rubrique (publiée, brouillon,
// version) et son historique. L'appelant a déjà vérifié la session et le droit « site ».

type Qui = { prenom: string; nom: string } | null;
export type LigneContenu = { valeur: Json | null; brouillon: Json | null; version: number; modifie_le: string | null; publie_le: string | null; modifiePar: string | null; publiePar: string | null };
export type VersionContenu = { id: number; version: number; etat: "brouillon" | "publie"; le: string; auteur: string | null };

const nom = (q: Qui) => (q ? `${q.prenom} ${q.nom}`.trim() : null);

/** Ligne d'une rubrique (version 0 et rien d'écrit si elle n'existe pas encore), ou null si la base ne répond pas. */
export async function lireLigne(cle: CleEdition): Promise<LigneContenu | null> {
  try {
    const r = await base(`contenu_site?select=valeur,brouillon,version,modifie_le,publie_le,modifie:equipe_profils!contenu_site_modifie_par_fkey(prenom,nom),publie:equipe_profils!contenu_site_publie_par_fkey(prenom,nom)&cle=eq.${encodeURIComponent(cle)}`);
    if (!r.ok) return null;
    const [l] = (await r.json()) as (Omit<LigneContenu, "modifiePar" | "publiePar"> & { modifie: Qui; publie: Qui })[];
    if (!l) return { valeur: null, brouillon: null, version: 0, modifie_le: null, publie_le: null, modifiePar: null, publiePar: null };
    return { valeur: l.valeur, brouillon: l.brouillon, version: l.version, modifie_le: l.modifie_le, publie_le: l.publie_le, modifiePar: nom(l.modifie), publiePar: nom(l.publie) };
  } catch {
    return null;
  }
}

/** Les 30 dernières versions, de la plus récente à la plus ancienne (null si la base ne répond pas). */
export async function lireVersions(cle: CleEdition): Promise<VersionContenu[] | null> {
  try {
    const r = await base(`contenu_versions?select=id,version,etat,le,auteur:equipe_profils(prenom,nom)&cle=eq.${encodeURIComponent(cle)}&order=version.desc&limit=30`);
    if (!r.ok) return null;
    return ((await r.json()) as (Omit<VersionContenu, "auteur"> & { auteur: Qui })[]).map((v) => ({ ...v, auteur: nom(v.auteur) }));
  } catch {
    return null;
  }
}

/** Valeur d'une version de l'historique (null : absente ou base muette). */
export async function lireVersion(cle: CleEdition, id: number): Promise<Json | null> {
  try {
    const r = await base(`contenu_versions?select=valeur&cle=eq.${encodeURIComponent(cle)}&id=eq.${id}`);
    if (!r.ok) return null;
    const [v] = (await r.json()) as { valeur: Json }[];
    return v ? v.valeur : null;
  } catch {
    return null;
  }
}

/** Données d'une surcharge fusionnée au défaut (sans fonction) ; la surcharge absente donne le défaut. */
export function fusion(cle: CleContenu, surcharge: Json | null): Json {
  const x = REGISTRE[cle];
  if (surcharge === null) return donnees(x.defaut) ?? null;
  // Une rubrique retirée du rendu public reste consultable, avec ses valeurs enregistrées, dans le panneau en lecture seule.
  if (x.verrouille) return surcharge;
  return fusionner(formeDe(cle), x.defaut, surcharge, cle, { medias: prefixesMedias() }).v;
}

/** Rubriques de la liste qui ont un brouillon en attente (ensemble vide si la base ne répond pas). */
export async function lireBrouillons(cles: CleEdition[]): Promise<Set<string>> {
  if (!cles.length) return new Set();
  try {
    const r = await base(`contenu_site?select=cle&brouillon=not.is.null&cle=in.(${cles.map((c) => `"${c}"`).join(",")})`);
    return r.ok ? new Set(((await r.json()) as { cle: string }[]).map((l) => l.cle)) : new Set();
  } catch {
    return new Set();
  }
}

/** Une traduction est relue contre la version française publiée, jamais contre un autre brouillon. */
export async function preparerEdition(cle: CleEdition) {
  const cible = decomposerCle(cle);
  if (cible.langue === "FR") return { cle: cible.cle, langue: cible.langue, forme: formeDe(cible.cle), source: REGISTRE[cible.cle].defaut };
  const ligne = await lireLigne(cible.cle);
  if (!ligne) return null;
  const source = fusion(cible.cle, ligne.valeur);
  return { cle: cible.cle, langue: cible.langue, forme: formeTraduction(formeDe(cible.cle), source), source };
}

export function fusionEdition(cle: CleEdition, valeur: Json | null, source: unknown): Json {
  const cible = decomposerCle(cle);
  return cible.langue === "FR" ? fusion(cible.cle, valeur) : donnees(traduireValeur(formeDe(cible.cle), source, valeur)) ?? null;
}
