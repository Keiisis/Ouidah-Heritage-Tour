import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { espace as T, logoPasserelle } from "@/content/espace";
import { reglages as R } from "@/content/espace-reglages";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { basculerPasserelle, deplacerPasserelle } from "@/lib/serveur/equipe/reglages/actions";
import { lirePasserelles } from "@/lib/serveur/equipe/reglages/lectures";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { saisiePossible } from "@/lib/serveur/paiement/cles";
import { Bloc, vars, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { Tete } from "../Tete";
import { Cles } from "./Cles";
import { Etat } from "./commun";
import { BoutonAction } from "./Envoi";
import "./reglages.css";

// Passerelles et paiements (lot « reglages ») : les 5 passerelles, leur ordre, leur activation et l'état de leurs clés
// (« configurée » ou « manquante », saisie ici ou variable du serveur, jamais la clé ni un extrait), puis leur saisie
// (Cles.tsx, chiffrée par le serveur). Une passerelle sans clés ne s'active pas : le bouton est inactif ici et le serveur
// refuse la requête forgée. Admin seulement, sinon retour à l'entrée /admins.
const P = R.passerelles;

export async function EcranPasserelles() {
  const s = await exigerRole("admins");
  if (!s) redirect("/admins");
  const l = await lirePasserelles();
  const saisie = saisiePossible();
  const proposees = l?.filter((x) => x.active && x.cles).length ?? 0;
  return (
    <Enveloppe role="admins" session={s} actif="passerelles" minute={minuteServeur()}>
      <Tete titre={P.titre} sous={P.sous} />
      <div className="esp-reglages">
        <div className="esp-grille">
          <Bloc id="r-pas" titre={P.liste} compte={l ? proposees : null} s={12} i={1}>
            {!l ? (
              <Vide texte={[T.vides.indisponible, ""]} />
            ) : (
              <>
                <p className="mention" data-proposees={proposees}>
                  {proposees ? P.actives(proposees) : P.aucune}
                </p>
                <div className="tableau-defile">
                  <table className="tableau">
                    <thead>
                      <tr>
                        <th scope="col">{P.cols.passerelle}</th>
                        <th scope="col">{P.cols.cles}</th>
                        <th scope="col">{P.cols.mode}</th>
                        <th scope="col">{P.cols.etat}</th>
                        <th scope="col">{P.cols.ordre}</th>
                        <th scope="col">
                          <span className="invisible">{P.cols.actions}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {l.map((p, k) => {
                        const nom = T.modes[p.nom];
                        return (
                          <tr key={p.nom} className="ligne-arrivee" style={vars({ "--k": k })} data-passerelle={p.nom} data-active={p.active} data-cles={p.cles}>
                            <td data-col={P.cols.passerelle}>
                              <span className="passerelle-nom">
                                <span className="logo-plaque">
                                  <Image src={logoPasserelle(p.nom)} alt="" width={96} height={22} />
                                </span>
                                <b>{nom}</b>
                              </span>
                            </td>
                            <td data-col={P.cols.cles}>
                              <Etat e={p.cles ? "configuree" : "manquante"} texte={p.cles ? R.configuree : R.manquante} />
                              {!p.cles && <span className="sous-cell">{P.manquantes(p.champs.filter((c) => !c.source && !c.champ.endsWith("_SANDBOX")).length)}</span>}
                            </td>
                            <td data-col={P.cols.mode}>{p.test === null ? P.sansMode : p.test ? <Etat e="test" texte={P.sandbox} /> : P.reel}</td>
                            <td data-col={P.cols.etat}>
                              <Etat e={p.active ? "active" : "coupee"} texte={p.active ? P.active : P.coupee} />
                              {p.active && !p.cles && <span className="sous-cell">{P.sansCles}</span>}
                            </td>
                            <td data-col={P.cols.ordre}>
                              <span className="actions">
                                <BoutonAction action={deplacerPasserelle} args={[p.nom, "haut"]} libelle={P.monter} nom={P.monterDe(nom)} reussite={P.ordre_ok} inactif={k === 0} />
                                <BoutonAction action={deplacerPasserelle} args={[p.nom, "bas"]} libelle={P.descendre} nom={P.descendreDe(nom)} reussite={P.ordre_ok} inactif={k === l.length - 1} />
                              </span>
                            </td>
                            <td className="actions">
                              {p.active ? (
                                <BoutonAction action={basculerPasserelle} args={[p.nom, false]} libelle={P.couper} nom={P.couperDe(nom)} reussite={P.coupee_ok} />
                              ) : (
                                <BoutonAction action={basculerPasserelle} args={[p.nom, true]} libelle={P.activer} nom={P.activerDe(nom)} reussite={P.active_ok} secondaire={false} inactif={!p.cles} />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="aide">{P.clesAide}</p>
              </>
            )}
          </Bloc>
          {l && (
            <Bloc id="r-cles" titre={P.clesTitre} s={12} i={2}>
              <p className="mention">{P.clesSous}</p>
              {l.map((p) => (
                <section key={p.nom} className="reg-cles-passerelle" aria-labelledby={`r-cles-${p.nom}`} data-passerelle-cles={p.nom}>
                  <h3 id={`r-cles-${p.nom}`}>{T.modes[p.nom]}</h3>
                  <Cles porteur={p.nom} champs={p.champs} saisie={saisie} nom={T.modes[p.nom]} />
                </section>
              ))}
            </Bloc>
          )}
          <Bloc id="r-coo" titre={P.coordonnees} s={12} i={3}>
            <p className="mention">{P.coordonneesSous}</p>
            <div className="reg-pied">
              <Link className="bouton-2" href="/admins/manuels">
                {P.coordonneesLien}
              </Link>
            </div>
          </Bloc>
        </div>
      </div>
    </Enveloppe>
  );
}
