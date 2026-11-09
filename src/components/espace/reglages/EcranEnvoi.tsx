import { redirect } from "next/navigation";
import { espace as T } from "@/content/espace";
import { reglages as R } from "@/content/espace-reglages";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { envoyerTest } from "@/lib/serveur/equipe/reglages/actions";
import { lireEnvoi } from "@/lib/serveur/equipe/reglages/lectures";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { Bloc, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { Tete } from "../Tete";
import { Etat, quand } from "./commun";
import { BoutonAction } from "./Envoi";
import "./reglages.css";

// E-mail d'envoi (lot « reglages ») : état du compte SMTP d'OHT (hôte, port, adresse d'envoi affichés ; le mot de passe
// seulement « posé » ou « absent », jamais sa valeur), test d'envoi vers l'admin lui-même, derniers échecs. Admin seulement.
const E = R.envoiCourriel;

export async function EcranEnvoi() {
  const s = await exigerRole("admins");
  if (!s) redirect("/admins");
  const e = await lireEnvoi();
  return (
    <Enveloppe role="admins" session={s} actif="envoi" minute={minuteServeur()}>
      <Tete titre={E.titre} sous={E.sous} />
      <div className="esp-reglages">
        <div className="esp-grille">
          {!e ? (
            <Bloc id="r-env" titre={E.etat} s={12} i={1}>
              <Vide texte={[T.vides.indisponible, ""]} />
            </Bloc>
          ) : (
            <>
              <Bloc id="r-env" titre={E.etat} s={7} i={1}>
                <p data-smtp={e.configure ? "configure" : "absent"}>
                  <Etat e={e.configure ? "configuree" : "manquante"} texte={e.configure ? E.configure : E.nonConfigure} />
                </p>
                <dl className="valeurs">
                  <div>
                    <dt>{E.adresse}</dt>
                    <dd>{e.adresse ?? R.manquante}</dd>
                  </div>
                  <div>
                    <dt>{E.hote}</dt>
                    <dd>{e.hote ?? R.manquante}</dd>
                  </div>
                  <div>
                    <dt>{E.port}</dt>
                    <dd>{e.port ?? R.manquante}</dd>
                  </div>
                  {e.port && (
                    <div>
                      <dt>{E.securite}</dt>
                      <dd>{e.port === 465 ? E.ssl : E.starttls}</dd>
                    </div>
                  )}
                  <div>
                    <dt>{E.motDePasse}</dt>
                    <dd data-mdp={e.mdp ? "pose" : "absent"}>{E.motDePasseValeur(e.mdp)}</dd>
                  </div>
                </dl>
                <p className="aide">{E.aideVariables}</p>
              </Bloc>
              <Bloc id="r-env-t" titre={E.test} s={5} i={2}>
                <p className="mention">{E.testSous(e.moi)}</p>
                <div className="reg-pied">
                  <BoutonAction action={envoyerTest} libelle={E.tester} reussite={E.teste} secondaire={false} />
                </div>
              </Bloc>
              <Bloc id="r-env-e" titre={E.echecs} compte={e.echecs ? e.echecs.length : null} s={12} i={3}>
                <p className="mention">{E.echecsSous}</p>
                {!e.echecs ? (
                  <Vide texte={[T.vides.indisponible, ""]} />
                ) : !e.echecs.length ? (
                  <Vide texte={E.echecsVide} />
                ) : (
                  <div className="tableau-defile">
                    <table className="tableau">
                      <thead>
                        <tr>
                          <th scope="col">{E.cols.quand}</th>
                          <th scope="col">{E.cols.quoi}</th>
                          <th scope="col">{E.cols.qui}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {e.echecs.map((x) => (
                          <tr key={x.id}>
                            <td data-col={E.cols.quand}>{quand(x.quand)}</td>
                            <td data-col={E.cols.quoi}>{x.quoi}</td>
                            <td data-col={E.cols.qui}>{x.qui ?? ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Bloc>
            </>
          )}
        </div>
      </div>
    </Enveloppe>
  );
}
