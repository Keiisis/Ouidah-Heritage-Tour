"use client";

import { useId, useRef, useState, useTransition } from "react";
import { espace as T } from "@/content/espace";
import { A_RELIRE, LANGUES_MSG, type LangueMsg, LIMITES_COURRIEL, MODELES_DEPART, msg, VARIABLES } from "@/content/espace-messages";
import { enregistrerModele, retirerModele, type RetourMessages, testerModele } from "@/lib/serveur/equipe/messages/actions";
import type { Modele } from "@/lib/serveur/equipe/messages/lectures";
import { CLE, estAuto, jetonsInconnus, remplir, valeursApercu, variablesAbsentes } from "@/lib/serveur/equipe/messages/rendu";
import { Bloc } from "../Bloc";
import { Picto } from "../Picto";
import { Apercu, texteRefus, useAnnonce } from "./Apercu";

// Modèles d'e-mails (admin) : chaque modèle dans les 7 langues, son état (personnalisé, texte de départ, à écrire),
// l'éditeur avec ses champs variables, l'aperçu et le test à soi-même : {prénom} = l'admin connecté, les autres champs en
// repères traduits entre crochets (aucune donnée inventée). Le serveur relit tout.
// Second groupe « E-mails automatiques » : les clés réservées au site (rendu.ts, AUTO_CLES), jamais dans le composeur ;
// seuls les quatre champs variables y sont acceptés, et l'écran signale ceux qui manquent.
const M = msg.modeles;

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
    const e = [...(sujet.trim() ? [] : ["sujet"]), ...(corps.trim() ? [] : ["corps"]), ...(inconnus.length ? ["jetons"] : [])];
    setErreurs(e);
    return !e.length;
  };
  const nom = m?.nom ?? sel.cle;
  const vals = valeursApercu(moi.prenom, sel.langue);
  const inconnus = m?.auto ? jetonsInconnus(`${sujet} ${corps}`) : [];
  const absentes = m?.auto && (sujet.trim() || corps.trim()) ? variablesAbsentes(`${sujet} ${corps}`) : [];
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
                  {Object.values(VARIABLES).map((v) => (
                    <button key={v} type="button" className="puce" data-var={v} aria-label={msg.courrier.inserer(v)} onClick={() => inserer(v)}>
                      {v}
                    </button>
                  ))}
                </div>
                {t?.source === "depart" && A_RELIRE.includes(sel.langue) && <span className="aide">{M.aRelire}</span>}
                {m.auto && <span className="aide">{M.autoVariables}</span>}
                {inconnus.length > 0 && <span className="erreur" id="jetons-inconnus">{M.inconnus(inconnus)}</span>}
                {absentes.length > 0 && <span className="mention-manque" id="variables-absentes">{M.absentes(absentes.map((v) => VARIABLES[v]))}</span>}
              </div>
            </div>
            <div className="pied-actions">
              {t?.source === "base" && (
                <button type="button" className="bouton-2" id="retirer-modele" disabled={occupe} onClick={() => lancer(() => retirerModele(sel.cle, sel.langue), () => {
                  annoncer(M.retire(nom, sel.langue));
                  // le texte de départ reprend sa place ; sans texte de départ, la langue redevient « à écrire »
                  const d = MODELES_DEPART[sel.cle as keyof typeof MODELES_DEPART];
                  setSujet(d?.sujet[sel.langue] ?? "");
                  setCorps(d?.corps[sel.langue] ?? "");
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
        <Apercu a={`${moi.prenom} ${moi.nom}`} objet={remplir(sujet, vals).texte} corps={remplir(corps, vals).texte} signature={msg.signature(moi.prenom, moi.nom)} />
      </Bloc>
      {vue}
    </div>
  );
}
