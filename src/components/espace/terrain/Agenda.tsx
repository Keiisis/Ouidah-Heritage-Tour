"use client";

import { LayoutGroup, motion } from "motion/react";
import Link from "next/link";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { espace as T } from "@/content/espace";
import { terrain } from "@/content/espace-terrain";
import { useMouvementReduit } from "@/lib/mouvement";
import { ajouterMoment, deplacerMoment, type RetourDossier } from "@/lib/serveur/equipe/dossiers-actions";
import type { TypeMoment } from "@/lib/serveur/equipe/dossiers-regles";
import { Bloc } from "../Bloc";
import { Picto, PICTO_MOMENT } from "../Picto";

// Agenda de l'agent (lot terrain L5), sur les moments des dossiers (lot L4) : jours de la période, moments à l'heure de
// Ouidah, ajout et déplacement d'un moment par les actions du lot L4 (ajouterMoment, deplacerMoment), qui relisent la
// session et le dossier à chaque appel puis renvoient l'écran à jour (refresh). Mouvement : un moment déplacé glisse vers
// son nouveau jour (motion, layoutId) ; rien en mouvement réduit.

const A = terrain.agenda;
const M = T.moments;
const GLISSE = [0.625, 0.05, 0, 1] as const;
export type MomentVu = { id: string; dossier: string; client: string; type: TypeMoment; lieu: string | null; heure: string; date: string; hhmm: string; etat: "avenir" | "encours" | "fait" | "aclore" };
export type JourVu = { iso: string; titre: string; aujourdhui: boolean; moments: MomentVu[] };
type Echec = Exclude<RetourDossier, { ok: true }>;

const texteEchec = (r: Echec) => (r.erreur === "champs" ? (r.champs ?? []).map((c) => M.erreurs[c] ?? T.refus.champs).join(" ") || T.refus.champs : (M.erreurs[r.erreur] ?? (T.refus as Record<string, string>)[r.erreur] ?? T.refus.panne));

export function Agenda({ jours, dossiers, lieux, dateParDefaut, unJour }: { jours: JourVu[]; dossiers: { id: string; client: string }[]; lieux: { id: string; nom: string }[]; dateParDefaut: string; unJour: boolean }) {
  const reduit = useMouvementReduit();
  const [deplace, setDeplace] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState("");
  const [erreurDeplace, setErreurDeplace] = useState("");
  const [annonce, setAnnonce] = useState("");
  const [, demarrer] = useTransition();
  const minuteur = useRef<number | undefined>(undefined);
  const annoncer = (t: string) => {
    setAnnonce(t);
    clearTimeout(minuteur.current);
    minuteur.current = window.setTimeout(() => setAnnonce(""), 6000);
  };

  const ajouter = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const dossier = String(f.get("dossier") ?? "");
    if (!dossiers.some((d) => d.id === dossier)) return setErreur(A.erreurDossier);
    const form = ev.currentTarget;
    setOccupe(true);
    demarrer(async () => {
      try {
        const r = await ajouterMoment(dossier, { type: f.get("type"), date: f.get("date"), heure: f.get("heure"), duree: Number(f.get("duree")), lieu: f.get("lieu") || null, note: f.get("note") ?? "" });
        if ("ok" in r) {
          setErreur("");
          form.reset();
          annoncer(M.annonces.ajoute);
        } else setErreur(texteEchec(r));
      } catch {
        setErreur(T.refus.introuvable);
      }
      setOccupe(false);
    });
  };

  const deplacer = (m: MomentVu, ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    setOccupe(true);
    demarrer(async () => {
      try {
        const r = await deplacerMoment(m.dossier, m.id, { date: f.get("date"), heure: f.get("heure") });
        if ("ok" in r) {
          setDeplace(null);
          setErreurDeplace("");
          annoncer(M.annonces.deplace);
        } else setErreurDeplace(texteEchec(r));
      } catch {
        setErreurDeplace(T.refus.introuvable);
      }
      setOccupe(false);
    });
  };

  const total = jours.reduce((t, j) => t + j.moments.length, 0);
  return (
    <div className="esp-terrain">
      <LayoutGroup>
        <div className={unJour ? "semaine un-jour" : "semaine"} id="agenda-jours">
          {jours.map((j) => (
            <section key={j.iso} className="jour-agenda" data-jour={j.iso} data-aujourdhui={j.aujourdhui || undefined} aria-labelledby={`j-${j.iso}`}>
              <h3 id={`j-${j.iso}`}>{j.titre}</h3>
              {j.moments.length ? (
                <ul className="moments-agenda">
                  {j.moments.map((m) => {
                    const quoi = [M.types[m.type], m.lieu, m.client].filter(Boolean).join(", ");
                    return (
                      <motion.li key={m.id} layoutId={reduit ? undefined : m.id} layout={reduit ? false : "position"} transition={{ duration: 0.56, ease: GLISSE }} className="moment-agenda" data-moment={m.id} data-etat={m.etat}>
                        <div className="haut">
                          <Picto nom={PICTO_MOMENT[m.type]} />
                          <span className="heure">{m.heure}</span>
                          {(m.etat === "fait" || m.etat === "aclore" || m.etat === "encours") && (
                            <span className="etat" data-e={m.etat}>
                              {m.etat === "fait" ? A.fait : m.etat === "aclore" ? A.aClore : T.journee.etats.encours}
                            </span>
                          )}
                        </div>
                        <span>{[M.types[m.type], m.lieu].filter(Boolean).join(", ")}</span>
                        <Link href={`/agents/demandes/${m.dossier}`} aria-label={A.ouvrirDossier(m.client)}>
                          {m.client}
                        </Link>
                        {deplace === m.id ? (
                          <form onSubmit={(e) => deplacer(m, e)} aria-label={A.deplacerDe(quoi)}>
                            <label className="champ">
                              {M.date}
                              <input type="date" name="date" defaultValue={m.date} required />
                            </label>
                            <label className="champ">
                              {M.heure}
                              <input type="time" name="heure" defaultValue={m.hhmm} step={300} required />
                            </label>
                            {erreurDeplace && (
                              <span className="meta" role="alert">
                                {erreurDeplace}
                              </span>
                            )}
                            <div className="actions">
                              <button type="submit" className="bouton accent bouton-petit" disabled={occupe} data-valider-deplacement>
                                {A.valider}
                              </button>
                              <button type="button" className="bouton-2 bouton-petit" onClick={() => setDeplace(null)}>
                                {A.annuler}
                              </button>
                            </div>
                          </form>
                        ) : (
                          m.etat !== "fait" && (
                            <div className="actions">
                              <button
                                type="button"
                                className="bouton-2 bouton-petit"
                                aria-label={A.deplacerDe(quoi)}
                                data-deplacer={m.id}
                                onClick={() => {
                                  setErreurDeplace("");
                                  setDeplace(m.id);
                                }}
                              >
                                <Picto nom="calendrier" />
                                {A.deplacer}
                              </button>
                            </div>
                          )
                        )}
                      </motion.li>
                    );
                  })}
                </ul>
              ) : (
                <p className="rien">{A.rien}</p>
              )}
            </section>
          ))}
        </div>
      </LayoutGroup>
      {total === 0 && !unJour && (
        <p className="meta" style={{ marginTop: 12 }}>
          <b>{A.vide[0]}</b> {A.vide[1]}
        </p>
      )}

      <div className="esp-grille" style={{ marginTop: 24 }}>
        <Bloc id="t-ajout" titre={A.ajouter} s={12} i={2}>
        {dossiers.length ? (
          <form className="form-moment" id="form-agenda" onSubmit={ajouter} noValidate>
            <label className="champ large">
              {A.dossier}
              <select name="dossier" defaultValue="" required>
                <option value="" disabled>
                  {A.choisirDossier}
                </option>
                {dossiers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.client}
                  </option>
                ))}
              </select>
            </label>
            <label className="champ">
              {M.type}
              <select name="type" defaultValue="visite">
                {Object.entries(M.types).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="champ">
              {M.lieu}
              <select name="lieu" defaultValue="">
                <option value="">{M.sansLieu}</option>
                {lieux.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nom}
                  </option>
                ))}
              </select>
            </label>
            <label className="champ">
              {M.date}
              <input type="date" name="date" defaultValue={dateParDefaut} required />
            </label>
            <label className="champ">
              {M.heure}
              <input type="time" name="heure" defaultValue="09:00" step={300} required />
            </label>
            <label className="champ">
              {M.duree}
              <select name="duree" defaultValue="60">
                {M.durees.map((d) => (
                  <option key={d} value={d}>
                    {M.minutes(d)}
                  </option>
                ))}
              </select>
            </label>
            <label className="champ">
              {M.note}
              <input type="text" name="note" maxLength={280} />
            </label>
            <p className="erreur" role="alert">
              {erreur}
            </p>
            <button type="submit" className="bouton accent" disabled={occupe} aria-busy={occupe}>
              <Picto nom="plus" />
              {M.ajout}
            </button>
          </form>
        ) : (
          <div className="vide">
            <b>{A.sansDossier[0]}</b>
            <span>{A.sansDossier[1]}</span>
          </div>
        )}
        </Bloc>
      </div>
      <p className="esp-annonce" role="status" aria-live="polite">
        {annonce}
      </p>
    </div>
  );
}
