"use client";

import Link from "next/link";
import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import type { Role } from "@/content/equipe";
import { espace as T } from "@/content/espace";
import { useMouvementReduit } from "@/lib/mouvement";
import type { FicheClient } from "@/lib/serveur/equipe/dossiers";
import { noterClient, remplirClients } from "@/lib/serveur/equipe/dossiers-actions";
import { LIMITES_NOTE } from "@/lib/serveur/equipe/dossiers-regles";
import { Bloc, Vide } from "./Bloc";
import { useMinute } from "./Cadre";
import { ilYa } from "./outils";
import { Picto } from "./Picto";
import "./agents.css";
import "./dossier.css";

// Fiches clients (lot L4) : une par adresse e-mail, remplie depuis les demandes. La fiche s'ouvre dans le tiroir (plein
// écran en 390) : langue, pays, e-mail, téléphone, notes de l'équipe et dossiers liés. Le serveur relit la session et le
// droit sur la fiche (un agent : les clients de ses dossiers) à chaque enregistrement.
const C = T.clients;
const regions = new Intl.DisplayNames(["fr"], { type: "region" });
const nomPays = (c: string | null) => {
  if (!c) return null;
  try {
    return regions.of(c) ?? c;
  } catch {
    return c;
  }
};

export function Clients({ role, clients, admin }: { role: Role; clients: FicheClient[]; admin: boolean }) {
  const reduit = useMouvementReduit();
  const minute = useMinute();
  const uid = useId();
  const panneau = useRef<HTMLDialogElement>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [annonce, setAnnonce] = useState<{ texte: string; erreur: boolean } | null>(null);
  const [occupe, demarrer] = useTransition();
  const minuteur = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fiche = clients.find((c) => c.id === ouvert) ?? null;

  const annoncer = (texte: string, erreur = false) => {
    setAnnonce({ texte, erreur });
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setAnnonce(null), 6000);
  };
  const ouvrir = (id: string) => {
    setErreurs([]);
    setOuvert(id);
    panneau.current?.showModal();
  };
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
  const enregistrer = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!fiche || occupe) return;
    const f = new FormData(e.currentTarget);
    const brut = { notes: f.get("notes") ?? "", telephone: f.get("telephone") ?? "" };
    demarrer(async () => {
      try {
        const r = await noterClient(fiche.id, brut);
        if ("ok" in r) {
          setErreurs([]);
          annoncer(C.enregistre(fiche.nom));
          fermer();
        } else if (r.erreur === "champs") setErreurs(r.champs ?? []);
        else annoncer(T.refus[r.erreur === "refuse" ? "refuse" : "panne"], true);
      } catch {
        annoncer(T.refus.reseau, true);
      }
    });
  };
  const remplir = () =>
    demarrer(async () => {
      try {
        const r = await remplirClients();
        if ("ok" in r) annoncer(C.remplis(r.nombre ?? 0));
        else annoncer(T.refus[r.erreur === "refuse" ? "refuse" : "panne"], true);
      } catch {
        annoncer(T.refus.reseau, true);
      }
    });

  return (
    <div className="esp-grille esp-dossiers esp-clients">
      <Bloc
        id="t-cli"
        titre={C.liste}
        compte={clients.length}
        s={12}
        i={1}
        lien={
          admin ? (
            <button type="button" className="bouton-2" id="remplir-clients" aria-busy={occupe} onClick={remplir}>
              <Picto nom="personnes" />
              {C.remplir}
            </button>
          ) : undefined
        }
      >
        {clients.length ? (
          <ul className="liste liste-clients" id="liste-clients">
            {clients.map((c) => (
              <li key={c.id} data-client={c.id}>
                <button type="button" className="rangee" aria-haspopup="dialog" aria-label={C.ouvrir(c.nom)} onClick={() => ouvrir(c.id)}>
                  <span className="avatar neutre" aria-hidden="true">
                    {c.nom.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="texte">
                    <span className="titre">{c.nom}</span>
                    <span className="meta courriel">{c.email}</span>
                    <span className="meta">
                      {[nomPays(c.pays), C.dossiers(c.dossiers.length)].filter(Boolean).join(", ")}
                    </span>
                  </span>
                  <span className="langue" title={T.langues[c.langue]}>
                    {c.langue}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Vide texte={C.vide[role]} />
        )}
      </Bloc>

      <dialog
        ref={panneau}
        className="esp-tiroir tiroir-client"
        aria-labelledby={`${uid}-t`}
        onCancel={(e) => {
          e.preventDefault();
          fermer();
        }}
        onClick={(e) => e.target === e.currentTarget && fermer()}
      >
        {fiche && (
          <form key={fiche.id} className="tiroir-cadre" noValidate onSubmit={enregistrer}>
            <header className="tiroir-tete">
              <div>
                <span className="type">{C.fiche}</span>
                <h2 id={`${uid}-t`}>{fiche.nom}</h2>
              </div>
              <button type="button" className="icone-bouton" aria-label={C.annuler} onClick={fermer}>
                <Picto nom="fermer" />
              </button>
            </header>
            <div className="tiroir-corps" data-lenis-prevent>
              <section className="section">
                <dl className="paires">
                  <div>
                    <dt>{C.langue}</dt>
                    <dd>{T.langues[fiche.langue] ?? fiche.langue}</dd>
                  </div>
                  <div>
                    <dt>{C.pays}</dt>
                    <dd>{nomPays(fiche.pays) ?? T.dossier.nonPrecise}</dd>
                  </div>
                  <div className="large">
                    <dt>{C.email}</dt>
                    <dd>
                      <a className="lien" href={`mailto:${fiche.email}`}>
                        {fiche.email}
                      </a>
                    </dd>
                  </div>
                </dl>
              </section>
              <section className="section champs">
                <div className="champ large">
                  <label htmlFor={`${uid}-tel`}>{C.tel}</label>
                  <input id={`${uid}-tel`} type="tel" name="telephone" maxLength={32} defaultValue={fiche.telephone ?? ""} autoComplete="off" inputMode="tel" aria-invalid={erreurs.includes("telephone")} aria-describedby={`${uid}-tela`} />
                  <span className="aide" id={`${uid}-tela`}>
                    {erreurs.includes("telephone") ? C.erreurs.telephone : C.telAide}
                  </span>
                </div>
                <div className="champ large">
                  <label htmlFor={`${uid}-no`}>{C.notes}</label>
                  <textarea id={`${uid}-no`} name="notes" rows={5} maxLength={LIMITES_NOTE} defaultValue={fiche.notes ?? ""} aria-invalid={erreurs.includes("notes")} aria-describedby={`${uid}-noa`} />
                  <span className="aide" id={`${uid}-noa`}>
                    {erreurs.includes("notes") ? C.erreurs.notes : C.notesAide}
                  </span>
                </div>
              </section>
              <section className="section" aria-labelledby={`${uid}-li`}>
                <h3 id={`${uid}-li`}>{C.lies}</h3>
                {fiche.dossiers.length ? (
                  <ul className="liste">
                    {fiche.dossiers.map((x) => (
                      <li key={x.id}>
                        <Link className="rangee" href={`/${role}/demandes/${x.id}`}>
                          <Picto nom="dossier" />
                          <span className="texte">
                            <span className="titre">{T.admin.demandes.types[x.intention] ?? x.intention}</span>
                            <span className="meta">{T.demandes.recue(ilYa(x.recue, minute))}</span>
                          </span>
                          <span className="etat" data-e={x.etape}>
                            {T.etapes[x.etape]}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mention">{C.aucunLie}</p>
                )}
              </section>
            </div>
            <footer className="tiroir-pied">
              <button type="button" className="bouton-2" onClick={fermer}>
                {C.annuler}
              </button>
              <button type="submit" className="bouton accent" id="enregistrer-client" aria-busy={occupe}>
                {C.enregistrer}
              </button>
            </footer>
          </form>
        )}
      </dialog>

      <p className="esp-annonce" role="status" aria-live="polite" data-ton={annonce?.erreur ? "erreur" : undefined}>
        {annonce?.texte}
      </p>
    </div>
  );
}
