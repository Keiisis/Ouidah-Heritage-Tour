export type ReglesFinancieres = {
  tva_active: boolean; tva_taux: number; commission_active: boolean; commission_taux: number; modifie_le: string;
};
export type VentilationTva = { tva_active: boolean; tva_taux: number; ht: number; tva: number; ttc: number };
export type Fiscalite = VentilationTva & { commission_active: boolean; commission_taux: number; agent_id: string | null; regles_le: string };

/** Prix TTC inchangé. Un arrondi au franc sur le HT, TVA = TTC − HT : aucune perte par addition. */
export function ventilationTva(ttc: number, active: boolean, taux: number): VentilationTva {
  if (!Number.isSafeInteger(ttc) || ttc < 0 || !Number.isFinite(taux) || taux < 0 || taux > 100 || Math.abs(taux * 100 - Math.round(taux * 100)) > 1e-8) throw new Error("montant_taux_invalide");
  const diviseur = BigInt(10000 + Math.round(taux * 100));
  const ht = active ? Number((BigInt(ttc) * BigInt(10000) + diviseur / BigInt(2)) / diviseur) : ttc;
  return { tva_active: active, tva_taux: active ? taux : 0, ht, tva: ttc - ht, ttc };
}

/** Le contrat public des documents ne contient jamais le taux de commission ni l’agent. */
export function taxeDocument(f: Fiscalite | VentilationTva | null | undefined, montant: number): VentilationTva | null {
  if (!f) return null;
  return montant === f.ttc
    ? { tva_active: f.tva_active, tva_taux: Number(f.tva_taux), ht: f.ht, tva: f.tva, ttc: f.ttc }
    : ventilationTva(montant, f.tva_active, Number(f.tva_taux));
}

export type MouvementCommission = { montant: number; date: string };
/** Commission cumulée, plafonnée au montant net des avoirs. Le mois est la différence de deux cumuls :
 * un avoir ou une écriture inverse tardifs reprennent la commission déjà comptée, sans réécrire le mois précédent. */
export function commissionCumulee(f: Fiscalite, paiements: MouvementCommission[], avoirs: MouvementCommission[], avant: string): { ht: number; commission: number } {
  if (!f.commission_active || !f.agent_id || f.ttc <= 0) return { ht: 0, commission: 0 };
  const borne = Date.parse(avant);
  const somme = (m: MouvementCommission[]) => m.filter((p) => Date.parse(p.date) < borne).reduce((n, p) => n + p.montant, 0);
  const net = Math.max(0, f.ttc - somme(avoirs));
  const encaisse = Math.max(0, Math.min(net, somme(paiements)));
  const ht = Number((BigInt(encaisse) * BigInt(f.ht) * BigInt(2) + BigInt(f.ttc)) / (BigInt(2) * BigInt(f.ttc)));
  return { ht, commission: Number((BigInt(ht) * BigInt(Math.round(f.commission_taux * 100)) + BigInt(5000)) / BigInt(10000)) };
}

export function lireReglesFinancieres(brut: unknown): Omit<ReglesFinancieres, "modifie_le"> | null {
  const o = brut instanceof FormData ? Object.fromEntries(brut) : brut && typeof brut === "object" ? brut as Record<string, unknown> : {};
  const active = (v: unknown) => v === true || v === "on";
  const taux = (v: unknown) => typeof v === "number" ? v : typeof v === "string" && /^\d{1,3}(?:[.,]\d{1,2})?$/.test(v.trim()) ? Number(v.trim().replace(",", ".")) : NaN;
  const tva = taux(o.tva_taux), commission = taux(o.commission_taux);
  if (![tva, commission].every((v) => Number.isFinite(v) && v >= 0 && v <= 100 && Math.abs(v * 100 - Math.round(v * 100)) < 1e-8)) return null;
  if (![undefined, false, true, "on"].includes(o.tva_active as undefined | boolean | string) || ![undefined, false, true, "on"].includes(o.commission_active as undefined | boolean | string)) return null;
  return { tva_active: active(o.tva_active), tva_taux: tva, commission_active: active(o.commission_active), commission_taux: commission };
}
