"use client";

import type { CSSProperties } from "react";
import { boutique as BOUTIQUE } from "@/content/boutique";
import { useContenu } from "@/components/ui/ContenuSite";
import type { ChoixOptions, Produit } from "@/lib/boutique-types";
import { QUANTITE_MAX } from "@/lib/panier";
import { Icon } from "@/components/ui/Icon";

// Choix d'un article avant l'ajout : taille ou sur mesure (mesures, ou « nous vous contacterons »), texte à broder avec
// compteur et aperçu, coloris quand l'article en a plusieurs (exigé par la commande), quantité. Partagé par le tiroir
// d'ajout rapide et l'encadré d'achat de la fiche. Le serveur revérifie tout (api/boutique/commande).

export type Choix = { taille: string; surMesure: boolean; mode: "moi" | "contact"; mesures: string; broderie: string; coloris: string; qte: number };
export const choixVide = (): Choix => ({ taille: "", surMesure: false, mode: "moi", mesures: "", broderie: "", coloris: "", qte: 1 });

/** Ce qui manque pour ajouter, dans l'ordre du formulaire (clés de T.options.besoin). La broderie est facultative. */
export function manque(p: Produit, c: Choix) {
  const o = p.options, m: string[] = [];
  if ((o?.tailles?.length || o?.surMesure) && !c.taille && !c.surMesure) m.push("taille");
  if (c.surMesure && c.mode === "moi" && !c.mesures.trim()) m.push("mesures");
  if (p.coloris.length > 1 && !c.coloris) m.push("coloris");
  return m;
}
export const phraseManque = (m: string[], T = BOUTIQUE) => T.options.manque(m.map((k) => T.options.besoin[k]).join(T.options.et));

/** Options envoyées au panier : taille OU mesures, jamais les deux (règle de la commande). */
export function versOptions(p: Produit, c: Choix, T = BOUTIQUE): ChoixOptions {
  return {
    ...(c.surMesure ? { mesures: c.mode === "contact" ? T.options.mesuresContact : c.mesures.trim() } : c.taille ? { taille: c.taille } : {}),
    ...(p.options?.broderie && c.broderie.trim() ? { broderie: c.broderie.trim() } : {}),
    ...(c.coloris ? { coloris: c.coloris } : {}),
  };
}

export function ChampsOptions({ p, c, set, id, msg, erreurs = [] }: { p: Produit; c: Choix; set: (x: Partial<Choix>) => void; id: string; msg: string; erreurs?: string[] }) {
  const T = useContenu("boutique.boutique", BOUTIQUE);
  const o = p.options;
  const max = o?.broderie?.max ?? 0;
  const tailles = o?.tailles ?? [];
  return (
    <div className="choix-options">
      {tailles.length || o?.surMesure ? (
        <fieldset id={`${id}-taille`}>
          <legend>{T.options.taille}</legend>
          <div className="pilules">
            {tailles.map((t) => (
              <label key={t} className="pilule">
                <input type="radio" name={`${id}-taille`} value={t} checked={!c.surMesure && c.taille === t} onChange={() => set({ taille: t, surMesure: false })} aria-describedby={msg} />
                <span>{t}</span>
              </label>
            ))}
            {o?.surMesure ? (
              <label className="pilule">
                <input type="radio" name={`${id}-taille`} value="" checked={c.surMesure} onChange={() => set({ taille: "", surMesure: true })} aria-describedby={msg} />
                <span>{T.options.surMesure}</span>
              </label>
            ) : null}
          </div>
        </fieldset>
      ) : null}

      {c.surMesure ? (
        <div className="sur-mesure">
          <fieldset>
            <legend className="bq-invisible">{T.options.mesures}</legend>
            <label className="choix">
              <input type="radio" name={`${id}-mode`} checked={c.mode === "moi"} onChange={() => set({ mode: "moi" })} />
              {T.options.modeMoi}
            </label>
            <label className="choix">
              <input type="radio" name={`${id}-mode`} checked={c.mode === "contact"} onChange={() => set({ mode: "contact" })} />
              {T.options.modeContact}
            </label>
          </fieldset>
          {c.mode === "moi" ? (
            <label className="champ">
              <span>{T.options.mesures}</span>
              <textarea id={`${id}-mesures`} rows={3} maxLength={500} value={c.mesures} placeholder={T.options.mesuresIndice} aria-describedby={msg} aria-invalid={erreurs.includes("mesures") || undefined} onChange={(e) => set({ mesures: e.target.value })} />
            </label>
          ) : (
            <p className="aide">{T.options.aideContact}</p>
          )}
        </div>
      ) : null}

      {p.coloris.length > 1 ? (
        <fieldset id={`${id}-coloris`}>
          <legend>{T.options.coloris}</legend>
          <div className="pilules">
            {p.coloris.map((x) => (
              <label key={x.nom} className="pilule">
                <input type="radio" name={`${id}-coloris`} value={x.nom} checked={c.coloris === x.nom} onChange={() => set({ coloris: x.nom })} aria-describedby={msg} />
                <span>
                  <span className="rond-c" style={{ "--c": x.hex } as CSSProperties} />
                  {x.nom}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {max ? (
        <div>
          <label className="champ">
            <span>{T.options.broderie}</span>
            <input id={`${id}-broderie`} type="text" maxLength={max} autoComplete="off" value={c.broderie} placeholder={T.options.broderieIndice} aria-describedby={`${id}-compte ${msg}`} onChange={(e) => set({ broderie: e.target.value })} />
          </label>
          <p className="compteur-c" id={`${id}-compte`}>
            {T.options.compteur([...c.broderie].length, max)}
          </p>
          {c.broderie.trim() ? (
            <div className="apercu">
              <span className="apercu-lib">{T.options.apercu}</span>
              <div className="apercu-tissu">
                <p className="apercu-texte">{c.broderie.trim()}</p>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Champ de quantité −/+ (1 à `max`, QUANTITE_MAX par défaut ; le stock disponible s'il est plus bas). */
export function Quantite({ n, set, label, className = "qte-c", max = QUANTITE_MAX }: { n: number; set: (n: number) => void; label: string; className?: string; max?: number }) {
  const T = useContenu("boutique.boutique", BOUTIQUE);
  return (
    <div className={className} role="group" aria-label={label}>
      <button type="button" aria-label={T.carte.moins} disabled={n <= 1} onClick={() => set(Math.max(1, n - 1))}>
        <Icon name="minus" className="size-4" />
      </button>
      <output>{n}</output>
      <button type="button" aria-label={T.carte.plus} disabled={n >= max} onClick={() => set(Math.min(max, n + 1))}>
        <Icon name="plus" className="size-4" />
      </button>
    </div>
  );
}
