import { redirect } from "next/navigation";
import { espace as T } from "@/content/espace";
import { pilotage as P } from "@/content/espace-pilotage";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { rapport } from "@/lib/serveur/equipe/pilotage/lectures";
import { courrielRapport, lignesRapport, titreSemaine } from "@/lib/serveur/equipe/pilotage/rapport";
import { voie } from "@/lib/serveur/equipe/messages/envoi";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { Bloc, vars, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { ilYa } from "../outils";
import { Tete } from "../Tete";
import { BoutonsRapport } from "./BoutonsRapport";
import { ReglageTache } from "./ReglageTache";
import { lireTaches } from "@/lib/serveur/equipe/pilotage/taches";
import { lire } from "@/lib/serveur/equipe/finances/lectures";
import { transversal as X } from "@/content/transversal";
import "../finances/finances.css";
import "./pilotage.css";

// Rapport hebdomadaire (admin), rendu sous <Suspense> : admin connecté seulement. La période écoulée (samedi → vendredi à
// Ouidah) tirée de la base, l'aperçu exact de l'e-mail (iframe sans script ni lien actif), l'envoi de test à soi-même et
// l'envoi aux admins actifs et le réglage de l'envoi du samedi. Les tentatives réservées et incertaines restent visibles.
const R = P.rapport;

export async function EcranRapport() {
  const s = await exigerRole("admins");
  if (!s) redirect("/admins");
  const minute = minuteServeur();
  const [r, v, reglages] = await Promise.all([rapport(minute * 60_000), voie(), lireTaches()]);
  const envois = r ? await lire<{ id: string; destinataire: string; etat: keyof typeof X.rapport.etats }>(`rapports_envois?select=id,destinataire,etat&semaine=eq.${r.debut}&order=cree_le.desc&limit=100`) : null;
  const envoiPossible = v !== null;

  return (
    <Enveloppe role="admins" session={s} actif="rapport" minute={minute}>
      <Tete titre={R.titre} sous={R.sous} />
      <div className="esp-finances esp-pilotage">
        {!r ? (
          <div className="esp-grille">
            <Bloc id="ra-chi" titre={R.chiffres} s={12} i={1}>
              <Vide texte={[T.vides.indisponible, ""]} />
            </Bloc>
          </div>
        ) : (
          <>
            <h2 className="pil-semaine" id="rapport-semaine" data-debut={r.debut}>
              {titreSemaine(r)}
            </h2>
            <div className="esp-grille">
              <Bloc id="ra-chi" titre={R.chiffres} s={5} i={1}>
                <dl className="pil-lignes" id="rapport-chiffres">
                  {lignesRapport(r).map(([l, x], k) => (
                    <div key={l} style={vars({ "--k": k })}>
                      <dt>{l}</dt>
                      <dd>{x}</dd>
                    </div>
                  ))}
                </dl>
              </Bloc>

              <Bloc id="ra-env" titre={R.envoi} s={7} i={2}>
                <p className="mention" id="rapport-dernier">
                  {r.dernierEnvoi ? R.dernier(ilYa(r.dernierEnvoi.quand, minute), r.dernierEnvoi.nombre) : R.jamais}
                </p>
                {envoiPossible ? (
                  <BoutonsRapport />
                ) : (
                  <p className="mention" data-smtp="non">
                    {R.sansSmtp}
                  </p>
                )}
                <p className="mention">{X.rapport.auto}</p>
                {reglages ? <ReglageTache nom="rapport_actif" actif={reglages.rapport_actif} libelle={X.rapport.activer} /> : <p className="aide" data-reglage="indisponible">{T.vides.indisponible}</p>}
                <h3>{X.rapport.historique}</h3>
                {envois?.length ? <ul>{envois.map((e) => <li key={e.id}>{e.destinataire} : {X.rapport.etats[e.etat]}</li>)}</ul> : <p className="aide">{envois ? X.rapport.jamais : T.vides.indisponible}</p>}
              </Bloc>

              <Bloc id="ra-ape" titre={R.apercu} s={12} i={3}>
                <iframe className="pil-apercu" title={R.apercuTitre} sandbox="" srcDoc={courrielRapport(r, null, false).html} />
              </Bloc>
            </div>
          </>
        )}
      </div>
    </Enveloppe>
  );
}
