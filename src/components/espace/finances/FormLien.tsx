"use client";

import { useState } from "react";
import { espace as T } from "@/content/espace";
import { finances as F } from "@/content/espace-finances";
import { creerLien } from "@/lib/serveur/equipe/finances/actions";
import { euroDeFcfa, fcfa } from "../outils";
import { FormAction } from "./Envoi";

// Création d'un lien de paiement : on choisit un devis envoyé et la durée ; le total affiché est celui du devis, et le
// serveur le recalcule de toute façon. Aucun champ de montant ni d'acompte.
export type DevisChoix = { id: string; libelle: string; montant: number; langue: string };

export function FormLien({ devis, passerelles, initial = "" }: { devis: DevisChoix[]; passerelles: string[]; initial?: string }) {
  const [choisi, setChoisi] = useState(initial);
  const d = devis.find((x) => x.id === choisi);
  const L = F.liens;
  return (
    <FormAction
      action={creerLien}
      nom={L.creer}
      bouton={L.creerBouton}
      reussite={L.cree}
      apres={() => setChoisi("")}
      enfants={
        <div className="champs">
          <div className="champ large">
            <label htmlFor="lien-devis">{L.devis}</label>
            <select id="lien-devis" name="devis" value={choisi} onChange={(e) => setChoisi(e.target.value)} required>
              <option value="" disabled>
                {L.choisir}
              </option>
              {devis.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.libelle}
                </option>
              ))}
            </select>
          </div>
          <div className="champ">
            <label htmlFor="lien-jours">{L.expire}</label>
            <select id="lien-jours" name="jours" defaultValue={String(L.durees[1])} required>
              {L.durees.map((n) => (
                <option key={n} value={n}>
                  {L.jours(n)}
                </option>
              ))}
            </select>
          </div>
          <div className="champ">
            <span className="aide">{L.langue}</span>
            <b>{d ? (T.langues[d.langue] ?? d.langue) : "–"}</b>
          </div>
          <div className="champ large total-calcule" aria-live="polite">
            <span>{L.total}</span>
            <b>{d ? fcfa(d.montant) : "–"}</b>
            <span>{d ? `${euroDeFcfa(d.montant)} · ${L.totalAide}` : L.totalAide}</span>
          </div>
          <div className="champ large">
            <span className="aide">
              {L.passerelles} : {passerelles.map((p) => (T.modes as Record<string, string>)[p] ?? p).join(", ")}. {L.passerellesAide}
            </span>
          </div>
        </div>
      }
    />
  );
}
