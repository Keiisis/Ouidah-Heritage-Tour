import { redirect } from "next/navigation";
import { espace as T } from "@/content/espace";
import { reglages as R } from "@/content/espace-reglages";
import { lireContenu } from "@/lib/contenu";
import { lireReglages } from "@/lib/serveur/assistant/fournisseur";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { basculerAssistant, reglerAssistantPublic } from "@/lib/serveur/equipe/reglages/actions";
import { lireSite } from "@/lib/serveur/equipe/reglages/lectures";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { Bloc, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { Picto } from "../Picto";
import { Tete } from "../Tete";
import { SavoirAssistant } from "./assistant/Savoir";
import { Etat } from "./commun";
import { BoutonAction, FormAction } from "./Envoi";
import "./reglages.css";

// Assistant d'écriture (lot « reglages ») : clé du fournisseur seulement « posée » ou non (GROQ_API_KEYS), jamais
// saisie ici ni inventée. Sans clé, l'écran l'explique, l'interrupteur reste inactif (le serveur refuse aussi) et
// assistantDisponible() rend false : aucun autre écran ne montre le bouton. Admin seulement. À la suite : « Ce que l'assistant
// sait » (assistant/Savoir.tsx), documents, notes, argumentaire et questions qui nourrissent l'assistant public.
export async function EcranAssistant() {
  const s = await exigerRole("admins");
  if (!s) redirect("/admins");
  const [site, reg, A] = await Promise.all([lireSite(), lireReglages(), lireContenu("reglages.assistant")]);
  return (
    <Enveloppe role="admins" session={s} actif="assistant" minute={minuteServeur()}>
      <Tete titre={A.titre} sous={A.sous} />
      <div className="esp-reglages">
        <div className="esp-grille">
          {!site ? (
            <Bloc id="r-ass" titre={A.cle} s={12} i={1}>
              <Vide texte={[T.vides.indisponible, ""]} />
            </Bloc>
          ) : (
            <>
              <Bloc id="r-ass" titre={A.cle} s={6} i={1}>
                <p data-cle={site.cleAssistant ? "posee" : "absente"}>
                  <Etat e={site.cleAssistant ? "configuree" : "manquante"} texte={site.cleAssistant ? R.configuree : R.manquante} />
                </p>
                {!site.cleAssistant && <Vide texte={[A.sansCle, A.sansCleSous]} />}
                <p className="aide">{A.cleAide}</p>
              </Bloc>
              <Bloc id="r-ass-e" titre={A.etat} s={6} i={2}>
                <p data-assistant={site.assistantActif && site.cleAssistant ? "allume" : "eteint"}>
                  <Etat e={site.assistantActif && site.cleAssistant ? "allume" : "eteint"} texte={site.assistantActif && site.cleAssistant ? A.allume : A.eteint} />
                </p>
                <div className="reg-pied">
                  {site.assistantActif ? (
                    <BoutonAction action={basculerAssistant} args={[false]} libelle={A.eteindre} reussite={A.eteint_ok} />
                  ) : (
                    <BoutonAction action={basculerAssistant} args={[true]} libelle={A.allumer} reussite={A.allume_ok} secondaire={false} inactif={!site.cleAssistant} />
                  )}
                </div>
              </Bloc>
              <Bloc id="r-ass-r" titre={A.regles} s={12} i={3}>
                <ul className="liste">
                  {A.listeRegles.map((r) => (
                    <li key={r} className="rangee">
                      <Picto nom="coche" />
                      <span className="texte">{r}</span>
                    </li>
                  ))}
                </ul>
              </Bloc>
            </>
          )}
          <Bloc id="r-ass-public" titre={A.publicTitre} s={12} i={4}>
            {!reg ? <Vide texte={[T.vides.indisponible, ""]} /> : <>
              <p className="aide">{A.publicAide}</p>
              <FormAction action={reglerAssistantPublic} nom={A.publicTitre} bouton={R.enregistrer} reussite={A.publicEnregistre} enfants={<>
                <label><input key={String(reg.actif)} name="public_actif" type="checkbox" defaultChecked={reg.actif} /> {A.publicActif}</label>
                <div className="champs">
                  <div className="champ">
                    <label htmlFor="r-ass-modele">{A.modele}</label>
                    <input key={reg.modele} id="r-ass-modele" name="modele" defaultValue={reg.modele} maxLength={80} required aria-describedby="r-ass-modele-a" />
                    <span className="aide" id="r-ass-modele-a">{A.modeleAide}</span>
                  </div>
                  <div className="champ">
                    <label htmlFor="r-ass-plafond">{A.plafond}</label>
                    <input key={reg.plafond} id="r-ass-plafond" name="plafond_reponse" type="number" min={100} max={4000} step={1} defaultValue={reg.plafond} required />
                  </div>
                  <div className="champ">
                    <label htmlFor="r-ass-budget">{A.budget}</label>
                    <input key={reg.budget} id="r-ass-budget" name="budget_jour" type="number" min={1000} max={5_000_000} step={1} defaultValue={reg.budget} required aria-describedby="r-ass-budget-a" />
                    <span className="aide" id="r-ass-budget-a">{A.budgetAide}</span>
                  </div>
                </div>
              </>} />
            </>}
          </Bloc>
          <SavoirAssistant />
        </div>
      </div>
    </Enveloppe>
  );
}
