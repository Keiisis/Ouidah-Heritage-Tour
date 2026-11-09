import "server-only";
import { lang } from "next/root-params";
import { lireContenu, type CleContenu } from "@/lib/contenu";
import { normaliserLangue, type Langue } from "@/lib/langue";

/** Paramètre racine statique, jamais cookie/en-tête. Réservé au rendu, pas aux actions/API. */
export async function languePage(): Promise<Langue> {
  return normaliserLangue(await lang());
}

export async function lireContenuPage<K extends CleContenu>(cle: K) {
  return lireContenu(cle, await languePage());
}
