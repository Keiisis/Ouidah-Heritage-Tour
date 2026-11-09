import Link from "next/link";
import { redirect } from "next/navigation";
import { espace as T } from "@/content/espace";
import { JOURS_PISTES, pilotage as P, PRIORITES } from "@/content/espace-pilotage";
import { iso, jourOuidah } from "@/lib/jours";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { suivrePiste } from "@/lib/serveur/equipe/pilotage/actions";
import { type Piste, pistes } from "@/lib/serveur/equipe/pilotage/lectures";
import { joursPistes } from "@/lib/serveur/equipe/pilotage/regles";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { Bloc, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { dateFr } from "../finances/commun";
import { ilYa } from "../outils";
import { Tete } from "../Tete";
import { FormAction } from "./Envoi";
import "../finances/finances.css";
import "./pilotage.css";

// Pistes de l'agent, rendues sous <Suspense> après la session : ses demandes sans réponse depuis le délai choisi
// (?jours=3|7|14), ses devis envoyés et non payés depuis ce délai, et les rappels échus. Priorité et rappel se règlent sur
// chaque piste ; le serveur vérifie que le dossier est bien le sien. Un admin y voit toutes les demandes.
const X = P.pistes;

const motif = (p: Piste) => (p.motif === "sans_reponse" ? X.sansReponse(p.depuis) : p.motif === "devis_ouvert" ? X.devisOuvert(p.depuis) : X.rappelSeul);

export async function EcranPistes({ recherche }: { recherche: Promise<{ jours?: string | string[] }> }) {
  const s = await exigerRole("agents");
  if (!s) redirect("/agents");
  const minute = minuteServeur();
  const ms = minute * 60_000;
  const jours = joursPistes((await recherche).jours);
  const l = await pistes(s, jours, ms);
  const aujourdhui = iso(jourOuidah(ms));

  return (
    <Enveloppe role="agents" session={s} actif="pistes" minute={minute}>
      <Tete titre={X.titre} sous={X.sous} />
      <div className="esp-finances esp-pilotage">
        <nav className="pil-periodes" aria-label={X.delai}>
          <span className="mention">{X.delai}</span>
          {JOURS_PISTES.map((j) => (
            <Link key={j} className="bouton-2 bouton-petit" href={`/agents/pistes?jours=${j}`} aria-current={j === jours ? "page" : undefined}>
              {X.jours(j)}
            </Link>
          ))}
        </nav>
        <div className="esp-grille">
          <Bloc id="pi-lis" titre={X.liste} compte={l ? l.length : null} s={12} i={1}>
            {!l ? (
              <Vide texte={[T.vides.indisponible, ""]} />
            ) : l.length ? (
              <ul className="liste" id="liste-pistes">
                {l.map((p) => (
                  <li key={p.id} data-piste={p.id} data-motif={p.motif} data-priorite={p.priorite}>
                    <div className="rangee pil-piste">
                      <span className="texte">
                        <span className="type">{motif(p)}</span>
                        <span className="titre">{p.nom}</span>
                        <span className="meta">
                          {X.recue(ilYa(p.recue, minute))} · {p.dernierContact ? X.dernierContact(ilYa(p.dernierContact, minute)) : X.aucunContact}
                        </span>
                        <span className="pil-badges">
                          <span className="etat" data-e={`priorite-${p.priorite}`}>
                            {X.priorite} : {X.priorites[p.priorite]}
                          </span>
                          {p.rappel && (
                            <span className="etat" data-e={p.rappelDu ? "a_confirmer" : "cree"} data-rappel={p.rappel}>
                              {p.rappel < aujourdhui ? X.rappelEchu : p.rappel === aujourdhui ? X.rappelJour : X.rappelLe(dateFr(p.rappel))}
                            </span>
                          )}
                        </span>
                      </span>
                      <Link className="lien" href={`/agents/demandes/${p.id}`}>
                        {X.ouvrir}
                      </Link>
                    </div>
                    <FormAction
                      action={suivrePiste}
                      args={[p.id]}
                      bouton={X.enregistrer}
                      reussite={X.ok}
                      garder
                      className="pil-suivi"
                      nom={`${X.priorite} · ${p.nom}`}
                      enfants={
                        <div className="champs">
                          <div className="champ">
                            <label htmlFor={`pr-${p.id}`}>{X.priorite}</label>
                            <select id={`pr-${p.id}`} name="priorite" defaultValue={p.priorite}>
                              {PRIORITES.map((x) => (
                                <option key={x} value={x}>
                                  {X.priorites[x]}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="champ">
                            <label htmlFor={`ra-${p.id}`}>{X.rappel}</label>
                            <input id={`ra-${p.id}`} name="rappel" type="date" min={aujourdhui} defaultValue={p.rappel && p.rappel >= aujourdhui ? p.rappel : ""} />
                          </div>
                        </div>
                      }
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <Vide texte={X.vide} />
            )}
            <p className="mention">{X.mention}</p>
          </Bloc>
        </div>
      </div>
    </Enveloppe>
  );
}
