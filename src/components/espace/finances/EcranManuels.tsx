import { redirect } from "next/navigation";
import { espace as T } from "@/content/espace";
import { finances as F } from "@/content/espace-finances";
import { relancesEquipe as R } from "@/content/relances";
import { lireRelances } from "@/lib/serveur/equipe/finances/relances";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { confirmerPaiement, enregistrerCoordonnees, inverserPaiement, rejeterPaiement } from "@/lib/serveur/equipe/finances/actions";
import { fileManuels, lireReglages, mesPaiements, type PaiementManuel, type Reglages } from "@/lib/serveur/equipe/finances/lectures";
import { objetsPayables } from "@/lib/serveur/equipe/finances/objets";
import { exigerRole, type Session } from "@/lib/serveur/equipe/session";
import { Bloc, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { fcfa } from "../outils";
import { Tete } from "../Tete";
import { dateFr, Etat, libelleMode, Montant } from "./commun";
import { BoutonAction, FormAction } from "./Envoi";
import { FormPaiement } from "./FormPaiement";
import { Relances } from "./Relances";
import "./finances.css";

// Paiements manuels (lot L7) : virement, espèces, Mobile Money direct, chèque. Agent (« Paiements reçus en agence ») :
// saisie et liste de ses saisies. Admin (« Paiements manuels ») : file à confirmer, justificatif visible, confirmation
// ou rejet avec motif, écriture inverse d'un paiement confirmé, coordonnées de l'agence. Le serveur revérifie tout.
const M = F.manuels;

function Tableau({ lignes, admin, s }: { lignes: PaiementManuel[]; admin: "file" | "traites" | null; s: Session }) {
  return (
    <div className="tableau-defile">
      <table className="tableau">
        <thead>
          <tr>
            <th scope="col">{M.cols.quand}</th>
            <th scope="col">{M.cols.pour}</th>
            <th scope="col">{M.cols.mode}</th>
            <th scope="col">{M.cols.montant}</th>
            <th scope="col">{M.cols.reference}</th>
            {admin && <th scope="col">{M.cols.qui}</th>}
            <th scope="col">{M.cols.etat}</th>
            {admin && (
              <th scope="col">
                <span className="invisible">{M.confirmer}</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {lignes.map((p) => {
            const quoi = `${p.client}, ${fcfa(p.montant)}`;
            const ecart = p.attendu !== null && p.devise === "XOF" && p.montant !== p.attendu && !p.inverse ? p.montant - p.attendu : null;
            return (
              <tr key={p.id} data-paiement={p.id} data-etat={p.etat}>
                <td data-col={M.cols.quand}>{dateFr(p.recuLe)}</td>
                <td data-col={M.cols.pour}>
                  <b>{p.client}</b>
                  {p.facture && <span className="sous-cell">{p.facture.numero}</span>}
                </td>
                <td data-col={M.cols.mode}>{p.inverse ? M.inverseDe : libelleMode(p.mode)}</td>
                <td data-col={M.cols.montant}>
                  <Montant n={p.montant} devise={p.devise} />
                  {ecart !== null && <span className="sous-cell">{M.ecart(fcfa(ecart))}</span>}
                </td>
                <td data-col={M.cols.reference}>
                  {p.reference ?? ""}
                  {p.payeur && <span className="sous-cell">{p.payeur}</span>}
                  {p.justificatif ? (
                    <a className="lien" href={`/agents/agence/justificatif/${p.justificatif}`} target="_blank" rel="noopener">
                      {M.justif}
                    </a>
                  ) : (
                    !p.inverse && <span className="sous-cell">{M.sansJustif}</span>
                  )}
                </td>
                {admin && <td data-col={M.cols.qui}>{p.saisi ? `${p.saisi.prenom} ${p.saisi.nom}` : ""}</td>}
                <td data-col={M.cols.etat}>
                  <Etat e={p.etat} textes={F.etatsPaiement} />
                  {p.motif && <span className="sous-cell">{p.motif}</span>}
                </td>
                {admin === "file" && (
                  <td className="actions">
                    {p.saisi?.id === s.profilId ? (
                      <span className="sous-cell">{M.deuxPersonnes}</span>
                    ) : (
                      <BoutonAction action={confirmerPaiement} args={[p.id]} libelle={M.confirmer} nom={M.confirmerDe(quoi)} reussite={M.confirmeOk} secondaire={false} />
                    )}
                    <FormAction
                      action={rejeterPaiement}
                      args={[p.id]}
                      nom={M.rejeterDe(quoi)}
                      bouton={M.rejeter}
                      reussite={M.rejete}
                      enfants={
                        <div className="champ">
                          <label htmlFor={`rej-${p.id}`}>{M.motif}</label>
                          <input id={`rej-${p.id}`} name="motif" maxLength={280} autoComplete="off" required aria-describedby={`rej-a-${p.id}`} />
                          <span className="aide" id={`rej-a-${p.id}`}>
                            {M.motifAide}
                          </span>
                        </div>
                      }
                    />
                  </td>
                )}
                {admin === "traites" && (
                  <td className="actions">
                    {p.etat === "confirme" && !p.inverse && (
                      <details>
                        <summary className="bouton-2 bouton-petit">{M.inverser}</summary>
                        <FormAction
                          action={inverserPaiement}
                          args={[p.id]}
                          nom={`${M.inverser} · ${quoi}`}
                          bouton={M.inverser}
                          reussite={M.inverse}
                          enfants={
                            <div className="champ">
                              <p className="mention">{M.inverserAide}</p>
                              <label htmlFor={`inv-${p.id}`}>{M.motifInverse}</label>
                              <input id={`inv-${p.id}`} name="motif" maxLength={280} autoComplete="off" required />
                            </div>
                          }
                        />
                      </details>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Coordonnées de l'agence (titulaire, banque, IBAN, BIC, Mobile Money) : jamais en dur, lues dans reglages_paiement. */
function Coordonnees({ r }: { r: Reglages }) {
  const lignes = [[M.titulaire, r.titulaire], [M.banque, r.banque], [M.iban, r.iban], [M.bic, r.bic], ...r.mobile.map((m) => [M.mobile, m])].filter((x): x is [string, string] => Boolean(x[1]));
  return lignes.length ? (
    <dl className="coordonnees">
      {lignes.map(([k, v], i) => (
        <div key={i}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  ) : (
    <p className="mention">{M.coordonneesVide}</p>
  );
}

export async function EcranManuels() {
  const s = await exigerRole("admins");
  if (!s) redirect("/admins");
  const [q, r, relances] = await Promise.all([fileManuels(), lireReglages(), lireRelances()]);
  const indispo = <Vide texte={[T.vides.indisponible, ""]} />;
  return (
    <Enveloppe role="admins" session={s} actif="manuels" minute={minuteServeur()}>
      <Tete titre={M.titreAdmin} sous={M.sousAdmin} />
      <div className="esp-finances">
        <div className="esp-grille">
          <Bloc id="m-file" titre={M.file} compte={q ? q.file.length : null} s={12} i={1}>
            {!q ? indispo : q.file.length ? <Tableau lignes={q.file} admin="file" s={s} /> : <Vide texte={M.fileVide} />}
          </Bloc>
          <Bloc id="m-trai" titre={M.traites} s={12} i={2}>
            {!q ? indispo : q.traites.length ? <Tableau lignes={q.traites} admin="traites" s={s} /> : <Vide texte={[M.traitesVide, ""]} />}
          </Bloc>
          <Bloc id="m-coord" titre={M.coordonnees} s={12} i={3}>
            <p className="mention">{M.coordonneesSous}</p>
            {!r ? (
              indispo
            ) : (
              <FormAction
                action={enregistrerCoordonnees}
                nom={M.coordonnees}
                bouton={M.enregistrerCoord}
                reussite={M.coordEnregistrees}
                garder
                enfants={
                  <div className="champs">
                    <div className="champ">
                      <label htmlFor="co-tit">{M.titulaire}</label>
                      <input id="co-tit" name="titulaire" maxLength={120} defaultValue={r.titulaire ?? ""} autoComplete="off" />
                    </div>
                    <div className="champ">
                      <label htmlFor="co-ban">{M.banque}</label>
                      <input id="co-ban" name="banque" maxLength={120} defaultValue={r.banque ?? ""} autoComplete="off" />
                    </div>
                    <div className="champ">
                      <label htmlFor="co-iban">{M.iban}</label>
                      <input id="co-iban" name="iban" maxLength={52} defaultValue={r.iban ?? ""} autoComplete="off" spellCheck={false} />
                    </div>
                    <div className="champ">
                      <label htmlFor="co-bic">{M.bic}</label>
                      <input id="co-bic" name="bic" maxLength={14} defaultValue={r.bic ?? ""} autoComplete="off" spellCheck={false} />
                    </div>
                    <div className="champ large">
                      <label htmlFor="co-mm">{M.mobile}</label>
                      <textarea id="co-mm" name="mobile" rows={3} defaultValue={r.mobile.join("\n")} aria-describedby="co-mm-a" />
                      <span className="aide" id="co-mm-a">
                        {M.mobileAide}
                      </span>
                    </div>
                    <div className="champ">
                      <label htmlFor="co-rel">{M.relance}</label>
                      <input id="co-rel" name="relance" inputMode="numeric" defaultValue={r.relance ?? ""} autoComplete="off" aria-describedby="co-rel-a" />
                      <span className="aide" id="co-rel-a">
                        {R.aide}
                      </span>
                    </div>
                  </div>
                }
              />
            )}
          </Bloc>
          <Bloc id="m-relances" titre={R.titre} compte={relances?.candidates.length ?? null} s={12} i={4}>
            <p className="mention">{R.sous}</p>
            <p className="mention">{R.automatique}</p>
            {!relances || !r ? <Vide texte={[R.indisponible, ""]} /> : <>
              {r.relance === null ? <p className="mention">{R.desactivees}</p> : relances.candidates.length ? <Relances candidates={relances.candidates} /> : <p className="mention">{R.vide}</p>}
              {relances.tentatives.length > 0 && <details><summary className="bouton-2 bouton-petit">{R.historique}</summary><p className="mention">{R.doute}</p><div className="tableau-defile"><table className="tableau"><thead><tr><th scope="col">{R.numero}</th><th scope="col">{R.depuis}</th><th scope="col">{R.etat}</th></tr></thead><tbody>{relances.tentatives.map((t) => <tr key={t.id}><td data-col={R.numero}>{t.facture?.numero ?? "—"}</td><td data-col={R.depuis}>{dateFr(t.cree_le)}</td><td data-col={R.etat}>{R.etats[t.etat]}</td></tr>)}</tbody></table></div></details>}
            </>}
          </Bloc>
        </div>
      </div>
    </Enveloppe>
  );
}

export async function EcranAgence() {
  const s = await exigerRole("agents");
  if (!s) redirect("/agents");
  const [devis, miens, r] = await Promise.all([objetsPayables(s), mesPaiements(s), lireReglages()]);
  const indispo = <Vide texte={[T.vides.indisponible, ""]} />;
  return (
    <Enveloppe role="agents" session={s} actif="agence" minute={minuteServeur()}>
      <Tete titre={M.titreAgent} sous={M.sousAgent} />
      <div className="esp-finances">
        <div className="esp-grille">
          <Bloc id="a-sai" titre={M.saisir} s={7} i={1}>
            {!devis ? (
              indispo
            ) : devis.length ? (
              <FormPaiement devis={devis.map((d) => ({ id: d.id, source: d.source, libelle: `${d.numero ? `${d.numero}, ` : ""}${d.client}, ${fcfa(d.montant)}`, montant: d.montant, langue: d.langue }))} />
            ) : (
              <p className="mention">{M.aucunDevis}</p>
            )}
          </Bloc>
          <Bloc id="a-coord" titre={M.coordonneesAgent} s={5} i={2}>
            {r ? <Coordonnees r={r} /> : indispo}
          </Bloc>
          <Bloc id="a-mes" titre={M.mesSaisies} compte={miens ? miens.length : null} s={12} i={3}>
            {!miens ? indispo : miens.length ? <Tableau lignes={miens} admin={null} s={s} /> : <Vide texte={M.mesSaisiesVide} />}
          </Bloc>
        </div>
      </div>
    </Enveloppe>
  );
}
