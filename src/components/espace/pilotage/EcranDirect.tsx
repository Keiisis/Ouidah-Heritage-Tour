import { redirect } from "next/navigation";
import { espace as T } from "@/content/espace";
import { DIRECT_SECONDES, pilotage as P } from "@/content/espace-pilotage";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { direct } from "@/lib/serveur/equipe/pilotage/lectures";
import { modeEco } from "@/lib/serveur/equipe/reglages/public";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { lireAudience } from "@/lib/serveur/mesure";
import { Bloc, Vide } from "../Bloc";
import { pasDe } from "../rafraichir";
import { Enveloppe } from "../Enveloppe";
import { hm, ilYa, minutesOuidah } from "../outils";
import { Tete } from "../Tete";
import { Direct } from "../terrain/Direct";
import "../finances/finances.css";
import "./pilotage.css";

// En direct (admin), rendu sous <Suspense> : admin connecté seulement. Le journal récent de l'équipe et les membres dont
// une session est ouverte (equipe_sessions), relus par le serveur toutes les DIRECT_SECONDES secondes (60 au moins, ×3 en mode
// économie) tant que l'onglet est visible et l'admin présent (useRafraichir : même rendu, même contrôle de session). Pages vues du jour tirées de l'audience maison
// (visiteurs qui l'ont acceptée seulement) ; aucun « visiteur en ligne » : la mesure ne suit personne.
const D = P.direct;
const nombre = new Intl.NumberFormat("fr-FR");

export async function EcranDirect() {
  const s = await exigerRole("admins");
  if (!s) redirect("/admins");
  const minute = minuteServeur();
  const [v, a, eco] = await Promise.all([direct(minute * 60_000), lireAudience(1, minute * 60_000), modeEco()]);
  const indispo = <Vide texte={[T.vides.indisponible, ""]} />;

  return (
    <Enveloppe role="admins" session={s} actif="direct" minute={minute}>
      <Tete titre={D.titre} sous={D.sous(pasDe(DIRECT_SECONDES * 1000, eco) / 1000)} />
      <Direct secondes={DIRECT_SECONDES} />
      <div className="esp-finances esp-pilotage">
        <p className="mention pil-relu" id="direct-relu" data-minute={minute}>
          <span className="pil-pouls" aria-hidden="true" />
          {D.relu(hm(minutesOuidah(minute)))}
        </p>
        <div className="esp-grille">
          <Bloc id="di-con" titre={D.connectes} compte={v ? v.connectes.length : null} s={5} i={1}>
            {!v ? (
              indispo
            ) : v.connectes.length ? (
              <>
                <ul className="liste" id="direct-connectes">
                  {v.connectes.map((c) => (
                    <li key={c.id} data-membre={c.id}>
                      <div className="rangee">
                        <span className="avatar" aria-hidden="true">
                          {c.nom
                            .split(" ")
                            .map((x) => x[0] ?? "")
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </span>
                        <span className="texte">
                          <span className="titre">{c.nom}</span>
                          <span className="meta">
                            {T.equipe.roles[c.role]} · {D.vu(ilYa(c.vu, minute))} · {D.appareils(c.appareils)}
                          </span>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mention">{D.connectesMention}</p>
              </>
            ) : (
              <Vide texte={D.connectesVide} />
            )}
          </Bloc>

          <Bloc id="di-jou" titre={D.journal} s={7} i={2}>
            {!v ? (
              indispo
            ) : v.journal.length ? (
              <ul className="fil-act" id="direct-journal">
                {v.journal.map((j) => (
                  <li key={j.id} data-action={j.action}>
                    <time dateTime={j.quand}>{ilYa(j.quand, minute)}</time>
                    <span>
                      <b>{P.actions[j.action] ?? j.action}</b> · {j.qui ?? D.systeme}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Vide texte={D.journalVide} />
            )}
          </Bloc>

          <Bloc id="di-vis" titre={D.visiteurs} s={12} i={3}>
            {!a ? (
              indispo
            ) : (
              <div className="pil-audience" data-audience="branchee" data-vues-jour={a.total}>
                {a.total ? (
                  <div className="chiffre" data-vues-jour-chiffre>
                    <b>{nombre.format(a.total)}</b>
                    <span>{D.vuesJour(a.total)}</span>
                  </div>
                ) : (
                  <Vide texte={D.visiteursVide} />
                )}
                <p className="mention">{D.visiteursMention}</p>
              </div>
            )}
          </Bloc>
        </div>
      </div>
    </Enveloppe>
  );
}
