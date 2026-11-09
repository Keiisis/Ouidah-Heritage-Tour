import { espace as T } from "@/content/espace";
import { reglages as R } from "@/content/espace-reglages";

// Petits morceaux communs des écrans « reglages » (composants serveur) : date et heure à Ouidah, pastille d'état, ligne
// « modifié le … par … ».
const leQuand = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: T.ouidah.fuseau });
export const quand = (iso: string) => leQuand.format(Date.parse(iso));

export function Etat({ e, texte }: { e: string; texte: string }) {
  return (
    <span className="etat" data-e={e}>
      {texte}
    </span>
  );
}

/** « Jamais modifié », ou « Modifié le … par … » quand l'auteur est connu (sinon rien : la date seule serait celle de la
 * création de la ligne par la migration). */
export function Modifie({ le, par, jamais = false }: { le: string; par: string | null; jamais?: boolean }) {
  if (jamais) return <p className="aide">{R.jamais}</p>;
  return par ? <p className="aide">{R.modifie(quand(le), par)}</p> : null;
}
