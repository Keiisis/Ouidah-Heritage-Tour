import Image from "next/image";
import { useId, type ReactNode } from "react";
import type { VueTicket } from "./format";
import "./papier.css";

// Le papier du ticket imprimé (maquette experience.html, validée) : emblème rond d'OHT et nom de l'agence en texte (le
// logo « OUIDAH » à la corde est réservé à la navigation, Kevin 02/11/2026), lignes de la commande, total,
// pastille de statut, tampon OHT si payé, QR vers le document, merci. Rendu identique en haut de la page de suivi et
// dans l'animation (le CSS de chacun règle la taille). Le QR est passé tout fait : il dépend de l'adresse du site.
export function Papier({ vue, qr }: { vue: VueTicket; qr: ReactNode }) {
  return (
    <div className="sv-papier">
      <Image className="sv-embleme" src="/brand/oht-embleme.webp" width={512} height={512} alt="" unoptimized loading="eager" />
      <span className="sv-marque">Ouidah Heritage Tour</span>
      <small className="sv-doc">{vue.doc}</small>
      <hr className="sv-sep" />
      <dl className="sv-lignes">
        {vue.lignes.map(([k, v], i) => (
          <div className="sv-ligne" key={i}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <hr className="sv-sep" />
      <p className="sv-total">
        <span>{vue.total[0]}</span>
        <span>{vue.total[1]}</span>
      </p>
      {vue.paye ? (
        <p className="sv-ligne sv-paye-avec">
          <span>{vue.paye[0]}</span>
          <span>{vue.paye[1]}</span>
        </p>
      ) : null}
      <div className="sv-ligne-statut">
        <span className={`sv-statut is-${vue.statut.cle}`}>{vue.statut.texte}</span>
        {vue.tampon ? <TamponRecu pays={vue.pays} /> : null}
      </div>
      <hr className="sv-sep" />
      <div className="sv-qr">
        {qr}
        <p>
          {vue.qr.texte}
          {vue.qr.numero ? <em>{vue.qr.numero}</em> : null}
        </p>
      </div>
      <p className="sv-merci">{vue.merci}</p>
    </div>
  );
}

// tampon latérite du reçu : « Ouidah Heritage Tour » sur l'arc, le pays dessous, OHT au centre (sceau de la marque)
function TamponRecu({ pays }: { pays: string }) {
  const id = useId();
  return (
    <svg className="sv-tampon" viewBox="0 0 118 118" aria-hidden="true">
      <defs>
        <path id={`${id}h`} d="M 19 59 A 40 40 0 0 1 99 59" />
        <path id={`${id}b`} d="M 16 59 A 43 43 0 0 0 102 59" />
      </defs>
      <circle cx="59" cy="59" r="55" fill="none" stroke="#ac3215" strokeWidth="3.5" />
      <circle cx="59" cy="59" r="49" fill="none" stroke="#ac3215" strokeWidth="1.2" />
      <text className="sv-tampon-arc">
        <textPath href={`#${id}h`} startOffset="50%" textAnchor="middle">
          Ouidah Heritage Tour
        </textPath>
      </text>
      <text className="sv-tampon-arc">
        <textPath href={`#${id}b`} startOffset="50%" textAnchor="middle">
          {pays}
        </textPath>
      </text>
      <text className="sv-tampon-sigle" x="59" y="71" textAnchor="middle">
        OHT
      </text>
    </svg>
  );
}
