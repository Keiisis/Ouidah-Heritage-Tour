import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import type { Role } from "@/content/equipe";
import { espace as T } from "@/content/espace";
import { CATEGORIES_WIKI, pilotage as P } from "@/content/espace-pilotage";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { changerPage, enregistrerPage, proposerPage } from "@/lib/serveur/equipe/pilotage/actions";
import { lireWiki, type PageWiki } from "@/lib/serveur/equipe/pilotage/lectures";
import { paragraphes } from "@/lib/serveur/equipe/pilotage/regles";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { Bloc, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { ilYa } from "../outils";
import { Tete } from "../Tete";
import { BoutonAction, FormAction } from "./Envoi";
import "../finances/finances.css";
import "./pilotage.css";

// Wiki de l'équipe, rendu sous <Suspense> après la session. Admin (/admins/wiki) : écrit, publie, retire, valide ou refuse
// les propositions. Agent (/agents/wiki) : lit les pages publiées, propose une page et suit ses propositions. Texte simple
// seulement (paragraphes), jamais de HTML saisi. Le serveur revérifie le rôle à chaque action.
const W = P.wiki;

function ChampsPage({ page, cle }: { page?: PageWiki; cle: string }) {
  return (
    <div className="champs">
      <div className="champ">
        <label htmlFor={`${cle}-titre`}>{W.champTitre}</label>
        <input id={`${cle}-titre`} name="titre" maxLength={140} required defaultValue={page?.titre} />
      </div>
      <div className="champ">
        <label htmlFor={`${cle}-cat`}>{W.champCategorie}</label>
        <select id={`${cle}-cat`} name="categorie" defaultValue={page?.categorie ?? CATEGORIES_WIKI[0]}>
          {CATEGORIES_WIKI.map((c) => (
            <option key={c} value={c}>
              {W.categories[c]}
            </option>
          ))}
        </select>
      </div>
      <div className="champ large">
        <label htmlFor={`${cle}-corps`}>{W.champCorps}</label>
        <textarea id={`${cle}-corps`} name="corps" rows={8} maxLength={20000} required defaultValue={page?.corps} aria-describedby={`${cle}-aide`} />
        <span className="aide" id={`${cle}-aide`}>
          {W.aideCorps}
        </span>
      </div>
    </div>
  );
}

function Article({ p, minute, admin, outils }: { p: PageWiki; minute: number; admin: boolean; outils?: ReactNode }) {
  return (
    <details className="facture pil-page" id={`article-${p.id}`} data-page={p.id} data-etat={p.etat}>
      <summary>
        <span>
          <span className="numero">{p.titre}</span>
          <span className="meta">
            {W.categories[p.categorie]} · {W.par(admin || p.etat !== "publie" ? (p.auteur ?? "") : "", ilYa(p.publie ?? p.modifie, minute))}
          </span>
        </span>
        <span className="etat" data-e={p.etat}>
          {W.etats[p.etat]}
        </span>
      </summary>
      <div className="facture-corps">
        <div className="pil-texte">
          {paragraphes(p.corps).map((x, i) => (
            <p key={i}>{x}</p>
          ))}
        </div>
        {p.etat === "refuse" && p.motif && <p className="ecart">{W.motifRefus(p.motif)}</p>}
        {outils}
      </div>
    </details>
  );
}

function Liste({ pages, minute, admin, outils, vide, id }: { pages: PageWiki[]; minute: number; admin: boolean; outils?: (p: PageWiki) => ReactNode; vide: [string, string]; id: string }) {
  if (!pages.length) return <Vide texte={vide} />;
  return (
    <div className="pil-wiki" id={id}>
      {CATEGORIES_WIKI.map((c) => {
        const l = pages.filter((p) => p.categorie === c);
        return l.length ? (
          <section key={c} aria-label={W.categories[c]}>
            <h3 className="sous-titre">{W.categories[c]}</h3>
            {l.map((p) => (
              <Article key={p.id} p={p} minute={minute} admin={admin} outils={outils?.(p)} />
            ))}
          </section>
        ) : null;
      })}
    </div>
  );
}

/** Outils de l'admin sur une page : publier, retirer, refuser (avec motif), modifier. */
function OutilsAdmin({ p }: { p: PageWiki }) {
  return (
    <div className="pil-outils">
      <div className="pil-actions">
        {p.etat !== "publie" && p.etat !== "refuse" && <BoutonAction action={changerPage} args={[p.id, "publier"]} libelle={W.publier} reussite={W.okPublie} secondaire={false} />}
        {p.etat === "publie" && <BoutonAction action={changerPage} args={[p.id, "retirer"]} libelle={W.retirer} reussite={W.okRetire} confirmer={W.confirmerRetrait} />}
      </div>
      {p.etat === "propose" && (
        <FormAction
          action={changerPage}
          args={[p.id, "refuser"]}
          bouton={W.refuser}
          reussite={W.okRefuse}
          nom={W.refuser}
          enfants={
            <div className="champ">
              <label htmlFor={`m-${p.id}`}>{W.champMotif}</label>
              <input id={`m-${p.id}`} name="motif" maxLength={280} required />
            </div>
          }
        />
      )}
      <details className="pil-modifier">
        <summary className="bouton-2 bouton-petit">{W.modifier}</summary>
        <FormAction action={enregistrerPage} args={[p.id]} bouton={W.enregistrerModif} reussite={W.okEnregistre} garder nom={W.modifier} enfants={<ChampsPage page={p} cle={`e-${p.id}`} />} />
      </details>
    </div>
  );
}

export async function EcranWiki({ role }: { role: Role }) {
  const s = await exigerRole(role);
  if (!s) redirect(`/${role}`);
  const minute = minuteServeur();
  const admin = role === "admins";
  const pages = await lireWiki(admin ? s : { ...s, role: "agent" }); // /agents/wiki : vue agent, même pour un admin
  const indispo = <Vide texte={[T.vides.indisponible, ""]} />;
  const de = (etat: PageWiki["etat"]) => pages?.filter((p) => p.etat === etat) ?? [];
  const outils = (p: PageWiki) => <OutilsAdmin p={p} />;

  return (
    <Enveloppe role={role} session={s} actif="wiki" minute={minute}>
      <Tete titre={W.titre} sous={admin ? W.sousAdmin : W.sousAgent} />
      <div className="esp-finances esp-pilotage">
        <div className="esp-grille">
          {admin ? (
            <>
              <Bloc id="wi-pro" titre={W.propositions} compte={pages ? de("propose").length : null} s={7} i={1}>
                {pages ? <Liste id="wiki-propositions" pages={de("propose")} minute={minute} admin outils={outils} vide={W.vides.propositions} /> : indispo}
              </Bloc>
              <Bloc id="wi-nou" titre={W.nouvelle} s={5} i={2}>
                <FormAction action={enregistrerPage} args={[null]} bouton={W.enregistrer} reussite={W.okEnregistre} nom={W.nouvelle} enfants={<ChampsPage cle="n" />} />
              </Bloc>
              <Bloc id="wi-pub" titre={W.publiees} compte={pages ? de("publie").length : null} s={12} i={3}>
                {pages ? <Liste id="wiki-publiees" pages={de("publie")} minute={minute} admin outils={outils} vide={W.vides.publiees} /> : indispo}
              </Bloc>
              <Bloc id="wi-bro" titre={W.brouillons} compte={pages ? de("brouillon").length : null} s={6} i={4}>
                {pages ? <Liste id="wiki-brouillons" pages={de("brouillon")} minute={minute} admin outils={outils} vide={W.vides.brouillons} /> : indispo}
              </Bloc>
              <Bloc id="wi-ref" titre={W.refusees} compte={pages ? de("refuse").length : null} s={6} i={5}>
                {pages ? <Liste id="wiki-refusees" pages={de("refuse")} minute={minute} admin outils={outils} vide={W.vides.refusees} /> : indispo}
              </Bloc>
            </>
          ) : (
            <>
              <Bloc id="wi-pub" titre={W.publiees} compte={pages ? de("publie").length : null} s={7} i={1}>
                {pages ? <Liste id="wiki-publiees" pages={de("publie")} minute={minute} admin={false} vide={W.vides.publiees} /> : indispo}
              </Bloc>
              <Bloc id="wi-pro" titre={W.proposer} s={5} i={2}>
                <FormAction action={proposerPage} bouton={W.envoyer} reussite={W.okPropose} nom={W.proposer} enfants={<ChampsPage cle="p" />} />
              </Bloc>
              <Bloc id="wi-mes" titre={W.mesPropositions} s={12} i={3}>
                {pages ? <Liste id="wiki-mes-propositions" pages={pages.filter((p) => p.auteurId === s.profilId && p.etat !== "publie")} minute={minute} admin={false} vide={W.vides.mesPropositions} /> : indispo}
              </Bloc>
            </>
          )}
        </div>
      </div>
    </Enveloppe>
  );
}
