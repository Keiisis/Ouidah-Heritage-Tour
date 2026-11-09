"use client";

import Link from "next/link";
import { useTransition } from "react";
import { msg } from "@/content/espace-messages";
import { marquerLue } from "@/lib/serveur/equipe/messages/actions";
import type { Notification } from "@/lib/serveur/equipe/messages/lectures";
import { Bloc, Vide } from "../Bloc";
import { useMinute } from "../Cadre";
import { ilYa } from "../outils";
import { Picto } from "../Picto";
import { texteRefus, useAnnonce } from "./Apercu";

// Liste des notifications du membre connecté : non lues d'abord marquées d'un point, « Marquer comme lue » une à une ou
// toutes ; le serveur ne touche que les siennes.
const N = msg.notifications;

export function Notifications({ notes }: { notes: Notification[] }) {
  const minute = useMinute();
  const { annoncer, vue } = useAnnonce();
  const [occupe, demarrer] = useTransition();
  const nonLues = notes.filter((n) => !n.lue).length;
  const lire = (id: string) =>
    demarrer(async () => {
      try {
        const r = await marquerLue(id);
        if (!("ok" in r)) annoncer(texteRefus(r), true);
      } catch {
        annoncer(msg.refus.reseau, true);
      }
    });

  return (
    <div className="esp-grille esp-messages esp-notifications">
      <Bloc
        id="t-not"
        titre={N.liste}
        compte={nonLues}
        s={12}
        i={1}
        lien={
          nonLues ? (
            <button type="button" className="bouton-2 bouton-petit" id="tout-lire" disabled={occupe} onClick={() => lire("toutes")}>
              <Picto nom="coche" />
              {N.toutLire}
            </button>
          ) : undefined
        }
      >
        <p className="mention">{N.nonLues(nonLues)}</p>
        {notes.length ? (
          <ul className="liste" id="liste-notifications">
            {notes.map((n) => (
              <li key={n.id} className="notif" data-notification={n.id} data-type={n.type} data-lue={n.lue}>
                <div className="rangee">
                  <span className="point" aria-hidden="true" />
                  <span className="texte">
                    <span className="type">{N.types[n.type] ?? n.type}</span>
                    <span className="titre">{n.accessible ? (N.textes[n.type] ?? ((c: string) => c))(n.client ?? N.clientInconnu) : N.dossierInaccessible}</span>
                    <span className="meta">{ilYa(n.quand, minute)}</span>
                  </span>
                  <span className="actions">
                    {n.accessible && (
                      <Link className="lien" href={`/agents/demandes/${n.dossier}`}>
                        {N.ouvrir}
                      </Link>
                    )}
                    {n.lue ? (
                      <span className="etat">{N.lue}</span>
                    ) : (
                      <button type="button" className="bouton-2 bouton-petit" data-lire={n.id} disabled={occupe} onClick={() => lire(n.id)}>
                        {N.marquer}
                      </button>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Vide texte={N.vide} />
        )}
        <p className="mention">{N.aide}</p>
      </Bloc>
      {vue}
    </div>
  );
}
