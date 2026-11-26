"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { logos } from "@/content/espace";
import { DESINSCRIPTION, type LangueMsg } from "@/content/espace-messages";
import { ABONNEMENT } from "@/content/lettre-abonnement";
import { demanderLienGestion } from "@/lib/serveur/equipe/messages/abonnement";
import { desinscrire } from "@/lib/serveur/equipe/messages/desinscription";
import "./desinscription.css";

// Page publique de désinscription de La lettre de Ouidah, dans la langue de l'abonné : rien ne change à l'affichage,
// seulement au clic (un lecteur de liens qui ouvre l'adresse ne désinscrit personne). En bas, la gestion de l'abonnement
// (langue, thèmes, réinscription) : son lien part par e-mail vers l'adresse elle-même, jamais à l'écran, car ce lien-ci
// est permanent et suivi d'office par les messageries (List-Unsubscribe).
export function Desinscription({ jeton, langue, email, deja, jours }: { jeton: string; langue: LangueMsg; email: string; deja: boolean; jours: number }) {
  const D = DESINSCRIPTION[langue], G = ABONNEMENT[langue].lien;
  const [etat, setEtat] = useState<"attente" | "fait" | "deja" | "erreur">(deja ? "deja" : "attente");
  const [lien, setLien] = useState<"attente" | "envoye" | "deja" | "erreur">("attente");
  const [occupe, demarrer] = useTransition();
  const [envoi, envoyer] = useTransition();
  const demanderLien = () =>
    envoyer(async () => {
      try {
        setLien(await demanderLienGestion(jeton));
      } catch {
        setLien("erreur");
      }
    });
  const confirmer = () =>
    demarrer(async () => {
      try {
        setEtat(await desinscrire(jeton));
      } catch {
        setEtat("erreur");
      }
    });
  return (
    <main className="lettre-desinscription" lang={langue.toLowerCase()}>
      <div className="carte">
        <Image src={logos.enteteMobile.src} alt={logos.enteteMobile.alt} width={logos.enteteMobile.largeur} height={logos.enteteMobile.hauteur} sizes="64px" priority />
        <h1>{D.titre}</h1>
        {etat === "fait" || etat === "deja" ? (
          <p role="status" data-etat={etat}>{etat === "fait" ? D.fait : D.deja}</p>
        ) : (
          <>
            <p>{D.texte(email)}</p>
            {etat === "erreur" && <p className="erreur" role="alert">{D.erreur}</p>}
            <button type="button" id="desinscrire" disabled={occupe} aria-busy={occupe} onClick={confirmer}>
              {occupe ? D.envoi : D.bouton}
            </button>
          </>
        )}
        <div className="gestion">
          {lien === "envoye" || lien === "deja" ? (
            <p role="status" data-lien={lien}>{lien === "envoye" ? G.envoye(email, jours) : G.deja}</p>
          ) : (
            <>
              <p>{G.texte}</p>
              {lien === "erreur" && <p className="erreur" role="alert">{G.erreur}</p>}
              <button type="button" id="lien-gestion" className="secondaire" disabled={envoi} aria-busy={envoi} onClick={demanderLien}>
                {envoi ? D.envoi : G.bouton}
              </button>
            </>
          )}
        </div>
        <Link href="/">{D.retour}</Link>
      </div>
    </main>
  );
}
