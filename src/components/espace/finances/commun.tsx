import { espace as T } from "@/content/espace";
import { finances as F } from "@/content/espace-finances";
import { euro, euroDeFcfa, fcfa } from "../outils";

// Petits morceaux communs des écrans « finances » (composants serveur) : montant en FCFA et en €, date à Ouidah, état.
const leJour = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: T.ouidah.fuseau });
const leMois = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
export const dateFr = (v: string) => leJour.format(Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00Z` : v));
export const moisFr = (mois: string) => leMois.format(Date.parse(`${mois}-15T12:00:00Z`));

/** Montant en FCFA, l'équivalent en € dessous (taux fixe 655,957). EUR : montant en centimes. */
export function Montant({ n, devise = "XOF" }: { n: number; devise?: string }) {
  if (devise === "EUR") {
    return (
      <span className="num">
        {euro(n / 100)}
        <small>{fcfa(Math.round((n * 655_957) / 100_000))}</small>
      </span>
    );
  }
  return (
    <span className="num">
      {fcfa(n)}
      <small>{euroDeFcfa(n)}</small>
    </span>
  );
}

export function Etat({ e, textes }: { e: string; textes: Record<string, string> }) {
  return (
    <span className="etat" data-e={e}>
      {textes[e] ?? e}
    </span>
  );
}

export const libelleMode = (m: string) => (T.modes as Record<string, string>)[m] ?? F.modesDepense[m as keyof typeof F.modesDepense] ?? m;
