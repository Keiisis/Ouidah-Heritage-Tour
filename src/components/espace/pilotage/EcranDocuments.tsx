import { espace as T } from "@/content/espace";
import { CONSERVATION_JOURS, pilotage as P } from "@/content/espace-pilotage";
import { iso, jourOuidah } from "@/lib/jours";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { supprimerDocument } from "@/lib/serveur/equipe/pilotage/actions";
import { lireDocuments } from "@/lib/serveur/equipe/pilotage/lectures";
import { exigerDroit } from "@/lib/serveur/equipe/securite/droits";
import { Bloc, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { dateFr } from "../finances/commun";
import { ilYa } from "../outils";
import { SansDroit } from "../securite/SansDroit";
import { Tete } from "../Tete";
import { Depot } from "./Depot";
import { BoutonAction } from "./Envoi";
import "../finances/finances.css";
import "./pilotage.css";

// Documents des clients (agent ; un admin y voit tous les dossiers), rendus sous <Suspense> après la session. Stockage
// privé : chaque fichier s'ouvre par /agents/documents/<id>, route qui revérifie le dossier, inscrit la lecture au journal
// et renvoie un lien signé d'une minute. La date de fin de conservation est affichée ; échue, le document est à supprimer.
const D = P.documents;

export async function EcranDocuments() {
  const s = await exigerDroit("demandes"); // documents des dossiers : droit « Demandes et devis » (lot « securite »)
  if (!s) return <SansDroit role="agents" actif="documents" />;
  const minute = minuteServeur();
  const v = await lireDocuments(s);
  const aujourdhui = iso(jourOuidah(minute * 60_000));
  const c = D.cols;

  return (
    <Enveloppe role="agents" session={s} actif="documents" minute={minute}>
      <Tete titre={D.titre} sous={D.sous} />
      <div className="esp-finances esp-pilotage">
        <div className="esp-grille">
          <Bloc id="do-dep" titre={D.depot} s={5} i={1}>
            {!v ? <Vide texte={[T.vides.indisponible, ""]} /> : v.dossiers.length ? <Depot dossiers={v.dossiers} /> : <Vide texte={D.sansDossier} />}
            <p className="mention" id="regle-conservation">
              {D.regle(CONSERVATION_JOURS)}
            </p>
          </Bloc>

          <Bloc id="do-lis" titre={D.liste} compte={v ? v.documents.length : null} s={7} i={2}>
            {!v ? (
              <Vide texte={[T.vides.indisponible, ""]} />
            ) : v.documents.length ? (
              <div className="tableau-defile">
                <table className="tableau" id="liste-documents">
                  <thead>
                    <tr>
                      {Object.values(c).map((x) => (
                        <th key={x} scope="col">
                          {x}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {v.documents.map((d) => {
                      const echu = d.conserver < aujourdhui;
                      return (
                        <tr key={d.id} data-document={d.id} data-echu={echu || undefined}>
                          <td data-col={c.document}>
                            <b>{D.types[d.type]}</b>
                            <span className="sous-cell pil-fichier">
                              {d.nom} · {D.taille(d.taille)}
                            </span>
                          </td>
                          <td data-col={c.dossier}>
                            {d.dossier.nom}
                            <span className="sous-cell">{d.dossier.reference}</span>
                          </td>
                          <td data-col={c.depose}>
                            {ilYa(d.cree, minute)}
                            {d.depose && <span className="sous-cell">{D.par(d.depose)}</span>}
                          </td>
                          <td data-col={c.conservation}>{echu ? <span className="etat" data-e="a_confirmer">{D.echu}</span> : D.jusquau(dateFr(d.conserver))}</td>
                          <td data-col={c.actions}>
                            <span className="actions">
                              <a className="bouton-2 bouton-petit" href={`/agents/documents/${d.id}`} target="_blank" rel="noopener noreferrer" data-ouvrir={d.id}>
                                {D.ouvrir}
                              </a>
                              <BoutonAction action={supprimerDocument} args={[d.id]} libelle={D.supprimer} nom={`${D.supprimer} · ${D.types[d.type]} · ${d.dossier.reference}`} reussite={D.okSuppression} confirmer={D.confirmerSuppression} />
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <Vide texte={D.vide} />
            )}
            <p className="mention">{D.journal}</p>
          </Bloc>
        </div>
      </div>
    </Enveloppe>
  );
}
