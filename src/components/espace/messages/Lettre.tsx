"use client";

import { useId, useRef, useState, useTransition } from "react";
import { espace as T } from "@/content/espace";
import { A_RELIRE, LANGUES_MSG, type LangueMsg, LIMITES_COURRIEL, msg, PIED_LETTRE } from "@/content/espace-messages";
import type { RetourMessages } from "@/lib/serveur/equipe/messages/actions";
import { enregistrerNumero, envoyerLettre, testerNumero } from "@/lib/serveur/equipe/messages/lettre";
import type { Numero, Repartition } from "@/lib/serveur/equipe/messages/lectures";
import { estLangue } from "@/lib/serveur/equipe/messages/rendu";
import { Bloc, Vide, vars } from "../Bloc";
import { useMinute } from "../Cadre";
import { ilYa } from "../outils";
import { Picto } from "../Picto";
import { Apercu, texteRefus, useAnnonce } from "./Apercu";

// Rédaction d'un numéro de La lettre de Ouidah (admin) : langue, thèmes, objet, texte, aperçu avec le pied de
// désinscription, test à soi-même. L'envoi réel passe par une confirmation qui annonce le nombre d'abonnés (le serveur le
// recompte), puis par lots jusqu'au bout ; un envoi interrompu se reprend depuis la liste des numéros.
const L = msg.lettre;
type Sujet = { id: string; nom: string };

export function Lettre({ repartition, numeros, sujets }: { repartition: Repartition[]; numeros: Numero[]; sujets: Sujet[] }) {
  const uid = useId();
  const minute = useMinute();
  const { annoncer, vue } = useAnnonce();
  const [occupe, demarrer] = useTransition();
  const confirmer = useRef<HTMLDialogElement>(null);
  const [id, setId] = useState<string | null>(null);
  const [langue, setLangue] = useState<LangueMsg | "">("");
  const [themes, setThemes] = useState<string[]>([]);
  const [objet, setObjet] = useState("");
  const [corps, setCorps] = useState("");
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [progres, setProgres] = useState<{ fait: number; total: number } | null>(null);

  const cible = langue ? repartition.filter((r) => r.langue === langue && r.sujets.some((x) => themes.includes(x))).reduce((t, r) => t + r.n, 0) : 0;
  const saisie = () => ({ id, langue, sujets: themes, objet, corps });
  const verifier = () => {
    const e = [...(langue ? [] : ["langue"]), ...(themes.length ? [] : ["themes"]), ...(objet.trim() ? [] : ["objet"]), ...(corps.trim() ? [] : ["corps"])];
    setErreurs(e);
    return !e.length;
  };
  const refus = (r: Exclude<RetourMessages, { ok: true }>) => {
    if (r.erreur === "champs") setErreurs(r.champs ?? []);
    annoncer(r.erreur === "variables" ? L.sansOrigine : texteRefus(r), true);
  };
  const vider = () => {
    setId(null);
    setObjet("");
    setCorps("");
    setThemes([]);
    setLangue("");
    setErreurs([]);
  };

  const enregistrer = (puis?: (num: string) => void) => {
    if (!verifier()) return;
    demarrer(async () => {
      try {
        const r = await enregistrerNumero(saisie());
        if (!("ok" in r)) return refus(r);
        setId(r.id ?? null);
        if (puis && r.id) puis(r.id);
        else annoncer(L.brouillonOk);
      } catch {
        annoncer(msg.refus.reseau, true);
      }
    });
  };
  const tester = () => {
    if (!verifier()) return;
    demarrer(async () => {
      try {
        const r = await testerNumero(saisie());
        if ("ok" in r) annoncer(L.testEnvoye(r.a ?? ""));
        else refus(r);
      } catch {
        annoncer(msg.refus.reseau, true);
      }
    });
  };
  /** Lots successifs jusqu'au bout ; l'écran montre la progression. */
  const envoyerTout = (num: string, attendu: number) =>
    demarrer(async () => {
      setProgres({ fait: 0, total: attendu });
      try {
        for (let i = 0; i < 1000; i++) {
          const r = await envoyerLettre(num, attendu);
          if (!("ok" in r)) {
            refus(r);
            if (r.erreur === "confirmer") annoncer(L.cible(r.total ?? 0), true);
            break;
          }
          setProgres({ fait: r.envoyes ?? 0, total: Math.max(attendu, r.envoyes ?? 0) });
          if (r.fini) {
            annoncer(L.fini(r.envoyes ?? 0, r.echecs ?? 0));
            vider();
            break;
          }
        }
      } catch {
        annoncer(msg.refus.reseau, true);
      }
      setProgres(null);
    });
  const reprendre = (n: Numero) => {
    setId(n.id);
    setLangue(n.langue);
    setThemes(n.sujets);
    setObjet(n.objet);
    setCorps(n.corps);
    setErreurs([]);
    if (n.statut === "en_cours") envoyerTout(n.id, cible);
  };

  return (
    <>
      <Bloc id="t-num" titre={L.numero} s={7} i={3}>
        <form id="form-lettre" noValidate onSubmit={(e) => { e.preventDefault(); if (verifier() && cible > 0) confirmer.current?.showModal(); }}>
          <div className="champs">
            <div className="champ">
              <label htmlFor={`${uid}-l`}>{L.langue}</label>
              <select id={`${uid}-l`} name="langue" value={langue} aria-invalid={erreurs.includes("langue")} onChange={(e) => setLangue(estLangue(e.target.value) ? e.target.value : "")}>
                <option value="">{msg.courrier.choisirLangue}</option>
                {LANGUES_MSG.map((l) => (
                  <option key={l} value={l}>
                    {T.langues[l]}
                  </option>
                ))}
              </select>
              <span className="erreur">{erreurs.includes("langue") ? L.erreurs.langue : ""}</span>
            </div>
            <fieldset className="champ">
              <legend>{L.themes}</legend>
              <div className="puces">
                {sujets.map((t) => (
                  <label key={t.id} className="puce">
                    <input type="checkbox" name="themes" value={t.id} checked={themes.includes(t.id)} aria-invalid={erreurs.includes("themes")} onChange={(e) => setThemes((x) => (e.target.checked ? [...x, t.id] : x.filter((y) => y !== t.id)))} />
                    <span>{t.nom}</span>
                  </label>
                ))}
              </div>
              <span className={erreurs.includes("themes") ? "erreur" : "aide"}>{erreurs.includes("themes") ? L.erreurs.themes : L.themesAide}</span>
            </fieldset>
            <div className="champ large">
              <label htmlFor={`${uid}-o`}>{L.objet}</label>
              <input type="text" id={`${uid}-o`} name="objet" autoComplete="off" maxLength={LIMITES_COURRIEL.objet} value={objet} aria-invalid={erreurs.includes("objet")} onChange={(e) => setObjet(e.target.value)} />
              <span className="erreur">{erreurs.includes("objet") ? L.erreurs.objet : ""}</span>
            </div>
            <div className="champ large">
              <label htmlFor={`${uid}-c`}>{L.corps}</label>
              <textarea id={`${uid}-c`} name="corps" rows={10} maxLength={LIMITES_COURRIEL.corps} value={corps} aria-invalid={erreurs.includes("corps")} onChange={(e) => setCorps(e.target.value)} />
              <span className={erreurs.includes("corps") ? "erreur" : "aide"}>{erreurs.includes("corps") ? L.erreurs.corps : L.pied}</span>
              {langue && A_RELIRE.includes(langue) && <span className="aide">{msg.courrier.locuteur}</span>}
            </div>
          </div>
          <p className="cible" id="cible-lettre" data-cible={cible}>{L.cible(cible)}</p>
          {progres && (
            <div className="progression" role="progressbar" aria-valuemin={0} aria-valuemax={progres.total} aria-valuenow={progres.fait} aria-label={L.progression(progres.fait, progres.total)} style={vars({ "--p": progres.total ? progres.fait / progres.total : 0 })}>
              <span />
            </div>
          )}
          <div className="pied-actions">
            <button type="button" className="bouton-2" id="l-brouillon" disabled={occupe} onClick={() => enregistrer()}>
              {L.brouillon}
            </button>
            <button type="button" className="bouton-2" id="l-test" disabled={occupe} onClick={tester}>
              <Picto nom="courrier" />
              {L.test}
            </button>
            <button type="submit" className="bouton accent" id="l-envoyer" disabled={occupe || cible === 0} aria-busy={occupe}>
              <Picto nom="courrier" />
              {L.envoyer(cible)}
            </button>
          </div>
        </form>
      </Bloc>

      <Bloc id="t-lap" titre={L.apercu} s={5} i={4}>
        <Apercu a={L.actifs(cible)} objet={objet} corps={corps} signature="Ouidah Heritage Tour" pied={langue ? PIED_LETTRE[langue](L.lienExemple) : undefined} />
      </Bloc>

      <Bloc id="t-nums" titre={L.numeros} compte={numeros.length} s={12} i={5}>
        {numeros.length ? (
          <ul className="liste" id="liste-numeros">
            {numeros.map((n) => (
              <li key={n.id} data-numero={n.id} data-statut={n.statut}>
                <div className="rangee">
                  <span className="texte">
                    <span className="titre">{n.objet}</span>
                    <span className="meta">
                      {ilYa(n.quand, minute)} · {L.envoyesA(n.envoyes)}
                    </span>
                  </span>
                  <span className="langue" title={T.langues[n.langue]}>{n.langue}</span>
                  <span className="etat" data-e={n.statut}>{L.etats[n.statut]}</span>
                  {n.statut !== "envoye" && (
                    <span className="actions">
                      <button type="button" className="bouton-2 bouton-petit" data-reprendre={n.id} disabled={occupe} onClick={() => reprendre(n)}>
                        {L.reprendre}
                      </button>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Vide texte={L.aucunNumero} />
        )}
      </Bloc>

      <dialog ref={confirmer} className="esp-confirmer" aria-labelledby={`${uid}-cf`} onClick={(e) => e.target === e.currentTarget && confirmer.current?.close()}>
        <p id={`${uid}-cf`}>{L.confirmer(cible)}</p>
        <div className="pied-actions">
          <button type="button" className="bouton-2" onClick={() => confirmer.current?.close()}>
            {L.non}
          </button>
          <button
            type="button"
            className="bouton accent"
            id="l-confirmer"
            onClick={() => {
              confirmer.current?.close();
              const attendu = cible;
              enregistrer((num) => envoyerTout(num, attendu));
            }}
          >
            {L.oui}
          </button>
        </div>
      </dialog>
      {vue}
    </>
  );
}
