import { redirect } from "next/navigation";
import { espace as T } from "@/content/espace";
import { securite as S } from "@/content/espace-securite";
import { transversal as X } from "@/content/transversal";
import { lireTaches } from "@/lib/serveur/equipe/pilotage/taches";
import { ReglageTache } from "../pilotage/ReglageTache";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { declarerIncident, enregistrerTraitement, marquerIncident, retirerTraitement } from "@/lib/serveur/equipe/securite/actions";
import { type LigneRegistre, lireConsentements, lireDemandesDonnees, lireIncidents, lireMembres, lireRegistre } from "@/lib/serveur/equipe/securite/lectures";
import { aujourdhui, BASES, CHAMPS_REGISTRE, jourDuIso, SUIVIS } from "@/lib/serveur/equipe/securite/regles";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { lireContenu } from "@/lib/contenu";
import { lireEffacements } from "@/lib/serveur/services/equipe";
import { FileEffacements } from "@/components/services/FileEffacements";
import { Bloc, vars, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { Picto } from "../Picto";
import { Tete } from "../Tete";
import { court, jourFr, moment, noms } from "./commun";
import { BoutonSec, FormSec } from "./Envoi";
import { Personne } from "./Personne";
import "./securite.css";

// Protection des données (lot « securite », admins/donnees ; APDP au Bénin, RGPD), rendu sous <Suspense> : admin connecté
// seulement. Registre des traitements éditable ; demandes d'accès et d'effacement d'une personne (Personne.tsx) et leur
// historique sans adresse ; procédure de violation sous 72 h et journal des incidents ; consentements enregistrés par le
// serveur (le bandeau du site, lui, ne laisse rien sur le serveur, et l'écran le dit). Données réelles ; base muette : on
// le dit.
const indispo = <Vide texte={[T.vides.indisponible, ""]} />;
const H72 = 72 * 3_600_000;
const LONGS = new Set(["finalite", "donnees", "destinataires", "mesures"]);

/** Champs d'une fiche du registre, préremplis pour une modification. */
function ChampsTraitement({ id, v }: { id: string; v?: LigneRegistre }) {
  const valeur = (col: string) => (v ? ((v as Record<string, unknown>)[col] as string | null) ?? "" : "");
  const base = (
    <div key="base_legale" className="champ">
      <label htmlFor={`${id}-base`}>{S.champs.base_legale}</label>
      <select id={`${id}-base`} name="base_legale" defaultValue={v?.base_legale ?? "consentement"}>
        {BASES.map((b) => (
          <option key={b} value={b}>
            {S.registre.bases[b]}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <div className="champs">
      {CHAMPS_REGISTRE.flatMap(([champ, col, min, max]) => [
        <div key={champ} className={LONGS.has(champ) ? "champ large" : "champ"}>
          <label htmlFor={`${id}-${champ}`}>{S.champs[champ]}</label>
          {LONGS.has(champ) ? (
            <textarea id={`${id}-${champ}`} name={champ} maxLength={max} required={min > 0} defaultValue={valeur(col)} aria-describedby={S.registre.aides[champ] ? `${id}-${champ}-a` : undefined} />
          ) : (
            <input id={`${id}-${champ}`} name={champ} type="text" maxLength={max} required={min > 0} defaultValue={valeur(col)} aria-describedby={S.registre.aides[champ] ? `${id}-${champ}-a` : undefined} />
          )}
          {S.registre.aides[champ] && (
            <span className="aide" id={`${id}-${champ}-a`}>
              {S.registre.aides[champ]}
            </span>
          )}
        </div>,
        ...(champ === "nom" ? [base] : []), // la base légale juste après le nom
      ])}
    </div>
  );
}

export async function EcranDonnees() {
  const s = await exigerRole("admins");
  if (!s) redirect("/admins");
  const minute = minuteServeur(); // heure de la requête, lue après la session
  const ms = minute * 60_000;
  const [registre, demandes, incidents, consentements, membres, taches, effacements, TS] = await Promise.all([lireRegistre(), lireDemandesDonnees(), lireIncidents(), lireConsentements(), lireMembres(), lireTaches(), lireEffacements(s), lireContenu("services.servicesEquipe")]);
  const nomDe = noms(membres);
  const R = S.registre, P = S.personnes, I = S.incidents, C = S.consentements;
  const maintenantOuidah = new Date(ms + 3_600_000).toISOString().slice(0, 16); // valeur par défaut « découvert le »

  return (
    <Enveloppe role="admins" session={s} actif="donnees" minute={minute}>
      <Tete titre={S.donnees.titre} sous={S.donnees.sous} />
      <div className="esp-securite">
        <div className="esp-grille">
          <Bloc id="d-purge" titre={X.purge.titre} s={12} i={0}>
            <p className="mention">{X.purge.description}</p>
            {taches ? <ReglageTache nom="purge_actif" actif={taches.purge_actif} libelle={X.purge.activer} /> : indispo}
          </Bloc>
          {/* registre des traitements */}
          <Bloc id="d-reg" titre={R.titre} compte={registre ? registre.length : null} s={12} i={1}>
            <p className="mention">{R.sous}</p>
            {!registre ? (
              indispo
            ) : !registre.length ? (
              <Vide texte={R.vide} />
            ) : (
              <ul className="registre" id="registre">
                {registre.map((t, k) => (
                  <li key={t.id} className="fiche-traitement sec-arrivee" style={vars({ "--k": k })} data-traitement={t.id}>
                    <h3>{t.nom}</h3>
                    <dl>
                      <dt>{S.champs.finalite}</dt>
                      <dd>{t.finalite}</dd>
                      <dt>{S.champs.base_legale}</dt>
                      <dd>{R.bases[t.base_legale] ?? t.base_legale}</dd>
                      <dt>{S.champs.personnes}</dt>
                      <dd>{t.personnes}</dd>
                      <dt>{S.champs.donnees}</dt>
                      <dd>{t.donnees}</dd>
                      <dt>{S.champs.destinataires}</dt>
                      <dd>{t.destinataires}</dd>
                      {t.transferts && (
                        <>
                          <dt>{S.champs.transferts}</dt>
                          <dd>{t.transferts}</dd>
                        </>
                      )}
                      <dt>{S.champs.duree_conservation}</dt>
                      <dd>{t.duree}</dd>
                      {t.mesures && (
                        <>
                          <dt>{S.champs.mesures}</dt>
                          <dd>{t.mesures}</dd>
                        </>
                      )}
                    </dl>
                    <p className="mention">{R.maj(moment(t.modifie_le))}</p>
                    <details className="sec-repli">
                      <summary aria-label={R.modifierDe(t.nom)}>
                        <Picto nom="chevron" />
                        {R.modifier}
                      </summary>
                      <FormSec action={enregistrerTraitement} args={[t.id]} bouton={R.enregistrer} reussite={R.enregistre} garder nom={R.modifierDe(t.nom)} enfants={<ChampsTraitement id={`t-${court(t.id)}`} v={t} />} />
                      <BoutonSec action={retirerTraitement} args={[t.id]} libelle={R.retirer} reussite={R.retire} confirmer={R.confirmerRetrait(t.nom)} attr="retirer" />
                    </details>
                  </li>
                ))}
              </ul>
            )}
            <details className="sec-repli" id="ajouter-traitement">
              <summary>
                <Picto nom="chevron" />
                {R.ajouter}
              </summary>
              <FormSec action={enregistrerTraitement} args={[null]} bouton={R.ajouter} reussite={R.ajoute} nom={R.ajouter} enfants={<ChampsTraitement id="t-neuf" />} />
            </details>
          </Bloc>

          {/* file des demandes d'effacement envoyées depuis /mes-donnees */}
          <Bloc id="d-eff" titre={TS.donnees} compte={effacements ? effacements.filter((e) => e.statut === "a_traiter").length : null} s={12} i={2}>
            {effacements ? <FileEffacements effacements={effacements} T={TS} /> : indispo}
          </Bloc>

          {/* demandes des personnes */}
          <Bloc id="d-per" titre={P.titre} s={12} i={2}>
            <p className="mention">{P.sous}</p>
            <Personne aujourdhui={aujourdhui(ms)} />
            <h3 className="sous-titre">{P.historique}</h3>
            {!demandes ? (
              indispo
            ) : !demandes.length ? (
              <Vide texte={P.historiqueVide} />
            ) : (
              <table className="tableau" id="table-demandes-donnees">
                <caption className="invisible">{P.historique}</caption>
                <thead>
                  <tr>
                    {Object.values(P.cols).map((c) => (
                      <th scope="col" key={c}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {demandes.map((d) => {
                    const delai = jourDuIso(aujourdhui(Date.parse(d.cree))) - jourDuIso(d.recue);
                    return (
                      <tr key={d.id} data-demande-donnees={d.type}>
                        <td>{jourFr(d.recue)}</td>
                        <td>
                          {moment(d.cree)}
                          <span className="sous-cell">{P.delai(delai)}</span>
                        </td>
                        <td>{P.types[d.type]}</td>
                        <td>{d.type === "acces" ? P.resultatAcces(d.resultat.exporte ?? 0) : P.resultat(d.resultat.efface ?? 0, d.resultat.garde ?? 0)}</td>
                        <td>{d.par ? (nomDe.get(d.par) ?? court(d.par)) : "–"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Bloc>

          {/* violations de données */}
          <Bloc id="d-inc" titre={I.titre} compte={incidents ? incidents.filter((x) => !x.clos).length : null} s={12} i={3}>
            <ol className="procedure" id="procedure-72h">
              {I.procedure.map(([titre, texte]) => (
                <li key={titre}>
                  <b>{titre}</b>
                  <span>{texte}</span>
                </li>
              ))}
            </ol>
            <h3 className="sous-titre">{I.journal}</h3>
            {!incidents ? (
              indispo
            ) : !incidents.length ? (
              <Vide texte={I.vide} />
            ) : (
              <ul className="incidents" id="incidents">
                {incidents.map((x) => {
                  const ecoule = ms - Date.parse(x.decouvert);
                  const reste = Math.ceil((H72 - ecoule) / 3_600_000);
                  return (
                    <li key={x.id} className="incident" data-incident={x.id} data-clos={Boolean(x.clos)}>
                      <b>{I.decouvert(moment(x.decouvert))}</b>
                      <p>{x.nature}</p>
                      <p className="mention">
                        {S.champs.donnees_incident} : {x.donnees}
                        {x.personnes ? ` · ${S.champs.personnes_incident} : ${x.personnes}` : ""}
                      </p>
                      {x.mesures && <p className="mention">{`${S.champs.mesures_incident} : ${x.mesures}`}</p>}
                      {!x.apdp && !x.clos && (
                        <div className="course" data-depasse={reste <= 0}>
                          <div className="piste">
                            <div className="barre" style={vars({ "--v": Math.min(1, Math.max(0, ecoule / H72)).toFixed(3) })} />
                          </div>
                          <span>{reste > 0 ? I.reste(reste) : I.depasse}</span>
                        </div>
                      )}
                      <div className="etapes-incident">
                        {(Object.keys(SUIVIS) as (keyof typeof SUIVIS)[]).map((q) =>
                          x[q] ? (
                            <span key={q} className="etat" data-e="moi">
                              {I[q]} {I.fait(moment(x[q] as string))}
                            </span>
                          ) : (
                            !x.clos && <BoutonSec key={q} action={marquerIncident} args={[x.id, q]} libelle={I.marquer[q]} nom={I.marquerDe(I.marquer[q], moment(x.decouvert))} reussite={I.marque} attr={q} />
                          ),
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <details className="sec-repli" id="declarer-incident">
              <summary>
                <Picto nom="chevron" />
                {I.declarer}
              </summary>
              <FormSec
                action={declarerIncident}
                bouton={I.declarer}
                reussite={I.declare}
                nom={I.declarer}
                accent
                enfants={
                  <div className="champs">
                    <div className="champ">
                      <label htmlFor="i-quand">{S.champs.decouvert_le}</label>
                      <input id="i-quand" name="decouvert_le" type="datetime-local" defaultValue={maintenantOuidah} max={maintenantOuidah} required />
                    </div>
                    <div className="champ">
                      <label htmlFor="i-pers">{S.champs.personnes_incident}</label>
                      <input id="i-pers" name="personnes_incident" type="text" maxLength={300} aria-describedby="i-pers-a" />
                      <span className="aide" id="i-pers-a">
                        {I.personnesAide}
                      </span>
                    </div>
                    <div className="champ large">
                      <label htmlFor="i-nat">{S.champs.nature}</label>
                      <textarea id="i-nat" name="nature" maxLength={2000} required aria-describedby="i-nat-a" />
                      <span className="aide" id="i-nat-a">
                        {I.natureAide}
                      </span>
                    </div>
                    <div className="champ large">
                      <label htmlFor="i-don">{S.champs.donnees_incident}</label>
                      <textarea id="i-don" name="donnees_incident" maxLength={1000} required />
                    </div>
                    <div className="champ large">
                      <label htmlFor="i-mes">{S.champs.mesures_incident}</label>
                      <textarea id="i-mes" name="mesures_incident" maxLength={2000} />
                    </div>
                  </div>
                }
              />
            </details>
          </Bloc>

          {/* consentements */}
          <Bloc id="d-con" titre={C.titre} s={12} i={4}>
            <p className="mention">{C.sous}</p>
            {!consentements ? (
              indispo
            ) : (
              <ul className="consentements" id="consentements">
                {consentements.map((c) => (
                  <li key={c.cle} data-consentement={c.cle}>
                    <span>
                      {C.lignes[c.cle]}
                      <span className="sous-cell">{c.dernier ? C.dernier(moment(c.dernier)) : C.aucun}</span>
                    </span>
                    <b>{c.n}</b>
                  </li>
                ))}
              </ul>
            )}
            <p className="mention">{C.bandeau}</p>
          </Bloc>
        </div>
      </div>
    </Enveloppe>
  );
}
