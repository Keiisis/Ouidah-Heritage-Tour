"use client";

import Link from "next/link";
import type { Picto as NomPicto } from "@/content/espace";
import { espace as T } from "@/content/espace";
import { etatMoment } from "@/lib/serveur/equipe/dossiers-regles";
import type { RepereArc } from "./ArcSoleil";
import { useMinute } from "./Cadre";
import { hm, minutesOuidah } from "./outils";
import { Picto, PICTO_MOMENT } from "./Picto";

// Sous l'horizon de « La course du soleil » (lot L4) : ce qui est en cours, ce qui est passé sans être traité (« À clore »,
// un lien vers le dossier pour le clore), ce qui vient ensuite (deux lignes, le reste replié) et ce qui est passé (« Sous
// l'horizon »). L'état de chaque moment suit l'horloge (même minute que l'arc : rendu serveur et hydratation identiques).
// `fixes` : lignes déjà rendues par le serveur (événement du jour, retraits boutique) rangées dans les mêmes rubriques.
export type LigneFixe = { cle: string; texte: string; picto: NomPicto };
type Rubrique = "encours" | "aclore" | "ensuite" | "fait";

export function MomentsSol({ moments, fixes = {}, rubriques, indisponible = false, vide }: { moments: RepereArc[]; fixes?: Partial<Record<Rubrique, LigneFixe[]>>; rubriques: Rubrique[]; indisponible?: boolean; vide?: string }) {
  const minute = useMinute();
  const t = minute * 60_000;
  const J = T.journee;
  const par: Record<Rubrique, RepereArc[]> = { encours: [], aclore: [], ensuite: [], fait: [] };
  for (const r of [...moments].sort((a, b) => a.debut - b.debut)) {
    const e = etatMoment(r, t);
    par[e === "avenir" ? "ensuite" : e].push(r);
  }
  par.fait.reverse(); // le plus récent d'abord
  const heure = (r: RepereArc) => hm(minutesOuidah(Math.floor(r.debut / 60_000)));
  const texte = (r: RepereArc) => `${heure(r)}, ${T.moments.types[r.type].toLowerCase()} : ${r.quoi}${r.agent ? `, ${r.agent}` : ""}`;
  const ligne = (r: RepereArc, lien: boolean) => (
    <li key={r.id} data-moment={r.id}>
      <Picto nom={PICTO_MOMENT[r.type]} />
      {lien ? <Link href={r.href}>{texte(r)}</Link> : <span>{texte(r)}</span>}
    </li>
  );
  const fixe = (f: LigneFixe) => (
    <li key={f.cle}>
      <Picto nom={f.picto} />
      <span>{f.texte}</span>
    </li>
  );
  const rien = !moments.length && !Object.values(fixes).some((l) => l?.length);

  return (
    <>
      {rubriques.includes("encours") && (
        <div className="esp-maintenant">
          <span className="etiq">{J.enCours}</span>
          {indisponible ? (
            <span>{T.vides.indisponible}</span>
          ) : par.encours.length || fixes.encours?.length ? (
            <ul>
              {fixes.encours?.map(fixe)}
              {par.encours.map((r) => ligne(r, true))}
            </ul>
          ) : (
            <span>{J.rienEnCours}</span>
          )}
        </div>
      )}
      {rubriques.includes("aclore") && (par.aclore.length > 0 || (fixes.aclore?.length ?? 0) > 0) && (
        <div className="a-clore">
          <span className="etiq">{J.aClore}</span>
          <ul className="defile-x" data-lenis-prevent>
            {par.aclore.map((r) => ligne(r, true))}
            {fixes.aclore?.map(fixe)}
          </ul>
        </div>
      )}
      {rubriques.includes("ensuite") && (par.ensuite.length > 0 || (fixes.ensuite?.length ?? 0) > 0) && (
        <div className="ensuite">
          <span className="etiq">{J.ensuite}</span>
          {(() => {
            const tout = [...par.ensuite.map((r) => ligne(r, true)), ...(fixes.ensuite?.map(fixe) ?? [])];
            return (
              <>
                <ol>{tout.slice(0, 2)}</ol>
                {tout.length > 2 && (
                  <details>
                    <summary>+ {J.autres(tout.length - 2)}</summary>
                    <ol>{tout.slice(2)}</ol>
                  </details>
                )}
              </>
            );
          })()}
        </div>
      )}
      {rubriques.includes("fait") && par.fait.length > 0 && (
        <div className="sous-horizon">
          <span className="etiq">{J.fait}</span>
          <ul className="defile-x" data-lenis-prevent>
            {par.fait.map((r) => ligne(r, false))}
          </ul>
        </div>
      )}
      {rien && !indisponible && vide && <p className="pile-note">{vide}</p>}
    </>
  );
}
