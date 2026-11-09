import "server-only";
import { randomUUID } from "node:crypto";
import { base } from "../../base";
import { journaliser } from "../journal";
import { emailDe, origine, partir, voie } from "../messages/envoi";
import { adressesAdmins, rapport } from "./lectures";
import { courrielRapport } from "./rapport";
import { lireTaches, rpcTache } from "./taches";

/** Réservation durable par semaine et destinataire, commune au clic admin et au cron. Un SMTP incertain n'est jamais rejoué automatiquement. */
export async function traiterRapport(par: string | null, test = false, automatique = false) {
  if (automatique) {
    const reglages = await lireTaches();
    if (!reglages) return { erreur: "panne" as const };
    const jour = new Date(Date.now() + 3_600_000);
    if (!reglages.rapport_actif || jour.getUTCDay() !== 1 || jour.getUTCHours() < 8) return { ok: true as const, n: 0 };
  }
  const v = await voie();
  if (!v) return { erreur: "smtp" as const };
  const [r, adresses] = await Promise.all([rapport(Date.now()), test && par ? emailDe(par).then((e) => e ? [e] : null) : adressesAdmins()]);
  if (!r || !adresses) return { erreur: "panne" as const };
  if (!adresses.length) return { erreur: "introuvable" as const };
  const message = courrielRapport(r, await origine(), test);
  let n = 0, incertaines = 0;
  for (const a of [...new Set(adresses.map((x) => x.toLowerCase()))]) {
    const claim = test ? { valeur: randomUUID() } : await rpcTache<string | null>("rapport_reserver", { p_semaine: r.lundi, p_destinataire: a });
    if (!claim) return { erreur: "panne" as const };
    if (!claim.valeur) continue;
    const parti = await partir({ a, sujet: message.sujet, html: message.html, texte: message.texte, cle: `rapport-${claim.valeur}` }, v.boite).catch(() => false);
    if (!test) {
      try {
        const fin = await base(`rapports_envois?id=eq.${claim.valeur}&etat=eq.reservee`, { method: "PATCH", corps: { etat: parti ? "envoyee" : "incertaine", traite_le: new Date().toISOString() }, prefer: "return=minimal" });
        if (!fin.ok) return { erreur: "panne" as const };
      } catch { return { erreur: "panne" as const }; }
    }
    if (parti) n++; else incertaines++;
  }
  if (n || incertaines) await journaliser(test ? "rapport.test" : "rapport.envoi", par, null, { semaine: r.lundi, nombre: n, ...(incertaines ? { motif: "envoi" as const } : {}) });
  if (incertaines) return { erreur: "envoi" as const };
  return { ok: true as const, n };
}
