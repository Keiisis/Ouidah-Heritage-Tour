import { reglages as R } from "@/content/espace-reglages";
import type { Porteur } from "@/lib/serveur/paiement/cles";
import { effacerCle, enregistrerCle } from "@/lib/serveur/equipe/reglages/actions";
import type { EtatCle } from "@/lib/serveur/equipe/reglages/lectures";
import { Etat } from "./commun";
import { BoutonAction, FormAction } from "./Envoi";

// Saisie des clés d'une passerelle (ou du connecteur e-MECeF), admin seulement : pour chaque champ, l'état (configurée ou
// manquante), sa source (saisie ici ou variable du serveur) et un formulaire jamais pré-rempli. Aucune valeur n'arrive
// au navigateur ; le serveur relit la session, le rôle et la valeur à chaque envoi.
const C = R.cles;

export function Cles({ porteur, champs, saisie, nom }: { porteur: Porteur; champs: EtatCle[]; saisie: boolean; nom: string }) {
  return (
    <ul className="reg-cles" data-cles-porteur={porteur}>
      {champs.map(({ champ, source }) => {
        const libelle = C.libelles[champ] ?? champ;
        const id = `r-cle-${porteur}-${champ}`;
        const choix = champ.endsWith("_SANDBOX") || champ === "EMCF_ENVIRONNEMENT";
        return (
          <li key={champ} data-champ={champ} data-source={source ?? "absente"}>
            <p className="reg-cle-tete">
              <b>{libelle}</b> <code>{champ}</code> <Etat e={source ? "configuree" : "manquante"} texte={source ? R.configuree : R.manquante} />
              {source && <span className="sous-cell">{C.source[source]}</span>}
            </p>
            {saisie && (
              <FormAction
                action={enregistrerCle}
                args={[porteur, champ]}
                nom={C.enregistrerDe(`${nom} · ${libelle}`)}
                bouton={C.enregistrer}
                reussite={C.enregistree}
                garder={false}
                enfants={
                  <div className="champ">
                    <label htmlFor={id}>{C.nouvelle}</label>
                    {choix ? (
                      <select id={id} name="valeur" defaultValue="" aria-describedby={`${id}-a`}>
                        <option value="" disabled>
                          {C.choisir}
                        </option>
                        {C.choixDe(champ).map((v) => (
                          <option key={v} value={v}>
                            {C.choix[v]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input id={id} name="valeur" type="password" autoComplete="off" spellCheck={false} maxLength={4096} aria-describedby={`${id}-a`} />
                    )}
                    <span className="aide" id={`${id}-a`}>
                      {C.nouvelleAide}
                    </span>
                  </div>
                }
              />
            )}
            {source === "admin" && <BoutonAction action={effacerCle} args={[porteur, champ]} libelle={C.effacer} nom={C.effacerDe(`${nom} · ${libelle}`)} reussite={C.effacee} confirmer={C.effacerConfirmer} />}
          </li>
        );
      })}
      {!saisie && <li className="aide">{C.sansSel}</li>}
    </ul>
  );
}
