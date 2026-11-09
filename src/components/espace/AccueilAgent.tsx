import Link from "next/link";
import { chemin, espace as T } from "@/content/espace";
import { deux, terrain } from "@/content/espace-terrain";
import { msg } from "@/content/espace-messages";
import { billetsAccueil, commandesAccueil, donneesAgent, type Retrait } from "@/lib/serveur/equipe/espace";
import { ArcSoleil, type RepereArc } from "./ArcSoleil";
import { Bloc, Vide } from "./Bloc";
import { MomentsSol } from "./MomentsSol";
import { Onglets } from "./Onglets";
import { Picto } from "./Picto";
import { Tete } from "./Tete";
import { Volets } from "./terrain/Volets";

// Accueil de l'agent (maquette E, recomposée d'après le critique du 02/11) : la course du soleil, et sous l'horizon ce qui
// est en cours (événement à billets du jour), à clore (retrait boutique reçu avant aujourd'hui, pas encore traité) et
// ensuite (retraits reçus aujourd'hui : deux lignes, le reste replié) ; le bandeau des billets ; puis Demandes, Alertes,
// Commandes, Clients (onglets collants en 390). Données réelles seulement, lues par le serveur ; chaque bloc a son état
// vide. Lot L4 : ses moments du jour se posent sur l'arc (à venir), sous l'horizon (passés) ou « À clore » ; ses demandes
// attribuées encore nouvelles et les clients de ses moments du jour remplissent leurs blocs. Lot terrain L5 : le bandeau
// compte les vraies entrées contrôlées (compteur à volets « 00 / 64 ») ; « Commandes à préparer » suit la préparation.
const ligneRetrait = (r: Retrait) => T.journee.retrait(r.reference, r.client);

export async function AccueilAgent({ prenom }: { prenom: string }) {
  const [d, billets, commandes] = await Promise.all([donneesAgent(), billetsAccueil(), commandesAccueil()]);
  if (!d) return null;
  const A = T.agent, J = T.journee, N = msg.notifications;
  const evts = d.evenements ?? [];
  const retraits = d.retraits?.liste ?? [];
  const aClore = retraits.filter((r) => r.avant);
  const ensuite = retraits.filter((r) => !r.avant);
  const indisponible = !d.evenements || !d.retraits || !d.moments;
  const reperes: RepereArc[] = (d.moments ?? []).map((m) => ({ id: m.id, debut: m.debut, fin: m.fin, type: m.type, fait: m.fait, quoi: [m.lieu, m.client].filter(Boolean).join(", "), agent: null, href: `${chemin("agents", "demandes")}/${m.dossier}` }));

  return (
    <>
      <Tete
        titre={T.bonjour(d.tete.salut, prenom)}
        sous={
          <>
            {T.sousAgent} <b>{d.tete.date}</b>, {d.tete.heure}.
          </>
        }
      />
      <ArcSoleil role="agents" moments={reperes}>
        <div className="lt-pile">
          <MomentsSol
            moments={reperes}
            rubriques={["encours", "aclore", "ensuite", "fait"]}
            indisponible={indisponible}
            vide={J.rienAujourdhui}
            fixes={{
              encours: evts.map((e) => ({ cle: e.slug, texte: J.evenement(e.titre, e.vendus), picto: "billet" })),
              aclore: aClore.map((r) => ({ cle: r.reference, texte: `${ligneRetrait(r)}, ${J.recu(r.recu)}`, picto: "sac" })),
              ensuite: ensuite.map((r) => ({ cle: r.reference, texte: ligneRetrait(r), picto: "sac" })),
            }}
          />
        </div>
      </ArcSoleil>

      {billets ? (
        billets.length > 0 && (
          <section className="esp-bandeau construit" aria-label={A.billets.titre}>
            {billets.map((e) => (
              <div key={`${e.evenement}|${e.occurrence}`} className="bandeau-billets" data-edition={`${e.evenement}|${e.occurrence}`}>
                <Picto nom="billet" />
                <b className="evt">{e.titre}</b>
                <span className="compte-billets" data-entrees-accueil>
                  <Volets texte={`${deux(e.entrees)} / ${e.vendus}`} libelle={terrain.billets.compteur(e.entrees, e.vendus)} />
                  <span aria-hidden="true">{terrain.billets.entreesTitre.toLowerCase()}</span>
                </span>
                <Link className="bouton accent" href={chemin("agents", "billets")}>
                  {A.billets.ouvrir}
                </Link>
              </div>
            ))}
          </section>
        )
      ) : (
        evts.length > 0 && (
          <section className="esp-bandeau construit" aria-label={A.billets.titre}>
            {evts.map((e) => (
              <div key={e.slug} className="bandeau-billets">
                <Picto nom="billet" />
                <b className="evt">{e.titre}</b>
                <span className="compte-billets">
                  <span aria-hidden="true">–</span>
                  <span aria-hidden="true">/</span>
                  <b>{e.vendus}</b> <span>{A.billets.vendus}</span>
                </span>
                <Link className="bouton accent" href={chemin("agents", "billets")}>
                  {A.billets.ouvrir}
                </Link>
              </div>
            ))}
            <p className="mention">{T.vides.indisponible}</p>
          </section>
        )
      )}

      <Onglets
        onglets={[
          {
            id: "demandes",
            titre: A.onglets.demandes,
            contenu: (
              <Bloc id="t-dem" titre={A.demandes.titre} compte={d.demandes?.total ?? null} s={7} i={2} lien={<Link className="lien" href={chemin("agents", "demandes")}>{T.voirTout}</Link>}>
                {!d.demandes ? (
                  <Vide texte={[T.vides.indisponible, ""]} />
                ) : d.demandes.liste.length ? (
                  <ul className="liste">
                    {d.demandes.liste.map((x) => (
                      <li key={x.id}>
                        <Link className="rangee" href={`${chemin("agents", "demandes")}/${x.id}`} aria-label={T.demandes.ouvrir(x.nom)}>
                          <span className="texte">
                            <span className="type">{x.type}</span>
                            <span className="titre">{x.nom}</span>
                            <span className="meta">{T.demandes.recue(x.recue.toLowerCase())}</span>
                          </span>
                          <span className="langue" title={T.langues[x.langue]}>
                            {x.langue}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Vide texte={A.demandes.vide} />
                )}
              </Bloc>
            ),
          },
          {
            id: "alertes",
            titre: A.onglets.alertes,
            contenu: (
              <Bloc id="t-ale" titre={A.alertes.titre} compte={d.alertes?.total ?? null} s={5} i={3} lien={<Link className="lien" href={chemin("agents", "notifications")}>{T.voirTout}</Link>}>
                {!d.alertes ? (
                  <Vide texte={[T.vides.indisponible, ""]} />
                ) : d.alertes.liste.length ? (
                  <ul className="liste">
                    {d.alertes.liste.map((n) => (
                      <li key={n.id} data-alerte={n.id}>
                        <Link className="rangee" href={n.accessible ? `${chemin("agents", "demandes")}/${n.dossier}` : chemin("agents", "notifications")}>
                          <Picto nom="cloche" />
                          <span className="texte">
                            <span className="type">{N.types[n.type] ?? n.type}</span>
                            <span className="titre">{n.accessible ? (N.textes[n.type] ?? ((c: string) => c))(n.client ?? N.clientInconnu) : N.dossierInaccessible}</span>
                            <span className="meta">{n.recue}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Vide texte={A.alertes.vide} />
                )}
              </Bloc>
            ),
          },
          {
            id: "commandes",
            titre: A.onglets.commandes,
            contenu: (
              <>
              <Bloc id="t-ret" titre={A.retraits.titre} compte={d.retraits?.total ?? null} s={7} i={4} lien={<Link className="lien" href={chemin("agents", "commandes")}>{T.voirTout}</Link>}>
                {!d.retraits ? (
                  <Vide texte={[T.vides.indisponible, ""]} />
                ) : d.retraits.liste.length ? (
                  <ul className="liste">
                    {d.retraits.liste.map((r) => (
                      <li key={r.reference}>
                        <div className="rangee">
                          <Picto nom="sac" />
                          <span className="texte">
                            <span className="titre">{r.reference}</span>
                            <span className="meta">
                              {r.client}, {A.retraits.articles(r.articles)}, {J.recu(r.recu)}
                            </span>
                          </span>
                          <span className="etat" data-e="confirmer">
                            {A.retraits.etat}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Vide texte={A.retraits.vide} />
                )}
              </Bloc>
              <Bloc id="t-pre" titre={terrain.commandes.accueilTitre} compte={commandes?.total ?? null} s={5} i={5} lien={<Link className="lien" href={chemin("agents", "commandes")}>{T.voirTout}</Link>}>
                {!commandes ? (
                  <Vide texte={[T.vides.indisponible, ""]} />
                ) : commandes.liste.length ? (
                  <ul className="liste" id="commandes-a-preparer">
                    {commandes.liste.map((c) => (
                      <li key={c.reference} data-commande={c.reference}>
                        <Link className="rangee" href={chemin("agents", "commandes")}>
                          <Picto nom={c.mode === "livraison" ? "voiture" : "sac"} />
                          <span className="texte">
                            <span className="titre">{c.reference}</span>
                            <span className="meta">
                              {c.client}, {A.retraits.articles(c.articles)}, {c.mode === "livraison" ? terrain.commandes.livraison : terrain.commandes.retrait}
                            </span>
                          </span>
                          <span className="etat" data-e={c.etat}>
                            {terrain.commandes.etats[c.etat]}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Vide texte={terrain.commandes.vide} />
                )}
              </Bloc>
            </>
            ),
          },
          {
            id: "clients",
            titre: A.onglets.clients,
            contenu: (
              <Bloc id="t-cli" titre={A.clients.titre} compte={d.clients?.length ?? null} s={12} i={6} lien={<Link className="lien" href={chemin("agents", "clients")}>{T.voirTout}</Link>}>
                {!d.clients ? (
                  <Vide texte={[T.vides.indisponible, ""]} />
                ) : d.clients.length ? (
                  <ul className="liste">
                    {d.clients.map((c) => (
                      <li key={c.dossier}>
                        <Link className="rangee" href={`${chemin("agents", "demandes")}/${c.dossier}`} aria-label={T.demandes.ouvrir(c.nom)}>
                          <Picto nom="personne" />
                          <span className="texte">
                            <span className="titre">{c.nom}</span>
                            <span className="meta">{A.clients.moments(c.moments)}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Vide texte={A.clients.vide} />
                )}
              </Bloc>
            ),
          },
        ]}
      />
    </>
  );
}
