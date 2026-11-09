import "server-only";
import { bornesMois, enXof } from "./regles";
import { lire } from "./lectures";
import { commissionCumulee, type Fiscalite, type ReglesFinancieres } from "./fiscalite-regles";

export async function reglesFinancieres(): Promise<ReglesFinancieres | null> {
  const r = await lire<ReglesFinancieres>("finances_regles?select=tva_active,tva_taux,commission_active,commission_taux,modifie_le&id=eq.true&limit=1");
  return r?.[0] ? { ...r[0], tva_taux: Number(r[0].tva_taux), commission_taux: Number(r[0].commission_taux) } : null;
}

export type CommissionAgent = { id: string; nom: string; ht: number; commission: number; documents: number };
export async function commissionsMois(mois: string): Promise<CommissionAgent[] | null> {
  const b = bornesMois(mois), agents = new Map<string, CommissionAgent>();
  type Ligne = { fiscalite: Fiscalite; avoirs: { montant: number; cree_le: string }[]; paiements: { montant: number; devise: string; etat: string; recu_le: string }[]; liens: { montant: number; paye_le: string | null }[] };
  for (let offset = 0; ; offset += 500) {
    const lignes = await lire<Ligne>(`factures?select=fiscalite,avoirs(montant,cree_le),paiements:paiements_manuels!paiements_manuels_facture_id_fkey(montant,devise,etat,recu_le),liens:liens_paiement!liens_paiement_facture_id_fkey(montant,paye_le)&fiscalite->>commission_active=eq.true&order=id.asc&limit=500&offset=${offset}`);
    if (!lignes) return null;
    for (const f of lignes) {
      const id = f.fiscalite.agent_id;
      if (!id) continue;
      const paiements = [
        ...f.paiements.filter((p) => p.etat === "confirme").map((p) => ({ montant: enXof(p.montant, p.devise), date: `${p.recu_le}T00:00:00+01:00` })),
        ...f.liens.filter((l) => l.paye_le).map((l) => ({ montant: l.montant, date: l.paye_le! })),
      ];
      const avoirs = f.avoirs.map((a) => ({ montant: a.montant, date: a.cree_le }));
      const debut = commissionCumulee(f.fiscalite, paiements, avoirs, b.debut), fin = commissionCumulee(f.fiscalite, paiements, avoirs, b.fin);
      if (debut.ht === fin.ht && debut.commission === fin.commission) continue;
      const a = agents.get(id) ?? { id, nom: id, ht: 0, commission: 0, documents: 0 };
      a.ht += fin.ht - debut.ht;
      a.commission += fin.commission - debut.commission;
      a.documents++;
      agents.set(id, a);
    }
    if (lignes.length < 500) break;
  }
  if (agents.size) {
    const profils = await lire<{ id: string; prenom: string; nom: string }>(`equipe_profils?select=id,prenom,nom&id=in.(${[...agents.keys()].join(",")})`);
    if (!profils) return null;
    for (const p of profils) agents.get(p.id)!.nom = `${p.prenom} ${p.nom}`.trim();
  }
  return [...agents.values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}
