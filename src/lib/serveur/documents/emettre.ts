import { base } from "../base";

// Numéro d'un document (T- ticket, R- reçu de paiement, D- devis), émis une seule fois par source et sans trou
// (fonction `emettre_document` de la migration 20261102). Un échec ne bloque jamais la commande : le document sera
// émis à la première lecture du suivi.
export type TypeDocument = "T" | "R" | "D";
export type SourceDocument = "reservation" | "demande" | "commande" | "devis";

export async function emettre(type: TypeDocument, source: SourceDocument, id: string): Promise<{ numero: string; cree_le: string } | null> {
  const r = await base("rpc/emettre_document", { method: "POST", corps: { p_type: type, p_source: source, p_source_id: id } }).catch(() => null);
  if (!r?.ok) return null;
  const doc = (await r.json().catch(() => null)) as { numero?: unknown; cree_le?: unknown } | null;
  return typeof doc?.numero === "string" && typeof doc.cree_le === "string" ? { numero: doc.numero, cree_le: doc.cree_le } : null;
}
