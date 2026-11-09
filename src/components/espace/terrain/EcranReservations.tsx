import { redirect } from "next/navigation";
import { espace as T } from "@/content/espace";
import { deux, terrain } from "@/content/espace-terrain";
import { jourOuidah } from "@/lib/jours";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { lireReservations } from "@/lib/serveur/equipe/terrain/billets";
import { Bloc, vars, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { Picto } from "../Picto";
import { Tete } from "../Tete";
import { Direct } from "./Direct";
import { Volets } from "./Volets";
import "./terrain.css";

// Écran « Réservations et billets » des admins (lot terrain L5), rendu sous <Suspense> : admin connecté seulement, sinon
// retour à l'entrée /admins (un agent n'y voit rien). Événements OHT à billets, éditions, places vendues et restantes,
// participants payés, entrées contrôlées relues toutes les 20 s, export CSV par édition. Textes et dates formatés ici, par
// le serveur ; aucune donnée d'exemple.
const K = terrain.reservations;
const FUSEAU = T.ouidah.fuseau;
const laDate = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const lePaye = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: FUSEAU });
const dateDe = (a: string, b: string) => (a === b ? laDate.format(Date.parse(`${a}T12:00:00Z`)) : T.dossier.du(laDate.format(Date.parse(`${a}T12:00:00Z`)), laDate.format(Date.parse(`${b}T12:00:00Z`))));
const MOMENT = { encours: K.enCours, avenir: K.aVenir, passee: K.passee };

export async function EcranReservations() {
  const s = await exigerRole("admins");
  if (!s) redirect("/admins");
  const minute = minuteServeur(); // l'heure de la requête, lue après la session (comme les autres écrans)
  const evts = await lireReservations(jourOuidah(minute * 60_000));
  return (
    <Enveloppe role="admins" session={s} actif="reservations" minute={minute}>
      <Tete titre={K.titre} sous={K.sous} />
      <div className="esp-grille esp-terrain">
        {!evts || !evts.length ? (
          <Bloc id="t-res" titre={K.titre} s={12} i={1}>
            <Vide texte={evts ? K.vide : [T.vides.indisponible, ""]} />
          </Bloc>
        ) : (
          evts.map((e, k) => (
            <Bloc key={e.slug} id={`t-res-${e.slug}`} titre={e.titre} compte={e.editions.length} s={12} i={k + 1}>
              <ul className="editions">
                {e.editions.map((ed) => {
                  const date = dateDe(ed.occurrence, ed.fin);
                  const places = ed.participants.reduce((t, p) => t + p.quantite, 0);
                  return (
                    <li key={ed.occurrence} className="edition" data-edition={`${e.slug}|${ed.occurrence}`}>
                      <div className="haut">
                        <h3>{date}</h3>
                        <span className="etat" data-e={ed.moment}>
                          {MOMENT[ed.moment]}
                        </span>
                        <a className="bouton-2 bouton-petit" href={`/admins/reservations/csv?evenement=${e.slug}&occurrence=${ed.occurrence}`} download aria-label={K.csvDe(e.titre, date)} data-csv>
                          <Picto nom="document" />
                          {K.csv}
                        </a>
                      </div>
                      <dl className="chiffres">
                        <div>
                          <dt>{K.vendues}</dt>
                          <dd data-vendues>
                            <Volets texte={String(ed.vendues)} taille="moyen" />
                          </dd>
                        </div>
                        <div>
                          <dt>{K.restantes}</dt>
                          <dd data-restantes>{ed.restantes === null ? <span className="meta">{K.sansJauge}</span> : <Volets texte={String(ed.restantes)} taille="moyen" />}</dd>
                        </div>
                        <div>
                          <dt>{K.entrees}</dt>
                          <dd data-entrees>
                            <Volets texte={`${deux(ed.entrees)} / ${ed.vendues}`} taille="moyen" libelle={terrain.billets.compteur(ed.entrees, ed.vendues)} />
                          </dd>
                        </div>
                      </dl>
                      <div className="horizon-entrees" style={vars({ "--f": ed.vendues ? Math.min(1, ed.entrees / ed.vendues).toFixed(3) : 0 })} aria-hidden="true">
                        <i />
                        <span>
                          <b />
                        </span>
                      </div>
                      {ed.attente > 0 && <p className="meta">{K.attente(ed.attente)}</p>}
                      <details open={ed.moment !== "passee" || undefined}>
                        <summary>
                          <Picto nom="personnes" />
                          {K.participants} · {K.places(places)}
                        </summary>
                        {ed.participants.length ? (
                          <table className="tableau empile">
                            <caption className="invisible">
                              {K.participants}, {date}
                            </caption>
                            <thead>
                              <tr>
                                {Object.values(K.cols).map((c) => (
                                  <th scope="col" key={c}>
                                    {c}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {ed.participants.map((p) => (
                                <tr key={p.id} data-reservation={p.id}>
                                  <td data-l={K.cols.qui}>
                                    <b>{p.nom}</b>
                                    <small>{p.email}</small>
                                  </td>
                                  <td data-l={K.cols.formule}>{p.formule}</td>
                                  <td data-l={K.cols.places}>{p.quantite}</td>
                                  <td data-l={K.cols.paye}>{p.paye_le ? lePaye.format(p.paye_le) : ""}</td>
                                  <td data-l={K.cols.entrees} data-entrees-resa>
                                    {p.entrees} / {p.quantite}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="meta">{K.aucunParticipant}</p>
                        )}
                      </details>
                    </li>
                  );
                })}
              </ul>
            </Bloc>
          ))
        )}
        <p className="mention" style={{ gridColumn: "1 / -1" }}>
          {K.direct}
        </p>
      </div>
      <Direct />
    </Enveloppe>
  );
}
