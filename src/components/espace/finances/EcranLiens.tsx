import type { Role } from "@/content/equipe";
import { espace as T } from "@/content/espace";
import { finances as F } from "@/content/espace-finances";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { annulerLien } from "@/lib/serveur/equipe/finances/actions";
import { devisPayables, lireLiens, secretLiens } from "@/lib/serveur/equipe/finances/lectures";
import { passerellesActives } from "@/lib/serveur/paiement";
import { exigerDroit } from "@/lib/serveur/equipe/securite/droits";
import { Bloc, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { fcfa } from "../outils";
import { SansDroit } from "../securite/SansDroit";
import { Tete } from "../Tete";
import { dateFr, Etat, Montant } from "./commun";
import { BoutonAction } from "./Envoi";
import { FormLien } from "./FormLien";
import "./finances.css";

// Liens de paiement (lot L7), agents (leurs dossiers) et admins (tous), sous <Suspense>. Le montant est le total du
// devis, calculé par le serveur ; jamais d'acompte. Seules les passerelles actives et configurées sont proposées. Le
// bouton « Lien de paiement » du dossier ouvre cet écran avec son devis choisi d'avance.
export async function EcranLiens({ role, recherche }: { role: Role; recherche: Promise<{ devis?: string | string[] }> }) {
  const s = await exigerDroit("liens", role); // droit de l'agent (lot « securite ») ; un admin les a tous
  if (!s) return <SansDroit role={role} actif={"liens"} />;
  const demande = (await recherche).devis; // devis choisi d'avance depuis le dossier (?devis=…), lu après la session
  const [liens, devis, passerelles] = await Promise.all([lireLiens(s), devisPayables(s), passerellesActives()]);
  const L = F.liens;
  const indispo = <Vide texte={[T.vides.indisponible, ""]} />;
  return (
    <Enveloppe role={role} session={s} actif="liens" minute={minuteServeur()}>
      <Tete titre={L.titre} sous={role === "admins" ? L.sousAdmin : L.sousAgent} />
      <div className="esp-finances">
        <div className="esp-grille">
          <Bloc id="l-cre" titre={L.creer} s={5} i={1}>
            {!devis ? (
              indispo
            ) : !secretLiens() ? (
              <p className="mention">{F.erreurs.secret}</p>
            ) : !passerelles.length ? (
              <p className="mention">{L.aucunePasserelle}</p>
            ) : devis.length ? (
              <>
                <FormLien initial={typeof demande === "string" && devis.some((d) => d.id === demande) ? demande : ""} devis={devis.map((d) => ({ id: d.id, libelle: `${d.numero ? `${d.numero} · ` : ""}${d.client} · ${fcfa(d.montant)}`, montant: d.montant, langue: d.langue }))} passerelles={passerelles} />
                <p className="mention">{L.pageAide}</p>
              </>
            ) : (
              <p className="mention">{L.aucunDevis}</p>
            )}
          </Bloc>
          <Bloc id="l-liste" titre={L.titre} compte={liens ? liens.length : null} s={7} i={2}>
            <p className="mention">{L.suivi}</p>
            {!liens ? (
              indispo
            ) : liens.length ? (
              <div className="tableau-defile">
                <table className="tableau">
                  <thead>
                    <tr>
                      <th scope="col">{L.cols.client}</th>
                      <th scope="col">{L.cols.montant}</th>
                      <th scope="col">{L.cols.langue}</th>
                      <th scope="col">{L.cols.expire}</th>
                      <th scope="col">{L.cols.etat}</th>
                      <th scope="col">
                        <span className="invisible">{L.annuler}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {liens.map((l) => (
                      <tr key={l.id} data-lien={l.id}>
                        <td data-col={L.cols.client}>
                          <b>{l.client}</b>
                          <span className="sous-cell">{dateFr(l.cree)}</span>
                        </td>
                        <td data-col={L.cols.montant}>
                          <Montant n={l.montant} />
                        </td>
                        <td data-col={L.cols.langue}>
                          <span className="langue">{l.langue}</span>
                        </td>
                        <td data-col={L.cols.expire}>{dateFr(l.expire)}</td>
                        <td data-col={L.cols.etat}>
                          <Etat e={l.etat} textes={F.etatsLien} />
                          {l.quand && l.etat !== "cree" && <span className="sous-cell">{L.le(dateFr(l.quand))}</span>}
                        </td>
                        <td className="actions">
                          {(l.etat === "cree" || l.etat === "envoye" || l.etat === "ouvert") && <BoutonAction action={annulerLien} args={[l.id]} libelle={L.annuler} nom={`${L.annuler} · ${l.client}`} reussite={L.annule} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Vide texte={L.vide} />
            )}
          </Bloc>
        </div>
      </div>
    </Enveloppe>
  );
}
