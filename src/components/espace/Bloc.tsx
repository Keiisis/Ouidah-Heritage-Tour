import type { CSSProperties, ReactNode } from "react";
import "./blocs.css";

// Bloc de l'accueil : le titre posé sur sa ligne d'horizon, le compte en disque, puis le corps. `s` = colonnes sur 12,
// `i` = rang dans la chorégraphie d'entrée. `cache390` : bloc réservé à l'ordinateur (résumé ailleurs en 390).
export const vars = (v: Record<string, string | number>) => v as CSSProperties;

export function Bloc({ id, titre, compte = null, lien, s, i, cache390 = false, children }: { id: string; titre: string; compte?: number | null; lien?: ReactNode; s: number; i: number; cache390?: boolean; children: ReactNode }) {
  return (
    <section className={cache390 ? "esp-bloc construit cache-390" : "esp-bloc construit"} style={vars({ "--s": s, "--i": i })} aria-labelledby={id}>
      <div className="bloc-tete">
        <h2 id={id}>
          {titre}
          {compte !== null && <span className="compte">{compte}</span>}
        </h2>
        {lien}
      </div>
      <div className="bloc-corps">
        {children}
      </div>
    </section>
  );
}

/** État vide honnête : ce qui manque, puis ce qui viendra ici. */
export function Vide({ texte: [fort, suite] }: { texte: readonly [string, string] | string[] }) {
  return (
    <div className="vide">
      <b>{fort}</b>
      {suite && <span>{suite}</span>}
    </div>
  );
}
