"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { reglages as R } from "@/content/espace-reglages";
import type { RetourReg } from "@/lib/serveur/equipe/reglages/actions";

// Envois du lot « reglages » (même conduite que ceux des finances) : un formulaire ou un bouton qui appelle une action
// serveur, puis dit ce qui s'est passé (réussite ou refus du serveur, champs à corriger marqués aria-invalid). Le serveur
// seul décide et renvoie l'écran à jour (refresh). Les arguments fixes (nom de la passerelle, identifiant de session)
// passent en clair : le serveur relit la session et le rôle à chaque appel.

type Action = (...a: unknown[]) => Promise<RetourReg>;
// réussite : un texte fixe, ou un texte qui dépend du nombre rendu par le serveur (passé par son nom : une fonction ne
// traverse pas la frontière serveur → client)
type Reussite = string | { nombre: "mdp" | "sessions" };
const PAR_NOMBRE = { mdp: R.profil.change, sessions: R.profil.autresFermees };
type Etat = { ton: "ok" | "erreur"; texte: string; champs: string[] } | null;

/** Un envoi à la fois ; le message précédent est effacé au clic, `n` compte les envois (data-envoi). */
function useEnvoi(action: Action, args: unknown[]) {
  const [etat, setEtat] = useState<Etat>(null);
  const [n, setN] = useState(0);
  const [occupe, demarrer] = useTransition();
  const lancer = (extra: unknown[], reussite: Reussite, apres?: () => void) => {
    setEtat(null);
    setN((x) => x + 1);
    demarrer(async () => {
      try {
        const r = await action(...args, ...extra);
        if ("ok" in r) {
          setEtat({ ton: "ok", texte: typeof reussite === "string" ? reussite : PAR_NOMBRE[reussite.nombre](r.n ?? 0), champs: [] });
          apres?.();
        } else setEtat({ ton: "erreur", texte: R.erreurs[r.erreur] ?? R.erreurs.panne, champs: r.champs ?? [] });
      } catch {
        setEtat({ ton: "erreur", texte: R.erreurs.reseau, champs: [] });
      }
    });
  };
  return { etat, n, occupe, lancer };
}

function Retour({ etat, n, id }: { etat: Etat; n: number; id: string }) {
  const champs = etat ? [...new Set(etat.champs.map((c) => R.champs[c.replace(/_(FR|EN|ES|DE|PT|HT|GCF)$/, "")] ?? c))] : [];
  return (
    <div className="reg-retour" id={id} role={etat?.ton === "erreur" ? "alert" : "status"} data-ton={etat?.ton} data-envoi={n}>
      {etat && (
        <>
          <p>{etat.texte}</p>
          {champs.length > 0 && (
            <ul>
              {champs.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** Champs refusés par le serveur marqués aria-invalid (« message_FR », « pied » couvrent leurs champs par langue). */
function marquer(f: HTMLFormElement | null, champs: string[]) {
  if (!f) return;
  const noms = new Set(champs);
  for (const el of Array.from(f.elements) as HTMLInputElement[]) {
    if (!el.name) continue;
    const base = el.name.replace(/_(FR|EN|ES|DE|PT|HT|GCF)$/, "");
    const refuse = noms.has(el.name) || (noms.has(base) && !noms.has(`${base}_FR`)) || (el.name === "langue" && noms.has("langues")) || (el.name === "telephone" && noms.has("telephone_doc"));
    if (refuse) el.setAttribute("aria-invalid", "true");
    else el.removeAttribute("aria-invalid");
  }
}

export function FormAction({ action, args = [], bouton, reussite, garder = true, className, enfants, nom }: { action: Action; args?: unknown[]; bouton: string; reussite: Reussite; garder?: boolean; className?: string; enfants: ReactNode; nom?: string }) {
  const uid = useId();
  const form = useRef<HTMLFormElement>(null);
  const { etat, n, occupe, lancer } = useEnvoi(action, args);
  const envoyer = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    lancer([new FormData(e.currentTarget)], reussite, () => {
      if (!garder) form.current?.reset();
    });
  };
  useEffect(() => marquer(form.current, etat?.ton === "erreur" ? etat.champs : []), [etat]);
  return (
    <form ref={form} className={className ? `reg-form ${className}` : "reg-form"} onSubmit={envoyer} aria-label={nom} aria-describedby={`${uid}-r`} noValidate>
      {enfants}
      <div className="reg-pied">
        <button type="submit" className="bouton" aria-busy={occupe} disabled={occupe}>
          {occupe ? R.envoi : bouton}
        </button>
      </div>
      <Retour etat={etat} n={n} id={`${uid}-r`} />
    </form>
  );
}

export function BoutonAction({ action, args = [], libelle, nom, reussite, confirmer, secondaire = true, inactif = false }: { action: Action; args?: unknown[]; libelle: string; nom?: string; reussite: Reussite; confirmer?: string; secondaire?: boolean; inactif?: boolean }) {
  const uid = useId();
  const { etat, n, occupe, lancer } = useEnvoi(action, args);
  return (
    <span className="reg-bouton">
      <button
        type="button"
        className={secondaire ? "bouton-2 bouton-petit" : "bouton"}
        aria-label={nom}
        aria-describedby={`${uid}-r`}
        aria-busy={occupe}
        disabled={occupe || inactif}
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
