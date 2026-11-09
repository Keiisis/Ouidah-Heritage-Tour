import { base } from "./base";
import { lireCoursBce, TAUX_EUR, tauxTropAncien, type SourceTaux, type TauxFige } from "./taux-regles";

// Source approuvée par Kevin le 04/11 ; v1 reste disponible : https://frankfurter.dev/v1/.
const URL_BCE = "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD";
export type EtatTaux = TauxFige & { mode: "auto" | "manuel"; verifieLe: string | null; propose: { taux: number; date: string } | null; ancien: boolean };
export type HistoriqueTaux = { id: string; taux: number | null; date_cours: string | null; source: SourceTaux | null; evenement: "applique" | "propose" | "auto"; cree_le: string; auteur: { prenom: string; nom: string } | null };
type Ligne = TauxFige & { taux_usd_mode: "auto" | "manuel"; taux_usd_verifie_le: string | null; taux_usd_propose: number | null; taux_usd_propose_le: string | null };
const CHAMPS = "taux_eur,taux_usd,taux_usd_le,taux_usd_source,taux_usd_mode,taux_usd_verifie_le,taux_usd_propose,taux_usd_propose_le";

export async function lireEtatTaux(): Promise<EtatTaux | null> {
  try {
    const r = await base(`reglages_site?select=${CHAMPS}&limit=1`);
    const x = r.ok ? ((await r.json()) as Ligne[])[0] : null;
    if (!x) return null;
    const usd = x.taux_usd == null ? null : Number(x.taux_usd);
    if (Number(x.taux_eur) !== TAUX_EUR || (usd !== null && (!Number.isFinite(usd) || usd < 100 || usd > 5000))) return null;
    return {
      taux_eur: TAUX_EUR, taux_usd: usd, taux_usd_le: x.taux_usd_le ?? null, taux_usd_source: x.taux_usd_source ?? null,
      mode: x.taux_usd_mode === "auto" ? "auto" : "manuel", verifieLe: x.taux_usd_verifie_le ?? null,
      propose: x.taux_usd_propose != null && x.taux_usd_propose_le ? { taux: Number(x.taux_usd_propose), date: x.taux_usd_propose_le } : null,
      ancien: usd !== null && tauxTropAncien(x.taux_usd_le),
    };
  } catch { return null; }
}

/** Appelé seulement après contrôle de la session par l'écran équipe. Aucun historique n'est envoyé au site public. */
export async function lireHistoriqueTaux(): Promise<HistoriqueTaux[] | null> {
  try {
    const r = await base("taux_historique?select=id,taux,date_cours,source,evenement,cree_le,auteur:equipe_profils(prenom,nom)&order=cree_le.desc,id.desc&limit=30");
    return r.ok ? await r.json() as HistoriqueTaux[] : null;
  } catch { return null; }
}

export type RetourTaux = { ok: true; etat: "applique" | "propose" | "auto" | "ignore" | "verifier" } | { erreur: "panne" | "admin" | "refuse" | "champs" | "taux_perime" };
/** Une transaction verrouille le réglage et ajoute l'historique ; aucun PATCH séparé ne peut perdre la trace. */
export async function modifierTaux(operation: "manuel" | "auto" | "valider" | "bce" | "verifier", auteur: string | null, taux: number | null = null, date: string | null = null): Promise<RetourTaux> {
  try {
    const r = await base("rpc/regler_taux_usd", { method: "POST", corps: { p_operation: operation, p_auteur: auteur, p_taux: taux, p_date: date } });
    return r.ok ? await r.json() as RetourTaux : { erreur: "panne" };
  } catch { return { erreur: "panne" }; }
}

/** Au plus une vérification par heure, verrou partagée en base compris. Une panne garde le dernier taux et sa date. */
export async function actualiserTauxAutomatique(): Promise<EtatTaux | null> {
  const avant = await lireEtatTaux();
  if (!avant || avant.mode !== "auto" || (avant.verifieLe && Date.now() - Date.parse(avant.verifieLe) < 3_600_000)) return avant;
  const verrou = await modifierTaux("verifier", null);
  if (!("ok" in verrou) || verrou.etat !== "verifier") return avant;
  try {
    const r = await fetch(URL_BCE, { cache: "no-store", signal: AbortSignal.timeout(5000), headers: { accept: "application/json" }, redirect: "error" });
    const cours = r.ok ? lireCoursBce(await r.json()) : null;
    if (cours) await modifierTaux("bce", null, cours.taux, cours.date);
  } catch { /* Panne de la source : le taux et sa date restent inchangés, l'écran signale son ancienneté. */ }
  return await lireEtatTaux() ?? avant;
}

/** Snapshot à enregistrer avec une nouvelle commande ; jamais à recalculer lors d'une lecture ou d'un paiement. */
export async function figerTaux(): Promise<TauxFige | null> {
  const t = await actualiserTauxAutomatique();
  return t ? { taux_eur: t.taux_eur, taux_usd: t.taux_usd, taux_usd_le: t.taux_usd_le, taux_usd_source: t.taux_usd_source } : null;
}
