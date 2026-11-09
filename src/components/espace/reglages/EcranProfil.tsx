import { redirect } from "next/navigation";
import { espace as T } from "@/content/espace";
import { LANGUES_REGLAGES, reglages as R } from "@/content/espace-reglages";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { changerMotDePasseProfil, enregistrerProfil, fermerAutresSessions, fermerSessionProfil } from "@/lib/serveur/equipe/reglages/actions";
import { lireProfilMoi, type Moi } from "@/lib/serveur/equipe/reglages/lectures";
import { THEMES } from "@/lib/serveur/equipe/reglages/regles";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { Bloc, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { Tete } from "../Tete";
import { quand } from "./commun";
import { BoutonAction, FormAction } from "./Envoi";
import "./reglages.css";

// Profil (lot « reglages ») : le compte connecté seulement (agent, ou admin entré par /agents). Coordonnées, langues
// (la première sert aux e-mails), thème ; mot de passe (l'actuel exigé, 12 caractères au moins, autres sessions fermées) ;
// sessions ouvertes de ce compte. Le serveur ne lit jamais un identifiant de compte du navigateur.
const P = R.profil;

function Coordonnees({ m }: { m: Moi }) {
  return (
    <>
      <div className="champs">
        <div className="champ">
          <label htmlFor="r-pro-prenom">{P.prenom}</label>
          <input id="r-pro-prenom" name="prenom" maxLength={80} defaultValue={m.prenom} autoComplete="given-name" required />
        </div>
        <div className="champ">
          <label htmlFor="r-pro-nom">{P.nom}</label>
          <input id="r-pro-nom" name="nom" maxLength={80} defaultValue={m.nom} autoComplete="family-name" required />
        </div>
        <div className="champ">
          <label htmlFor="r-pro-email">{P.email}</label>
          <input id="r-pro-email" type="email" value={m.email} readOnly aria-describedby="r-pro-email-a" />
          <span className="aide" id="r-pro-email-a">
            {P.emailAide}
          </span>
        </div>
        <div className="champ">
          <label htmlFor="r-pro-tel">{P.telephone}</label>
          <input id="r-pro-tel" name="telephone" type="tel" maxLength={32} defaultValue={m.telephone ?? ""} autoComplete="tel" aria-describedby="r-pro-tel-a" />
          <span className="aide" id="r-pro-tel-a">
            {P.telephoneAide}
          </span>
        </div>
      </div>
      <fieldset>
        <legend>{P.langues}</legend>
        <div className="champs">
          <div className="champ">
            <label htmlFor="r-pro-langue">{P.langueCourriels}</label>
            <select id="r-pro-langue" name="langue" defaultValue={m.langues[0] ?? "FR"} aria-describedby="r-pro-langue-a">
              {LANGUES_REGLAGES.map((l) => (
                <option key={l} value={l}>
                  {T.langues[l] ?? l}
                </option>
              ))}
            </select>
            <span className="aide" id="r-pro-langue-a">
              {P.langueCourrielsAide}
            </span>
          </div>
          <div className="champ">
            <label htmlFor="r-pro-theme">{P.theme}</label>
            <select id="r-pro-theme" name="theme" defaultValue={m.theme}>
              {THEMES.map((t) => (
                <option key={t} value={t}>
                  {P.themes[t]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <fieldset>
          <legend>{P.autres}</legend>
          <div className="cases">
            {LANGUES_REGLAGES.map((l) => (
              <label key={l} className="case">
                <input type="checkbox" name="autres" value={l} defaultChecked={m.langues.slice(1).includes(l)} />
                {T.langues[l] ?? l}
              </label>
            ))}
          </div>
        </fieldset>
      </fieldset>
    </>
  );
}

function MotDePasse() {
  return (
    <div className="champs">
      <div className="champ large">
        <label htmlFor="r-pro-ancien">{P.ancien}</label>
        <input id="r-pro-ancien" name="ancien" type="password" maxLength={200} autoComplete="current-password" required />
      </div>
      <div className="champ">
        <label htmlFor="r-pro-nouveau">{P.nouveau}</label>
        <input id="r-pro-nouveau" name="nouveau" type="password" minLength={12} maxLength={200} autoComplete="new-password" required aria-describedby="r-pro-mdp-a" />
      </div>
      <div className="champ">
        <label htmlFor="r-pro-confirmation">{P.confirmation}</label>
        <input id="r-pro-confirmation" name="confirmation" type="password" minLength={12} maxLength={200} autoComplete="new-password" required aria-describedby="r-pro-mdp-a" />
      </div>
      <p className="aide champ large" id="r-pro-mdp-a">
        {P.mdpSous}
      </p>
    </div>
  );
}

export async function EcranProfil() {
  const s = await exigerRole("agents");
  if (!s) redirect("/agents");
  const p = await lireProfilMoi();
  const autres = p?.sessions?.filter((x) => !x.courante) ?? [];
  return (
    <Enveloppe role="agents" session={s} actif="profil" minute={minuteServeur()}>
      <Tete titre={P.titre} sous={P.sous} />
      <div className="esp-reglages">
        <div className="esp-grille">
          {!p ? (
            <Bloc id="r-pro" titre={P.identite} s={12} i={1}>
              <Vide texte={[T.vides.indisponible, ""]} />
            </Bloc>
          ) : (
            <>
              <Bloc id="r-pro" titre={P.identite} s={7} i={1}>
                <FormAction action={enregistrerProfil} nom={P.identite} bouton={R.enregistrer} reussite={P.enregistre} enfants={<Coordonnees m={p.moi} />} />
              </Bloc>
              <Bloc id="r-pro-mdp" titre={P.mdp} s={5} i={2}>
                <FormAction action={changerMotDePasseProfil} nom={P.mdp} bouton={P.changer} reussite={{ nombre: "mdp" }} garder={false} enfants={<MotDePasse />} />
              </Bloc>
              <Bloc id="r-pro-ses" titre={P.sessions} compte={p.sessions ? p.sessions.length : null} s={12} i={3}>
                <p className="mention">{P.sessionsSous}</p>
                {!p.sessions ? (
                  <Vide texte={[T.vides.indisponible, ""]} />
                ) : (
                  <>
                    <ul className="sessions">
                      {p.sessions.map((x) => (
                        <li key={x.id} data-session-ouverte={x.courante ? "courante" : "autre"}>
                          <span className="texte">
                            <b>{x.courante ? P.cetAppareil : P.ouverte(quand(x.cree_le))}</b>
                            <span className="meta">{x.courante ? `${P.ouverte(quand(x.cree_le))}, ${P.vue(quand(x.vu_le))}` : P.vue(quand(x.vu_le))}</span>
                          </span>
                          {!x.courante && <BoutonAction action={fermerSessionProfil} args={[x.id]} libelle={P.fermer} nom={P.fermerDe(quand(x.cree_le))} reussite={P.fermee} />}
                        </li>
                      ))}
                    </ul>
                    {autres.length > 0 ? <BoutonAction action={fermerAutresSessions} libelle={P.fermerAutres} reussite={{ nombre: "sessions" }} /> : <p className="aide">{P.aucuneAutre}</p>}
                  </>
                )}
              </Bloc>
            </>
          )}
        </div>
      </div>
    </Enveloppe>
  );
}
