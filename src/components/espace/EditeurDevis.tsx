"use client";

import { useId } from "react";
import { LIMITES_DEVIS } from "@/content/documents";
import { espace as T } from "@/content/espace";
import { retours, totalDevis } from "@/lib/serveur/equipe/dossiers-regles";
import { euroDeFcfa, fcfa } from "./outils";
import { Picto } from "./Picto";

// Éditeur du devis d'un dossier (lot L4) : un devis tient sur UNE page (LIMITES_DEVIS, content/documents.ts). Compteurs
// pendant la saisie (lignes, caractères du libellé et de la note, retours à la ligne) et aperçu de la page. Le total
// affiché est un aperçu : le serveur le recalcule (somme des lignes) à chaque enregistrement. Aucun champ d'acompte,
// aucun montant libre. Un devis prêt ne se modifie plus : il s'affiche en lecture.
export type SaisieDevis = { lignes: { libelle: string; quantite: string; prix: string }[]; note: string; valable: string };
const V = T.devis;
const L = LIMITES_DEVIS;
const nombre = (s: string) => (/^\d{1,12}$/.test(s.trim()) ? Number(s) : 0);
/** Saisie → corps envoyé aux actions serveur (libellé, quantité, prix unitaire ; rien d'autre). */
export const corpsDevis = (v: SaisieDevis) => ({ lignes: v.lignes.map((l) => ({ libelle: l.libelle, quantite: nombre(l.quantite), prix_unitaire: nombre(l.prix) })), note: v.note, valable: v.valable });
export const ligneVide = () => ({ libelle: "", quantite: "1", prix: "" });

export function EditeurDevis({ valeur, changer, erreurs, lecture }: { valeur: SaisieDevis; changer: (v: SaisieDevis) => void; erreurs: string[]; lecture: boolean }) {
  const id = useId();
  const lignes = corpsDevis(valeur).lignes;
  const total = totalDevis(lignes);
  const faux = (c: string) => erreurs.includes(c);
  const maj = (i: number, champ: "libelle" | "quantite" | "prix", texte: string) => changer({ ...valeur, lignes: valeur.lignes.map((l, k) => (k === i ? { ...l, [champ]: texte } : l)) });
  const nRetours = retours(valeur.note.replace(/\r\n?/g, "\n"));

  return (
    <div className="editeur-devis" data-lecture={lecture || undefined}>
      <div className="devis-saisie">
        <table className="lignes-devis">
          <caption className="invisible">{V.titre}</caption>
          <thead>
            <tr>
              <th scope="col">{V.designation}</th>
              <th scope="col">{V.qte}</th>
              <th scope="col">{V.pu}</th>
              <th scope="col">{V.montant}</th>
              {!lecture && (
                <th scope="col">
                  <span className="invisible">{V.retirer}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {valeur.lignes.map((l, i) => (
              <tr key={i} data-ligne={i}>
                <td data-l={V.designation}>
                  {lecture ? (
                    l.libelle
                  ) : (
                    <>
                      <input type="text" name={`libelle-${i}`} value={l.libelle} maxLength={L.libelle} aria-label={V.libelleDe(i + 1)} aria-invalid={faux(`libelle:${i}`)} aria-describedby={`${id}-c${i}`} onChange={(e) => maj(i, "libelle", e.target.value)} />
                      <small className="compteur" id={`${id}-c${i}`} data-plein={l.libelle.length >= L.libelle || undefined}>
                        {V.caracteres(l.libelle.length, L.libelle)}
                      </small>
                    </>
                  )}
                </td>
                <td data-l={V.qte} className="num">
                  {lecture ? l.quantite : <input type="number" inputMode="numeric" name={`quantite-${i}`} min={1} max={L.quantite} step={1} value={l.quantite} aria-label={V.qteDe(i + 1)} aria-invalid={faux(`quantite:${i}`)} onChange={(e) => maj(i, "quantite", e.target.value)} />}
                </td>
                <td data-l={V.pu} className="num">
                  {lecture ? fcfa(nombre(l.prix)) : <input type="number" inputMode="numeric" name={`prix-${i}`} min={0} max={L.prixUnitaire} step={1} value={l.prix} aria-label={V.puDe(i + 1)} aria-invalid={faux(`prix:${i}`)} onChange={(e) => maj(i, "prix", e.target.value)} />}
                </td>
                <td data-l={V.montant} className="num">
                  {fcfa(lignes[i].quantite * lignes[i].prix_unitaire)}
                </td>
                {!lecture && (
                  <td>
                    <button type="button" className="icone-bouton petit" aria-label={V.retirerDe(i + 1)} onClick={() => changer({ ...valeur, lignes: valeur.lignes.filter((_, k) => k !== i) })}>
                      <Picto nom="fermer" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>{V.total}</td>
              <td className="num" data-total={total}>
                {fcfa(total)}
                <small>{euroDeFcfa(total)}</small>
              </td>
              {!lecture && <td />}
            </tr>
          </tfoot>
        </table>
        {!valeur.lignes.length && <p className="mention">{V.vide}</p>}
        {!lecture && (
          <div className="ajout-ligne">
            <button type="button" className="bouton-2 bouton-petit" id="ajouter-ligne" disabled={valeur.lignes.length >= L.lignes} onClick={() => changer({ ...valeur, lignes: [...valeur.lignes, ligneVide()] })}>
              <Picto nom="plus" />
              {V.ajouterLigne}
            </button>
            <small className="compteur" data-plein={valeur.lignes.length >= L.lignes || undefined} aria-live="polite">
              {V.lignes(valeur.lignes.length, L.lignes)}
            </small>
          </div>
        )}
        {(faux("lignes") || faux("total")) && <p className="erreur">{V.erreurs[faux("total") ? "total" : "lignes"]}</p>}
        {["libelle", "quantite", "prix"].filter((c) => erreurs.some((e) => e.startsWith(`${c}:`))).map((c) => (
          <p key={c} className="erreur">
            {V.erreurs[c]}
          </p>
        ))}

        <div className="champ large">
          <label htmlFor={`${id}-note`}>{V.note}</label>
          {lecture ? (
            <p className="note-lue">{valeur.note || "—"}</p>
          ) : (
            <>
              <textarea id={`${id}-note`} name="note" rows={4} maxLength={L.note} value={valeur.note} aria-invalid={faux("note") || faux("retours")} aria-describedby={`${id}-nc`} onChange={(e) => changer({ ...valeur, note: e.target.value })} />
              <small className="compteur" id={`${id}-nc`} data-plein={valeur.note.length >= L.note || nRetours > L.retours || undefined}>
                {V.noteCompte(valeur.note.length, L.note, nRetours, L.retours)}
              </small>
              {(faux("note") || faux("retours")) && <span className="erreur">{V.erreurs[faux("note") ? "note" : "retours"]}</span>}
            </>
          )}
        </div>
        <div className="champ">
          <label htmlFor={`${id}-val`}>{V.valable}</label>
          {lecture ? (
            <p>{valeur.valable || "—"}</p>
          ) : (
            <>
              <input id={`${id}-val`} type="date" name="valable" value={valeur.valable} aria-invalid={faux("valable")} aria-describedby={`${id}-va`} onChange={(e) => changer({ ...valeur, valable: e.target.value })} />
              <span className="aide" id={`${id}-va`}>
                {faux("valable") ? V.erreurs.valable : V.valableAide}
              </span>
            </>
          )}
        </div>
        <p className="mention">{V.calcule}</p>
      </div>

      {/* aperçu de la page A4 : les lignes, la note et le total tels qu'ils seront imprimés */}
      <figure className="apercu-devis" aria-label={V.apercu}>
        <figcaption>
          <b>{V.apercu}</b>
          <span>{V.apercuSous}</span>
        </figcaption>
        <div className="feuille" aria-hidden="true">
          <i className="tete-feuille" />
          <ol>
            {lignes.map((l, i) => (
              <li key={i}>
                <span>{l.libelle || "…"}</span>
                <span>{fcfa(l.quantite * l.prix_unitaire)}</span>
              </li>
            ))}
          </ol>
          <p className="total-feuille">
            <span>{V.total}</span>
            <span>{fcfa(total)}</span>
          </p>
          {valeur.note && <p className="note-feuille">{valeur.note}</p>}
        </div>
      </figure>
    </div>
  );
}
