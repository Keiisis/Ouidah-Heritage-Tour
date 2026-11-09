import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { draftMode } from "next/headers";
import { type CleContenu, type CleEdition, cleEdition, estCle, formeDe, prefixesMedias, REGISTRE, traduisible, type ValeurContenu } from "./contenu-registre";
import { contenuPublic, donnees, fusionner, type Json } from "./contenu-regles";
import { base, baseConfiguree } from "./serveur/base";
import { journaliser } from "./serveur/equipe/journal";
import { avecMessages, messagesValides, traduireValeur } from "./traductions";
import type { Langue } from "./langue";

// Une lecture groupée, mise en cache par langue. La publication expire « contenu » pour toutes les langues.
// L'aperçu garde ses brouillons privés ; les données techniques sont toujours celles du français publié.
// Les textes calculés sont rendus par des fonctions contrôlées et des modèles éditables, sans eval.

export type { CleContenu, ValeurContenu } from "./contenu-registre";
export const tagContenu = (cle: CleEdition) => `contenu:${cle}`;

async function contenusPublies(langue: Langue = "FR"): Promise<Partial<Record<CleContenu, Json>>> {
  "use cache";
  cacheTag("contenu");
  const { isEnabled: apercu } = await draftMode();
  if (!baseConfiguree()) return {};
  let lignes: { cle: string; valeur: Json | null; brouillon: Json | null }[] | null = null;
  try {
    const r = await base("contenu_site?select=cle,valeur,brouillon");
    lignes = r.ok ? ((await r.json()) as { cle: string; valeur: Json | null; brouillon: Json | null }[]) : null;
  } catch {
    lignes = null;
  }
  if (!lignes) {
    cacheLife("minutes");
    return {};
  }
  cacheLife("hours");
  const sortie: Partial<Record<CleContenu, Json>> = {};
  const valeur = (ligne: { valeur: Json | null; brouillon: Json | null }) => apercu ? (ligne.brouillon ?? ligne.valeur) : ligne.valeur;
  for (const l of lignes) {
    if (!estCle(l.cle)) continue;
    const cle = l.cle;
    const x = REGISTRE[cle];
    if (x.verrouille) continue;
    const brut = valeur(l);
    if (brut === null || brut === undefined) continue;
    const { v, ecarts } = fusionner(formeDe(cle), x.defaut, brut, cle, { medias: prefixesMedias() });
    if (ecarts.length) await journaliser("contenu.ecart", null, null, { cle, nombre: ecarts.length });
    sortie[cle] = v;
  }
  if (langue !== "FR") for (const cle of Object.keys(REGISTRE) as CleContenu[]) {
    if (!traduisible(cle)) continue;
    const ligne = lignes.find((l) => l.cle === cleEdition(cle, langue));
    const brut = ligne ? valeur(ligne) : null;
    if (brut === null) continue;
    const source = sortie[cle] ?? REGISTRE[cle].defaut;
    sortie[cle] = donnees(traduireValeur(formeDe(cle), source, brut)) ?? null;
  }
  return sortie;
}

/** Seules les valeurs publiques partent au navigateur. Les documents serveur gardent les mentions complètes. */
export async function surchargesPubliques(langue: Langue = "FR"): Promise<Partial<Record<CleContenu, Json>>> {
  const valeurs = await contenusPublies(langue);
  return Object.fromEntries(Object.entries(valeurs).map(([cle, v]) => [cle, contenuPublic(cle, v)]));
}

/** Contenu d'une rubrique : la version publiée si elle existe et vaut, sinon le défaut du code. */
export async function lireContenu<K extends CleContenu>(cle: K, langue: Langue = "FR"): Promise<ValeurContenu<K>> {
  const valeurs = await contenusPublies(langue);
  return avecMessages(cle, REGISTRE[cle].defaut as ValeurContenu<K>, valeurs[cle], langue, messagesValides(valeurs["site.messages"]));
}
