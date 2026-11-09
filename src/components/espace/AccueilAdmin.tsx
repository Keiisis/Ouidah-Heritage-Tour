import Image from "next/image";
import Link from "next/link";
import { chemin, espace as T, logoPasserelle, MODES_EN_LIGNE, section } from "@/content/espace";
import { donneesAdmin } from "@/lib/serveur/equipe/espace";
import { finances as F } from "@/content/espace-finances";
import { ArcSoleil, type RepereArc } from "./ArcSoleil";
import { MomentsSol } from "./MomentsSol";
import { Bloc, vars, Vide } from "./Bloc";
import { euroDeFcfa, fcfa } from "./outils";
import { Picto } from "./Picto";
import { Defile } from "./Defile";
import { Onglets } from "./Onglets";
import { Tete } from "./Tete";

// Accueil de l'admin (maquette E, recomposée d'après le critique du 02/11) : la course du soleil avec le total encaissé du
// jour dans le ciel, la ligne d'état des passerelles (390), puis Caisse (encaissé du mois ventilé par mode, en attente, à
// confirmer), Réservations, Demandes, Commandes, Activité : une grille sur ordinateur, des onglets collants en 390. Les
// passerelles en détail et « Éditer le site » restent sur ordinateur (en 390 : la ligne d'état et le menu). Données
// réelles seulement, lues par le serveur. La caisse inclut les paiements manuels confirmés. Lot L4 : les moments
// du jour de toute l'équipe se posent sur l'arc (initiale
// de l'agent), ceux qui attendent d'être clos sous l'horizon ; les demandes en attente disent leur agent.
export async function AccueilAdmin({ prenom }: { prenom: string }) {
  const d = await donneesAdmin();
  if (!d) return null;
  const A = T.admin;
  const indispo = <Vide texte={[T.vides.indisponible, ""]} />;
  const max = Math.max(1, ...(d.caisse?.parMode.map((x) => x.montant) ?? []));
  const reperes: RepereArc[] = (d.moments ?? []).map((m) => ({ id: m.id, debut: m.debut, fin: m.fin, type: m.type, fait: m.fait, quoi: [m.lieu, m.client].filter(Boolean).join(", "), agent: m.agent?.prenom ?? A.demandes.nonAttribuee, href: `${chemin("admins", "demandes")}/${m.dossier}` }));
  const voir = (id: string, texte: string = T.voirTout) => (
    <Link className="lien" href={chemin("admins", id)}>
      {texte}
    </Link>
  );

  return (
    <>
      <Tete
        titre={T.bonjour(d.tete.salut, prenom)}
        sous={
          <>
                {T.sousAdmin} <b>{d.tete.date}</b>, {d.tete.heure}.
          </>
        }
      />
      <ArcSoleil role="admins" ticks={d.caisse?.jour.flatMap((p) => p.minute === null ? [] : [p.minute])} moments={reperes}>
        <div className="lt-pile caisse-l">
          <p className="caisse-ciel">
            <span>{T.journee.caisse}</span>
            <b>{d.caisse ? fcfa(d.caisse.totalJour) : "–"}</b>
          </p>
          {!d.caisse ? (
            <p className="pile-vide">{T.vides.indisponible}</p>
          ) : d.caisse.jour.length ? (
            <ol>
              {d.caisse.jour.slice(0, 6).map((p, k) => (
                <li key={k}>
                  <span className="heure" title={p.minute === null ? T.journee.heureNonRenseignee : undefined}>{p.heure}</span>
                  <span>
                    {p.quoi}, {T.modes[p.mode]}
                  </span>
                  <span className="num">{fcfa(p.montant)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="pile-vide">{T.journee.caisseVide}</p>
          )}
        </div>
        <div className="lt-pile moments-l">
          <MomentsSol moments={reperes} rubriques={["aclore", "fait"]} />
        </div>
      </ArcSoleil>

      {d.passerelles && (
        <p className="ligne-passerelles">
          <span>{A.passerelles.ligne}</span>
          {(["active", "coupee", "nonconf"] as const).map((e) => {
            const n = d.passerelles?.filter((p) => p.etat === e).length ?? 0;
            return n ? (
              <span key={e} className="etat" data-e={e}>
                {A.passerelles.compte[e](n)}
              </span>
            ) : null;
          })}
          {voir("passerelles", A.passerelles.regler)}
        </p>
      )}

      <Onglets
        onglets={[
          {
            id: "caisse",
            titre: A.onglets.caisse,
            contenu: (
              <Bloc id="t-cai" titre={A.caisse.titre} s={5} i={2} lien={voir("finances")}>
                {!d.caisse ? (
                  indispo
                ) : (
                  <>
                    <div className="caisse-total">
                      <span>{A.caisse.encaisseMois(d.caisse.mois)}</span>
                      <b>
                        <Defile valeur={d.caisse.totalMois} format="fcfa" />
                      </b>
                      <span>{euroDeFcfa(d.caisse.totalMois)}</span>
                    </div>
                    <div className="resume">
                      <div>
                        <b>
                          <Defile valeur={d.caisse.totalJour} format="fcfa" rang={1} />
                        </b>
                        <span>{A.caisse.encaisseJour}</span>
                      </div>
                      <div>
                        <b>{d.attente ? <Defile valeur={d.attente.montant} format="fcfa" rang={2} /> : "–"}</b>
                        <span>
                          {A.caisse.attente}
                          {d.attente ? `, ${A.caisse.attenteDetail(d.attente.n)}` : ""}
                        </span>
                      </div>
                    </div>
                    <div className="a-confirmer">
                      <h3>{A.caisse.aConfirmer}</h3>
                      <p data-a-confirmer={d.caisse.aConfirmer.n}>{fcfa(d.caisse.aConfirmer.montant)} · {F.compta.aConfirmerSous(d.caisse.aConfirmer.n)}</p>
                    </div>
                    <h3 className="sous-titre">{A.caisse.parMode}</h3>
                    <ul className="modes">
                      {d.caisse.parMode.map((x) => {
                        const enLigne = MODES_EN_LIGNE.includes(x.mode);
                        return (
                          <li key={x.mode} data-mode={enLigne ? "ligne" : "manuel"}>
                            {enLigne ? (
                              <span className="logo-plaque">
                                <Image src={logoPasserelle(x.mode)} alt={T.modes[x.mode]} width={96} height={22} />
                              </span>
                            ) : (
                              <span className="mode-nom">{T.modes[x.mode]}</span>
                            )}
                            <span className="barre" style={vars({ "--v": (x.montant / max).toFixed(3) })} />
                            <span className="num">
                              {x.montant ? fcfa(x.montant) : A.caisse.aucun}
                              {x.n > 0 && <small>{A.caisse.paiements(x.n)}</small>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </Bloc>
            ),
          },
          {
            id: "reservations",
            titre: A.onglets.reservations,
            contenu: (
              <Bloc id="t-res" titre={A.reservations.titre} compte={d.reservations?.total ?? null} s={7} i={3} lien={voir("reservations")}>
                {!d.reservations ? (
                  indispo
                ) : d.reservations.liste.length ? (
                  <table className="tableau empile">
                    <caption className="invisible">{A.reservations.titre}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{A.reservations.cols.quand}</th>
                        <th scope="col">{A.reservations.cols.quoi}</th>
                        <th scope="col">{A.reservations.cols.qui}</th>
                        <th scope="col">{A.reservations.cols.etat}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.reservations.liste.map((r) => (
                        <tr key={r.id}>
                          <td>{r.quand}</td>
                          <td>
                            <b>{r.titre}</b>
                            <small className="sous-cell">{r.places}</small>
                          </td>
                          <td>{r.client}</td>
                          <td className="num">
                            {fcfa(r.montant)}
                            <small>
                              <span className="etat" data-e="paye">
                                {A.reservations.paye}
                              </span>
                            </small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <Vide texte={A.reservations.vide} />
                )}
              </Bloc>
            ),
          },
          {
            id: "demandes",
            titre: A.onglets.demandes,
            contenu: (
              <Bloc id="t-dem" titre={A.demandes.titre} compte={d.demandes?.total ?? null} s={5} i={4} lien={voir("demandes")}>
                {!d.demandes ? (
                  indispo
                ) : d.demandes.liste.length ? (
                  <>
                    {d.demandes.plusAncienne && <p className="mention">{A.demandes.plusAncienne(d.demandes.plusAncienne)}</p>}
                    <ul className="liste">
                      {d.demandes.liste.map((x) => (
                        <li key={x.id}>
                          <Link className="rangee" href={`${chemin("admins", "demandes")}/${x.id}`} aria-label={T.demandes.ouvrir(x.nom)}>
                            <span className={x.agent ? "avatar" : "avatar neutre"} aria-hidden="true">
                              {x.agent ? x.agent.slice(0, 1).toUpperCase() : "?"}
                            </span>
                            <span className="texte">
                              <span className="type">{x.type}</span>
                              <span className="titre">{x.nom}</span>
                              <span className="meta">
                                {x.recue}, {x.agent ? A.demandes.attribuee(x.agent) : A.demandes.nonAttribuee.toLowerCase()}
                              </span>
                            </span>
                            <span className="langue" title={T.langues[x.langue]}>
                              {x.langue}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {voir("demandes", A.demandes.attribuer)}
                  </>
                ) : (
                  <Vide texte={A.demandes.vide} />
                )}
              </Bloc>
            ),
          },
          {
            id: "commandes",
            titre: A.onglets.commandes,
            contenu: (
              <Bloc id="t-com" titre={A.commandes.titre} compte={d.commandes?.total ?? null} s={7} i={5} lien={voir("boutique")}>
                {!d.commandes ? (
                  indispo
                ) : d.commandes.liste.length ? (
                  <ul className="liste">
                    {d.commandes.liste.map((c) => (
                      <li key={c.reference}>
                        <div className="rangee">
                          <Picto nom="sac" />
                          <span className="texte">
                            <span className="titre">
                              {c.reference}, {c.client}
                            </span>
                            <span className="meta">
                              {A.commandes.articles(c.articles)}, {c.remise}, {c.quand}
                            </span>
                          </span>
                          {c.totalXof !== null && (
                            <span className="num">
                              {fcfa(c.totalXof)}
                              <small>{euroDeFcfa(c.totalXof)}</small>
                            </span>
                          )}
                          <span className="etat" data-e="confirmer">
                            {A.commandes.etat}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Vide texte={A.commandes.vide} />
                )}
              </Bloc>
            ),
          },
          {
            id: "activite",
            titre: A.onglets.activite,
            contenu: (
              <Bloc id="t-act" titre={A.activite.titre} s={3} i={7}>
                {!d.activite ? (
                  indispo
                ) : d.activite.length ? (
                  <ul className="fil-act">
                    {d.activite.map((a, k) => (
                      <li key={k}>
                        <time>{a.quand}</time>
                        <span>{a.texte}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Vide texte={A.activite.vide} />
                )}
              </Bloc>
            ),
          },
        ]}
        autres={
          <>
            <Bloc id="t-pas" titre={A.passerelles.titre} s={5} i={6} cache390 lien={voir("passerelles", A.passerelles.regler)}>
              <p className="mention">{A.passerelles.sous}</p>
              {!d.passerelles ? (
                indispo
              ) : (
                <ul className="liste">
                  {d.passerelles.map((p) => (
                    <li key={p.nom} className="passerelle">
                      <span className="logo-plaque">
                        <Image src={logoPasserelle(p.nom)} alt="" width={96} height={22} />
                      </span>
                      <span className="texte">
                        <b>{T.modes[p.nom]}</b>
                      </span>
                      <span className="etat" data-e={p.etat}>
                        {A.passerelles.etats[p.etat]}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Bloc>

            <Bloc id="t-edi" titre={A.editer.titre} s={4} i={8} cache390>
              <p className="mention">{A.editer.sous}</p>
              <div className="raccourcis">
                {A.editer.raccourcis.map(([id, detail]) => {
                  const x = section("admins", id);
                  return x ? (
                    <Link key={id} href={chemin("admins", id)}>
                      <Picto nom={x.picto} />
                      <span>
                        {x.nom}
                        <small>{detail}</small>
                      </span>
                    </Link>
                  ) : null;
                })}
              </div>
            </Bloc>
          </>
        }
      />
    </>
  );
}
