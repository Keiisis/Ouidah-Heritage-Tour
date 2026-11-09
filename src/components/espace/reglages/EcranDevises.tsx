import { redirect } from "next/navigation";
import type { Role } from "@/content/equipe";
import { espace as T } from "@/content/espace";
import { reglages as R } from "@/content/espace-reglages";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { enregistrerTauxUsd, revenirTauxAuto, validerTauxBce } from "@/lib/serveur/equipe/reglages/actions";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { actualiserTauxAutomatique, lireHistoriqueTaux } from "@/lib/serveur/taux";
import { Bloc, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { euro, fcfa } from "../outils";
import { Tete } from "../Tete";
import { BoutonAction, FormAction } from "./Envoi";
import "./reglages.css";

const D = R.devises;
const taux3 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const tauxSaisi = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });
const jour = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: T.ouidah.fuseau });
const source = (s: string | null) => s === "bce" ? D.sourceBce : s === "manuel" ? D.sourceManuelle : D.sourceAbsente;

export async function EcranDevises({ role = "admins" }: { role?: Role } = {}) {
  const s = await exigerRole(role);
  if (!s) redirect(`/${role}`);
  const site = await actualiserTauxAutomatique();
  const historique = await lireHistoriqueTaux();
  return (
    <Enveloppe role={role} session={s} actif="devises" minute={minuteServeur()}>
      <Tete titre={D.titre} sous={D.sous} />
      <div className="esp-reglages">
        <div className="esp-grille">
          {!site ? (
            <Bloc id="r-dev" titre={D.titre} s={12} i={1}><Vide texte={[T.vides.indisponible, ""]} /></Bloc>
          ) : (
            <>
              <Bloc id="r-dev-usd" titre={D.dollar} s={12} i={1}>
                <p className="grand" data-taux-usd={site.taux_usd ?? ""}>
                  {site.taux_usd === null ? D.dollarVide : D.dollarValeur(tauxSaisi.format(site.taux_usd))}
                </p>
                <p className="mention">{site.mode === "auto" ? D.modeAuto : D.modeManuel} · {source(site.taux_usd_source)}</p>
                {site.taux_usd_le && <p className="mention">{D.dollarLe(jour.format(Date.parse(site.taux_usd_le)))}</p>}
                {site.ancien && <p className="mention" role="alert">{D.ancien}</p>}
                <p className="mention">{D.autoAide}</p>
                <p className="mention">{D.figes}</p>
              </Bloc>
              {site.propose && (
                <Bloc id="r-dev-proposition" titre={D.proposition} s={12} i={2}>
                  <p className="grand">{D.dollarValeur(tauxSaisi.format(site.propose.taux))}</p>
                  <p className="mention">{D.dollarLe(jour.format(Date.parse(site.propose.date)))}</p>
                  <p className="mention" role="status">{D.propositionAide}</p>
                  {s.role === "admin" ? (
                    <FormAction action={validerTauxBce} nom={D.proposition} bouton={D.valider} reussite={D.valide} enfants={<>
                      <input type="hidden" name="taux_usd" value={site.propose.taux} />
                      <input type="hidden" name="date" value={site.propose.date} />
                    </>} />
                  ) : <p className="mention">{D.adminValidation}</p>}
                </Bloc>
              )}
              <Bloc id="r-dev-manuel" titre={D.manuel} s={6} i={3}>
                <FormAction action={enregistrerTauxUsd} nom={D.manuel} bouton={R.enregistrer} reussite={D.dollarEnregistre} enfants={
                  <div className="champ">
                    <label htmlFor="r-dev-usd-t">{D.dollarChamp}</label>
                    <input key={site.taux_usd ?? "vide"} id="r-dev-usd-t" name="taux_usd" inputMode="decimal" maxLength={9} defaultValue={site.taux_usd === null ? "" : tauxSaisi.format(site.taux_usd)} autoComplete="off" aria-describedby="r-dev-usd-a" />
                    <span className="aide" id="r-dev-usd-a">{D.dollarAide}</span>
                  </div>
                } />
                {site.mode === "manuel" && <BoutonAction action={revenirTauxAuto} libelle={D.revenirAuto} reussite={D.autoEnregistre} />}
              </Bloc>
              <Bloc id="r-dev" titre={D.taux} s={6} i={4}>
                <p className="grand" data-taux={site.taux_eur}>{D.tauxValeur(taux3.format(site.taux_eur))}</p>
                <p className="mention">{D.tauxSous}</p>
                <dl className="valeurs">{D.exemplesFcfa.map((n) => <div key={n}><dt>{fcfa(n)}</dt><dd>{euro(n / site.taux_eur)}</dd></div>)}</dl>
              </Bloc>
              <Bloc id="r-dev-historique" titre={D.historique} s={12} i={5}>
                <p className="mention">{D.historiqueAide}</p>
                {historique === null ? <Vide texte={[T.vides.indisponible, ""]} /> : historique.length === 0 ? <p className="mention">{D.historiqueVide}</p> : (
                  <ol className="sessions">{historique.map((h) => <li key={h.id}>
                    <span className="texte"><span>{D.evenements[h.evenement]} · {h.taux === null ? D.dollarVide : D.dollarValeur(tauxSaisi.format(Number(h.taux)))}</span>
                      <span className="meta">{source(h.source)} · {h.auteur ? `${h.auteur.prenom} ${h.auteur.nom}` : D.automatique}</span>
                      {h.date_cours && <span className="meta">{D.dollarLe(jour.format(Date.parse(h.date_cours)))}</span>}
                    </span>
                    <time dateTime={h.cree_le}>{jour.format(Date.parse(h.cree_le))}</time>
                  </li>)}</ol>
                )}
              </Bloc>
            </>
          )}
        </div>
      </div>
    </Enveloppe>
  );
}
