"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { securite as S } from "@/content/espace-securite";
import { chercherPersonne, effacerPersonne, exporterPersonne, type RetourSec } from "@/lib/serveur/equipe/securite/actions";
import type { Apercu } from "@/lib/serveur/equipe/securite/personne";

// Demandes d'accès et d'effacement d'une personne (lot « securite ») : recherche par adresse e-mail, aperçu en nombres par
// catégorie (rien de la personne n'est affiché), export JSON téléchargé par le navigateur, effacement réel après une
// seconde saisie de l'adresse et une confirmation. Le serveur seul décide (actions.ts) ; il relit l'adresse à chaque
// appel et inscrit chaque export et chaque effacement à l'historique, sans l'adresse.
const P = S.personnes;
type Etat = { ton: "ok" | "erreur"; texte: string } | null;

export function Personne({ aujourdhui }: { aujourdhui: string }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [recue, setRecue] = useState(aujourdhui);
  const [confirmation, setConfirmation] = useState("");
  const [apercu, setApercu] = useState<{ pour: string; a: Apercu } | null>(null);
  const [etat, setEtat] = useState<Etat>(null);
  const [champs, setChamps] = useState<string[]>([]);
  const [occupe, demarrer] = useTransition();
  const racine = useRef<HTMLDivElement>(null);
  // après un refus, le premier champ fautif prend le focus
  useEffect(() => racine.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus(), [champs]);

  const lancer = (faire: () => Promise<RetourSec>, ok: (r: Extract<RetourSec, { ok: true }>) => string | null) => {
    setEtat(null);
    demarrer(async () => {
      try {
        const r = await faire();
        if ("ok" in r) {
          setChamps([]);
          const t = ok(r);
          if (t) setEtat({ ton: "ok", texte: t });
        } else {
          setChamps(r.champs ?? []);
          setEtat({ ton: "erreur", texte: S.erreurs[r.erreur] ?? S.erreurs.panne });
        }
      } catch {
        setEtat({ ton: "erreur", texte: S.erreurs.reseau });
      }
    });
  };

  const chercher = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (occupe) return;
    const pour = email.trim().toLowerCase();
    setApercu(null);
    setConfirmation("");
    lancer(
      () => chercherPersonne({ email: pour, recue_le: recue }),
      (r) => {
        if (r.apercu) setApercu({ pour, a: r.apercu });
        return null;
      },
    );
  };
  const exporter = () =>
    apercu &&
    lancer(
      () => exporterPersonne({ email: apercu.pour, recue_le: recue }),
      (r) => {
        if (r.fichier && r.nom) {
          const url = URL.createObjectURL(new Blob([r.fichier], { type: "application/json" }));
          const a = document.createElement("a");
          a.href = url;
          a.download = r.nom;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        return P.exporte;
      },
    );
  const effacer = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!apercu || occupe || !window.confirm(P.confirmerEffacement)) return;
    lancer(
      () => effacerPersonne({ email: apercu.pour, confirmation, recue_le: recue }),
      (r) => {
        setApercu(null);
        setConfirmation("");
        return P.efface(r.efface ?? 0, r.garde ?? 0);
      },
    );
  };

  const total = apercu ? Object.values(apercu.a).reduce((n, x) => n + x.n, 0) : 0;
  const gardes = apercu ? Object.values(apercu.a).reduce((n, x) => n + x.gardes, 0) : 0;
  const faux = (c: string) => champs.includes(c) || undefined;

  return (
    <div className="sec-form" id="personne" ref={racine}>
      <form className="sec-form" onSubmit={chercher} noValidate aria-describedby={`${id}-r`}>
        <div className="champs">
          <div className="champ">
            <label htmlFor={`${id}-email`}>{S.champs.email}</label>
            <input id={`${id}-email`} name="email" type="email" inputMode="email" autoComplete="off" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={faux("email")} aria-describedby={`${id}-email-a`} />
            <span className="aide" id={`${id}-email-a`}>
              {P.emailAide}
            </span>
          </div>
          <div className="champ">
            <label htmlFor={`${id}-recue`}>{S.champs.recue_le}</label>
            <input id={`${id}-recue`} name="recue_le" type="date" max={aujourdhui} value={recue} onChange={(e) => setRecue(e.target.value)} aria-invalid={faux("recue_le")} />
          </div>
        </div>
        <div className="sec-pied">
          <button type="submit" className="bouton" aria-busy={occupe} disabled={occupe} data-chercher-personne>
            {occupe ? S.envoi : P.chercher}
          </button>
        </div>
      </form>

      {apercu && (
        <div className="sec-form" data-apercu-personne={total}>
          {total === 0 ? (
            <p className="mention">{P.rien}</p>
          ) : (
            <>
              <h3 className="sous-titre">{P.trouve}</h3>
              <ul className="trouve">
                {Object.entries(apercu.a)
                  .filter(([, x]) => x.n > 0)
                  .map(([k, x]) => (
                    <li key={k} data-categorie={k} data-garde={x.gardes > 0}>
                      <span>
                        {P.categories[k] ?? k}
                        {x.gardes > 0 && <span className="sous-cell">{`${P.conserve} : ${x.gardes}`}</span>}
                      </span>
                      <b>{x.n}</b>
                    </li>
                  ))}
              </ul>
              {gardes > 0 && (
                <p className="conserves">
                  <b>{P.conserves}</b>
                  {P.conservesTexte}
                </p>
              )}
              <div className="sec-pied">
                <button type="button" className="bouton-2" onClick={exporter} disabled={occupe} aria-busy={occupe} data-exporter-personne>
                  {P.exporter}
                </button>
              </div>
              <form className="zone-effacer" onSubmit={effacer} noValidate>
                <div className="champ">
                  <label htmlFor={`${id}-conf`}>{S.champs.confirmation}</label>
                  <input id={`${id}-conf`} name="confirmation" type="email" autoComplete="off" maxLength={254} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} aria-invalid={faux("confirmation")} aria-describedby={`${id}-conf-a`} />
                  <span className="aide" id={`${id}-conf-a`}>
                    {P.confirmationAide}
                  </span>
                </div>
                <div className="sec-pied">
                  <button type="submit" className="bouton accent" disabled={occupe || !confirmation} aria-busy={occupe} data-effacer-personne>
                    {P.effacer}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      )}

      <div className="sec-retour" id={`${id}-r`} role={etat?.ton === "erreur" ? "alert" : "status"} data-ton={etat?.ton}>
        {etat && <p>{etat.texte}</p>}
      </div>
    </div>
  );
}
