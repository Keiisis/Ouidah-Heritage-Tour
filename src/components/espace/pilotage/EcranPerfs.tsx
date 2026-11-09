import Link from "next/link";
import { redirect } from "next/navigation";
import type { Role } from "@/content/equipe";
import { espace as T } from "@/content/espace";
import { PERIODES_PERFS, pilotage as P } from "@/content/espace-pilotage";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { type Perf, performances } from "@/lib/serveur/equipe/pilotage/lectures";
import { periodePerfs } from "@/lib/serveur/equipe/pilotage/regles";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { Bloc, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { euroDeFcfa, fcfa } from "../outils";
import { Tete } from "../Tete";
import "../finances/finances.css";
import "./pilotage.css";

// Performances, rendues sous <Suspense> après la session. Admin (/admins/perfs) : chaque agent actif dans l'ordre
// alphabétique, jamais classé. Agent (/agents/performances) : ses propres chiffres seulement (la requête ne porte que sur
// lui). Période choisie par l'adresse (?periode=30|90|365), lue après la session.
const F = P.perfs;
const nombre = new Intl.NumberFormat("fr-FR");
const delai = (p: Perf) => (p.delaiMoyen === null ? F.sansReponse : T.duree(p.delaiMoyen / 60_000));

export async function EcranPerfs({ role, recherche }: { role: Role; recherche: Promise<{ periode?: string | string[] }> }) {
  const s = await exigerRole(role);
  if (!s) redirect(`/${role}`);
  const minute = minuteServeur();
  const jours = periodePerfs((await recherche).periode);
  const admin = role === "admins";
  const actif = admin ? "perfs" : "performances";
  const l = await performances(jours, minute * 60_000, admin ? null : s);
  const c = F.cols;
  const moi = l?.[0];

  return (
    <Enveloppe role={role} session={s} actif={actif} minute={minute}>
      <Tete titre={admin ? F.titreAdmin : F.titreAgent} sous={admin ? F.sousAdmin : F.sousAgent} />
      <div className="esp-finances esp-pilotage">
        <nav className="pil-periodes" aria-label={F.periode}>
          {PERIODES_PERFS.map((p) => (
            <Link key={p} className="bouton-2 bouton-petit" href={`/${role}/${actif}?periode=${p}`} aria-current={p === jours ? "page" : undefined}>
              {F.jours(p)}
            </Link>
          ))}
        </nav>
        <div className="esp-grille">
          <Bloc id="pe-chi" titre={F.jours(jours)} s={12} i={1}>
            {!l ? (
              <Vide texte={[T.vides.indisponible, ""]} />
            ) : admin ? (
              l.length ? (
                <>
                  <div className="tableau-defile">
                    <table className="tableau" id="perfs-agents">
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
                        {l.map((p) => (
                          <tr key={p.id} data-agent={p.id}>
                            <td data-col={c.agent}>
                              <b>{p.nom}</b>
                            </td>
                            <td data-col={c.attribues} data-attribues>
                              {nombre.format(p.attribues)}
                            </td>
                            <td data-col={c.traites} data-traites>
                              {nombre.format(p.traites)}
                            </td>
                            <td data-col={c.delai} data-delai>
                              {delai(p)}
                              {p.reponses > 0 && <span className="sous-cell">{F.surReponses(p.reponses)}</span>}
                            </td>
                            <td data-col={c.devis} data-devis>
                              {nombre.format(p.devis)}
                            </td>
                            <td data-col={c.encaisse} className="num" data-encaisse>
                              {fcfa(p.encaisse)}
                              <small>{euroDeFcfa(p.encaisse)}</small>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mention">{F.ordre}</p>
                </>
              ) : (
                <Vide texte={F.vide} />
              )
            ) : moi ? (
              <div className="chiffres" id="perfs-moi" data-agent={moi.id}>
                <div className="chiffre" data-attribues>
                  <span>{c.attribues}</span>
                  <b>{nombre.format(moi.attribues)}</b>
                </div>
                <div className="chiffre" data-traites>
                  <span>{c.traites}</span>
                  <b>{nombre.format(moi.traites)}</b>
                </div>
                <div className="chiffre" data-delai>
                  <span>{c.delai}</span>
                  <b>{delai(moi)}</b>
                  {moi.reponses > 0 && <span>{F.surReponses(moi.reponses)}</span>}
                </div>
                <div className="chiffre" data-devis>
                  <span>{c.devis}</span>
                  <b>{nombre.format(moi.devis)}</b>
                </div>
                <div className="chiffre" data-encaisse>
                  <span>{c.encaisse}</span>
                  <b>{fcfa(moi.encaisse)}</b>
                  <span>{euroDeFcfa(moi.encaisse)}</span>
                </div>
              </div>
            ) : (
              <Vide texte={[T.vides.indisponible, ""]} />
            )}
            <ul className="pil-definitions">
              {F.definitions.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </Bloc>
        </div>
      </div>
    </Enveloppe>
  );
}
