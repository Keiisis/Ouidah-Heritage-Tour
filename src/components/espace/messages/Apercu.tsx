"use client";

import Image from "next/image";
import { type Ref, useRef, useState } from "react";
import { logos } from "@/content/espace";
import { msg, VARIABLES } from "@/content/espace-messages";
import { paragraphes } from "@/lib/serveur/equipe/messages/rendu";
import { Picto } from "../Picto";

// Aperçu d'un e-mail (feuille blanche, emblème rond) et annonce en bas d'écran, partagés par le composeur, les modèles et
// la lettre. Un champ variable resté sans valeur est montré tel quel, souligné : l'envoi le refusera.
const JETONS = new RegExp(`(${Object.values(VARIABLES).map((v) => v.replace(/[{}]/g, "\\$&")).join("|")})`);

function Texte({ t }: { t: string }) {
  return t.split(JETONS).map((x, i) => (i % 2 ? <span key={i} className="manque">{x}</span> : x));
}

export function Apercu({ a, objet, corps, signature, pied, pieces = [], ref }: { a: string; objet: string; corps: string; signature?: string; pied?: string; pieces?: string[]; ref?: Ref<HTMLDivElement> }) {
  const p = paragraphes(corps);
  return (
    <div className="apercu" id="apercu" ref={ref} aria-live="polite">
      <div className="apercu-tete">
        <Image src={logos.enteteMobile.src} alt={logos.enteteMobile.alt} width={logos.enteteMobile.largeur} height={logos.enteteMobile.hauteur} sizes="48px" />
        <dl>
          <div>
            <dt>{msg.courrier.de}</dt>
            <dd>{msg.expediteur}</dd>
          </div>
          <div>
            <dt>{msg.courrier.a}</dt>
            <dd id="ap-a">{a || "…"}</dd>
          </div>
          <div>
            <dt>{msg.courrier.objet}</dt>
            <dd id="ap-objet">{objet ? <Texte t={objet} /> : "…"}</dd>
          </div>
        </dl>
      </div>
      <div className="apercu-corps" id="ap-corps">
        {p.length ? (
          <>
            {p.map((x, i) => (
              <p key={i} style={{ whiteSpace: "pre-line" }}>
                <Texte t={x} />
              </p>
            ))}
            {signature && <p className="signature" style={{ whiteSpace: "pre-line" }}>{signature}</p>}
            {pied && <p className="pied-lettre">{pied}</p>}
          </>
        ) : (
          <p className="aide">{msg.courrier.apercuVide}</p>
        )}
      </div>
      {pieces.length > 0 && (
        <ul className="apercu-pieces" id="ap-pieces">
          {pieces.map((x) => (
            <li key={x}>
              <Picto nom="document" />
              {x}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Annonce posée en bas de l'écran, effacée après 6 s. */
export function useAnnonce() {
  const [annonce, setAnnonce] = useState<{ texte: string; erreur: boolean } | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout>>(undefined);
  const annoncer = (texte: string, erreur = false) => {
    setAnnonce({ texte, erreur });
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setAnnonce(null), 6000);
  };
  const vue = (
    <p className="esp-annonce" role="status" aria-live="polite" data-ton={annonce?.erreur ? "erreur" : undefined}>
      {annonce?.texte}
    </p>
  );
  return { annoncer, vue };
}

/** Message d'un refus du serveur. */
export function texteRefus(r: { erreur: string; manque?: string[] }) {
  if (r.erreur === "variables" && r.manque?.length) return msg.manquent(r.manque.map((m) => msg.manque[m as keyof typeof msg.manque] ?? m));
  return msg.refus[r.erreur as keyof typeof msg.refus] ?? msg.refus.panne;
}
