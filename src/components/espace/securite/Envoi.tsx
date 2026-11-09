"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { securite as S } from "@/content/espace-securite";
import type { RetourSec } from "@/lib/serveur/equipe/securite/actions";

// Envois du lot « securite » : un formulaire ou un bouton qui appelle une action serveur, puis dit ce qui s'est passé
// (réussite ou refus du serveur, champs refusés marqués aria-invalid). Le serveur seul décide et renvoie l'écran à jour
// (refresh) : rien n'est inventé ici. Les arguments fixes (identifiant d'une session, d'un blocage…) passent en clair :
// le serveur relit la session et le rôle à chaque appel. Même mécanique que les envois des finances (finances/Envoi.tsx).

type Action = (...a: unknown[]) => Promise<RetourSec>;
type Ok = Extract<RetourSec, { ok: true }>;
type Etat = { ton: "ok" | "erreur"; texte: string; champs: string[] } | null;

function useEnvoi(action: Action, args: unknown[]) {
  const [etat, setEtat] = useState<Etat>(null);
  const [n, setN] = useState(0);
  const [occupe, demarrer] = useTransition();
  const lancer = (extra: unknown[], reussite: string | ((r: Ok) => string), apres?: (r: Ok) => void) => {
    setEtat(null); // effacé au clic : l'écran ne montre jamais l'ancien résultat pendant le nouvel envoi
    setN((x) => x + 1);
    demarrer(async () => {
      try {
        const r = await action(...args, ...extra);
        if ("ok" in r) {
          setEtat({ ton: "ok", texte: typeof reussite === "string" ? reussite : reussite(r), champs: [] });
          apres?.(r);
        } else setEtat({ ton: "erreur", texte: S.erreurs[r.erreur] ?? S.erreurs.panne, champs: r.champs ?? [] });
      } catch {
        setEtat({ ton: "erreur", texte: S.erreurs.reseau, champs: [] });
      }
    });
  };
  return { etat, n, occupe, lancer };
}

function Retour({ etat, n, id }: { etat: Etat; n: number; id: string }) {
  return (
    <div className="sec-retour" id={id} role={etat?.ton === "erreur" ? "alert" : "status"} data-ton={etat?.ton} data-envoi={n}>
      {etat && (
        <>
          <p>{etat.texte}</p>
          {etat.champs.length > 0 && (
            <ul>
              {[...new Set(etat.champs.map((c) => S.champs[c] ?? c))].map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function marquer(f: HTMLFormElement | null, champs: string[]) {
  if (!f) return;
  for (const el of Array.from(f.elements) as HTMLInputElement[]) {
    if (!el.name) continue;
    if (champs.includes(el.name)) el.setAttribute("aria-invalid", "true");
    else el.removeAttribute("aria-invalid");
  }
}

export function FormSec({
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
  accent = false,
}: {
  action: Action;
  args?: unknown[];
  bouton: string;
  reussite: string | ((r: Ok) => string);
  confirmer?: string;
  garder?: boolean; // garder la saisie après réussite (une fiche modifiée)
  apres?: (r: Ok) => void; // composants clients seulement : une fonction ne passe pas du serveur
  className?: string;
  enfants: ReactNode;
  nom?: string;
  accent?: boolean;
}) {
  const uid = useId();
  const form = useRef<HTMLFormElement>(null);
  const { etat, n, occupe, lancer } = useEnvoi(action, args);
  const envoyer = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (occupe || (confirmer && !window.confirm(confirmer))) return;
    lancer([new FormData(e.currentTarget)], reussite, (r) => {
      if (!garder) form.current?.reset();
      apres?.(r);
    });
  };
  useEffect(() => marquer(form.current, etat?.ton === "erreur" ? etat.champs : []), [etat]);
  return (
    <form ref={form} className={className ? `sec-form ${className}` : "sec-form"} onSubmit={envoyer} aria-label={nom} aria-describedby={`${uid}-r`} noValidate>
      {enfants}
      <div className="sec-pied">
        <button type="submit" className={accent ? "bouton accent" : "bouton"} aria-busy={occupe} disabled={occupe}>
          {occupe ? S.envoi : bouton}
        </button>
      </div>
      <Retour etat={etat} n={n} id={`${uid}-r`} />
    </form>
  );
}

export function BoutonSec({ action, args = [], libelle, nom, reussite, confirmer, attr }: { action: Action; args?: unknown[]; libelle: string; nom?: string; reussite: string; confirmer?: string; attr?: string }) {
  const uid = useId();
  const { etat, n, occupe, lancer } = useEnvoi(action, args);
  return (
    <span className="sec-bouton">
      <button
        type="button"
        className="bouton-2 bouton-petit"
        aria-label={nom}
        aria-describedby={`${uid}-r`}
        aria-busy={occupe}
        disabled={occupe}
        data-act={attr}
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
