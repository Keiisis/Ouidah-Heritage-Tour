"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { logos } from "@/content/espace";
import { DESINSCRIPTION, type LangueMsg } from "@/content/espace-messages";
import { desinscrire } from "@/lib/serveur/equipe/messages/desinscription";
import "./desinscription.css";

// Page publique de désinscription de La lettre de Ouidah, dans la langue de l'abonné : rien ne change à l'affichage,
// seulement au clic (un lecteur de liens qui ouvre l'adresse ne désinscrit personne).
export function Desinscription({ jeton, langue, email, deja }: { jeton: string; langue: LangueMsg; email: string; deja: boolean }) {
  const D = DESINSCRIPTION[langue];
  const [etat, setEtat] = useState<"attente" | "fait" | "deja" | "erreur">(deja ? "deja" : "attente");
  const [occupe, demarrer] = useTransition();
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
        <Link href="/">{D.retour}</Link>
      </div>
    </main>
  );
}
