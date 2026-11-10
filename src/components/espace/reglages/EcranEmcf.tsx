import { redirect } from "next/navigation";
import { reglages as R } from "@/content/espace-reglages";
import { lireContenu } from "@/lib/contenu";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { enregistrerNim } from "@/lib/serveur/equipe/reglages/actions";
import { lireSite } from "@/lib/serveur/equipe/reglages/lectures";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { lireFactures } from "@/lib/serveur/equipe/finances/lectures";
import { configurationEmcf } from "@/lib/serveur/emcf/client";
import { listerOperations } from "@/lib/serveur/emcf/operations";
import { Bloc } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { Tete } from "../Tete";
import { Cles } from "./Cles";
import { Etat, Modifie } from "./commun";
import { FormAction } from "./Envoi";
import { ConnecteurEmcf } from "./ConnecteurEmcf";
import "./reglages.css";

export async function EcranEmcf({ recherche }: { recherche: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await exigerRole("admins");
  if (!s || s.role !== "admin") redirect("/admins");
  const cible = (await recherche).operation;
  const [site, E, factures, operations] = await Promise.all([lireSite(), lireContenu("reglages.emcf"), lireFactures(s), listerOperations(50, cible).catch(() => null)]);
  const conf = await configurationEmcf();
  return <Enveloppe role="admins" session={s} actif="emcf" minute={minuteServeur()}>
    <Tete titre={E.titre} sous={E.sous} />
    <div className="esp-reglages"><div className="esp-grille">
      <Bloc id="r-mcf-n" titre={E.nim} s={7} i={1}>
        {!site ? <p role="alert">{E.indisponible}</p> : <>
          <FormAction action={enregistrerNim} nom={E.nim} bouton={R.enregistrer} reussite={E.enregistre} enfants={<div className="champ">
            <label htmlFor="r-mcf-nim">{E.nim}</label>
            <input id="r-mcf-nim" name="nim" maxLength={40} defaultValue={site.nim ?? ""} placeholder={E.nimVide} autoComplete="off" autoCapitalize="characters" aria-describedby="r-mcf-nim-a" />
            <span className="aide" id="r-mcf-nim-a">{E.nimAide}</span>
          </div>} />
          <Modifie le={site.modifie_le} par={site.par} />
        </>}
      </Bloc>
      <Bloc id="r-mcf-j" titre={E.jeton} s={5} i={2}>
        <p data-jeton={site?.jetonEmcf ? "pose" : "absent"}><Etat e={conf.configure ? "configuree" : "manquante"} texte={conf.configure ? R.configuree : R.manquante} /></p>
        <p className="aide">{E.jetonAide}</p>
        {site && <Cles porteur="emcf" champs={site.emcfCles} saisie={site.saisieCles} nom={E.jeton} />}
      </Bloc>
      <ConnecteurEmcf copie={E} configure={conf.configure} environnement={conf.environnement}
        documents={factures?.flatMap((f) => [{ facture: f.id, avoir: null, numero: f.numero, montant: f.montant }, ...f.avoirs.filter((a) => a.montant === f.montant).map((a) => ({ facture: f.id, avoir: a.id, numero: a.numero, montant: a.montant }))]) ?? null}
        operations={operations?.map((o) => ({ id: o.id, document: String(o.identite.documentNumero ?? o.facture_id), environnement: o.environnement, etat: o.etat, uid: o.uid, total: o.calcul?.total ?? null, montant: o.requete.payment?.[0]?.amount ?? null, code: o.securite?.codeMECeFDGI ?? null })) ?? null} />
    </div></div>
  </Enveloppe>;
}
