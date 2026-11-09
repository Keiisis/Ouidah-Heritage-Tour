import "server-only";
import { espace as T } from "@/content/espace";
import { pilotage as P } from "@/content/espace-pilotage";
import { echapper } from "../../courriel";
import type { Rapport } from "./lectures";

// E-mail du rapport hebdomadaire (admin) : les chiffres de la semaine écoulée, tels que l'écran les montre, en français
// (l'équipe travaille en français). Texte simple et HTML sobre, aucun suivi d'ouverture, aucune image distante.

const leJour = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
const nombre = new Intl.NumberFormat("fr-FR");
const jour = (d: string) => leJour.format(Date.parse(`${d}T12:00:00Z`));

export const titreSemaine = (r: Rapport) => P.rapport.semaine(jour(r.lundi), jour(r.dimanche));

/** Les lignes du rapport, dans l'ordre de l'écran : [libellé, valeur affichée]. */
export function lignesRapport(r: Rapport): [string, string][] {
  const L = P.rapport.lignes;
  return [
    [L.demandes, nombre.format(r.demandes)],
    [L.devis, nombre.format(r.devis)],
    [L.paiements, nombre.format(r.paiements)],
    [L.encaisse, `${nombre.format(r.encaisse)} ${T.monnaie.fcfa}`],
    [L.billets, nombre.format(r.billets)],
    [L.aConfirmer, nombre.format(r.aConfirmer)],
    [L.nonAttribuees, nombre.format(r.nonAttribuees)],
  ];
}

export function courrielRapport(r: Rapport, origine: string | null, test: boolean) {
  const C = P.rapport.courriel;
  const semaine = titreSemaine(r);
  const lignes = lignesRapport(r);
  const lien = origine ? `${origine}/admins/rapport` : null;
  const sujet = `${test ? `[${C.test}] ` : ""}${C.sujet(semaine)}`;
  const texte = [C.bonjour, "", C.intro, semaine, "", ...lignes.map(([l, v]) => `${l} : ${v}`), "", C.pied, ...(lien ? ["", `${C.lien} : ${lien}`] : [])].join("\n");
  const html = `<!doctype html><html lang="fr"><body style="margin:0;padding:24px;background:#f7f1e8;color:#0b1638;font:16px/1.5 Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px">
<p style="margin:0 0 12px">${echapper(C.bonjour)}</p>
<p style="margin:0 0 4px">${echapper(C.intro)}</p>
<h1 style="margin:0 0 16px;font:400 24px/1.25 Georgia,serif">${echapper(semaine)}</h1>
<table role="presentation" style="width:100%;border-collapse:collapse">${lignes.map(([l, v]) => `<tr><td style="padding:8px 0;border-top:1px solid #e6ddd0">${echapper(l)}</td><td style="padding:8px 0;border-top:1px solid #e6ddd0;text-align:right;font-weight:700">${echapper(v)}</td></tr>`).join("")}</table>
<p style="margin:16px 0 0;color:#4a5370;font-size:14px">${echapper(C.pied)}</p>
${lien ? `<p style="margin:16px 0 0"><a href="${echapper(lien)}" style="color:#0b1638;font-weight:700">${echapper(C.lien)}</a></p>` : ""}
</div></body></html>`;
  return { sujet, texte, html };
}
