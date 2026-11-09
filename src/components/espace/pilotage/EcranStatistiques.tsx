import { redirect } from "next/navigation";
import { espace as T } from "@/content/espace";
import { MOIS_STATS, PERIODE_AUDIENCE, pilotage as P } from "@/content/espace-pilotage";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { statistiques } from "@/lib/serveur/equipe/pilotage/lectures";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { lireAudience } from "@/lib/serveur/mesure";
import { Bloc, vars, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { moisFr } from "../finances/commun";
import { euroDeFcfa, fcfa } from "../outils";
import { Tete } from "../Tete";
import "../finances/finances.css";
import "./pilotage.css";

// Statistiques (admin), rendues sous <Suspense> : admin connecté seulement, sinon retour à l'entrée /admins. Chiffres
// métier tirés de la base à la requête (demandes, devis envoyés, encaissé, billets, conversion, pays et langues), puis
// l'audience maison (audience_jours) : pages vues par jour, pages, langues, provenance, questions posées à l'assistant.
// Elle ne compte que les visiteurs qui l'ont acceptée : l'écran le dit et renvoie à Vercel Web Analytics pour le reste.
const S = P.statistiques;
const nombre = new Intl.NumberFormat("fr-FR");
const jourCourt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const jourFr = (j: string) => jourCourt.format(new Date(`${j}T00:00:00Z`));
const nomChemin = (c: string) => (c === "/" ? S.accueil : c === "autre" ? S.autreAdresse : c);
const pourcent = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const regions = new Intl.DisplayNames(["fr"], { type: "region" });
const nomPays = (code: string | null) => {
  if (!code) return S.sansPays;
  try {
    return regions.of(code) ?? code;
  } catch {
    return code;
  }
};

function Repartition({ id, lignes, nom, unite = S.clients }: { id: string; lignes: [string, number][]; nom: (k: string) => string; unite?: (n: number) => string }) {
  const max = Math.max(1, ...lignes.map(([, n]) => n));
  return (
    <ul className="pil-barres" id={id}>
      {lignes.map(([k, n], i) => (
        <li key={k} style={vars({ "--k": i })}>
          <span className="pil-nom">{nom(k)}</span>
          <span className="barre" style={vars({ "--v": (n / max).toFixed(3) })} />
          <span className="num">{unite(n)}</span>
        </li>
      ))}
    </ul>
  );
}

export async function EcranStatistiques() {
  const s = await exigerRole("admins");
  if (!s) redirect("/admins");
  const minute = minuteServeur();
  const [st, a] = await Promise.all([statistiques(minute * 60_000), lireAudience(PERIODE_AUDIENCE, minute * 60_000)]);
  const maxJour = Math.max(1, ...(a?.jours.map(([, n]) => n) ?? []));
  const indispo = <Vide texte={[T.vides.indisponible, ""]} />;
  const max = Math.max(1, ...(st?.mois.map((m) => m.demandes) ?? []));
  const total = st?.mois.reduce((t, m) => ({ demandes: t.demandes + m.demandes, devis: t.devis + m.devis, encaisse: t.encaisse + m.encaisse, billets: t.billets + m.billets }), { demandes: 0, devis: 0, encaisse: 0, billets: 0 });
  const c = S.cols;

  return (
    <Enveloppe role="admins" session={s} actif="statistiques" minute={minute}>
      <Tete titre={S.titre} sous={S.sous(MOIS_STATS)} />
      <div className="esp-finances esp-pilotage">
        <div className="esp-grille">
          <Bloc id="st-mois" titre={S.mois} s={12} i={1}>
            {!st || !total ? (
              indispo
            ) : (
              <>
                <div className="tableau-defile">
                  <table className="tableau" id="stats-mois">
                    <thead>
                      <tr>
                        <th scope="col">{c.mois}</th>
                        <th scope="col">{c.demandes}</th>
                        <th scope="col">{c.devis}</th>
                        <th scope="col">{c.encaisse}</th>
                        <th scope="col">{c.billets}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {st.mois.map((m, i) => (
                        <tr key={m.mois} data-mois={m.mois} className="ligne-arrivee" style={vars({ "--k": i })}>
                          <td data-col={c.mois}>
                            <b className="pil-mois">{moisFr(m.mois)}</b>
                          </td>
                          <td data-col={c.demandes}>
                            <span className="pil-compte">
                              <b data-demandes>{nombre.format(m.demandes)}</b>
                              <span className="barre" style={vars({ "--v": (m.demandes / max).toFixed(3) })} aria-hidden="true" />
                            </span>
                          </td>
                          <td data-col={c.devis} data-devis>
                            {nombre.format(m.devis)}
                          </td>
                          <td data-col={c.encaisse} className="num" data-encaisse>
                            {fcfa(m.encaisse)}
                            <small>{euroDeFcfa(m.encaisse)}</small>
                          </td>
                          <td data-col={c.billets} data-billets>
                            {nombre.format(m.billets)}
                          </td>
                        </tr>
                      ))}
                      <tr className="pil-total">
                        <td data-col={c.mois}>
                          <b>{S.total}</b>
                        </td>
                        <td data-col={c.demandes}>
                          <b>{nombre.format(total.demandes)}</b>
                        </td>
                        <td data-col={c.devis}>
                          <b>{nombre.format(total.devis)}</b>
                        </td>
                        <td data-col={c.encaisse} className="num">
                          {fcfa(total.encaisse)}
                          <small>{euroDeFcfa(total.encaisse)}</small>
                        </td>
                        <td data-col={c.billets}>
                          <b>{nombre.format(total.billets)}</b>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <ul className="pil-definitions">
                  {S.definitions.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </>
            )}
          </Bloc>

          <Bloc id="st-conv" titre={S.conversion} s={4} i={2}>
            {!st ? (
              indispo
            ) : st.conversion.recues ? (
              <div className="chiffre" data-conversion>
                <b>{S.taux(pourcent.format((100 * st.conversion.payees) / st.conversion.recues))}</b>
                <span>{S.tauxSous(st.conversion.payees, st.conversion.recues)}</span>
              </div>
            ) : (
              <Vide texte={S.tauxVide} />
            )}
          </Bloc>

          <Bloc id="st-pays" titre={S.pays} s={4} i={3}>
            {!st ? indispo : st.pays.length ? <Repartition id="stats-pays" lignes={st.pays.map(([k, n]) => [k ?? "", n])} nom={(k) => nomPays(k || null)} /> : <Vide texte={S.repartitionVide} />}
          </Bloc>

          <Bloc id="st-langues" titre={S.langues} s={4} i={4}>
            {!st ? indispo : st.langues.length ? <Repartition id="stats-langues" lignes={st.langues} nom={(k) => T.langues[k] ?? k} /> : <Vide texte={S.repartitionVide} />}
          </Bloc>

          <Bloc id="st-audience" titre={S.audience} s={12} i={5}>
            {!a ? (
              indispo
            ) : (
              <div className="pil-audience" data-audience="branchee" data-vues={a.total}>
                <div className="chiffres">
                  <div className="chiffre" data-vues-periode>
                    <b>{nombre.format(a.total)}</b>
                    <span>{S.vuesPeriode(PERIODE_AUDIENCE)}</span>
                  </div>
                  <div className="chiffre" data-questions>
                    <b>{nombre.format(a.questions)}</b>
                    <span>{S.questions}</span>
                  </div>
                </div>
                {a.total ? (
                  <figure className="pil-courbe">
                    <figcaption>{S.vuesJours}</figcaption>
                    <ol className="pil-jours" id="audience-jours">
                      {a.jours.map(([j, n], i) => (
                        <li key={j} data-jour={j} data-vues={n} title={S.jourVues(jourFr(j), n)} style={vars({ "--v": (n / maxJour).toFixed(3), "--k": i })}>
                          <span className="barre-v" aria-hidden="true" />
                          <span className="invisible">{S.jourVues(jourFr(j), n)}</span>
                        </li>
                      ))}
                    </ol>
                    <p className="pil-bornes" aria-hidden="true">
                      <span>{jourFr(a.jours[0][0])}</span>
                      <span>{S.maxJour(maxJour)}</span>
                      <span>{jourFr(a.jours[a.jours.length - 1][0])}</span>
                    </p>
                  </figure>
                ) : (
                  <Vide texte={a.jamais ? S.audienceVide : S.audienceVidePeriode(PERIODE_AUDIENCE)} />
                )}
                <p className="mention">{S.audienceMention}</p>
              </div>
            )}
          </Bloc>

          {a && a.total > 0 && (
            <>
              <Bloc id="st-pages" titre={S.pages} s={4} i={6}>
                <Repartition id="audience-pages" lignes={a.pages} nom={nomChemin} unite={S.vues} />
              </Bloc>
              <Bloc id="st-langues-vues" titre={S.languesVues} s={4} i={7}>
                <Repartition id="audience-langues" lignes={a.langues} nom={(k) => T.langues[k] ?? k} unite={S.vues} />
              </Bloc>
              <Bloc id="st-sources" titre={S.sources} s={4} i={8}>
                <Repartition id="audience-sources" lignes={a.sources} nom={(k) => S.nomsSources[k] ?? k} unite={S.vues} />
              </Bloc>
            </>
          )}
        </div>
      </div>
    </Enveloppe>
  );
}
