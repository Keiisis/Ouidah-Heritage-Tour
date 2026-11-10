import { base } from "../../base";
import { actualiserTauxAutomatique } from "../../taux";
import type { SourceTaux } from "../../taux-regles";
import type { Textes } from "./regles";

// Réglages lus hors de l'espace équipe, sans session : par le proxy du site public (maintenance, une fois branché par la
// session documents) et par les écrans qui pourraient montrer l'assistant. Aucun « server-only » ici : le proxy de Next
// doit pouvoir l'importer. Rien de secret n'en sort : les clés ne sont lues que pour savoir si elles existent.

/** Au moins une clé Groq posée sur le serveur (GROQ_API_KEYS, clés séparées par des virgules ; présence seulement). */
export const cleAssistant = () => (process.env.GROQ_API_KEYS ?? "").split(",").some((k) => k.trim().length > 0);

export type TauxPublics = { eur: number; usd: number | null; usdLe: string | null; usdSource: SourceTaux | null; ancien: boolean };
let memoTaux: { t: number; v: TauxPublics } | null = null;
export const oublierTauxPublics = () => { memoTaux = null; };

/** Taux d'affichage : euro fixe, dollar BCE ou manuel. Une panne conserve le taux et sa date ; ancien signale le retard.
 * Réglage relu au plus toutes les 30 s ; vérification BCE au plus une fois par heure, partagée entre instances. */
export async function tauxPublics(): Promise<TauxPublics | null> {
  if (memoTaux && Date.now() - memoTaux.t < 30_000) return memoTaux.v;
  const x = await actualiserTauxAutomatique();
  if (!x) return null;
  memoTaux = { t: Date.now(), v: { eur: x.taux_eur, usd: x.taux_usd, usdLe: x.taux_usd_le, usdSource: x.taux_usd_source, ancien: x.ancien } };
  return memoTaux.v;
}

export type EtatMaintenance = { actif: boolean; message: Textes };

export type ModeEco = "auto" | "marche" | "arret";
export type EtatEco = { mode: ModeEco; plafond: number | null; vues: number | null; actif: boolean };
/** Seuil de l'allumage automatique : part du plafond de vues du mois. */
export const ECO_SEUIL = 0.7;
let memoEco: { t: number; v: EtatEco } | null = null;

/** Mode économie (migration 20261105_mode_eco.sql) : 'marche' / 'arret' imposés par un admin ; 'auto' allumé quand les vues
 * du mois (vues_du_mois) dépassent ECO_SEUIL du plafond, jamais sans plafond. Relu au plus toutes les 5 min par processus
 * (`frais` : relu tout de suite, écran admin). null si la base ne répond pas. */
export async function etatEco(frais = false): Promise<EtatEco | null> {
  if (!frais && memoEco && Date.now() - memoEco.t < 300_000) return memoEco.v;
  try {
    const r = await base("reglages_site?select=mode_eco,plafond_vues_mois&limit=1");
    if (!r.ok) return null;
    const x = ((await r.json()) as { mode_eco: ModeEco; plafond_vues_mois: number | null }[])[0];
    if (!x) return null;
    let vues: number | null = null;
    if (x.plafond_vues_mois !== null) {
      const v = await base("rpc/vues_du_mois", { method: "POST", corps: {} });
      if (!v.ok) return null;
      vues = Number(await v.json());
    }
    const actif = x.mode_eco === "marche" || (x.mode_eco === "auto" && vues !== null && x.plafond_vues_mois !== null && vues > ECO_SEUIL * x.plafond_vues_mois);
    memoEco = { t: Date.now(), v: { mode: x.mode_eco, plafond: x.plafond_vues_mois, vues, actif } };
    return memoEco.v;
  } catch {
    return null;
  }
}

/** Mode économie allumé ; base muette : éteint (le site garde son rythme normal). */
export const modeEco = async () => (await etatEco())?.actif === true;

/** Assistant d'écriture utilisable : allumé par un admin ET clé du fournisseur présente. Sans les deux, aucun écran ne
 * montre son bouton. */
export async function assistantDisponible(): Promise<boolean> {
  if (!cleAssistant()) return false;
  try {
    const r = await base("reglages_site?select=assistant_actif&limit=1");
    return r.ok && ((await r.json()) as { assistant_actif: boolean }[])[0]?.assistant_actif === true;
  } catch {
    return false;
  }
}
