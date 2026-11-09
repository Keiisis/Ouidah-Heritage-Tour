"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { reglages } from "@/content/espace-reglages";
import { executerOperationEmcf, preparerFactureEmcf, verifierConnexionEmcf, type RetourEmcf } from "@/lib/serveur/emcf/actions";
import type { EtatEmcf } from "@/lib/serveur/emcf/operations";
import { GROUPES_EMCF, PAIEMENTS_EMCF } from "@/lib/serveur/emcf/regles";
import { Bloc } from "../Bloc";

export type LigneEmcf = { id: string; document: string; environnement: "test" | "production"; etat: EtatEmcf; uid: string | null; total: number | null; montant: number | null; code: string | null };
export type DocumentEmcf = { facture: string; avoir: string | null; numero: string; montant: number };
type Copie = typeof reglages.emcf;
const argent = (v: number) => `${new Intl.NumberFormat("fr-FR").format(v)} FCFA`;

export function ConnecteurEmcf({ copie: E, configure, environnement, documents, operations }: { copie: Copie; configure: boolean; environnement: "test" | "production"; documents: DocumentEmcf[] | null; operations: LigneEmcf[] | null }) {
  const [enCours, lancer] = useTransition();
  const [retour, resultat] = useState<RetourEmcf | null>(null);
  const [selection, choisir] = useState("");
  const router = useRouter();
  const document = documents?.find((d) => `${d.facture}:${d.avoir ?? ""}` === selection);
  function executer(action: () => Promise<RetourEmcf>) {
    resultat(null);
    lancer(async () => {
      try {
        const r = await action(); resultat(r);
        if ("ok" in r && r.operation) router.replace(`/admins/emcf?operation=${encodeURIComponent(r.operation)}#r-emcf-operations`);
      } catch { resultat({ erreur: "base" }); }
    });
  }
  return <>
    <Bloc id="r-emcf-connexion" titre={E.connexion} s={12} i={3}>
      <p><b>{E[environnement]}</b></p>
      {!configure && <p className="mention">{E.configurationAbsente}</p>}
      <p className="mention">{E.attenteSous}</p>
      <p className="aide">{E.perimetre}</p>
      <div className="reg-pied">
        <button className="bouton-2" disabled={!configure || enCours} onClick={() => executer(verifierConnexionEmcf)}>{E.verifier}</button>
        <Link href="/admins/docs" className="bouton-2">{E.documents}</Link>
      </div>
      <div role="status" aria-live="polite" className="reg-retour" data-ton={retour && "erreur" in retour ? "erreur" : "ok"}>
        {retour && ("erreur" in retour ? E.erreurs[retour.erreur] : retour.statut ? <>{E.verifiee} IFU {retour.statut.ifu} · NIM {retour.statut.nim}</> : E.effectue)}
      </div>
    </Bloc>
    <Bloc id="r-emcf-preparer" titre={E.preparer} s={12} i={4}>
      <p className="aide">{E.preparationAide}</p>
      {!documents || !operations ? <p role="alert">{E.indisponible}</p> : <form className="reg-form" aria-label={E.preparer} onSubmit={(e) => {
        e.preventDefault(); const valeurs = new FormData(e.currentTarget);
        valeurs.set("facture", document?.facture ?? ""); valeurs.set("avoir", document?.avoir ?? "");
        executer(() => preparerFactureEmcf(valeurs));
      }}>
        <div className="champs">
          <div className="champ large"><label htmlFor="emcf-document">{E.document}</label><select id="emcf-document" value={selection} onChange={(e) => choisir(e.target.value)} required disabled={enCours}>
            <option value="">{E.choisir}</option>{documents.map((d) => <option key={`${d.facture}:${d.avoir ?? ""}`} value={`${d.facture}:${d.avoir ?? ""}`}>{d.numero} · {argent(d.montant)}</option>)}
          </select></div>
          <div className="champ"><label htmlFor="emcf-groupe">{E.groupe}</label><select name="groupe" id="emcf-groupe" required={!document?.avoir} disabled={enCours || Boolean(document?.avoir)} defaultValue="" aria-describedby="emcf-groupe-a"><option value="">{E.choisir}</option>{GROUPES_EMCF.map((g) => <option key={g}>{g}</option>)}</select></div>
          <div className="champ"><label htmlFor="emcf-paiement">{E.paiement}</label><select name="paiement" id="emcf-paiement" required={!document?.avoir} disabled={enCours || Boolean(document?.avoir)} defaultValue=""><option value="">{E.choisir}</option>{PAIEMENTS_EMCF.map((p) => <option key={p} value={p}>{E.paiements[p]}</option>)}</select></div>
        </div>
        <p className="aide" id="emcf-groupe-a">{E.groupeAide}</p>
        <div className="reg-pied"><button className="bouton" type="submit" disabled={!configure || enCours || !document} aria-busy={enCours}>{E.preparation}</button></div>
      </form>}
    </Bloc>
    <Bloc id="r-emcf-operations" titre={E.historique} s={12} i={5}>
      <p className="aide">{E.historiqueAide}</p>
      <p className="mention">{E.confirmationAide}</p>
      {!operations ? <p role="alert">{E.indisponible}</p> : !operations.length ? <p>{E.vide}</p> : <div className="reg-form">{operations.map((o) => <article key={o.id} className="emcf-operation" aria-label={o.document}>
        <h3>{o.document} · {E[o.environnement]}</h3>
        <dl className="valeurs">
          <div><dt>{E.etat}</dt><dd>{E.etats[o.etat]}</dd></div>
          {o.montant !== null && <div><dt>{E.montantSource}</dt><dd>{argent(o.montant)}</dd></div>}
          {o.uid && <div><dt>{E.uid}</dt><dd>{o.uid}</dd></div>}
          {o.total !== null && <div><dt>{E.montant}</dt><dd>{argent(o.total)}</dd></div>}
          {o.code && <div><dt>{E.code}</dt><dd>{o.code}</dd></div>}
        </dl>
        {(o.etat === "preparee" || o.etat === "attente") && o.environnement === environnement && <div className="reg-pied">
          <button className="bouton" disabled={enCours || !configure} onClick={() => executer(() => executerOperationEmcf(o.id, o.etat === "preparee" ? "envoyer" : "confirmer"))}>{o.etat === "preparee" ? E.envoyer : E.confirmer}</button>
          <button className="bouton-2" disabled={enCours || !configure} onClick={() => executer(() => executerOperationEmcf(o.id, "annuler"))}>{E.annuler}</button>
        </div>}
      </article>)}</div>}
      <p><Link href="/admins/finances" className="bouton-2">{E.pdf}</Link></p>
    </Bloc>
  </>;
}
