"use client";

import { AnimatePresence, motion } from "motion/react";
import { Fragment, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { espace as T } from "@/content/espace";
import { useMouvementReduit } from "@/lib/mouvement";
import type { EtatCompte, Membre } from "@/lib/serveur/equipe/agents";
import { ajouterAgent, changerAgent, changerRole, type Retour, supprimerAgent } from "@/lib/serveur/equipe/gestion";
import { type ChampInvalide, type Langue, LANGUES, lireInvitation } from "@/lib/serveur/equipe/partage";
import { Bloc, Vide } from "./Bloc";
import { useMinute } from "./Cadre";
import { ilYa, lumiere, minutesOuidah, soleil, surArc } from "./outils";
import { Picto } from "./Picto";
import "./agents.css";

// Écran Équipe (lot L3, maquette E ?ecran=equipe) : la liste réelle des comptes (compteurs qui filtrent par état, petite
// course du soleil de chaque membre actif), le panneau « Ajouter un membre » et les actions de ligne (suspendre,
// réactiver, réinviter, supprimer après confirmation dans la ligne, changer le rôle). Les champs sont
// relus ici avec les règles partagées (partage.ts) puis par le serveur, qui seul décide. Après chaque action, le serveur
// renvoie la liste à jour (refresh) : rien n'est inventé côté navigateur. Mouvement signature : la ligne de l'agent invité
// arrive dans la liste (clip-path et transform) et les autres se replacent en FLIP (motion, layout) ; rien en mouvement
// réduit.

const E = T.equipe;
const ETATS: EtatCompte[] = ["actif", "invite", "suspendu"];
type Filtre = "tous" | EtatCompte;
type Quoi = "suspendre" | "reactiver" | "reinviter" | "supprimer" | "role";
type Echec = Exclude<Retour, { ok: true }>;
const GLISSE = [0.625, 0.05, 0, 1] as const;

const texteErreur = (r: Echec) => (r.erreur === "trop_tot" ? E.erreurs.trop_tot(r.attente ?? 60) : E.erreurs[r.erreur]);
const initiales = (m: Membre) => `${m.prenom[0] ?? ""}${m.nom[0] ?? ""}`.toUpperCase();

/** Adresse coupée proprement : avant « @ », puis à chaque point du domaine ; l'adresse entière en infobulle. */
function Courriel({ email }: { email: string }) {
  const [local, domaine = ""] = email.split("@");
  return (
    <small className="courriel" title={email}>
      {local}
      <wbr />@
      {domaine.split(".").map((p, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <>
              <wbr />.
            </>
          )}
          {p}
        </Fragment>
      ))}
    </small>
  );
}

/** Petite course du soleil d'un membre actif, à l'heure de Ouidah, avec un point par moment du jour de ses dossiers
 * (lot L4) ; sans moment, l'arc le dit. */
function MiniArc({ moments }: { moments: number[] }) {
  const minute = useMinute();
  const m = minutesOuidah(minute), s = soleil(minute), lum = lumiere(m, s);
  const W = 176, hz = 38, a = 30;
  const point = (mm: number) => {
    const p = surArc(mm, s);
    return `${(p.x * W).toFixed(1)} ${(hz - a * p.h).toFixed(1)}`;
  };
  const trace = (de: number, jusque: number) => {
    const pts: string[] = [];
    for (let mm = de; mm < jusque; mm += 15) pts.push(point(mm));
    pts.push(point(jusque));
    return `M${pts.join(" L")}`;
  };
  const p = surArc(m, s);
  return (
    <span className="jour-arc">
      <svg className="mini-arc" viewBox="-6 -2 188 48" role="img" aria-label={moments.length ? E.jourArcMoments(moments.length) : E.jourArc} data-lumiere={lum}>
        <path className="arc" d={trace(s.aube, s.coucher)} />
        {m > s.aube && <path className="arc-p" d={trace(s.aube, Math.min(m, s.coucher))} />}
        <line className="hz" x1="0" x2={W} y1={hz} y2={hz} />
        {lum !== "nuit" && <circle className="sol" cx={(p.x * W).toFixed(1)} cy={(hz - a * p.h).toFixed(1)} r="6" />}
        {moments.map((t, k) => {
          const q = surArc(minutesOuidah(Math.floor(t / 60_000)), s);
          return <circle key={k} className="moment" cx={(q.x * W).toFixed(1)} cy={(hz - a * Math.max(0, q.h)).toFixed(1)} r="3.5" />;
        })}
      </svg>
      <span className="meta" aria-hidden="true">
        {moments.length ? E.jourMoments(moments.length) : E.jourVide}
      </span>
    </span>
  );
}

export function Equipe({ membres }: { membres: Membre[] }) {
  const reduit = useMouvementReduit();
  const minute = useMinute();
  const titreId = useId();
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [occupe, setOccupe] = useState<string | null>(null);
  const [aSupprimer, setASupprimer] = useState<string | null>(null); // ligne dont la suppression attend confirmation
  const [annonce, setAnnonce] = useState<{ texte: string; erreur: boolean } | null>(null);
  const [cle, setCle] = useState(0); // un formulaire neuf à chaque ouverture du panneau
  // seul le membre qui vient d'être invité joue l'arrivée ; un changement de filtre ne rejoue rien (lignes posées d'un coup)
  const [arrive, setArrive] = useState<string | null>(null);
  const [, demarrer] = useTransition();
  const minuteur = useRef<ReturnType<typeof setTimeout>>(undefined);
  const panneau = useRef<HTMLDialogElement>(null);

  const nombre = (f: Filtre) => (f === "tous" ? membres.length : membres.filter((m) => m.etat === f).length);
  const vus = filtre === "tous" ? membres : membres.filter((m) => m.etat === filtre);

  const annoncer = (texte: string, erreur = false) => {
    setAnnonce({ texte, erreur });
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setAnnonce(null), 6000);
  };

  const ouvrir = () => {
    setCle((c) => c + 1);
    panneau.current?.showModal();
  };
  // le panneau repart d'où il est venu (à droite, ou vers le bas en 390), puis se ferme
  const fermer = () => {
    const d = panneau.current;
    if (!d?.open) return;
    if (reduit) return d.close();
    const bas = matchMedia("(max-width: 760px)").matches;
    const a = d.animate([{ transform: "none" }, { transform: bas ? "translateY(100%)" : "translateX(100%)" }], { duration: 360, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
    const fin = () => {
      d.close();
      a.cancel();
    };
    a.finished.then(fin, fin);
  };
  const fini = (qui: string, r: Retour) => {
    fermer();
    if ("ok" in r && "id" in r && typeof r.id === "string") setArrive(r.id);
    if ("ok" in r) annoncer(E.annonces.invite(qui));
    else annoncer(texteErreur(r), true);
  };

  const agir = (m: Membre, quoi: Quoi) => {
    if (occupe) return;
    setOccupe(`${m.id}:${quoi}`);
    setASupprimer(null);
    const qui = `${m.prenom} ${m.nom}`;
    const vers = m.role === "admin" ? "agent" : "admin";
    demarrer(async () => {
      try {
        const r = quoi === "supprimer" ? await supprimerAgent(m.id) : quoi === "role" ? await changerRole(m.id, vers) : await changerAgent(m.id, quoi);
        if (!("ok" in r)) annoncer(texteErreur(r), true);
        else if (quoi === "supprimer") annoncer(E.annonces.supprime(qui));
        else if (quoi === "role") annoncer(E.annonces.role(qui, E.roles[vers]));
        else annoncer({ suspendre: E.annonces.suspendu, reactiver: E.annonces.reactive, reinviter: E.annonces.reinvite }[quoi](qui));
      } catch {
        annoncer(E.erreurs.reseau, true);
      }
      setOccupe(null);
    });
  };

  const action = (m: Membre, quoi: Quoi, libelle: string, picto?: "pause" | "courrier") => (
    <button
      type="button"
      className="bouton-2 bouton-petit"
      data-act={quoi}
      aria-label={E.actionDe(libelle, `${m.prenom} ${m.nom}`)}
      aria-busy={occupe === `${m.id}:${quoi}`}
      disabled={occupe === `${m.id}:${quoi}`}
      onClick={() => agir(m, quoi)}
    >
      {picto && <Picto nom={picto} />}
      {libelle}
    </button>
  );

  return (
    <div className="esp-grille esp-equipe">
      <Bloc
        id="t-equ"
        titre={E.titre}
        compte={membres.length}
        s={12}
        i={1}
        lien={
          <button type="button" className="bouton accent" id="ajouter" aria-haspopup="dialog" onClick={ouvrir}>
            <Picto nom="plus" />
            {E.ajouter}
          </button>
        }
      >
        <div className="filtres" role="group" aria-label={E.filtres}>
          {(["tous", ...ETATS] as Filtre[]).map((f) => (
            <button key={f} type="button" data-filtre={f} aria-pressed={filtre === f} onClick={() => setFiltre(f)}>
              <b>{nombre(f)}</b>
              <span>{E.resume[f](nombre(f))}</span>
            </button>
          ))}
        </div>

        <table className="tableau empile" id="table-equipe">
          <caption className="invisible">{E.titre}</caption>
          <thead>
            <tr>
              {Object.values(E.cols).map((c) => (
                <th scope="col" key={c}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {vus.map((m) => {
                const quand =
                  m.etat === "invite" ? (m.invitation ? E.invitation(ilYa(m.invitation, minute)) : null) : m.derniere ? E.derniere(ilYa(m.derniere, minute)) : E.jamais;
                return (
                  <motion.tr
                    key={m.id}
                    data-membre={m.id}
                    data-etat={m.etat}
                    layout={reduit ? false : "position"}
                    initial={reduit || m.id !== arrive ? false : { clipPath: "inset(0 0 0 100%)", x: 56 }}
                    animate={{ clipPath: "inset(0 0 0 0%)", x: 0, transitionEnd: { clipPath: "none" } }}
                    transition={{ duration: 0.72, ease: GLISSE, layout: { duration: 0.5, ease: GLISSE } }}
                  >
                    <td data-l={E.cols.qui}>
                      <div className="qui">
                        <span className={m.etat === "actif" ? "avatar" : "avatar neutre"} aria-hidden="true">
                          {initiales(m)}
                        </span>
                        <span>
                          <b>
                            {m.prenom} {m.nom}
                          </b>
                          <Courriel email={m.email} />
                          {quand && <small className="quand">{quand}</small>}
                        </span>
                      </div>
                    </td>
                    <td data-l={E.cols.role}>{E.roles[m.role]}</td>
                    <td data-l={E.cols.langues}>
                      <span className="langues">
                        {m.langues.map((l) => (
                          <span className="langue" key={l} title={T.langues[l]}>
                            {l}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td data-l={E.cols.jour}>{m.etat === "actif" ? <MiniArc moments={m.moments} /> : <span className="meta">{E.jourVide}</span>}</td>
                    <td data-l={E.cols.etat}>
                      <AnimatePresence initial={false}>
                        <motion.span
                          key={m.etat}
                          className="etat"
                          data-e={m.etat}
                          initial={reduit ? false : { scale: 1.6, rotate: -8, opacity: 0 }}
                          animate={{ scale: 1, rotate: 0, opacity: 1 }}
                          transition={{ duration: 0.56, ease: [0, 0, 0.3, 1] }}
                        >
                          {E.etats[m.etat]}
                        </motion.span>
                      </AnimatePresence>
                    </td>
                    <td data-l={E.cols.actions}>
                      <div className="actions-ligne">
                        {m.moi ? (
                          <span className="meta">{E.moi}</span>
                        ) : aSupprimer === m.id ? (
                          <>
                            <span className="meta" role="alert">
                              {E.confirmation(`${m.prenom} ${m.nom}`)}
                            </span>
                            {action(m, "supprimer", E.confirmer)}
                            <button type="button" className="bouton-2 bouton-petit" onClick={() => setASupprimer(null)}>
                              {E.garder}
                            </button>
                          </>
                        ) : (
                          <>
                            {m.etat === "suspendu" && action(m, "reactiver", E.reactiver)}
                            {m.etat === "invite" && action(m, "reinviter", E.reinviter, "courrier")}
                            {m.etat !== "suspendu" && action(m, "suspendre", E.suspendre, "pause")}
                            {action(m, "role", E.devenir[m.role === "admin" ? "agent" : "admin"])}
                            {m.etat !== "actif" && (
                              <button type="button" className="bouton-2 bouton-petit" data-act="demander-suppression" aria-label={E.actionDe(E.supprimer, `${m.prenom} ${m.nom}`)} disabled={Boolean(occupe)} onClick={() => setASupprimer(m.id)}>
                                {E.supprimer}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
        {!vus.length && <p className="mention">{E.filtreVide}</p>}
        {!membres.some((m) => m.role === "agent") && <Vide texte={E.vide} />}
      </Bloc>

      <dialog
        ref={panneau}
        className="esp-tiroir"
        aria-labelledby={titreId}
        onCancel={(e) => {
          e.preventDefault();
          fermer();
        }}
        onClick={(e) => e.target === e.currentTarget && fermer()}
      >
        {cle > 0 && <Formulaire key={cle} titreId={titreId} fermer={fermer} fini={fini} />}
      </dialog>

      <p className="esp-annonce" role="status" aria-live="polite" data-ton={annonce?.erreur ? "erreur" : undefined}>
        {annonce?.texte}
      </p>
    </div>
  );
}

type ChampTexte = "prenom" | "nom" | "email" | "telephone";
const TEXTES: [ChampTexte, string, number, boolean][] = [
  ["prenom", "text", 80, false],
  ["nom", "text", 80, false],
  ["email", "email", 254, true],
  ["telephone", "tel", 32, true],
];

/** Panneau « Ajouter un membre ». La première langue de la liste envoyée sert aux e-mails du compte. */
function Formulaire({ titreId, fermer, fini }: { titreId: string; fermer: () => void; fini: (qui: string, r: Retour) => void }) {
  const F = E.form;
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const [langues, setLangues] = useState<Langue[]>([]); // dans l'ordre où elles ont été cochées
  const [mail, setMail] = useState<Langue | "">("");
  const [role, setRole] = useState<"agent" | "admin">("agent");
  const [droits, setDroits] = useState<Record<string, boolean>>(() => Object.fromEntries(E.droits.map(([k, , oui]) => [k, oui])));
  const [erreurs, setErreurs] = useState<ChampInvalide[]>([]);
  const [message, setMessage] = useState("");
  const [envoi, demarrer] = useTransition();
  const langueMail = mail && langues.includes(mail) ? mail : langues[0];
  const faux = (c: ChampInvalide) => erreurs.includes(c);

  const montrer = (champs: ChampInvalide[]) => {
    setErreurs(champs);
    setMessage(champs.length ? F.resume : "");
    const premier = champs[0];
    if (premier) form.current?.querySelector<HTMLElement>(`[name="${premier}"]`)?.focus();
  };

  const soumettre = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (envoi) return;
    const f = new FormData(e.currentTarget);
    const brut = {
      prenom: f.get("prenom"),
      nom: f.get("nom"),
      email: f.get("email"),
      telephone: f.get("telephone"),
      langues: langueMail ? [langueMail, ...langues.filter((l) => l !== langueMail)] : [],
      role,
      droits: role === "admin" ? {} : droits,
    };
    const lu = lireInvitation(brut);
    if (!lu.ok) return montrer(lu.champs);
    montrer([]);
    demarrer(async () => {
      try {
        const r = await ajouterAgent(brut);
        if ("ok" in r || r.erreur === "envoi") fini(`${lu.v.prenom} ${lu.v.nom}`, r);
        else if (r.erreur === "champs") montrer(r.champs ?? []);
        else setMessage(texteErreur(r));
      } catch {
        setMessage(E.erreurs.reseau);
      }
    });
  };

  return (
    <form ref={form} className="tiroir-cadre" noValidate onSubmit={soumettre}>
      <header className="tiroir-tete">
        <div>
          <h2 id={titreId}>{F.titre}</h2>
          <p>{F.sous}</p>
        </div>
        <button type="button" className="icone-bouton" aria-label={F.annuler} onClick={fermer}>
          <Picto nom="fermer" />
        </button>
      </header>
      <div className="tiroir-corps" data-lenis-prevent>
        {message && (
          <p className="message-erreur" role="alert">
            {message}
          </p>
        )}
        <div className="champs">
          {TEXTES.map(([nom, type, max, large]) => (
            <div key={nom} className={large ? "champ large" : "champ"}>
              <label htmlFor={`${id}-${nom}`}>{F[nom === "telephone" ? "tel" : nom]}</label>
              <input
                id={`${id}-${nom}`}
                name={nom}
                type={type}
                maxLength={max}
                autoComplete="off"
                autoFocus={nom === "prenom"}
                inputMode={nom === "email" ? "email" : nom === "telephone" ? "tel" : undefined}
                aria-invalid={faux(nom)}
                aria-describedby={`${id}-${nom}-e${nom === "telephone" ? ` ${id}-tel-a` : ""}`}
              />
              {nom === "telephone" && (
                <span className="aide" id={`${id}-tel-a`}>
                  {F.telAide}
                </span>
              )}
              <span className="erreur" id={`${id}-${nom}-e`}>
                {faux(nom) ? F.erreurs[nom] : ""}
              </span>
            </div>
          ))}

          <fieldset className="champ large" aria-describedby={`${id}-langues-e`}>
            <legend>{F.langues}</legend>
            <div className="puces">
              {LANGUES.map((l) => (
                <label className="puce" key={l}>
                  <input
                    type="checkbox"
                    name="langues"
                    value={l}
                    checked={langues.includes(l)}
                    aria-invalid={faux("langues")}
                    onChange={(e) => {
                      const oui = e.target.checked;
                      setLangues((x) => (oui ? [...x, l] : x.filter((y) => y !== l)));
                    }}
                  />
                  {T.langues[l]}
                </label>
              ))}
            </div>
            <span className="erreur" id={`${id}-langues-e`}>
              {faux("langues") ? F.erreurs.langues : ""}
            </span>
          </fieldset>

          {langues.length > 1 && (
            <div className="champ large">
              <label htmlFor={`${id}-mail`}>{F.langueEmails}</label>
              <select id={`${id}-mail`} value={langueMail} aria-describedby={`${id}-mail-a`} onChange={(e) => setMail(e.target.value as Langue)}>
                {LANGUES.filter((l) => langues.includes(l)).map((l) => (
                  <option key={l} value={l}>
                    {T.langues[l]}
                  </option>
                ))}
              </select>
              <span className="aide" id={`${id}-mail-a`}>
                {F.langueEmailsAide}
              </span>
            </div>
          )}

          <fieldset className="champ large" aria-describedby={`${id}-role-e`}>
            <legend>{F.role}</legend>
            <div className="puces">
              {(["agent", "admin"] as const).map((r) => (
                <label className="puce" key={r}>
                  <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} />
                  {E.roles[r]}
                </label>
              ))}
            </div>
            <span className="erreur" id={`${id}-role-e`}>
              {faux("role") ? F.erreurs.role : ""}
            </span>
          </fieldset>

          <fieldset className="champ large" aria-describedby={`${id}-droits-e`}>
            <legend>{F.droits}</legend>
            {role === "admin" ? (
              <p className="aide">{F.droitsAdmin}</p>
            ) : (
              <div className="puces">
                {E.droits.map(([k, libelle]) => (
                  <label className="puce" key={k}>
                    <input
                      type="checkbox"
                      name="droits"
                      value={k}
                      checked={droits[k] ?? false}
                      onChange={(e) => {
                        const oui = e.target.checked;
                        setDroits((d) => ({ ...d, [k]: oui }));
                      }}
                    />
                    {libelle}
                  </label>
                ))}
              </div>
            )}
            <span className="erreur" id={`${id}-droits-e`}>
              {faux("droits") ? F.erreurs.droits : ""}
            </span>
          </fieldset>
        </div>
      </div>
      <footer className="tiroir-pied">
        <button type="button" className="bouton-2" onClick={fermer}>
          {F.annuler}
        </button>
        <button type="submit" className="bouton accent" id="envoyer-invitation" aria-busy={envoi} disabled={envoi}>
          <Picto nom="courrier" />
          <span>{envoi ? F.envoi : F.envoyer}</span>
        </button>
      </footer>
    </form>
  );
}
