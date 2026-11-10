"use client";
import { useState, useTransition, type FormEvent } from "react";
import type { servicesEquipe } from "@/content/services";
import type { EffacementEquipe } from "@/lib/serveur/services/equipe";
import { traiterEffacement } from "@/lib/serveur/services/actions";
import "./services.css";

// File des demandes d'effacement envoyées depuis /mes-donnees, affichée dans « Protection des données » (admin) : traiter
// (adresse recopiée, motif) ou refuser avec un motif. Le serveur relit la session, le statut et l'adresse ; rien ici ne décide.
export function FileEffacements({ effacements, T }: { effacements: EffacementEquipe[]; T: typeof servicesEquipe }) {
  const [attente, lancer] = useTransition(), [retour, setRetour] = useState("");
  const format = new Intl.DateTimeFormat("fr", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Porto-Novo" });
  const etat = (x: string) => (x === "en_cours" ? T.traitementEnCours : (T.etats[x as keyof typeof T.etats] ?? x));
  function effacement(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    lancer(async () => {
      setRetour("");
      try {
        const r = await traiterEffacement(f);
        setRetour("ok" in r ? T.succes : r.erreur === "conflit" ? T.conflit : T.panne);
      } catch {
        setRetour(T.panne);
      }
    });
  }
  return (
    <div className="services-equipe" id="file-effacements">
      <p role="status" aria-live="polite">{retour}</p>
      <section>
        <p>{T.conservation} {T.conservationServices}</p>
        {!effacements.length ? (
          <p>{T.vide}</p>
        ) : (
          effacements.map((e) => (
            <article key={e.id}>
              <h3>{e.email}</h3>
              <p>
                {format.format(new Date(e.cree_le))} · {etat(e.statut)}
              </p>
              {e.motif ? <p>{e.motif}</p> : null}
              {e.statut === "a_traiter" ? (
                <>
                  <form onSubmit={effacement}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="action" value="traiter" />
                    <label>
                      {T.confirmation}
                      <input type="email" name="confirmation" required autoComplete="off" />
                    </label>
                    <label>
                      {T.motifEffacement}
                      <textarea name="motif" minLength={3} maxLength={2000} required />
                    </label>
                    <button className="services-bouton" disabled={attente}>
                      {T.traiter}
                    </button>
                  </form>
                  <form onSubmit={effacement}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="action" value="refuser" />
                    <label>
                      {T.motifRefus}
                      <textarea name="motif" minLength={3} maxLength={2000} required />
                    </label>
                    <button className="services-bouton secondaire" disabled={attente}>
                      {T.refuser}
                    </button>
                  </form>
                </>
              ) : null}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
