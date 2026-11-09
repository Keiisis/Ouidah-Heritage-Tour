import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { espace as T, logoPasserelle, MODES_EN_LIGNE } from "@/content/espace";
import { finances as F, MODES_DEPENSE } from "@/content/espace-finances";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { ajouterDepense, cloreMois, rouvrirMois, emettreFacture } from "@/lib/serveur/equipe/finances/actions";
import { calculerMois, devisPayables, lireFactures, lireReglages } from "@/lib/serveur/equipe/finances/lectures";
import { aujourdhuiOuidah, decaler, moisCourant, moisValide } from "@/lib/serveur/equipe/finances/regles";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { Bloc, vars, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { euroDeFcfa, fcfa } from "../outils";
import { Tete } from "../Tete";
import { dateFr, libelleMode, Montant, moisFr } from "./commun";
import { BoutonAction, FormAction } from "./Envoi";
import { ListeFactures } from "./ListeFactures";
import "./finances.css";

// Comptabilité et factures (lot L7, maquette E ?role=admins&ecran=finances), rendue sous <Suspense> : admin connecté
// seulement, sinon retour à l'entrée /admins. Le mois se choisit par l'adresse (?mois=AAAA-MM), lu après la session.
// Encaissé = paiements confirmés seulement (passerelles, liens payés, paiements manuels confirmés) ; « à confirmer » à
// part, jamais dans l'encaissé. Données réelles ; si la base ne répond pas, on le dit.
export async function EcranCompta({ recherche }: { recherche: Promise<{ mois?: string | string[]; facture?: string | string[] }> }) {
  const s = await exigerRole("admins");
  if (!s) redirect("/admins");
  const minute = minuteServeur(); // heure de la requête, lue après la session
  const ms = minute * 60_000;
  const courant = moisCourant(ms);
  const parametres = await recherche;
  const demande = parametres.mois;
  const mois = moisValide(demande) && demande <= courant ? demande : courant;
  const [m, factures, devis, reglages] = await Promise.all([calculerMois(mois), lireFactures(s, parametres.facture), devisPayables(s), lireReglages()]);
  const C = F.compta;
  const indispo = <Vide texte={[T.vides.indisponible, ""]} />;
  const max = Math.max(1, ...(m?.parMode.map((x) => x.montant) ?? []));
  const aFacturer = devis?.filter((d) => !d.facture) ?? null;
  const ouvertes = factures?.filter((f) => f.statut === "emise" || f.statut === "a_regulariser") ?? null;
  const age = (iso: string) => Math.floor((ms - Date.parse(iso)) / 86_400_000);
  const aujourdhui = aujourdhuiOuidah(ms);

  return (
    <Enveloppe role="admins" session={s} actif="finances" minute={minute}>
      <Tete titre={C.titre} sous={C.sous} />
      <div className="esp-finances">
        <nav className="mois-nav" aria-label={C.mois}>
          <Link className="bouton-2 bouton-petit" href={`/admins/finances?mois=${decaler(mois, -1)}`}>
            {C.moisPrecedent}
          </Link>
          <h2>{moisFr(mois)}</h2>
          {mois < courant && (
            <Link className="bouton-2 bouton-petit" href={`/admins/finances?mois=${decaler(mois, 1)}`}>
              {C.moisSuivant}
            </Link>
          )}
        </nav>
        <div className="esp-grille">
          <Bloc id="f-enc" titre={C.encaisse(moisFr(mois))} s={7} i={1}>
            {!m ? (
              indispo
            ) : (
              <>
                <div className="chiffres">
                  <div className="chiffre" data-encaisse>
                    <span>{C.encaisse(moisFr(mois))}</span>
                    <b>{fcfa(m.encaisse)}</b>
                    <span>{euroDeFcfa(m.encaisse)}</span>
                  </div>
                  <div className="chiffre" data-attente>
                    <span>{C.aConfirmer}</span>
                    <b>{fcfa(m.aConfirmer.montant)}</b>
                    <span>{C.aConfirmerSous(m.aConfirmer.n)}</span>
                  </div>
                </div>
                <p className="mention">{C.encaisseSous}</p>
                <h3 className="sous-titre">{C.parMode}</h3>
                <ul className="modes">
                  {m.parMode.map((x, k) => {
                    const enLigne = MODES_EN_LIGNE.includes(x.mode);
                    return (
                      <li key={x.mode} data-mode={x.mode} style={vars({ "--k": k })}>
                        {enLigne ? (
                          <span className="logo-plaque">
                            <Image src={logoPasserelle(x.mode)} alt={T.modes[x.mode]} width={96} height={22} />
                          </span>
                        ) : (
                          <span className="mode-nom">{T.modes[x.mode]}</span>
                        )}
                        <span className="barre" style={vars({ "--v": (x.montant / max).toFixed(3) })} />
                        <span className="num">
                          {x.montant ? fcfa(x.montant) : C.aucun}
                          {x.n > 0 && <small>{C.paiements(x.n)}</small>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {m.aConfirmer.n > 0 && (
                  <Link className="lien" href="/admins/manuels">
                    {C.voirFile}
                  </Link>
                )}
              </>
            )}
          </Bloc>

          <Bloc id="f-res" titre={C.resultat} s={5} i={2}>
            {!m ? (
              indispo
            ) : (
              <>
                <div className="chiffres">
                  <div className="chiffre">
                    <span>{C.depenses}</span>
                    <b>{fcfa(m.totalDepenses)}</b>
                  </div>
                  <div className="chiffre" data-resultat>
                    <span>{C.resultat}</span>
                    <b>{fcfa(m.resultat)}</b>
                    <span>{C.resultatSous}</span>
                  </div>
                </div>
                <h3 className="sous-titre">{C.cloture}</h3>
                {m.cloture ? (
                  <>
                    <p className="mention">{C.clos(moisFr(mois), dateFr(m.cloture.le))}</p>
                    <FormAction action={rouvrirMois} args={[mois]} nom={C.rouvrir} bouton={C.rouvrir} reussite={C.rouvert} enfants={<div className="champ"><label htmlFor="motif-reouverture">{C.motifReouverture}</label><input id="motif-reouverture" name="motif" minLength={3} maxLength={280} required /></div>} />
                  </>
                ) : mois < courant ? (
                  <>
                    <p className="mention">{C.cloreAide}</p>
                    <BoutonAction action={cloreMois} args={[mois]} libelle={C.clore(moisFr(mois))} reussite={C.clotureFaite(moisFr(mois))} confirmer={C.cloreConfirmer} secondaire={false} />
                  </>
                ) : (
                  <p className="mention">{C.nonTermine}</p>
                )}
                <h3 className="sous-titre">{C.exports}</h3>
                <p className="mention">{C.exportsSous}</p>
                <div className="fin-pied">
                  <a className="bouton-2 bouton-petit" href={`/admins/finances/export?mois=${mois}&format=xlsx`} download>{C.exportExcel}</a>
                  <a className="bouton-2 bouton-petit" href={`/admins/finances/journal?mois=${mois}`} download>{C.exportJournal}</a>
                  <a className="bouton-2 bouton-petit" href={`/admins/finances/export?mois=${mois}&quoi=encaissements`} download>
                    {C.exportEncaissements}
                  </a>
                  <a className="bouton-2 bouton-petit" href={`/admins/finances/export?mois=${mois}&quoi=depenses`} download>
                    {C.exportDepenses}
                  </a>
                  <a className="bouton-2 bouton-petit" href={`/admins/finances/export?mois=${mois}&quoi=factures`} download>
                    {C.exportFactures}
                  </a>
                </div>
              </>
            )}
          </Bloc>

          <Bloc id="f-dep" titre={C.depenses} compte={m ? m.depenses.length : null} s={7} i={3}>
            {!m ? (
              indispo
            ) : (
              <>
                {m.depenses.length ? (
                  <div className="tableau-defile">
                    <table className="tableau">
                      <thead>
                        <tr>
                          <th scope="col">{F.depense.cols.jour}</th>
                          <th scope="col">{F.depense.cols.libelle}</th>
                          <th scope="col">{F.depense.cols.mode}</th>
                          <th scope="col">{F.depense.cols.montant}</th>
                          <th scope="col">{F.depense.cols.justificatif}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.depenses.map((d) => (
                          <tr key={d.id}>
                            <td data-col={F.depense.cols.jour}>{dateFr(d.jour)}</td>
                            <td data-col={F.depense.cols.libelle}>{d.libelle}</td>
                            <td data-col={F.depense.cols.mode}>{libelleMode(d.mode)}</td>
                            <td data-col={F.depense.cols.montant}>
                              <Montant n={d.montant} />
                            </td>
                            <td data-col={F.depense.cols.justificatif}>
                              <a className="lien" href={`/agents/agence/justificatif/${d.justificatif}`} target="_blank" rel="noopener">
                                {F.depense.voir}
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Vide texte={C.depensesVide} />
                )}
                {!m.cloture && (
                  <FormAction
                    action={ajouterDepense}
                    nom={F.depense.titre}
                    bouton={F.depense.ajouter}
                    reussite={F.depense.ajoutee}
                    enfants={
                      <>
                        <h3 className="sous-titre">{F.depense.titre}</h3>
                        <div className="champs">
                          <div className="champ">
                            <label htmlFor="dep-jour">{F.depense.jour}</label>
                            <input id="dep-jour" name="jour" type="date" max={aujourdhui} defaultValue={aujourdhui} required />
                          </div>
                          <div className="champ">
                            <label htmlFor="dep-mode">{F.depense.mode}</label>
                            <select id="dep-mode" name="mode" defaultValue="" required>
                              <option value="" disabled>
                                {F.champs.mode}
                              </option>
                              {MODES_DEPENSE.map((x) => (
                                <option key={x} value={x}>
                                  {F.modesDepense[x]}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="champ large">
                            <label htmlFor="dep-lib">{F.depense.libelle}</label>
                            <input id="dep-lib" name="libelle" maxLength={120} autoComplete="off" required />
                          </div>
                          <div className="champ">
                            <label htmlFor="dep-mt">{F.depense.montant}</label>
                            <input id="dep-mt" name="montant" inputMode="numeric" autoComplete="off" required />
                          </div>
                          <div className="champ">
                            <label htmlFor="dep-j">{F.depense.justificatif}</label>
                            <input id="dep-j" name="justificatif" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required />
                          </div>
                        </div>
                      </>
                    }
                  />
                )}
              </>
            )}
          </Bloc>

          <Bloc id="f-rap" titre={C.rapprochement} compte={ouvertes ? ouvertes.length : null} s={5} i={4}>
            {!ouvertes ? (
              indispo
            ) : (
              <>
                <p className="mention">{C.rapprochementSous(reglages?.relance ?? null)}</p>
                {ouvertes.length ? (
                  <ul className="liste">
                    {ouvertes.map((f) => {
                      const j = age(f.emise);
                      const relancer = reglages?.relance ? j >= reglages.relance : false;
                      return (
                        <li key={f.id} className="rangee" data-relance={relancer || undefined}>
                          <span className="texte">
                            <span className="titre">
                              {f.numero} · {f.client.nom}
                            </span>
                            <span className="meta">
                              {C.depuis(j)}
                              {f.paiements.some((p) => p.mode === "virement" && p.etat === "confirme") ? ` · ${C.virementsRecus(f.paiements.filter((p) => p.mode === "virement" && p.etat === "confirme").length)}` : ""}
                            </span>
                          </span>
                          {relancer && <span className="etat" data-e="a_regulariser">{C.aRelancer}</span>}
                          <Montant n={f.net - f.recu} />
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <Vide texte={[C.rapprochementVide, ""]} />
                )}
              </>
            )}
          </Bloc>

          <Bloc id="f-afa" titre={F.factures.aEmettre} compte={aFacturer ? aFacturer.length : null} s={12} i={5}>
            {!aFacturer ? (
              indispo
            ) : aFacturer.length ? (
              <ul className="liste">
                {aFacturer.map((d) => (
                  <li key={d.id} className="rangee">
                    <span className="texte">
                      <span className="titre">
                        {d.numero ?? ""} {d.client}
                      </span>
                      <span className="meta">{d.publie ? dateFr(d.publie) : ""}</span>
                    </span>
                    <Montant n={d.montant} />
                    <BoutonAction action={emettreFacture} args={[d.id]} libelle={F.factures.emettre} nom={`${F.factures.emettre} · ${d.client}`} reussite={F.factures.emiseOk} />
                  </li>
                ))}
              </ul>
            ) : (
              <Vide texte={[F.factures.aEmettreVide, ""]} />
            )}
          </Bloc>

          <Bloc id="f-fac" titre={F.factures.titre} compte={factures ? factures.length : null} s={12} i={6}>
            <p className="mention">{F.factures.sous}</p>
            {factures ? <ListeFactures factures={factures} admin vide={F.factures.vide} /> : indispo}
          </Bloc>
        </div>
      </div>
    </Enveloppe>
  );
}
