import "server-only";
import { lang } from "next/root-params";
import { lireContenu, type CleContenu } from "@/lib/contenu";
import { LANGUES_URL } from "@/lib/adresses-langues";
import { normaliserLangue, type Langue } from "@/lib/langue";

/** Paramètre racine statique, jamais cookie/en-tête. Réservé au rendu, pas aux actions/API. */
export async function languePage(): Promise<Langue> {
  return normaliserLangue(await lang());
}

/** Premier segment lu comme une langue sans en être une (/circuits, /contact, faute de frappe) : adresse introuvable. */
export async function langueInconnue(): Promise<boolean> {
  const v: unknown = await lang();
  return typeof v === "string" && !LANGUES_URL.some((l) => l === v);
}

export async function lireContenuPage<K extends CleContenu>(cle: K) {
  return lireContenu(cle, await languePage());
}
