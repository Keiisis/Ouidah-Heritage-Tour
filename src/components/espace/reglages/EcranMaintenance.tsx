import { redirect } from "next/navigation";
import { espace as T } from "@/content/espace";
import { LANGUES_REGLAGES, reglages as R } from "@/content/espace-reglages";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { enregistrerMaintenance, enregistrerModeEco } from "@/lib/serveur/equipe/reglages/actions";
import { type Maintenance, lireMaintenanceAdmin } from "@/lib/serveur/equipe/reglages/lectures";
import { ECO_SEUIL, type EtatEco, etatEco } from "@/lib/serveur/equipe/reglages/public";
import { MODES_ECO } from "@/lib/serveur/equipe/reglages/regles";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { Bloc, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { Picto } from "../Picto";
import { Tete } from "../Tete";
import { Etat, Modifie } from "./commun";
import { FormAction } from "./Envoi";
import "./reglages.css";

// Maintenance (lot « reglages ») : interrupteur et message aux visiteurs par langue, gardés dans reglages_maintenance. Le
// site public ne lit ce réglage qu'une fois branché dans proxy.ts par la session documents : l'écran le dit. Le serveur
// refuse l'activation sans message en français. Mode économie (reglages_site.mode_eco, plafond_vues_mois) : choix, plafond
// et état lu à l'instant (reglages/public.ts › etatEco). Admin seulement.
const M = R.maintenance;
const E = R.eco;
const nombre = new Intl.NumberFormat("fr-FR");

function ChampsEco({ e }: { e: EtatEco }) {
  return (
    <>
      <fieldset>
        <legend>{E.mode}</legend>
        {MODES_ECO.map((m) => (
          <label key={m} className="case">
            <input type="radio" name="mode" value={m} defaultChecked={e.mode === m} aria-describedby={`r-eco-${m}`} />
            {E.modes[m]}
            <span className="aide" id={`r-eco-${m}`}>
              {m === "auto" ? E.modesAide.auto(ECO_SEUIL * 100) : E.modesAide[m]}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="champ">
        <label htmlFor="r-eco-p">{E.plafond}</label>
        <input id="r-eco-p" name="plafond" inputMode="numeric" maxLength={13} defaultValue={e.plafond === null ? "" : nombre.format(e.plafond)} autoComplete="off" aria-describedby="r-eco-pa" />
        <span className="aide" id="r-eco-pa">
          {E.plafondAide}
        </span>
      </div>
    </>
  );
}

function Champs({ m }: { m: Maintenance }) {
  return (
    <>
      <label className="case">
        <input type="checkbox" name="actif" value="oui" defaultChecked={m.actif} aria-describedby="r-mai-a" />
        {M.interrupteur}
      </label>
      <p className="aide" id="r-mai-a">
        {M.interrupteurAide}
      </p>
      <fieldset>
        <legend>{M.message}</legend>
        <p className="aide">{M.messageSous}</p>
        <div className="langues">
          {LANGUES_REGLAGES.map((l) => (
            <details key={l} className="langue" open={l === "FR" || undefined} data-langue={l}>
              <summary>
                <span>{R.docs.langue(T.langues[l] ?? l, l === "FR")}</span>
                <Picto nom="chevron" className="ic" />
              </summary>
              <div className="langue-corps">
                <div className="champ">
                  <label htmlFor={`r-mai-${l}`}>{`${M.message} · ${T.langues[l] ?? l}`}</label>
                  <textarea id={`r-mai-${l}`} name={`message_${l}`} maxLength={500} rows={3} defaultValue={m.message[l] ?? ""} lang={l === "GCF" ? "gcf" : l.toLowerCase()} />
                </div>
              </div>
            </details>
          ))}
        </div>
      </fieldset>
    </>
  );
}

export async function EcranMaintenance() {
  const s = await exigerRole("admins");
  if (!s) redirect("/admins");
  const [m, e] = await Promise.all([lireMaintenanceAdmin(), etatEco(true)]);
  return (
    <Enveloppe role="admins" session={s} actif="maintenance" minute={minuteServeur()}>
      <Tete titre={M.titre} sous={M.sous} />
      <div className="esp-reglages">
        <div className="esp-grille">
          {!m ? (
            <Bloc id="r-mai" titre={M.etat} s={12} i={1}>
              <Vide texte={[T.vides.indisponible, ""]} />
            </Bloc>
          ) : (
            <>
              <Bloc id="r-mai-e" titre={M.etat} s={5} i={1}>
                <p data-maintenance={m.actif ? "active" : "inactive"}>
                  <Etat e={m.actif ? "ferme" : "active"} texte={m.actif ? M.ferme : M.ouvert} />
                </p>
                <Modifie le={m.modifie_le} par={m.par} />
                <h3 className="sous-titre">{M.branchement}</h3>
                <p className="mention">{M.branchementSous}</p>
              </Bloc>
              <Bloc id="r-mai" titre={M.titre} s={7} i={2}>
                <FormAction action={enregistrerMaintenance} nom={M.titre} bouton={R.enregistrer} reussite={M.enregistre} enfants={<Champs m={m} />} />
              </Bloc>
            </>
          )}
          {!e ? (
            <Bloc id="r-eco" titre={E.titre} s={12} i={3}>
              <Vide texte={[T.vides.indisponible, ""]} />
            </Bloc>
          ) : (
            <>
              <Bloc id="r-eco-e" titre={E.etat} s={5} i={3}>
                <p data-mode-eco={e.actif ? "allume" : "eteint"}>
                  <Etat e={e.actif ? "ferme" : "active"} texte={e.actif ? E.allume : E.eteint} />
                </p>
                <p className="mention">{e.plafond === null ? E.sansPlafond : e.vues === null ? T.vides.indisponible : E.vues(nombre.format(e.vues), nombre.format(e.plafond))}</p>
                <p className="mention">{E.effets}</p>
                <p className="aide">{E.delai}</p>
              </Bloc>
              <Bloc id="r-eco" titre={E.titre} s={7} i={4}>
                <p className="mention">{E.sous}</p>
                <FormAction action={enregistrerModeEco} nom={E.titre} bouton={R.enregistrer} reussite={E.enregistre} enfants={<ChampsEco e={e} />} />
              </Bloc>
            </>
          )}
        </div>
      </div>
    </Enveloppe>
  );
}
