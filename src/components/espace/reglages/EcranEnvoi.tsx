import { redirect } from "next/navigation";
import { espace as T } from "@/content/espace";
import { reglages as R } from "@/content/espace-reglages";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { MAX_AVIS } from "@/lib/serveur/courriel";
import { CONSERVATION_JOURS } from "@/content/espace-pilotage";
import { ajouterAvis, envoyerTest, retirerAvis, testerAvis } from "@/lib/serveur/equipe/reglages/actions";
import { lireEnvoi } from "@/lib/serveur/equipe/reglages/lectures";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { Bloc, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { Tete } from "../Tete";
import { Etat, quand } from "./commun";
import { BoutonAction, FormAction } from "./Envoi";
import "./reglages.css";

// E-mail d'envoi (lot « reglages ») : état du compte SMTP d'OHT (hôte, port, adresse d'envoi affichés ; le mot de passe
// seulement « posé » ou « absent », jamais sa valeur), test d'envoi vers l'admin lui-même, derniers échecs ; destinataires
// des avis à l'équipe (liste de l'admin, 11/11) et journal des envois (modèle, destinataire masqué, résultat). Admin seulement.
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
              <Bloc id="r-env-avis" titre={E.avis} compte={e.avis ? e.avis.length : null} s={12} i={4}>
                <p className="mention">{E.avisSous(MAX_AVIS)}</p>
                {!e.avis ? (
                  <Vide texte={[T.vides.indisponible, ""]} />
                ) : !e.avis.length ? (
                  <>
                    <Vide texte={E.avisVide} />
                    <p className="aide">{E.avisSecours(e.secours)}</p>
                  </>
                ) : (
                  <ul className="liste-avis">
                    {e.avis.map((a) => (
                      <li key={a}>
                        <span>{a}</span> <BoutonAction action={retirerAvis} args={[a]} libelle={E.avisRetirer(a)} reussite={E.avisRetiree} />
                      </li>
                    ))}
                  </ul>
                )}
                {e.avis && e.avis.length < MAX_AVIS && (
                  <FormAction
                    action={ajouterAvis}
                    bouton={E.avisAjouter}
                    reussite={E.avisAjoutee}
                    garder={false}
                    nom={E.avis}
                    enfants={
                      <div className="champ">
                        <label htmlFor="r-env-avis-a">{E.avisAdresse}</label>
                        <input id="r-env-avis-a" name="avis_adresse" type="email" maxLength={254} autoComplete="off" required />
                      </div>
                    }
                  />
                )}
                <div className="reg-pied">
                  <BoutonAction action={testerAvis} libelle={E.avisTester} reussite={{ nombre: "avis" }} inactif={!e.configure} />
                </div>
              </Bloc>
              <Bloc id="r-env-j" titre={E.journal} compte={e.journal ? e.journal.length : null} s={12} i={5}>
                <p className="mention">{E.journalSous(CONSERVATION_JOURS)}</p>
                {!e.journal ? (
                  <Vide texte={[T.vides.indisponible, ""]} />
                ) : !e.journal.length ? (
                  <Vide texte={E.journalVide} />
                ) : (
                  <div className="tableau-defile">
                    <table className="tableau">
                      <thead>
                        <tr>
                          <th scope="col">{E.journalCols.quand}</th>
                          <th scope="col">{E.journalCols.modele}</th>
                          <th scope="col">{E.journalCols.a}</th>
                          <th scope="col">{E.journalCols.resultat}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {e.journal.map((x) => (
                          <tr key={x.id} data-reussi={x.reussi ? "oui" : "non"}>
                            <td data-col={E.journalCols.quand}>{quand(x.quand)}</td>
                            <td data-col={E.journalCols.modele}>{E.modeles[x.modele] ?? x.modele}</td>
                            <td data-col={E.journalCols.a}>{x.a}</td>
                            <td data-col={E.journalCols.resultat}>
                              <Etat e={x.reussi ? "configuree" : "manquante"} texte={x.reussi ? E.journalParti : E.journalEchec(x.motif ? (E.motifs[x.motif] ?? x.motif) : null)} />
                            </td>
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
