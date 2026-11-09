import "server-only";
import { base } from "../../base";
import { UUID } from "../dossiers-regles";
import type { EtatCommande } from "./regles";

// Commandes de la boutique à préparer puis à remettre (lot terrain L5), lues par le serveur seulement avec la clé secrète,
// après la session. Les commandes viennent du site (boutique_commandes, statut « a_confirmer ») ; l'équipe les fait
// avancer : à préparer, prête, remise. Les commandes remises restent visibles 7 jours. null : la base ne répond pas.

export type CommandeVue = {
  id: string;
  reference: string;
  etat: EtatCommande;
  client: string;
  telephone: string | null;
  articles: { nom: string; quantite: number; options: string[] }[];
  mode: "retrait" | "livraison";
  adresse: string | null;
  message: string | null;
  totalEur: number | null;
  totalXof: number | null;
  paiement: "attente" | "paye" | "a_regulariser";
  frais: number | null; // frais de livraison (FCFA), compris dans le total
  zone: string | null; // zone de la grille de livraison
  echeance: number | null; // paiement immédiat : fin de la réservation du stock (ms)
  recue: number;
  remise: number | null;
};
type Brute = {
  id: string;
  reference: string;
  statut: EtatCommande;
  lignes: { nom?: string; quantite?: number; options?: Record<string, unknown> }[];
  contact: { prenom?: string; nom?: string; telephone?: string } | null;
  remise: { mode?: string; adresse?: string; ville?: string; pays?: string } | null;
  message: string | null;
  total_eur: number | string | null;
  total_xof: number | null;
  paiement_etat: CommandeVue["paiement"];
  frais_livraison_xof: number | null;
  livraison_zone: string | null;
  paiement_expire_le: string | null;
  cree_le: string;
  remise_le: string | null;
};

const texte = (v: unknown) => (typeof v === "string" ? v : "");

const CHAMPS = "id,reference,statut,lignes,contact,remise,message,total_eur,total_xof,paiement_etat,frais_livraison_xof,livraison_zone,paiement_expire_le,cree_le,remise_le";

export async function lireCommandes(cible?: unknown): Promise<CommandeVue[] | null> {
  const depuis = new Date(Date.now() - 7 * 86_400_000).toISOString();
  try {
    const r = await base(`boutique_commandes?select=${CHAMPS}&statut=in.(a_confirmer,a_preparer,prete,remise,annulee)&or=(statut.neq.remise,remise_le.gte.${encodeURIComponent(depuis)})&order=cree_le.asc&limit=300`);
    if (!r.ok) return null;
    const lignes = await r.json() as Brute[];
    if (typeof cible === "string" && UUID.test(cible) && !lignes.some(c => c.id === cible)) {
      const rCible = await base(`boutique_commandes?select=${CHAMPS}&id=eq.${cible}&limit=1`);
      if (!rCible.ok) return null;
      const c = (await rCible.json() as Brute[])[0];
      if (c) lignes.unshift(c);
    }
    return lignes.map((c) => {
      const livraison = c.remise?.mode === "livraison";
      return {
        id: c.id,
        reference: c.reference,
        etat: c.statut,
        client: [texte(c.contact?.prenom), texte(c.contact?.nom)].filter(Boolean).join(" "),
        telephone: texte(c.contact?.telephone) || null,
        articles: (Array.isArray(c.lignes) ? c.lignes : []).map((l) => ({ nom: texte(l.nom), quantite: typeof l.quantite === "number" ? l.quantite : 1, options: Object.values(l.options ?? {}).filter((x): x is string => typeof x === "string" && x.length > 0) })),
        mode: livraison ? "livraison" : "retrait",
        adresse: livraison ? [texte(c.remise?.adresse), texte(c.remise?.ville), texte(c.remise?.pays)].filter(Boolean).join(", ") || null : null,
        message: c.message,
        totalEur: c.total_eur === null ? null : Number(c.total_eur),
        totalXof: c.total_xof ?? (c.total_eur === null ? null : Math.round(Number(c.total_eur) * 655.957)),
        paiement: c.paiement_etat,
        frais: c.frais_livraison_xof ?? null,
        zone: c.livraison_zone ?? null,
        echeance: c.paiement_expire_le ? Date.parse(c.paiement_expire_le) : null,
        recue: Date.parse(c.cree_le),
        remise: c.remise_le ? Date.parse(c.remise_le) : null,
      };
    });
  } catch {
    return null;
  }
}
