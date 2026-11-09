import type { Facture } from "../equipe/finances/lectures";
import type { DemandeFactureEmcf, DetailsFactureEmcf, GroupeTaxeEmcf, GroupesTaxesEmcf, TypePaiementEmcf } from "./client";

export const GROUPES_EMCF: GroupeTaxeEmcf[] = ["A", "B", "C", "D", "E", "F"];
export const PAIEMENTS_EMCF: TypePaiementEmcf[] = ["ESPECES", "VIREMENT", "CARTEBANCAIRE", "MOBILEMONEY", "CHEQUES", "CREDIT", "AUTRE"];

/** Une catégorie choisie explicitement ; un taux nul ne permet jamais de deviner A/C/E/F. */
export function demandeDepuisFacture(f: Facture, groupe: GroupeTaxeEmcf, paiement: TypePaiementEmcf, taxes: GroupesTaxesEmcf, ifu: string, operateur: { id: string; name: string }): DemandeFactureEmcf | null {
  if (!GROUPES_EMCF.includes(groupe) || !PAIEMENTS_EMCF.includes(paiement) || !f.fiscalite || f.avoirs.length || f.statut === "annulee") return null;
  const taux = f.fiscalite.tva_active ? Number(f.fiscalite.tva_taux) : 0;
  const tauxDgi = taxes[groupe.toLowerCase() as "a" | "b" | "c" | "d" | "e" | "f"];
  if (!Number.isFinite(tauxDgi) || tauxDgi !== taux || f.fiscalite.ttc !== f.montant || !Number.isSafeInteger(f.montant) || f.montant <= 0
    || ![f.fiscalite.ht, f.fiscalite.tva].every((v) => Number.isSafeInteger(v) && v >= 0) || f.fiscalite.ht + f.fiscalite.tva !== f.montant) return null;
  if (f.recu < f.montant && paiement !== "CREDIT") return null;
  if (!f.lignes.length || f.lignes.length > 200 || f.lignes.some((l) => !l.libelle.trim() || l.libelle.length > 1000 || !Number.isSafeInteger(l.prix_unitaire) || l.prix_unitaire < 0 || !Number.isFinite(l.quantite) || l.quantite <= 0)) return null;
  if (f.lignes.some((l) => !Number.isSafeInteger(l.prix_unitaire * l.quantite)) || f.lignes.reduce((s, l) => s + l.prix_unitaire * l.quantite, 0) !== f.montant) return null;
  return {
    ifu, type: "FV", operator: operateur,
    client: { name: f.client.nom, contact: f.client.email },
    items: f.lignes.map((l) => ({ name: l.libelle, price: l.prix_unitaire, quantity: l.quantite, taxGroup: groupe })),
    payment: [{ name: paiement, amount: f.montant }],
  };
}

/** Comparaison des données conservées chez la DGI, sans prendre paymentUrl comme preuve de certification. */
export function memeDemande(a: DemandeFactureEmcf, b: DetailsFactureEmcf): boolean {
  const forme = (d: DemandeFactureEmcf) => ({
    ifu: d.ifu, type: d.type, aib: d.aib ?? null, reference: d.reference ?? "",
    operator: { id: d.operator.id ?? "", name: d.operator.name },
    client: Object.fromEntries((["ifu", "name", "contact", "address"] as const).map((k) => [k, d.client?.[k] ?? ""])),
    items: d.items.map((i) => ({ code: i.code ?? "", name: i.name, price: i.price, quantity: i.quantity, taxGroup: i.taxGroup, taxSpecific: i.taxSpecific ?? 0, originalPrice: i.originalPrice ?? null, priceModification: i.priceModification ?? "" })),
    payment: (d.payment ?? []).map((p) => ({ name: p.name, amount: p.amount })),
  });
  return JSON.stringify(forme(a)) === JSON.stringify(forme(b));
}
