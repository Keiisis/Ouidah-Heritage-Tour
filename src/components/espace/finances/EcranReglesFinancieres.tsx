import { redirect } from "next/navigation";
import { espace as T } from "@/content/espace";
import { fiscalite as F } from "@/content/espace-fiscalite";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { commissionsMois, reglesFinancieres } from "@/lib/serveur/equipe/finances/fiscalite";
import { enregistrerReglesFinancieres } from "@/lib/serveur/equipe/finances/fiscalite-actions";
import { moisCourant, moisValide } from "@/lib/serveur/equipe/finances/regles";
import { Bloc, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { Tete } from "../Tete";
import { fcfa } from "../outils";
import { FormAction } from "./Envoi";
import "./finances.css";

export async function EcranReglesFinancieres({ recherche }: { recherche: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await exigerRole("admins");
  if (!s) redirect("/admins");
  const minute = minuteServeur(), q = (await recherche).mois, mois = moisValide(q) ? q : moisCourant(minute * 60000);
  const [regles, commissions] = await Promise.all([reglesFinancieres(), commissionsMois(mois)]);
  return <Enveloppe role="admins" session={s} actif="finances/regles" minute={minute}>
    <Tete titre={F.titre} sous={F.sous} />
    <div className="esp-finances"><div className="esp-grille">
      <Bloc id="regles-financieres" titre={F.regles} s={12} i={1}>
        {!regles ? <Vide texte={[T.vides.indisponible, ""]} /> : <>
          <FormAction action={enregistrerReglesFinancieres} nom={F.regles} bouton={F.enregistrer} reussite={F.enregistre} garder enfants={<>
            <h3>{F.tva}</h3><p className="mention">{F.tvaAide}</p>
            <div className="champs">
              <div className="champ"><label htmlFor="tva-active"><input id="tva-active" type="checkbox" name="tva_active" defaultChecked={regles.tva_active} /> {F.activerTva}</label></div>
              <div className="champ"><label htmlFor="tva-taux">{F.tauxTva}</label><input id="tva-taux" name="tva_taux" type="number" min="0" max="100" step="0.01" defaultValue={regles.tva_taux} aria-describedby="tva-aide" required /><span id="tva-aide" className="aide">{F.tauxAide}</span></div>
            </div>
            <h3>{F.commission}</h3><p className="mention">{F.commissionAide}</p>
            <div className="champs">
              <div className="champ"><label htmlFor="commission-active"><input id="commission-active" type="checkbox" name="commission_active" defaultChecked={regles.commission_active} /> {F.activerCommission}</label></div>
              <div className="champ"><label htmlFor="commission-taux">{F.tauxCommission}</label><input id="commission-taux" name="commission_taux" type="number" min="0" max="100" step="0.01" defaultValue={regles.commission_taux} aria-describedby="commission-aide" required /><span id="commission-aide" className="aide">{F.tauxAide}</span></div>
            </div>
          </>} />
          <p className="mention">{F.modifie} : {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Porto-Novo" }).format(Date.parse(regles.modifie_le))}</p>
        </>}
      </Bloc>
      <Bloc id="commissions" titre={F.rapport} s={12} i={2}>
        <form className="fin-form" method="get"><div className="champs"><div className="champ"><label htmlFor="commission-mois">{F.mois}</label><input id="commission-mois" name="mois" type="month" defaultValue={mois} required /></div></div><div className="fin-pied"><button className="bouton-2 bouton-petit" type="submit">{F.afficher}</button></div></form>
        <p className="mention">{F.rapportAide}</p>
        {!commissions ? <Vide texte={[T.vides.indisponible, ""]} /> : !commissions.length ? <Vide texte={F.vide} /> : <div className="tableau-defile"><table className="tableau">
          <thead><tr><th scope="col">{F.colonnes.agent}</th><th scope="col">{F.colonnes.dossiers}</th><th scope="col">{F.colonnes.ht}</th><th scope="col">{F.colonnes.commission}</th></tr></thead>
          <tbody>{commissions.map((a) => <tr key={a.id}><td data-col={F.colonnes.agent}>{a.nom}</td><td data-col={F.colonnes.dossiers} className="num">{a.documents}</td><td data-col={F.colonnes.ht} className="num">{fcfa(a.ht)}</td><td data-col={F.colonnes.commission} className="num">{fcfa(a.commission)}</td></tr>)}</tbody>
          <tfoot><tr><th scope="row" colSpan={2}>{F.total}</th><td data-col={F.colonnes.ht} className="num">{fcfa(commissions.reduce((n, a) => n + a.ht, 0))}</td><td data-col={F.colonnes.commission} className="num">{fcfa(commissions.reduce((n, a) => n + a.commission, 0))}</td></tr></tfoot>
        </table></div>}
      </Bloc>
    </div></div>
  </Enveloppe>;
}
