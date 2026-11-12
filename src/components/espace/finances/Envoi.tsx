"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { finances as F } from "@/content/espace-finances";
import type { RetourFin } from "@/lib/serveur/equipe/finances/actions";

// Envois du lot « finances » : un formulaire ou un bouton qui appelle une action serveur, puis dit ce qui s'est passé
// (réussite ou refus du serveur, champs à corriger marqués aria-invalid). Le serveur seul décide et renvoie l'écran à
// jour (refresh) : rien n'est inventé ici. Les arguments fixes (identifiant de la facture, du paiement…) passent en clair :
// le serveur relit la session et le droit à chaque appel.

type Action = (...a: unknown[]) => Promise<RetourFin>;
type Etat = { ton: "ok" | "erreur"; texte: string; champs: string[] } | null;

const lireRefus = (r: Exclude<RetourFin, { ok: true }>) => ({ texte: F.erreurs[r.erreur] ?? F.erreurs.panne, champs: r.champs ?? [] });

/** Un envoi à la fois. Le message précédent est effacé AU CLIC (mise à jour urgente) : posé dans la transition, il ne
 * disparaîtrait qu'à la réponse et l'écran montrerait l'ancien résultat pendant le nouvel envoi. `n` compte les envois
 * (data-envoi) : le retour affiché est toujours celui de l'envoi n. */
function useEnvoi(action: Action, args: unknown[]) {
  const [etat, setEtat] = useState<Etat>(null);
  const [n, setN] = useState(0);
  const [occupe, demarrer] = useTransition();
  const lancer = (extra: unknown[], reussite: string | ((r: Extract<RetourFin, { ok: true }>) => string), apres?: () => void) => {
    setEtat(null);
    setN((x) => x + 1);
    demarrer(async () => {
      try {
        const r = await action(...args, ...extra);
        if ("ok" in r) {
          setEtat({ ton: "ok", texte: typeof reussite === "string" ? reussite : reussite(r), champs: [] });
          apres?.();
        } else setEtat({ ton: "erreur", ...lireRefus(r) });
      } catch {
        setEtat({ ton: "erreur", texte: F.erreurs.reseau, champs: [] });
      }
    });
  };
  return { etat, n, occupe, lancer };
}

/** Message de l'envoi : la réussite en « status », le refus en « alert », avec la liste des champs à corriger. */
function Retour({ etat, n, id }: { etat: Etat; n: number; id: string }) {
  return (
    <div className="fin-retour" id={id} role={etat?.ton === "erreur" ? "alert" : "status"} data-ton={etat?.ton} data-envoi={n}>
      {etat && (
        <>
          <p>{etat.texte}</p>
          {etat.champs.length > 0 && (
            <ul>
              {[...new Set(etat.champs.map((c) => F.champs[c.split(":")[0]] ?? c))].map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** Champs refusés par le serveur marqués aria-invalid (« jour » couvre aussi la date de réception, « expire » la durée) ;
 * le premier prend le focus. */
function marquer(f: HTMLFormElement | null, champs: string[]) {
  if (!f) return;
  const noms = new Set(champs.flatMap((c) => (c === "jour" ? ["jour", "recu_le"] : c === "expire" ? ["jours"] : [c.split(":")[0]])));
  let premier: HTMLElement | null = null;
  for (const el of Array.from(f.elements) as HTMLInputElement[]) {
    if (!el.name) continue;
    if (noms.has(el.name)) {
      el.setAttribute("aria-invalid", "true");
      premier ??= el;
    } else el.removeAttribute("aria-invalid");
  }
  premier?.focus();
}

export function FormAction({
  action,
  args = [],
  bouton,
  reussite,
  confirmer,
  garder = false,
  apres,
  className,
  enfants,
  nom,
}: {
  action: Action;
  args?: unknown[];
  bouton: string;
  reussite: string | ((r: Extract<RetourFin, { ok: true }>) => string);
  confirmer?: string;
  garder?: boolean; // garder la saisie après réussite (coordonnées, prix modifié)
  apres?: () => void; // après une réussite (formulaires clients seulement : une fonction ne passe pas du serveur)
  className?: string;
  enfants: ReactNode;
  nom?: string; // nom accessible du formulaire
}) {
  const uid = useId();
  const form = useRef<HTMLFormElement>(null);
  const { etat, n, occupe, lancer } = useEnvoi(action, args);
  const envoyer = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (occupe || (confirmer && !window.confirm(confirmer))) return;
    const fd = new FormData(e.currentTarget);
    lancer([fd], reussite, () => {
      if (!garder) form.current?.reset();
      apres?.();
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

export function BoutonAction({ action, args = [], libelle, nom, reussite, confirmer, secondaire = true }: { action: Action; args?: unknown[]; libelle: string; nom?: string; reussite: string | ((r: Extract<RetourFin, { ok: true }>) => string); confirmer?: string; secondaire?: boolean }) {
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
