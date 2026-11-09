import { redirect } from "next/navigation";
import { espace as T } from "@/content/espace";
import { LANGUES_MSG, msg } from "@/content/espace-messages";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { lireAbonnes, lireNumeros } from "@/lib/serveur/equipe/messages/lectures";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { Bloc, Vide, vars } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { Tete } from "../Tete";
import { Lettre } from "./Lettre";
import "./messages.css";

// La lettre de Ouidah (lot L6), admin seulement, rendue sous <Suspense> : abonnés réels comptés par le serveur (nombre,
// thèmes, langue, désinscriptions ; aucune adresse à l'écran), puis la rédaction et l'envoi des numéros.
export async function EcranLettre() {
  const s = await exigerRole("admins");
  if (!s) redirect("/admins");
  const [abonnes, numeros] = await Promise.all([lireAbonnes(), lireNumeros()]);
  const L = msg.lettre;
  const max = abonnes ? Math.max(1, ...abonnes.parTheme.map((t) => t.n), ...Object.values(abonnes.parLangue)) : 1;
  return (
    <Enveloppe role="admins" session={s} actif="lettre" minute={minuteServeur()}>
      <Tete titre={L.titre} sous={L.sous} />
      <div className="esp-grille esp-messages esp-lettre">
        {abonnes && numeros ? (
          <>
            <Bloc id="t-abo" titre={L.abonnes} compte={abonnes.actifs} s={12} i={1}>
              {abonnes.actifs || abonnes.desinscrits ? (
                <>
                  <div className="chiffres" id="chiffres-lettre">
                    <div>
                      <b data-actifs={abonnes.actifs}>{abonnes.actifs}</b>
                      <span>{L.actifs(abonnes.actifs)}</span>
                    </div>
                    <div>
                      <b data-desinscrits={abonnes.desinscrits}>{abonnes.desinscrits}</b>
                      <span>{L.desinscrits(abonnes.desinscrits)}</span>
                    </div>
                  </div>
                  <div className="champs">
                    <section aria-labelledby="t-abo-th">
                      <h3 className="sous-titre" id="t-abo-th">{L.parTheme}</h3>
                      <ul className="barres-l">
                        {abonnes.parTheme.map((t) => (
                          <li key={t.id} data-theme={t.id}>
                            <span>{t.nom}</span>
                            <span className="barre" style={vars({ "--v": t.n / max })} aria-hidden="true" />
                            <span className="num">{t.n}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                    <section aria-labelledby="t-abo-la">
                      <h3 className="sous-titre" id="t-abo-la">{L.parLangue}</h3>
                      <ul className="barres-l">
                        {LANGUES_MSG.map((l) => (
                          <li key={l} data-langue={l}>
                            <span>{T.langues[l]}</span>
                            <span className="barre" style={vars({ "--v": abonnes.parLangue[l] / max })} aria-hidden="true" />
                            <span className="num">{abonnes.parLangue[l]}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  </div>
                </>
              ) : (
                <Vide texte={L.aucunAbonne} />
              )}
            </Bloc>
            <Lettre repartition={abonnes.repartition} numeros={numeros} sujets={abonnes.parTheme.map((t) => ({ id: t.id, nom: t.nom }))} />
          </>
        ) : (
          <Bloc id="t-abo" titre={L.abonnes} s={12} i={1}>
            <Vide texte={[T.vides.indisponible, ""]} />
          </Bloc>
        )}
      </div>
    </Enveloppe>
  );
}
