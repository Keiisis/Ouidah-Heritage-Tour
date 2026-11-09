"use client";

import { type FormEvent, useId, useRef, useState, useTransition } from "react";
import type { Role } from "@/content/equipe";
import { espace as T } from "@/content/espace";
import { A_RELIRE, LANGUES_MSG, type LangueMsg, LIMITES_COURRIEL, msg, VARIABLES } from "@/content/espace-messages";
import { useMouvementReduit } from "@/lib/mouvement";
import { enregistrerBrouillon, envoyerCourrier, envoyerTest, type RetourMessages } from "@/lib/serveur/equipe/messages/actions";
import type { ClientCourrier, Envoi, Modele } from "@/lib/serveur/equipe/messages/lectures";
import { estLangue, remplir, valeursDe } from "@/lib/serveur/equipe/messages/rendu";
import { Rediger } from "../assistant/Rediger";
import { Bloc, Vide } from "../Bloc";
import { useMinute } from "../Cadre";
import { ilYa } from "../outils";
import { Picto } from "../Picto";
import { Apercu, texteRefus, useAnnonce } from "./Apercu";

// Rédiger un e-mail (maquette E ?ecran=courrier) : destinataire tiré des clients (l'agent : les siens ; l'admin : tous, ou
// un groupe d'une même langue), modèle et langue du client, champs variables, devis lié, aperçu, brouillon, test à soi-même,
// envoi. L'aperçu montre ce que le serveur enverra : même rendu (rendu.ts), mêmes valeurs ; le serveur les relit à l'envoi.
const C = msg.courrier;
type Erreurs = Partial<Record<"dest" | "groupe" | "objet" | "langue" | "corps", string>>;

export function Courrier({ role, admin, clients, modeles, envois, moi, initial, redaction = false }: { role: Role; admin: boolean; clients: ClientCourrier[]; modeles: Modele[]; envois: Envoi[]; moi: { prenom: string; nom: string }; initial: { client: string | null; modele: string | null }; redaction?: boolean }) {
  const uid = useId();
  const reduit = useMouvementReduit();
  const minute = useMinute();
  const { annoncer, vue } = useAnnonce();
  const [occupe, demarrer] = useTransition();
  const zone = useRef<HTMLTextAreaElement>(null);
  const feuille = useRef<HTMLDivElement>(null);
  const formulaire = useRef<HTMLFormElement>(null);

  const texteDe = (cle: string, l: LangueMsg) => modeles.find((m) => m.cle === cle)?.textes[l] ?? null;
  const depart = clients.find((c) => c.id === initial.client) ?? null;
  const modeleDepart = initial.modele && modeles.some((m) => m.cle === initial.modele) ? initial.modele : "libre";
  const t0 = depart && modeleDepart !== "libre" ? texteDe(modeleDepart, depart.langue) : null;

  const [mode, setMode] = useState<"un" | "groupe">("un");
  const [client, setClient] = useState(depart?.id ?? "");
  const [groupe, setGroupe] = useState<string[]>([]);
  const [langue, setLangue] = useState<LangueMsg | "">(depart?.langue ?? "");
  const [modele, setModele] = useState(modeleDepart);
  const [objet, setObjet] = useState(t0?.sujet ?? "");
  const [corps, setCorps] = useState(t0?.corps ?? "");
  const [devis, setDevis] = useState(Boolean(modeleDepart === "devis" && depart?.devis));
  const [brouillon, setBrouillon] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<Erreurs>({});

  const choisi = clients.find((c) => c.id === client) ?? null;
  const candidats = langue ? clients.filter((c) => c.langue === langue) : [];
  const temoin = mode === "un" ? choisi : (clients.find((c) => c.id === groupe[0]) ?? null);
  const vals = temoin ? valeursDe(temoin.faits, langue || temoin.langue) : {};
  const sujetRempli = remplir(objet, vals), corpsRempli = remplir(corps, vals);
  const manque = temoin ? [...new Set([...sujetRempli.manque, ...corpsRempli.manque])] : [];

  const appliquer = (cle: string, l: LangueMsg | "") => {
    if (cle === "libre" || !l) return;
    const t = texteDe(cle, l);
    setObjet(t?.sujet ?? "");
    setCorps(t?.corps ?? "");
  };
  const choisirClient = (id: string) => {
    setClient(id);
    setBrouillon(null);
    const c = clients.find((x) => x.id === id);
    if (!c) return setDevis(false);
    setLangue(c.langue);
    setDevis(modele === "devis" && Boolean(c.devis));
    appliquer(modele, c.langue);
  };
  const choisirLangue = (v: string) => {
    const l = estLangue(v) ? v : "";
    setLangue(l);
    setGroupe((g) => g.filter((id) => clients.find((c) => c.id === id)?.langue === l));
    appliquer(modele, l);
  };
  const choisirModele = (k: string) => {
    setModele(k);
    appliquer(k, langue);
    if (k === "devis" && choisi?.devis && mode === "un") setDevis(true);
  };
  const inserer = (v: string) => {
    const t = zone.current;
    if (!t) return;
    const a = t.selectionStart ?? t.value.length, b = t.selectionEnd ?? a;
    setCorps(t.value.slice(0, a) + v + t.value.slice(b));
    requestAnimationFrame(() => {
      t.focus();
      t.setSelectionRange(a + v.length, a + v.length);
    });
  };

  const verifier = () => {
    const e: Erreurs = {};
    if (mode === "un" && !client) e.dest = C.erreurs.dest;
    if (mode === "groupe" && !groupe.length) e.groupe = C.erreurs.groupe;
    if (!objet.trim()) e.objet = C.erreurs.objet;
    if (!langue) e.langue = C.erreurs.langue;
    setErreurs(e);
    const premier = (["dest", "groupe", "langue", "objet"] as const).find((k) => e[k]);
    if (premier) formulaire.current?.querySelector<HTMLElement>(`[data-champ="${premier}"]`)?.focus();
    return !premier;
  };
  const saisie = () => ({ mode, client, clients: groupe, langue, modele, objet, corps, devis: mode === "un" && devis, brouillon });
  const repondre = (r: RetourMessages, ok: () => void) => {
    if ("ok" in r) return ok();
    if (r.erreur === "champs") {
      const e: Erreurs = {};
      for (const k of r.champs ?? []) if (k in C.erreurs) e[k as keyof Erreurs] = C.erreurs[k as keyof typeof C.erreurs];
      setErreurs(e);
    }
    annoncer(texteRefus(r), true);
  };
  const lancer = (faire: () => Promise<RetourMessages>, ok: (r: Extract<RetourMessages, { ok: true }>) => void) =>
    demarrer(async () => {
      try {
        const r = await faire();
        repondre(r, () => ok(r as Extract<RetourMessages, { ok: true }>));
      } catch {
        annoncer(msg.refus.reseau, true);
      }
    });

  const enregistrer = () => {
    if (!client) return verifier();
    lancer(() => enregistrerBrouillon(saisie()), (r) => {
      setBrouillon(r.id ?? null);
      annoncer(C.brouillonOk);
    });
  };
  const tester = () => {
    if (verifier()) lancer(() => envoyerTest(saisie()), (r) => annoncer(C.testEnvoye(r.a ?? "")));
  };
  const envoyer = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (occupe || !verifier()) return;
    const nom = choisi?.nom ?? "";
    lancer(() => envoyerCourrier(saisie()), (r) => {
      annoncer(mode === "un" ? C.envoye(nom) : C.envoyes(r.envoyes ?? 0, r.echecs ?? 0));
      // signature : l'aperçu se replie comme une lettre glissée, puis le formulaire repart à vide
      const f = feuille.current;
      if (f && !reduit) f.animate([{ clipPath: "inset(0)", transform: "none", opacity: 1 }, { clipPath: "inset(0 0 100% 0)", transform: "translateY(-24px) scale(.96)", opacity: 0 }], { duration: 640, easing: "cubic-bezier(.4,0,1,1)" });
      setClient("");
      setGroupe([]);
      setObjet("");
      setCorps("");
      setDevis(false);
      setBrouillon(null);
      setModele("libre");
      if (mode === "un") setLangue("");
    });
  };
  const reprendre = (x: Envoi) => {
    if (!x.client) return;
    setMode("un");
    setClient(x.client.id);
    setLangue(x.langue);
    setModele(x.modele ?? "libre");
    setObjet(x.objet);
    setCorps(x.corps);
    setDevis(x.pieces.includes("devis"));
    setBrouillon(x.id);
    setErreurs({});
    formulaire.current?.scrollIntoView({ behavior: reduit ? "auto" : "smooth", block: "start" });
  };

  const pieces = mode === "un" && devis && choisi?.devis ? [C.pieceDevis(choisi.devis.numero)] : [];
  const aEcrire = temoin ? `${temoin.nom} <${temoin.email}>` : "";

  return (
    <div className="esp-grille esp-messages esp-courrier">
      <Bloc id="t-red" titre={C.message} s={7} i={1}>
        <form ref={formulaire} id="form-courrier" noValidate onSubmit={envoyer}>
          <p className="message-erreur" role="alert" hidden={!Object.keys(erreurs).length}>
            {C.resume}
          </p>
          <div className="ligne-de">
            <span>{C.de}</span>
            <b>{msg.expediteur}</b>
          </div>
          <div className="champs">
            {admin && (
              <div className="champ large">
                <div className="bascule" role="group" aria-label={C.a}>
                  {(["un", "groupe"] as const).map((m) => (
                    <button key={m} type="button" aria-pressed={mode === m} data-mode={m} onClick={() => { setMode(m); setBrouillon(null); setErreurs({}); }}>
                      {C.mode[m]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {mode === "un" ? (
              <div className="champ large">
                <label htmlFor={`${uid}-dest`}>{C.a}</label>
                <select id={`${uid}-dest`} name="dest" data-champ="dest" value={client} required aria-invalid={Boolean(erreurs.dest)} aria-describedby={`${uid}-edest`} onChange={(e) => choisirClient(e.target.value)}>
                  <option value="">{C.choisir}</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}, {c.email}
                    </option>
                  ))}
                </select>
                <span className="erreur" id={`${uid}-edest`}>{erreurs.dest}</span>
                {!clients.length && <Vide texte={C.aucunClient[role]} />}
              </div>
            ) : null}
            <div className="champ">
              <label htmlFor={`${uid}-langue`}>{C.langue}</label>
              <select id={`${uid}-langue`} name="langue" data-champ="langue" value={langue} required aria-invalid={Boolean(erreurs.langue)} aria-describedby={`${uid}-elangue`} onChange={(e) => choisirLangue(e.target.value)}>
                <option value="">{C.choisirLangue}</option>
                {LANGUES_MSG.map((l) => (
                  <option key={l} value={l}>
                    {T.langues[l]}
                  </option>
                ))}
              </select>
              <span className="erreur" id={`${uid}-elangue`}>{erreurs.langue}</span>
            </div>
            <div className="champ">
              <label htmlFor={`${uid}-modele`}>{C.modele}</label>
              <select id={`${uid}-modele`} name="modele" value={modele} onChange={(e) => choisirModele(e.target.value)}>
                <option value="libre">{C.libre}</option>
                {modeles.map((m) => (
                  <option key={m.cle} value={m.cle}>
                    {m.nom}
                  </option>
                ))}
              </select>
            </div>
            {mode === "groupe" && (
              <fieldset className="champ large" data-champ="groupe" tabIndex={-1} aria-describedby={`${uid}-egroupe`}>
                <legend>{C.groupe}</legend>
                {langue ? (
                  <>
                    <div className="groupe-outils">
                      <span className="aide">{C.groupeAide(candidats.length)}</span>
                      {candidats.length > 0 && (
                        <button type="button" className="bouton-2 bouton-petit" onClick={() => setGroupe(groupe.length ? [] : candidats.slice(0, LIMITES_COURRIEL.groupe).map((c) => c.id))}>
                          {groupe.length ? C.aucun : C.tous}
                        </button>
                      )}
                    </div>
                    {candidats.length > 0 && (
                      <div className="groupe-liste" data-lenis-prevent>
                        {candidats.map((c) => (
                          <label key={c.id} className="puce">
                            <input type="checkbox" name="groupe" value={c.id} checked={groupe.includes(c.id)} disabled={!groupe.includes(c.id) && groupe.length >= LIMITES_COURRIEL.groupe} onChange={(e) => setGroupe((g) => (e.target.checked ? [...g, c.id] : g.filter((x) => x !== c.id)))} />
                            <span>
                              {c.nom}, {c.email}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <span className="aide">{C.erreurs.langue}</span>
                )}
                <span className="erreur" id={`${uid}-egroupe`}>{erreurs.groupe}</span>
              </fieldset>
            )}
            <div className="champ large">
              <label htmlFor={`${uid}-objet`}>{C.objet}</label>
              <input type="text" id={`${uid}-objet`} name="objet" data-champ="objet" autoComplete="off" maxLength={LIMITES_COURRIEL.objet} value={objet} required aria-invalid={Boolean(erreurs.objet)} aria-describedby={`${uid}-eobjet`} onChange={(e) => setObjet(e.target.value)} />
              <span className="erreur" id={`${uid}-eobjet`}>{erreurs.objet}</span>
            </div>
            <div className="champ large">
              <label htmlFor={`${uid}-corps`}>{C.corps}</label>
              <textarea ref={zone} id={`${uid}-corps`} name="corps" rows={9} maxLength={LIMITES_COURRIEL.corps} value={corps} aria-invalid={Boolean(erreurs.corps)} onChange={(e) => setCorps(e.target.value)} />
              <div className="puces" role="group" aria-label={C.variables}>
                <span className="aide">{C.variables}</span>
                {Object.values(VARIABLES).map((v) => (
                  <button key={v} type="button" className="puce" data-var={v} aria-label={C.inserer(v)} onClick={() => inserer(v)}>
                    {v}
                  </button>
                ))}
              </div>
              {langue && A_RELIRE.includes(langue) && <span className="aide">{C.locuteur}</span>}
              {redaction && <Rediger objet={objet} corps={corps} langue={langue} utiliser={(o, c) => {
                    setObjet(o);
                    setCorps(c);
                  }} />}
            </div>
            {mode === "un" && (
              <fieldset className="champ large">
                <legend>{C.pieces}</legend>
                <div className="puces" id="m-pieces">
                  {!choisi ? (
                    <span className="aide">{C.choisirDabord}</span>
                  ) : choisi.devis ? (
                    <label className="puce">
                      <input type="checkbox" name="pieces" value="devis" checked={devis} onChange={(e) => setDevis(e.target.checked)} />
                      <Picto nom="document" />
                      <span>{C.pieceDevis(choisi.devis.numero)}</span>
                    </label>
                  ) : (
                    <span className="aide">{C.aucunePiece}</span>
                  )}
                </div>
                {choisi?.devis && <span className="aide">{C.pieceNote}</span>}
              </fieldset>
            )}
          </div>
          <div className="pied-actions">
            {mode === "un" && (
              <button type="button" className="bouton-2" id="m-brouillon" disabled={occupe} onClick={enregistrer}>
                {C.brouillon}
              </button>
            )}
            <button type="button" className="bouton-2" id="m-test" disabled={occupe} onClick={tester}>
              <Picto nom="courrier" />
              {C.test}
            </button>
            <button type="submit" className="bouton accent" id="m-envoyer" disabled={occupe} aria-busy={occupe}>
              <Picto nom="courrier" />
              <span>{occupe ? C.envoi : mode === "groupe" && groupe.length ? C.envoyerGroupe(groupe.length) : C.envoyer}</span>
            </button>
          </div>
        </form>
      </Bloc>

      <Bloc id="t-ape" titre={mode === "groupe" && temoin ? C.apercuGroupe(temoin.nom) : C.apercu} s={5} i={2}>
        <Apercu ref={feuille} a={aEcrire} objet={sujetRempli.texte} corps={corpsRempli.texte} signature={msg.signature(moi.prenom, moi.nom)} pieces={pieces} />
        {manque.length > 0 && <p className="mention-manque">{msg.manquent(manque.map((m) => msg.manque[m]))}</p>}
      </Bloc>

      <Bloc id="t-env" titre={C.derniers} compte={envois.length} s={12} i={3}>
        {envois.length ? (
          <ul className="liste" id="liste-envois">
            {envois.map((x) => (
              <li key={x.id} data-envoi={x.id} data-statut={x.statut}>
                <div className="rangee">
                  <span className="texte">
                    <span className="titre">{x.objet || "…"}</span>
                    <span className="meta">{C.pour(x.client?.nom ?? x.destinataire, ilYa(x.quand, minute))}{admin && x.auteur ? ` · ${x.auteur}` : ""}</span>
                  </span>
                  <span className="langue" title={T.langues[x.langue]}>{x.langue}</span>
                  <span className="etat" data-e={x.statut}>{C.etats[x.statut]}</span>
                  {x.statut === "brouillon" && x.mien && x.client && (
                    <span className="actions">
                      <button type="button" className="bouton-2 bouton-petit" data-reprendre={x.id} onClick={() => reprendre(x)}>
                        {C.reprendre}
                      </button>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Vide texte={C.vide} />
        )}
      </Bloc>
      {vue}
    </div>
  );
}
