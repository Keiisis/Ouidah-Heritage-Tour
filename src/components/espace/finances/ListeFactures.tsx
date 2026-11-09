import { espace as T } from "@/content/espace";
import { finances as F } from "@/content/espace-finances";
import { emettreAvoir, envoyerFacture } from "@/lib/serveur/equipe/finances/actions";
import { mentionsAgence } from "@/lib/serveur/equipe/finances/documents";
import type { Facture } from "@/lib/serveur/equipe/finances/lectures";
import { fcfa } from "../outils";
import { Vide } from "../Bloc";
import { dateFr, Etat, libelleMode, Montant } from "./commun";
import { BoutonAction, FormAction } from "./Envoi";

// Factures (et leurs avoirs, paiements, reçu) en liste repliable : le détail s'ouvre sous sa ligne (<details> natif).
// Admin : avoir possible. Agent : ses dossiers seulement (lu par le serveur), envoi par e-mail et reçu PDF.
export async function ListeFactures({ factures, admin, vide }: { factures: Facture[]; admin: boolean; vide: readonly [string, string] }) {
  if (!factures.length) return <Vide texte={vide} />;
  const mentions = await mentionsAgence();
  const Fa = F.factures;
  return (
    <div className="liste-factures">
      {factures.map((f) => (
        <details key={f.id} id={`facture-${f.id}`} className="facture" data-facture={f.numero}>
          <summary aria-label={Fa.ouvrir(f.numero)}>
            <span>
              <span className="numero">{f.numero}</span>
              <span className="meta">
                {Fa.nature} · {dateFr(f.emise)}
              </span>
            </span>
            <span className="client">
              {f.client.nom}
              <span className="meta">{T.langues[f.client.langue] ?? f.client.langue}</span>
            </span>
            <Montant n={f.montant} />
            <Etat e={f.statut} textes={F.etatsFacture} />
          </summary>
          <div className="facture-corps">
            <h3>{Fa.lignes}</h3>
            <div className="tableau-defile">
              <table className="tableau">
                <thead>
                  <tr>
                    <th scope="col">{T.devis.designation}</th>
                    <th scope="col">{T.devis.qte}</th>
                    <th scope="col">{T.devis.pu}</th>
                    <th scope="col">{T.devis.montant}</th>
                  </tr>
                </thead>
                <tbody>
                  {f.lignes.map((l, i) => (
                    <tr key={i}>
                      <td data-col={T.devis.designation}>{l.libelle}</td>
                      <td data-col={T.devis.qte} className="num">{l.quantite}</td>
                      <td data-col={T.devis.pu} className="num">{fcfa(l.prix_unitaire)}</td>
                      <td data-col={T.devis.montant} className="num">{fcfa(l.quantite * l.prix_unitaire)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="chiffres">
              <div className="chiffre">
                <span>{T.devis.total}</span>
                <b>{fcfa(f.montant)}</b>
              </div>
              <div className="chiffre">
                <span>{Fa.net}</span>
                <b>{fcfa(f.net)}</b>
              </div>
              <div className="chiffre">
                <span>{Fa.recu}</span>
                <b>{fcfa(f.recu)}</b>
              </div>
            </div>
            {f.statut === "a_regulariser" && <p className="ecart">{Fa.ecart(fcfa(f.ecart))}</p>}

            <h3>{F.avoir.liste}</h3>
            {f.avoirs.length ? (
              <ul className="liste">
                {f.avoirs.map((a) => (
                  <li key={a.id} className="rangee">
                    <span className="texte">
                      <span className="titre">{a.numero}</span>
                      <span className="meta">
                        {dateFr(a.cree)} · {a.motif}
                      </span>
                    </span>
                    <span className="num">− {fcfa(a.montant)}</span>
                    <a className="bouton-2 bouton-petit" href={`/agents/factures/pdf/${f.id}/avoirs/${a.id}`} target="_blank" rel="noopener" aria-label={F.avoir.pdfDe(a.numero)}>{F.avoir.pdf}</a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mention">{F.avoir.aucun}</p>
            )}

            <h3>{Fa.paiementsLies}</h3>
            {f.paiements.length ? (
              <ul className="liste">
                {f.paiements.map((p) => (
                  <li key={p.id} className="rangee">
                    <span className="texte">
                      <span className="titre">{p.inverse ? F.manuels.inverseDe : libelleMode(p.mode)}</span>
                      <span className="meta">
                        {dateFr(p.recuLe)}
                        {p.reference ? ` · ${p.reference}` : ""}
                      </span>
                    </span>
                    <Montant n={p.montant} devise={p.devise} />
                    <Etat e={p.etat} textes={F.etatsPaiement} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mention">{Fa.aucunPaiement}</p>
            )}

            <h3>{Fa.mentions}</h3>
            <p className="mentions">{mentions.join(" · ")}</p>
            <p className="mention">{Fa.vuClient}</p>
            <div className="fin-pied">
              <a className="bouton-2 bouton-petit" href={`/agents/factures/pdf/${f.id}`} target="_blank" rel="noopener" aria-label={Fa.pdfDe(f.numero)}>{Fa.pdf}</a>
              <BoutonAction action={envoyerFacture} args={[f.id]} libelle={Fa.envoyer} reussite={Fa.envoiOk} />
              {f.statut === "payee" && (
                <a className="bouton-2 bouton-petit" href={`/agents/factures/recu/${f.id}`} target="_blank" rel="noopener" aria-label={Fa.recuDe(f.numero)}>
                  {Fa.recuPdf}
                </a>
              )}
            </div>
            {f.envoyee && <p className="mention">{Fa.envoyee(dateFr(f.envoyee))}</p>}

            {admin && f.net > 0 && (
              <FormAction
                action={emettreAvoir}
                args={[f.id]}
                nom={`${F.avoir.titre} · ${f.numero}`}
                bouton={F.avoir.emettre}
                reussite={F.avoir.emisOk}
                enfants={
                  <>
                    <h3>{F.avoir.titre}</h3>
                    <p className="mention">{F.avoir.sous}</p>
                    <div className="champs">
                      <div className="champ">
                        <label htmlFor={`av-m-${f.id}`}>{F.avoir.montant}</label>
                        <input id={`av-m-${f.id}`} name="montant" inputMode="numeric" autoComplete="off" required />
                      </div>
                      <div className="champ large">
                        <label htmlFor={`av-r-${f.id}`}>{F.avoir.motif}</label>
                        <input id={`av-r-${f.id}`} name="motif" maxLength={280} autoComplete="off" required aria-describedby={`av-a-${f.id}`} />
                        <span className="aide" id={`av-a-${f.id}`}>
                          {F.avoir.motifAide}
                        </span>
                      </div>
                    </div>
                  </>
                }
              />
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
