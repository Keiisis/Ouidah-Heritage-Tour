"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { espace as T } from "@/content/espace";
import { A_RELIRE, LANGUES_MSG, type LangueMsg, LIMITES_COURRIEL, MODELES_DEPART, msg, type Variable, VARIABLES } from "@/content/espace-messages";
import { apercuModele, enregistrerModele, retirerModele, type RetourMessages, testerModele } from "@/lib/serveur/equipe/messages/actions";
import type { Modele } from "@/lib/serveur/equipe/messages/lectures";
import { autoConnue, CLE, type CleAuto, estAuto, jetonsInconnus, remplir, valeursApercu, VARIABLES_AUTO, variablesAbsentes, variablesHors } from "@/lib/serveur/equipe/messages/rendu";
import { Bloc } from "../Bloc";
import { Picto } from "../Picto";
import { Apercu, texteRefus, useAnnonce } from "./Apercu";

// Modèles d'e-mails (admin) : chaque modèle dans les 7 langues, son état (personnalisé, texte de départ, à écrire),
// l'éditeur avec ses champs variables, l'aperçu et le test à soi-même : {prénom} = l'admin connecté, les autres champs en
// repères traduits entre crochets (aucune donnée inventée). Le serveur relit tout.
// Second groupe « E-mails automatiques » : les clés réservées au site (rendu.ts, AUTO_CLES), jamais dans le composeur ;
// l'éditeur s'ouvre sur le texte par défaut que le site envoie, n'accepte que les champs variables que cet e-mail remplit
// (VARIABLES_AUTO), et l'aperçu est le vrai e-mail (gabarit « la lettre illustrée », données d'exemple) en iframe isolée.
const M = msg.modeles;

/** Vrai rendu d'un e-mail automatique, demandé au serveur 400 ms après la dernière frappe, dans une iframe sans script. */
function ApercuReel({ cle, langue, sujet, corps }: { cle: CleAuto; langue: LangueMsg; sujet: string; corps: string }) {
  const [rendu, setRendu] = useState<{ sujet: string; html: string } | "indispo" | null>(null);
  useEffect(() => {
    let perime = false;
    const minuteur = setTimeout(async () => {
      try {
        const r = await apercuModele({ cle, langue, sujet, corps });
        if (!perime) setRendu("ok" in r && r.html ? { sujet: r.sujet ?? "", html: r.html } : "indispo");
      } catch {
        if (!perime) setRendu("indispo");
      }
    }, 400);
    return () => {
      perime = true;
      clearTimeout(minuteur);
    };
  }, [cle, langue, sujet, corps]);
  if (rendu === "indispo") return <p className="aide">{M.apercuIndispo}</p>;
  return (
    <div className="apercu-reel" aria-busy={!rendu}>
      <p className="aide" id="apercu-reel-objet">
        {msg.courrier.objet} : {rendu?.sujet ?? "…"}
      </p>
      {rendu && <iframe id="apercu-reel" title={M.apercuReel} sandbox="" referrerPolicy="no-referrer" srcDoc={rendu.html} />}
    </div>
  );
}

export function Modeles({ modeles, auto, moi }: { modeles: Modele[]; auto: Modele[]; moi: { prenom: string; nom: string } }) {
  const uid = useId();
  const { annoncer, vue } = useAnnonce();
  const [occupe, demarrer] = useTransition();
  const zone = useRef<HTMLTextAreaElement>(null);
  const [nouveaux, setNouveaux] = useState<string[]>([]);
  const equipe: Modele[] = [...modeles, ...nouveaux.filter((c) => !modeles.some((m) => m.cle === c)).map((cle) => ({ cle, nom: cle, depart: false, auto: false, textes: {} }))];
  const liste = [...equipe, ...auto];
  const [sel, setSel] = useState<{ cle: string; langue: LangueMsg }>({ cle: liste[0]?.cle ?? "", langue: "FR" });
  const m = liste.find((x) => x.cle === sel.cle) ?? null;
  const t = m?.textes[sel.langue] ?? null;
  const [sujet, setSujet] = useState(t?.sujet ?? "");
  const [corps, setCorps] = useState(t?.corps ?? "");
  const [cle, setCle] = useState("");
  const [erreurs, setErreurs] = useState<string[]>([]);

  const ouvrir = (c: string, l: LangueMsg, liste2 = liste) => {
    const x = liste2.find((y) => y.cle === c)?.textes[l];
    setSel({ cle: c, langue: l });
    setSujet(x?.sujet ?? "");
    setCorps(x?.corps ?? "");
    setErreurs([]);
  };
  const creer = () => {
    if (estAuto(cle)) return setErreurs(["reservee"]);
    if (!CLE.test(cle) || liste.some((x) => x.cle === cle)) return setErreurs(["cle"]);
    setNouveaux((n) => [...n, cle]);
    setSel({ cle, langue: "FR" });
    setSujet("");
    setCorps("");
    setErreurs([]);
    setCle("");
  };
  const inserer = (v: string) => {
    const z = zone.current;
    if (!z) return;
    const a = z.selectionStart ?? z.value.length, b = z.selectionEnd ?? a;
    setCorps(z.value.slice(0, a) + v + z.value.slice(b));
    requestAnimationFrame(() => {
      z.focus();
      z.setSelectionRange(a + v.length, a + v.length);
    });
  };
  const lancer = (faire: () => Promise<RetourMessages>, ok: (r: Extract<RetourMessages, { ok: true }>) => void) =>
    demarrer(async () => {
      try {
        const r = await faire();
        if ("ok" in r) {
          setErreurs([]);
          ok(r);
        } else {
          if (r.erreur === "champs") setErreurs(r.champs ?? []);
          annoncer(texteRefus(r), true);
        }
      } catch {
        annoncer(msg.refus.reseau, true);
      }
    });
  const saisie = () => ({ cle: sel.cle, langue: sel.langue, sujet, corps });
  const verifier = () => {
    const e = [...(sujet.trim() ? [] : ["sujet"]), ...(corps.trim() ? [] : ["corps"]), ...(inconnus.length ? ["jetons"] : []), ...(hors.length ? ["variables"] : [])];
    setErreurs(e);
    return !e.length;
  };
  const nom = m?.nom ?? sel.cle;
  const vals = valeursApercu(moi.prenom, sel.langue);
  const cleAuto = m?.auto && autoConnue(sel.cle) ? sel.cle : null;
  // champs proposés : ceux que cet e-mail automatique remplit, sinon les quatre
  const offerts: readonly Variable[] = cleAuto ? VARIABLES_AUTO[cleAuto] : (Object.keys(VARIABLES) as Variable[]);
  const inconnus = m?.auto ? jetonsInconnus(`${sujet} ${corps}`) : [];
  const hors = cleAuto ? variablesHors(cleAuto, `${sujet} ${corps}`) : [];
  const absentes = cleAuto && (sujet.trim() || corps.trim()) ? variablesAbsentes(`${sujet} ${corps}`, offerts) : [];
  const groupe = (id: string, l: Modele[]) => (
    <div id={id}>
      {l.map((x) => (
        <div key={x.cle} className="modele-l" data-modele={x.cle}>
          <span className="titre">{x.nom}</span>
          <div className="langues-m" role="group" aria-label={x.nom}>
            {LANGUES_MSG.map((g) => {
              const etat = x.textes[g]?.source ?? (x.auto ? "defaut" : "vide");
              const libelle = etat === "defaut" ? M.defaut : M.etats[etat];
              return (
                <button key={g} type="button" data-langue={g} data-etat={etat} aria-pressed={sel.cle === x.cle && sel.langue === g} aria-label={`${M.choisir(x.nom, T.langues[g])}, ${libelle}`} onClick={() => ouvrir(x.cle, g)}>
                  {g}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="esp-grille esp-messages esp-modeles">
      <Bloc id="t-mod" titre={M.liste} compte={equipe.length} s={4} i={1}>
        {groupe("liste-modeles", equipe)}
        <div className="legende">
          <span>{M.etats.base}</span>
          <span>{M.etats.depart}</span>
          <span>{M.etats.vide}</span>
        </div>
        <div className="champ">
          <label htmlFor={`${uid}-cle`}>{M.nouveau}</label>
          <div className="groupe-outils">
            <input type="text" id={`${uid}-cle`} name="cle" autoComplete="off" maxLength={LIMITES_COURRIEL.cle} value={cle} aria-invalid={erreurs.includes("cle")} aria-describedby={`${uid}-clea`} onChange={(e) => setCle(e.target.value.toLowerCase())} />
            <button type="button" className="bouton-2 bouton-petit" id="creer-modele" onClick={creer}>
              <Picto nom="plus" />
              {M.creer}
            </button>
          </div>
          <span className={erreurs.some((x) => x === "cle" || x === "reservee") ? "erreur" : "aide"} id={`${uid}-clea`}>{erreurs.includes("reservee") ? M.erreurs.reservee : erreurs.includes("cle") ? M.erreurs.cle : M.cleAide}</span>
        </div>
        <p className="mention">{M.oht}</p>
        <section className="groupe-auto" aria-labelledby={`${uid}-auto`}>
          <h3 className="sous-titre" id={`${uid}-auto`}>{M.auto}</h3>
          <p className="mention">{M.autoSous}</p>
          {groupe("liste-modeles-auto", auto)}
        </section>
      </Bloc>

      <Bloc id="t-edi" titre={m ? M.choisir(nom, T.langues[sel.langue]) : M.liste} s={8} i={2}>
        {m && (
          <form id="form-modele" noValidate onSubmit={(e) => { e.preventDefault(); if (verifier()) lancer(() => enregistrerModele(saisie()), () => annoncer(M.enregistre(nom, sel.langue))); }}>
            <div className="champs">
              <div className="champ large">
                <label htmlFor={`${uid}-su`}>{M.sujet}</label>
                <input type="text" id={`${uid}-su`} name="sujet" autoComplete="off" maxLength={LIMITES_COURRIEL.objet} value={sujet} aria-invalid={erreurs.includes("sujet")} onChange={(e) => setSujet(e.target.value)} />
                <span className="erreur">{erreurs.includes("sujet") ? M.erreurs.sujet : ""}</span>
              </div>
              <div className="champ large">
                <label htmlFor={`${uid}-co`}>{M.corps}</label>
                <textarea ref={zone} id={`${uid}-co`} name="corps" rows={9} maxLength={LIMITES_COURRIEL.corps} value={corps} aria-invalid={erreurs.includes("corps")} onChange={(e) => setCorps(e.target.value)} />
                <span className="erreur">{erreurs.includes("corps") ? M.erreurs.corps : ""}</span>
                <div className="puces" role="group" aria-label={msg.courrier.variables}>
                  <span className="aide">{msg.courrier.variables}</span>
                  {offerts.map((k) => VARIABLES[k]).map((v) => (
                    <button key={v} type="button" className="puce" data-var={v} aria-label={msg.courrier.inserer(v)} onClick={() => inserer(v)}>
                      {v}
                    </button>
                  ))}
                </div>
                {t?.source === "depart" && A_RELIRE.includes(sel.langue) && <span className="aide">{M.aRelire}</span>}
                {cleAuto && <span className="aide" id="variables-auto">{M.autoVariables(offerts.map((k) => VARIABLES[k]))}</span>}
                {cleAuto && M.autoNotes[cleAuto] && <span className="aide">{M.autoNotes[cleAuto]}</span>}
                {inconnus.length > 0 && <span className="erreur" id="jetons-inconnus">{M.inconnus(inconnus)}</span>}
                {hors.length > 0 && <span className="erreur" id="variables-hors">{M.horsListe(hors.map((k) => VARIABLES[k]))}</span>}
                {absentes.length > 0 && <span className="mention-manque" id="variables-absentes">{M.absentes(absentes.map((v) => VARIABLES[v]))}</span>}
              </div>
            </div>
            <div className="pied-actions">
              {t?.source === "base" && (
                <button type="button" className="bouton-2" id="retirer-modele" disabled={occupe} onClick={() => lancer(() => retirerModele(sel.cle, sel.langue), () => {
                  annoncer(M.retire(nom, sel.langue));
                  // le texte de départ (ou, pour un e-mail automatique, le texte par défaut du site) reprend sa place ;
                  // sans lui, la langue redevient « à écrire »
                  const d = MODELES_DEPART[sel.cle as keyof typeof MODELES_DEPART];
                  const defaut = m.defauts?.[sel.langue];
                  setSujet(defaut?.sujet ?? d?.sujet[sel.langue] ?? "");
                  setCorps(defaut?.corps ?? d?.corps[sel.langue] ?? "");
                })}>
                  {m.auto ? M.retirerAuto : m.depart ? M.retirer : M.supprimer}
                </button>
              )}
              <button type="button" className="bouton-2" id="tester-modele" disabled={occupe} onClick={() => verifier() && lancer(() => testerModele(saisie()), (r) => annoncer(M.testEnvoye(r.a ?? "")))}>
                <Picto nom="courrier" />
                {M.test}
              </button>
              <button type="submit" className="bouton accent" id="enregistrer-modele" disabled={occupe} aria-busy={occupe}>
                {M.enregistrer}
              </button>
            </div>
          </form>
        )}
        <h3 className="sous-titre">{M.apercu}</h3>
        {cleAuto ? (
          <ApercuReel cle={cleAuto} langue={sel.langue} sujet={sujet} corps={corps} />
        ) : (
          <Apercu a={`${moi.prenom} ${moi.nom}`} objet={remplir(sujet, vals).texte} corps={remplir(corps, vals).texte} signature={msg.signature(moi.prenom, moi.nom)} />
        )}
      </Bloc>
      {vue}
    </div>
  );
}
