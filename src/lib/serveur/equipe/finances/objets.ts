import "server-only";
import type { Session } from "../session";
import { droitsEffectifs } from "../securite/droits";
import { devisPayables, lire } from "./lectures";
import { UUID } from "./regles";

export type ObjetPayable = { id: string; source: "devis" | "commande" | "reservation"; client: string; numero: string | null; montant: number; langue: string; demande: string | null; facture: { id: string } | null };

/** Les droits sont vérifiés à chaque saisie, pas seulement dans la liste du formulaire. */
export async function objetsPayables(s: Session, source?: ObjetPayable["source"], id?: string): Promise<ObjetPayable[] | null> {
  if (id && !UUID.test(id)) return [];
  const droits = droitsEffectifs(s.droits);
  const filtre = id ? `&id=eq.${id}` : "";
  const resultats: ObjetPayable[] = [];
  if (!source || source === "devis") {
    const devis = await devisPayables(s, id);
    if (!devis) return null;
    resultats.push(...devis.map((d) => ({ ...d, source: "devis" as const })));
  }
  if ((!source || source === "commande") && (s.role === "admin" || droits.boutique)) {
    const commandes = await lire<{ id: string; reference: string; total_xof: number | null; total_eur: number | null; contact: { prenom?: string; nom?: string }; langue: string }>(`boutique_commandes?select=id,reference,total_xof,total_eur,contact,langue&statut=in.(a_preparer,prete)&paiement_etat=neq.paye${filtre}&order=cree_le.desc&limit=1000`);
    if (!commandes) return null;
    for (const c of commandes) {
      const montant = c.total_xof ?? (c.total_eur === null ? null : Math.round(c.total_eur * 655.957));
      if (montant !== null && montant > 0) resultats.push({ id: c.id, source: "commande", numero: c.reference, client: [c.contact.prenom, c.contact.nom].filter(Boolean).join(" "), montant, langue: c.langue, demande: null, facture: null });
    }
  }
  if ((!source || source === "reservation") && (s.role === "admin" || droits.billets)) {
    const reservations = await lire<{ id: string; montant: number; nom: string; langue: string; evenement: string }>(`reservations?select=id,montant,nom,langue,evenement&statut=eq.attente${filtre}&order=cree_le.desc&limit=1000`);
    if (!reservations) return null;
    resultats.push(...reservations.filter((r) => r.montant > 0).map((r) => ({ id: r.id, source: "reservation" as const, numero: r.evenement, client: r.nom, montant: r.montant, langue: r.langue, demande: null, facture: null })));
  }
  return resultats;
}
