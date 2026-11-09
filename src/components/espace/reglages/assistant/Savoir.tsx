import { Fragment } from "react";
import { LIMITES } from "@/content/assistant";
import { base as B, LIMITES_BASE as L, taille } from "@/content/assistant-base";
import { espace as T } from "@/content/espace";
import {
  ajouterNote,
  enregistrerArgumentaire,
  ignorerQuestion,
  importerSource,
  lireBase,
  publierSource,
  type QuestionVue,
  repondreQuestion,
  retirerPassageSource,
  retirerSource,
  type SourceVue,
  supprimerSource,
} from "@/lib/serveur/assistant/sources";
import { Bloc, Vide } from "../../Bloc";
import { Etat, quand } from "../commun";
import { Annonces, BoutonBase, Depot, FormBase } from "./Envois";
import "./assistant-base.css";

// « Ce que l'assistant sait » (écran Assistant, admins) : documents et notes qui nourrissent l'assistant public, aperçu du
// texte extrait avec ses passages sensibles surlignés, argumentaire commercial et questions sans réponse auxquelles
// l'admin répond (la réponse devient une fiche publiée). Tout vient de la base (sources.ts, lireBase) : rien d'inventé.

const ETAT_PASTILLE: Record<SourceVue["etat"], string> = { brouillon: "attente", publie: "active", retire: "coupee" };
const langueHtml = (l: string) => (l === "GCF" ? "gcf" : l.toLowerCase());

function Source({ x }: { x: SourceVue }) {
  const t = `src-${x.id}`;
  const meta = [B.sources.genres[x.genre] ?? x.genre, x.pages ? B.sources.pages(x.pages) : null, B.sources.caracteres(x.caracteres), B.sources.morceaux(x.morceaux), x.taille ? taille(x.taille) : null].filter(Boolean);
  return (
    <article className="source" aria-labelledby={`${t}-t`} data-source={x.id} data-etat={x.etat}>
      <div className="source-tete">
        <h4 id={`${t}-t`}>{x.titre}</h4>
        <Etat e={ETAT_PASTILLE[x.etat]} texte={B.sources.etats[x.etat]} />
      </div>
      <p className="meta">{meta.join(" · ")}</p>
      <p className="aide">
        {B.sources.ajoute(quand(x.cree_le), x.auteur)}
        {x.nom_fichier && <span className="fichier"> · {x.nom_fichier}</span>}
      </p>
      {x.apercu && (
        <details className="apercu" open={x.etat === "brouillon" || undefined}>
          <summary>{B.sources.apercu}</summary>
          <p className="aide">{B.sources.apercuAide}</p>
          <div className="apercu-texte" tabIndex={0} role="region" aria-label={`${B.sources.apercu} : ${x.titre}`}>
            {x.apercu.map((m, i) => (
              <section key={i} className="morceau">
                <h5>{m.titre}</h5>
                <p>
                  {m.segments.map((s, k) =>
                    s.g ? (
                      <mark key={k} data-g={s.g} title={B.controle.genres[s.g]}>
                        {s.t}
                      </mark>
                    ) : (
                      <Fragment key={k}>{s.t}</Fragment>
                    ),
                  )}
                </p>
              </section>
            ))}
          </div>
        </details>
      )}
      <div className="source-actions">
        {/* même composant à la même place, quel que soit l'état : le retour de l'action reste affiché après le refresh */}
        {x.etat === "publie" ? (
          <FormBase action={retirerSource} args={[x.id]} bouton={B.sources.retirer} reussite="retire" nom={B.sources.nomRetirer(x.titre)} />
        ) : (
          <FormBase
            action={publierSource}
            args={[x.id]}
            bouton={x.etat === "brouillon" ? B.sources.publier : B.sources.republier}
            reussite="publie"
            nom={B.sources.nomPublier(x.titre)}
            alertes={x.alertes}
            retrait={{ action: retirerPassageSource, id: x.id }}
          />
        )}
        <BoutonBase action={supprimerSource} args={[x.id]} libelle={B.sources.supprimer} nom={B.sources.nomSupprimer(x.titre)} confirmer={B.sources.supprimerConfirme} reussite="supprime" liste />
      </div>
    </article>
  );
}

function Question({ q }: { q: QuestionVue }) {
  const id = `q-${q.id}`;
  return (
    <li className="question" data-question={q.id}>
      <p className="question-texte" lang={langueHtml(q.langue)}>
        {q.texte}
      </p>
      <p className="meta">{[B.questions.langues[q.langue] ?? q.langue, B.questions.fois(q.nombre), B.questions.derniere(quand(q.derniere_le))].join(" · ")}</p>
      {q.deja && <p className="aide">{B.questions.dejaRepondue}</p>}
      <div className="question-actions">
        <details className="repondre">
          <summary className="bouton-2 bouton-petit">{B.questions.repondre}</summary>
          <FormBase action={repondreQuestion} args={[q.id]} bouton={B.questions.repondre} reussite="reponse" nom={`${B.questions.repondre} : ${q.texte}`} liste>
            <div className="champ">
              <label htmlFor={`${id}-r`}>{B.questions.reponseChamp}</label>
              <textarea id={`${id}-r`} name="reponse" rows={4} maxLength={L.reponse} required aria-describedby={`${id}-a`} />
              <span className="aide" id={`${id}-a`}>
                {B.questions.reponseAide}
              </span>
            </div>
          </FormBase>
        </details>
        <BoutonBase action={ignorerQuestion} args={[q.id]} libelle={B.questions.ignorer} nom={B.questions.nomIgnorer(q.texte)} confirmer={B.questions.ignorerConfirme} reussite="ignore" liste />
      </div>
    </li>
  );
}

/** Section « Ce que l'assistant sait » : quatre blocs à la suite de ceux de l'écran Assistant (rangs 4 à 7). */
export async function SavoirAssistant() {
  const v = await lireBase();
  if (!v) {
    return (
      <Bloc id="r-ass-base" titre={B.titre} s={12} i={4}>
        <Vide texte={[T.vides.indisponible, ""]} />
      </Bloc>
    );
  }
  return (
    <>
      <Bloc id="r-ass-base" titre={B.titre} s={12} i={4}>
        <div className="ass-base">
          <p className="mention">{B.sous}</p>
          {v.publiees !== null && (
            <p className="aide" data-publiees={v.publiees}>
              {B.compteur(v.publiees)}
            </p>
          )}
          <Depot action={importerSource} />
          <h3 id="r-ass-sources">{B.sources.titre}</h3>
          <Annonces>
            {v.sources.length ? (
              <ul className="sources" aria-labelledby="r-ass-sources">
                {v.sources.map((x) => (
                  <li key={x.id}>
                    <Source x={x} />
                  </li>
                ))}
              </ul>
            ) : (
              <Vide texte={B.sources.vide} />
            )}
          </Annonces>
        </div>
      </Bloc>
      <Bloc id="r-ass-note" titre={B.note.titre} s={6} i={5}>
        <div className="ass-base">
          <p className="mention">{B.note.sous}</p>
          <FormBase action={ajouterNote} bouton={B.note.bouton} reussite="note" nom={B.note.titre} garder={false}>
            <div className="champ">
              <label htmlFor="r-ass-note-t">{B.note.titreChamp}</label>
              <input id="r-ass-note-t" name="titre" maxLength={L.titre} required autoComplete="off" />
            </div>
            <div className="champ">
              <label htmlFor="r-ass-note-x">{B.note.texteChamp}</label>
              <textarea id="r-ass-note-x" name="texte" rows={6} maxLength={L.note} required aria-describedby="r-ass-note-a" />
              <span className="aide" id="r-ass-note-a">
                {B.public}
              </span>
            </div>
          </FormBase>
        </div>
      </Bloc>
      <Bloc id="r-ass-arg" titre={B.argumentaire.titre} s={6} i={6}>
        <div className="ass-base">
          <p className="mention">{B.argumentaire.sous}</p>
          <FormBase action={enregistrerArgumentaire} bouton={B.enregistrer} reussite="argumentaire" nom={B.argumentaire.titre}>
            <div className="champ">
              <label htmlFor="r-ass-arg-x">{B.argumentaire.champ}</label>
              <textarea id="r-ass-arg-x" name="argumentaire" rows={10} maxLength={L.argumentaire} defaultValue={v.argumentaire} aria-describedby="r-ass-arg-a" />
              <span className="aide" id="r-ass-arg-a">
                {B.argumentaire.aide(LIMITES.argumentaire)}
              </span>
            </div>
          </FormBase>
        </div>
      </Bloc>
      <Bloc id="r-ass-q" titre={B.questions.titre} compte={v.questions.length} s={12} i={7}>
        <div className="ass-base">
          <p className="mention">{B.questions.sous}</p>
          <Annonces>
            {v.questions.length ? (
              <ul className="questions" aria-labelledby="r-ass-q">
                {v.questions.map((q) => (
                  <Question key={q.id} q={q} />
                ))}
              </ul>
            ) : (
              <Vide texte={B.questions.vide} />
            )}
          </Annonces>
        </div>
      </Bloc>
    </>
  );
}
