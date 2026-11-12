"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { pilotage as P } from "@/content/espace-pilotage";
import type { RetourPil } from "@/lib/serveur/equipe/pilotage/actions";

// Envois du lot « pilotage » (repris des écrans finances) : un formulaire ou un bouton qui appelle une action serveur, puis
// dit ce qui s'est passé (réussite ou refus du serveur, champs à corriger marqués aria-invalid). Le serveur seul décide et
// renvoie l'écran à jour (refresh). Les arguments fixes (identifiant d'une page, d'un dossier) passent en clair : le
// serveur relit la session et le droit à chaque appel.

type Action = (...a: unknown[]) => Promise<RetourPil>;
export type Etat = { ton: "ok" | "erreur"; texte: string; champs: string[] } | null;

export const texteRefus = (r: Exclude<RetourPil, { ok: true }>) => ({ texte: P.erreurs[r.erreur] ?? P.erreurs.panne, champs: r.champs ?? [] });

function useEnvoi(action: Action, args: unknown[]) {
  const [etat, setEtat] = useState<Etat>(null);
  const [n, setN] = useState(0);
  const [occupe, demarrer] = useTransition();
  const lancer = (extra: unknown[], reussite: string | ((r: Extract<RetourPil, { ok: true }>) => string), apres?: () => void) => {
    setEtat(null);
    setN((x) => x + 1);
    demarrer(async () => {
      try {
        const r = await action(...args, ...extra);
        if ("ok" in r) {
          setEtat({ ton: "ok", texte: typeof reussite === "string" ? reussite : reussite(r), champs: [] });
          apres?.();
        } else setEtat({ ton: "erreur", ...texteRefus(r) });
      } catch {
        setEtat({ ton: "erreur", texte: P.erreurs.reseau, champs: [] });
      }
    });
  };
  return { etat, n, occupe, lancer };
}

/** Message d'un envoi : la réussite en « status », le refus en « alert », avec les champs à corriger. */
export function Retour({ etat, n, id }: { etat: Etat; n: number; id: string }) {
  return (
    <div className="fin-retour" id={id} role={etat?.ton === "erreur" ? "alert" : "status"} data-ton={etat?.ton} data-envoi={n}>
      {etat && (
        <>
          <p>{etat.texte}</p>
          {etat.champs.length > 0 && (
            <ul>
              {[...new Set(etat.champs.map((c) => P.champs[c] ?? c))].map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** Champs refusés par le serveur marqués aria-invalid ; le premier prend le focus. */
function marquer(f: HTMLFormElement | null, champs: string[]) {
  if (!f) return;
  let premier: HTMLElement | null = null;
  for (const el of Array.from(f.elements) as HTMLInputElement[]) {
    if (!el.name) continue;
    if (champs.includes(el.name)) {
      el.setAttribute("aria-invalid", "true");
      premier ??= el;
    } else el.removeAttribute("aria-invalid");
  }
  premier?.focus();
}

export function FormAction({ action, args = [], bouton, reussite, confirmer, garder = false, className, nom, enfants }: { action: Action; args?: unknown[]; bouton: string; reussite: string; confirmer?: string; garder?: boolean; className?: string; nom?: string; enfants: ReactNode }) {
  const uid = useId();
  const form = useRef<HTMLFormElement>(null);
  const { etat, n, occupe, lancer } = useEnvoi(action, args);
  const envoyer = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (occupe || (confirmer && !window.confirm(confirmer))) return;
    lancer([new FormData(e.currentTarget)], reussite, () => {
      if (!garder) form.current?.reset();
    });
  };
  useEffect(() => marquer(form.current, etat?.ton === "erreur" ? etat.champs : []), [etat]);
  return (
    <form ref={form} className={className ? `fin-form ${className}` : "fin-form"} onSubmit={envoyer} aria-label={nom} aria-describedby={`${uid}-r`} noValidate>
      {enfants}
      <div className="fin-pied">
        <button type="submit" className="bouton" aria-busy={occupe} disabled={occupe}>
          {bouton}
        </button>
      </div>
      <Retour etat={etat} n={n} id={`${uid}-r`} />
    </form>
  );
}

export function BoutonAction({ action, args = [], libelle, nom, reussite, confirmer, secondaire = true }: { action: Action; args?: unknown[]; libelle: string; nom?: string; reussite: string | ((r: Extract<RetourPil, { ok: true }>) => string); confirmer?: string; secondaire?: boolean }) {
  const uid = useId();
  const { etat, n, occupe, lancer } = useEnvoi(action, args);
  return (
    <span className="fin-bouton">
      <button
        type="button"
        className={secondaire ? "bouton-2 bouton-petit" : "bouton"}
        aria-label={nom}
        aria-describedby={`${uid}-r`}
        aria-busy={occupe}
        disabled={occupe}
        onClick={() => {
          if (confirmer && !window.confirm(confirmer)) return;
          lancer([], reussite);
        }}
      >
        {libelle}
      </button>
      <Retour etat={etat} n={n} id={`${uid}-r`} />
    </span>
  );
}
