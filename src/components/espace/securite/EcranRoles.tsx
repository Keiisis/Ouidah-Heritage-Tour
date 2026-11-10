import { redirect } from "next/navigation";
import { espace as T } from "@/content/espace";
import { securite as S } from "@/content/espace-securite";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { DROITS } from "@/lib/serveur/equipe/partage";
import { changerDroits } from "@/lib/serveur/equipe/securite/actions";
import { lireMembres } from "@/lib/serveur/equipe/securite/lectures";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { Bloc, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { Tete } from "../Tete";
import { FormSec } from "./Envoi";
import "./securite.css";

// Rôles et droits (lot « securite », admins/roles), rendu sous <Suspense> : admin connecté seulement. Ce que chaque droit
// ouvre, puis les droits effectifs de chaque agent (droits.ts : enregistrés, sinon ceux cochés d'avance à l'invitation),
// modifiables ici. Le serveur les applique partout (exigerDroit) : écrans et actions des demandes, liens de paiement,
// billets et commandes boutique. Un admin a tous les droits : sa ligne le dit, sans case.
const R = S.roles;
const libelle = Object.fromEntries(T.equipe.droits.map(([k, l]) => [k, l]));

export async function EcranRoles() {
  const s = await exigerRole("admins");
  if (!s) redirect("/admins");
  const membres = await lireMembres();
  const agents = membres?.filter((m) => m.role === "agent" && m.etat !== "supprime") ?? [];
  const admins = membres?.filter((m) => m.role === "admin" && m.etat !== "supprime") ?? [];
  return (
    <Enveloppe role="admins" session={s} actif="roles" minute={minuteServeur()}>
      <Tete titre={R.titre} sous={R.sous} />
      <div className="esp-securite">
        <div className="esp-grille">
          <Bloc id="r-reg" titre={R.regles} s={12} i={1}>
            <ul className="regles-droits" id="regles-droits">
              {DROITS.map((d) => (
                <li key={d} data-droit={d}>
                  <b>{libelle[d] ?? d}</b>
                  <span>{R.ouvre[d]}</span>
                </li>
              ))}
            </ul>
            <p className="mention">{R.admin}</p>
            <p className="mention">{R.toujours}</p>
          </Bloc>

          <Bloc id="r-mem" titre={R.membres} compte={membres ? agents.length : null} s={12} i={2}>
            {!membres ? (
              <Vide texte={[T.vides.indisponible, ""]} />
            ) : (
              <div id="droits-membres">
                {!agents.length && <Vide texte={R.vide} />}
                {agents.map((m) => {
                  const qui = `${m.prenom} ${m.nom}`;
                  return (
                    <div key={m.id} className="droits-membre" data-membre={m.id}>
                      <div className="qui">
                        <b>{qui}</b>
                        <span className="sous-cell">{R.etats[m.etat] ?? m.etat}</span>
                      </div>
                      <FormSec
                        action={changerDroits}
                        args={[m.id]}
                        bouton={R.enregistrer}
                        reussite={R.enregistre(qui)}
                        garder
                        nom={R.enregistrerDe(qui)}
                        enfants={
                          <fieldset className="champ large">
                            <legend className="invisible">{S.champs.droits}</legend>
                            <div className="puces">
                              {DROITS.map((d) => (
                                <label className="puce" key={d}>
                                  <input type="checkbox" name="droits" value={d} defaultChecked={m.droits[d]} data-droit={d} />
                                  {libelle[d] ?? d}
                                </label>
                              ))}
                            </div>
                          </fieldset>
                        }
                      />
                    </div>
                  );
                })}
                {admins.map((m) => (
                  <div key={m.id} className="droits-membre" data-membre={m.id} data-admin>
                    <div className="qui">
                      <b>
                        {m.prenom} {m.nom}
                      </b>
                      <span className="sous-cell">{T.equipe.roles.admin}</span>
                    </div>
                    <span className="etat" data-e="moi">
                      {R.tous}
                    </span>
                  </div>
                ))}
                <p className="mention">{R.defaut}</p>
              </div>
            )}
          </Bloc>
        </div>
      </div>
    </Enveloppe>
  );
}
