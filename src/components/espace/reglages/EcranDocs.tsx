import Image from "next/image";
import { redirect } from "next/navigation";
import { espace as T } from "@/content/espace";
import { LANGUES_REGLAGES, reglages as R } from "@/content/espace-reglages";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { enregistrerDocuments } from "@/lib/serveur/equipe/reglages/actions";
import { type Docs, lireDocs } from "@/lib/serveur/equipe/reglages/lectures";
import type { Mentions } from "@/lib/serveur/equipe/reglages/regles";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { Bloc, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { Picto } from "../Picto";
import { Tete } from "../Tete";
import { Modifie } from "./commun";
import { FormAction } from "./Envoi";
import "./reglages.css";

// Documents (lot « reglages ») : mentions des devis, factures et reçus (en-tête, pied de page et mentions par langue,
// signature et cachet de la Direction générale), gardées dans reglages_documents pour le rendu PDF de la session
// documents. Champs vides pré-remplis d'après les mentions publiques du site (legal.json, jamais le siège privé).
// Admin seulement ; le serveur relit chaque champ et le type réel des images.
const D = R.docs;
type Cle = "raison_sociale" | "forme" | "adresse" | "ifu" | "rccm" | "telephone" | "email";
const ENTETE: { cle: Cle; aide?: string; type?: string; mode?: "numeric" }[] = [
  { cle: "raison_sociale" },
  { cle: "forme" },
  { cle: "adresse", aide: D.adresseAide },
  { cle: "ifu", aide: D.ifuAide, mode: "numeric" },
  { cle: "rccm" },
  { cle: "telephone", type: "tel" },
  { cle: "email", type: "email" },
];
const MAX: Record<Cle, number> = { raison_sociale: 120, forme: 80, adresse: 200, ifu: 13, rccm: 120, telephone: 80, email: 254 };

function Champs({ d }: { d: Docs }) {
  const v = (c: keyof Mentions) => (d.m[c] as string | null) ?? (d.defauts[c] as string | null | undefined) ?? "";
  const image = (cle: "signature" | "cachet", titre: string) => {
    const x = d[cle];
    return (
      <div className="champ">
        <label htmlFor={`r-doc-${cle}`}>{titre}</label>
        <div className="apercu-image" data-image={cle}>
          {x ? <Image src={x.donnees} alt={`${D.actuelle} : ${titre}`} width={240} height={96} unoptimized /> : <span className="aide">{D.aucune}</span>}
        </div>
        <input id={`r-doc-${cle}`} name={cle} type="file" accept="image/png,image/jpeg,image/webp" aria-describedby={`r-doc-${cle}-a`} />
        <span className="aide" id={`r-doc-${cle}-a`}>
          {D.imageAide}
        </span>
        {x && (
          <label className="case">
            <input type="checkbox" name={`retirer_${cle}`} value="oui" />
            {D.retirer}
          </label>
        )}
      </div>
    );
  };
  return (
    <>
      <fieldset>
        <legend>{D.entete}</legend>
        <p className="aide">{d.jamais ? D.preRempli : D.enteteSous}</p>
        <div className="champs">
          {ENTETE.map(({ cle, aide, type, mode }) => (
            <div key={cle} className={cle === "adresse" ? "champ large" : "champ"}>
              <label htmlFor={`r-doc-${cle}`}>{D[cle]}</label>
              <input id={`r-doc-${cle}`} name={cle} type={type ?? "text"} inputMode={mode} maxLength={MAX[cle]} defaultValue={v(cle)} autoComplete="off" aria-describedby={aide ? `r-doc-${cle}-a` : undefined} />
              {aide && (
                <span className="aide" id={`r-doc-${cle}-a`}>
                  {aide}
                </span>
              )}
            </div>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>{D.textes}</legend>
        <p className="aide">{D.textesSous}</p>
        <div className="langues">
          {LANGUES_REGLAGES.map((l) => (
            <details key={l} className="langue" open={l === "FR" || undefined} data-langue={l}>
              <summary>
                <span>{D.langue(T.langues[l] ?? l, l === "FR")}</span>
                <Picto nom="chevron" className="ic" />
              </summary>
              <div className="langue-corps">
                <div className="champ">
                  <label htmlFor={`r-doc-pied-${l}`}>{D.pied}</label>
                  <textarea id={`r-doc-pied-${l}`} name={`pied_${l}`} maxLength={400} rows={2} defaultValue={d.m.pied[l] ?? ""} lang={l === "GCF" ? "gcf" : l.toLowerCase()} aria-describedby="r-doc-pied-a" />
                </div>
                <div className="champ">
                  <label htmlFor={`r-doc-mentions-${l}`}>{D.mentions}</label>
                  <textarea id={`r-doc-mentions-${l}`} name={`mentions_${l}`} maxLength={600} rows={3} defaultValue={d.m.mentions[l] ?? ""} lang={l === "GCF" ? "gcf" : l.toLowerCase()} aria-describedby="r-doc-mentions-a" />
                </div>
              </div>
            </details>
          ))}
        </div>
        <p className="aide" id="r-doc-pied-a">
          {D.piedAide}
        </p>
        <p className="aide" id="r-doc-mentions-a">
          {D.mentionsAide}
        </p>
      </fieldset>
      <fieldset>
        <legend>{D.signature}</legend>
        <p className="aide">{D.signatureSous}</p>
        <div className="champs">
          <div className="champ">
            <label htmlFor="r-doc-signataire">{D.signataire}</label>
            <input id="r-doc-signataire" name="signataire" maxLength={80} defaultValue={d.m.signataire ?? ""} autoComplete="off" />
          </div>
          <div className="champ">
            <label htmlFor="r-doc-fonction">{D.fonction}</label>
            <input id="r-doc-fonction" name="fonction" maxLength={80} defaultValue={d.m.fonction ?? ""} autoComplete="off" />
          </div>
        </div>
        <div className="images">
          {image("signature", D.image)}
          {image("cachet", D.cachet)}
        </div>
      </fieldset>
    </>
  );
}

export async function EcranDocs() {
  const s = await exigerRole("admins");
  if (!s) redirect("/admins");
  const d = await lireDocs();
  return (
    <Enveloppe role="admins" session={s} actif="docs" minute={minuteServeur()}>
      <Tete titre={D.titre} sous={D.sous} />
      <div className="esp-reglages">
        <div className="esp-grille">
          <Bloc id="r-doc" titre={D.titre} s={12} i={1}>
            {!d ? (
              <Vide texte={[T.vides.indisponible, ""]} />
            ) : (
              <>
                <Modifie le={d.modifie_le} par={d.par} jamais={d.jamais} />
                <FormAction action={enregistrerDocuments} nom={D.titre} bouton={R.enregistrer} reussite={R.enregistre} enfants={<Champs d={d} />} />
              </>
            )}
          </Bloc>
          <Bloc id="r-doc-l" titre={D.lecture} s={12} i={2}>
            <p className="mention">{D.lectureSous}</p>
          </Bloc>
        </div>
      </div>
    </Enveloppe>
  );
}
