"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, useTransition, type DragEvent, type FormEvent, type ReactNode } from "react";
import { base as B, LIMITES_BASE as L } from "@/content/assistant-base";
import type { Alerte } from "@/lib/serveur/assistant/extraction";
import type { RetourBase } from "@/lib/serveur/assistant/sources";

// Envois de la section « Ce que l'assistant sait » (même conduite que reglages/Envoi.tsx) : un formulaire ou un bouton
// appelle une action serveur, puis dit ce qui s'est passé dans une zone aria-live (réussite ou refus du serveur, champs
// marqués aria-invalid, passages sensibles à retirer ou à confirmer). Le serveur seul décide et renvoie l'écran à jour
// (refresh). Une action qui fait disparaître son élément (supprimer, ignorer, répondre) annonce sa réussite dans la zone
// de la liste (<Annonces>), qui prend le focus.

type Action = (...a: unknown[]) => Promise<RetourBase>;
type Etat = { ton: "ok" | "erreur"; texte: string; champs: string[]; alertes: Alerte[] } | null;

// textes de réussite, choisis par leur nom (une fonction ne traverse pas la frontière serveur → client)
const REUSSITES = {
  depot: (n?: number) => B.depot.reussite(n ?? 0),
  publie: () => B.sources.publie_ok,
  retire: () => B.sources.retire_ok,
  supprime: () => B.sources.supprime_ok,
  passage: () => B.controle.retire_ok,
  note: () => B.note.reussite,
  argumentaire: () => B.argumentaire.reussite,
  reponse: () => B.questions.reussite,
  ignore: () => B.questions.ignore_ok,
};
type Reussite = keyof typeof REUSSITES;

const Annonce = createContext<((e: Etat) => void) | null>(null);

/** Zone d'annonce d'une liste : reçoit la réussite des actions qui retirent leur propre élément, et prend le focus. */
export function Annonces({ children }: { children: ReactNode }) {
  const [etat, setEtat] = useState<Etat>(null);
  const [n, setN] = useState(0);
  const zone = useRef<HTMLDivElement>(null);
  const annoncer = useCallback((e: Etat) => {
    setEtat(e);
    setN((x) => x + 1);
  }, []);
  useEffect(() => {
    if (etat) zone.current?.focus();
  }, [etat, n]);
  return (
    <Annonce.Provider value={annoncer}>
      <div ref={zone} tabIndex={-1} className="reg-retour annonce" role="status" aria-live="polite" data-ton={etat?.ton} data-envoi={n}>
        {etat && <p>{etat.texte}</p>}
      </div>
      {children}
    </Annonce.Provider>
  );
}

function useEnvoi(action: Action, args: unknown[], reussite: Reussite, liste: boolean) {
  const annoncer = useContext(Annonce);
  const [etat, setEtat] = useState<Etat>(null);
  const [n, setN] = useState(0);
  const [occupe, demarrer] = useTransition();
  const refuser = (texte: string) => {
    setN((x) => x + 1);
    setEtat({ ton: "erreur", texte, champs: [], alertes: [] });
  };
  const lancer = (extra: unknown[], apres?: () => void, relais?: (e: Etat) => void) => {
    setEtat(null);
    setN((x) => x + 1);
    demarrer(async () => {
      let e: NonNullable<Etat>;
      try {
        const r = await action(...args, ...extra);
        e = "ok" in r ? { ton: "ok", texte: REUSSITES[reussite](r.n), champs: [], alertes: [] } : { ton: "erreur", texte: B.erreurs[r.erreur] ?? B.erreurs.panne, champs: r.champs ?? [], alertes: r.alertes ?? [] };
      } catch {
        e = { ton: "erreur", texte: B.erreurs.reseau, champs: [], alertes: [] };
      }
      if (e.ton === "ok") apres?.();
      const vers = relais ?? (e.ton === "ok" && liste ? annoncer : null);
      if (vers) vers(e);
      else setEtat(e);
    });
  };
  return { etat, n, occupe, lancer, refuser };
}

function Retour({ etat, n, id }: { etat: Etat; n: number; id: string }) {
  const champs = etat ? [...new Set(etat.champs.map((c) => B.champs[c] ?? c))] : [];
  return (
    <div className="reg-retour" id={id} role="status" aria-live="polite" data-ton={etat?.ton} data-envoi={n}>
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

/** Passages sensibles : genre, passage, case « public, je confirme » (e-mail, téléphone, IBAN) ou « à retirer » ; bouton
 * « Retirer du texte » quand le texte est gardé en base (brouillon d'un document). */
function Controle({ id, alertes, retrait, relais }: { id: string; alertes: Alerte[]; retrait?: { action: Action; id: string }; relais: (e: Etat) => void }) {
  return (
    <fieldset className="controle" id={id} tabIndex={-1} data-alertes={alertes.length}>
      <legend>{B.controle.titre}</legend>
      <p className="aide">{B.controle.sous}</p>
      <ul>
        {alertes.map((a, i) => (
          <li key={a.texte} data-genre={a.genre} data-confirmable={a.confirmable}>
            <span className="controle-genre">{B.controle.genres[a.genre] ?? a.genre}</span>
            <mark className="controle-passage" data-g={a.genre} id={`${id}-p${i}`}>
              {a.texte}
            </mark>
            {a.confirmable ? (
              <label className="case">
                <input type="checkbox" name="confirme" value={a.texte} aria-describedby={`${id}-p${i}`} />
                {B.controle.confirmer}
              </label>
            ) : (
              <span className="aide">{B.controle.aRetirer}</span>
            )}
            {retrait && <BoutonBase action={retrait.action} args={[retrait.id, a.texte]} libelle={B.controle.retirer} nom={B.controle.nomRetirer(a.texte)} reussite="passage" relais={relais} />}
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

/** Champs refusés par le serveur marqués aria-invalid ; le premier prend le focus. */
function marquer(f: HTMLFormElement | null, champs: string[]) {
  if (!f) return;
  let premier: HTMLElement | null = null;
  for (const el of Array.from(f.elements) as HTMLInputElement[]) {
    if (!el.name || el.name === "confirme") continue;
    if (champs.includes(el.name)) {
      el.setAttribute("aria-invalid", "true");
      premier ??= el;
    } else el.removeAttribute("aria-invalid");
  }
  premier?.focus();
}

type PropsForm = {
  action: Action;
  args?: unknown[];
  bouton: string;
  reussite: Reussite;
  nom?: string;
  garder?: boolean;
  liste?: boolean;
  // passages sensibles rendus par le serveur (aperçu d'un document) ; sans eux, ceux du dernier refus « sensible »
  alertes?: Alerte[];
  retrait?: { action: Action; id: string };
  avant?: (fd: FormData) => string | null;
  apres?: () => void;
  className?: string;
  children?: ReactNode;
};

export function FormBase({ action, args = [], bouton, reussite, nom, garder = true, liste = false, alertes, retrait, avant, apres, className, children }: PropsForm) {
  const uid = useId();
  const form = useRef<HTMLFormElement>(null);
  const { etat, n, occupe, lancer, refuser } = useEnvoi(action, args, reussite, liste);
  const [relaye, setRelaye] = useState<Etat>(null);
  const vues = alertes ?? (etat?.ton === "erreur" ? etat.alertes : []);
  const envoyer = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (occupe) return;
    setRelaye(null);
    const fd = new FormData(e.currentTarget);
    const refus = avant?.(fd);
    if (refus) return refuser(refus);
    lancer([fd], () => {
      if (!garder) form.current?.reset();
      apres?.();
    });
  };
  useEffect(() => {
    if (etat?.ton !== "erreur") return marquer(form.current, []);
    marquer(form.current, etat.champs);
    if (!etat.champs.length && etat.alertes.length) document.getElementById(`${uid}-c`)?.focus();
  }, [etat, uid]);
  return (
    <form ref={form} className={className ? `reg-form ${className}` : "reg-form"} onSubmit={envoyer} aria-label={nom} aria-describedby={`${uid}-r`} noValidate>
      {children}
      {vues.length > 0 && <Controle id={`${uid}-c`} alertes={vues} retrait={retrait} relais={setRelaye} />}
      {alertes && !alertes.length && <p className="aide controle-net">{B.controle.aucun}</p>}
      <div className="reg-pied">
        <button type="submit" className="bouton" aria-busy={occupe} disabled={occupe}>
          {occupe ? B.envoi : bouton}
        </button>
      </div>
      <Retour etat={relaye ?? etat} n={n + (relaye ? 1 : 0)} id={`${uid}-r`} />
    </form>
  );
}

export function BoutonBase({ action, args = [], libelle, nom, reussite, confirmer, liste = false, relais }: { action: Action; args?: unknown[]; libelle: string; nom?: string; reussite: Reussite; confirmer?: string; liste?: boolean; relais?: (e: Etat) => void }) {
  const uid = useId();
  const { etat, n, occupe, lancer } = useEnvoi(action, args, reussite, liste);
  return (
    <span className="reg-bouton">
      <button
        type="button"
        className="bouton-2 bouton-petit"
        aria-label={nom}
        aria-describedby={`${uid}-r`}
        aria-busy={occupe}
        disabled={occupe}
        onClick={() => {
          if (confirmer && !window.confirm(confirmer)) return;
          lancer([], undefined, relais);
        }}
      >
        {libelle}
      </button>
      <Retour etat={etat} n={n} id={`${uid}-r`} />
    </span>
  );
}

const ACCEPTE = ".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown";

/** Dépôt d'un document : zone où lâcher le fichier (ou champ fichier natif, au clavier), taille vérifiée avant l'envoi. */
export function Depot({ action }: { action: Action }) {
  const uid = useId();
  const champ = useRef<HTMLInputElement>(null);
  const [choisi, setChoisi] = useState<{ nom: string; taille: number } | null>(null);
  const [survol, setSurvol] = useState(false);
  const lu = () => {
    const f = champ.current?.files?.[0];
    setChoisi(f ? { nom: f.name, taille: f.size } : null);
  };
  const deposer = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setSurvol(false);
    if (champ.current && e.dataTransfer.files.length) {
      champ.current.files = e.dataTransfer.files;
      lu();
    }
  };
  const avant = (fd: FormData) => {
    const f = fd.get("fichier");
    if (!(f instanceof File) || !f.size) return B.champs.fichier;
    return f.size > L.envoi ? B.depot.trop : null;
  };
  return (
    <FormBase action={action} bouton={B.depot.bouton} reussite="depot" nom={B.depot.titre} garder={false} avant={avant} apres={() => setChoisi(null)} className="depot-form">
      <div
        className="depot"
        data-survol={survol || undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={deposer}
      >
        <p className="depot-zone" aria-hidden="true">
          {B.depot.zone}
          <span>{B.depot.ou}</span>
        </p>
        <label htmlFor={`${uid}-f`}>{B.depot.choisir}</label>
        <input id={`${uid}-f`} ref={champ} name="fichier" type="file" accept={ACCEPTE} onChange={lu} aria-describedby={`${uid}-a ${uid}-c`} />
        <p className="aide" id={`${uid}-a`}>
          {B.depot.aide}
        </p>
        <p className="aide depot-choisi" id={`${uid}-c`} aria-live="polite">
          {choisi ? B.depot.choisi(choisi.nom, choisi.taille) : B.depot.aucun}
        </p>
      </div>
      <div className="champ">
        <label htmlFor={`${uid}-t`}>{B.depot.titreChamp}</label>
        <input id={`${uid}-t`} name="titre" maxLength={L.titre} autoComplete="off" aria-describedby={`${uid}-ta`} />
        <span className="aide" id={`${uid}-ta`}>
          {B.depot.titreAide}
        </span>
      </div>
    </FormBase>
  );
}
