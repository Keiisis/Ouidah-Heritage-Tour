"use client";

import { useState } from "react";
import { finances as F, MODES_MANUELS, type ModeManuel } from "@/content/espace-finances";
import { espace as T } from "@/content/espace";
import { saisirPaiement } from "@/lib/serveur/equipe/finances/actions";
import { AVEC_REFERENCE, JUSTIFICATIF_MAX } from "@/lib/serveur/equipe/finances/regles";
import { jourOuidah } from "@/lib/jours";
import { useMinute } from "../Cadre";
import { euroDeFcfa, fcfa } from "../outils";
import { FormAction } from "./Envoi";
import type { DevisChoix } from "./FormLien";

// Saisie d'un paiement reçu en agence : il reste « à confirmer » jusqu'à la confirmation d'un admin. Le total attendu est
// celui du devis (paiement complet, sans acompte) ; un écart laissera la facture « à régulariser ». Justificatif
// obligatoire pour un virement ; un fichier trop lourd est refusé avant l'envoi (900 Ko au plus).
export function FormPaiement({ devis }: { devis: (DevisChoix & { source?: "devis" | "commande" | "reservation" })[] }) {
  const minute = useMinute();
  const aujourdhui = new Date(jourOuidah(minute * 60_000) * 86_400_000).toISOString().slice(0, 10);
  const [choisi, setChoisi] = useState("");
  const [mode, setMode] = useState<ModeManuel | "">("");
  const [trop, setTrop] = useState(false);
  const d = devis.find((x) => x.id === choisi);
  const M = F.manuels;
  return (
    <FormAction
      action={saisirPaiement}
      nom={M.saisir}
      bouton={M.enregistrer}
      reussite={M.enregistre}
      apres={() => {
        setChoisi("");
        setMode("");
        setTrop(false);
      }}
      enfants={
        <div className="champs">
          <div className="champ large">
            <label htmlFor="pm-devis">{M.pour}</label>
            <select id="pm-devis" name={d?.source ?? "devis"} value={choisi} onChange={(e) => setChoisi(e.target.value)} required>
              <option value="" disabled>
                {M.choisir}
              </option>
              {devis.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.libelle}
                </option>
              ))}
            </select>
            {d && <span className="aide">{M.attendu(`${fcfa(d.montant)} (${euroDeFcfa(d.montant)})`)}</span>}
          </div>
          <div className="champ">
            <label htmlFor="pm-mode">{M.mode}</label>
            <select id="pm-mode" name="mode" value={mode} onChange={(e) => setMode(e.target.value as ModeManuel)} required>
              <option value="" disabled>
                {F.champs.mode}
              </option>
              {MODES_MANUELS.map((x) => (
                <option key={x} value={x}>
                  {T.modes[x]}
                </option>
              ))}
            </select>
          </div>
          <div className="champ">
            <label htmlFor="pm-jour">{M.recuLe}</label>
            <input id="pm-jour" name="recu_le" type="date" max={aujourdhui} defaultValue={aujourdhui} required />
          </div>
          <div className="champ">
            <label htmlFor="pm-mt">{M.montant}</label>
            <input id="pm-mt" name="montant" inputMode="decimal" autoComplete="off" required />
          </div>
          <div className="champ">
            <label htmlFor="pm-dev">{M.devise}</label>
            <select id="pm-dev" name="devise" defaultValue="XOF">
              {Object.entries(M.devises).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="champ">
            <label htmlFor="pm-ref">{M.reference}</label>
            <input id="pm-ref" name="reference" maxLength={80} autoComplete="off" required={mode !== "" && AVEC_REFERENCE.includes(mode)} aria-describedby="pm-ref-a" />
            <span className="aide" id="pm-ref-a">
              {M.referenceAide}
            </span>
          </div>
          <div className="champ">
            <label htmlFor="pm-pay">{M.payeur}</label>
            <input id="pm-pay" name="payeur" maxLength={120} autoComplete="off" required aria-describedby="pm-pay-a" />
            <span className="aide" id="pm-pay-a">
              {M.payeurAide}
            </span>
          </div>
          <div className="champ large">
            <label htmlFor="pm-j">{M.justificatif}</label>
            <input
              id="pm-j"
              name="justificatif"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              required={mode === "virement"}
              aria-describedby="pm-j-a"
              aria-invalid={trop || undefined}
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                const lourd = Boolean(f && f.size > JUSTIFICATIF_MAX);
                setTrop(lourd);
                if (lourd) e.currentTarget.value = "";
              }}
            />
            <span className="aide" id="pm-j-a">
              {trop ? F.champs.justificatif : M.justificatifAide}
            </span>
          </div>
        </div>
      }
    />
  );
}
