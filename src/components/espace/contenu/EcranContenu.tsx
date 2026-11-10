import Link from "next/link";
import { redirect } from "next/navigation";
import type { Role } from "@/content/equipe";
import { espace as T, section as sectionDe } from "@/content/espace";
import { contenu as C } from "@/content/espace-contenu";
import { type CleContenu, type CleEdition, cleEdition, decomposerCle, estCleEdition, formeDe, prefixesMedias, REGISTRE, traduisible, type SectionContenu, SECTIONS_CONTENU } from "@/lib/contenu-registre";
import { slugs } from "@/lib/contenu-regles";
import { fusionEdition, lireBrouillons, lireLigne, lireVersions, preparerEdition } from "@/lib/serveur/contenu/lectures";
import { LANGUES, normaliserLangue } from "@/lib/langue";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { exigerDroit } from "@/lib/serveur/equipe/securite/droits";
import { vars, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { Tete } from "../Tete";
import { SansDroit } from "../securite/SansDroit";
import { EditeurCollection } from "./EditeurCollection";
import { TraductionAutomatique } from "./TraductionAutomatique";
import "./contenu.css";

// Écran « Contenu du site » : la liste des rubriques d'une section (admins : une page par section du menu « Site » ;
// agents : /agents/contenu, sections en onglets), puis l'éditeur de la rubrique choisie (?cle=). Rendu sous <Suspense> :
// la session et l'adresse sont des données de la requête. Admin toujours ; agent seulement avec le droit « site »
// (sinon l'état « sans droit », comme les autres écrans gardés). Les valeurs viennent de la base, fusionnées au défaut du
// code : ce que le site affiche, et le brouillon s'il y en a un.

const leQuand = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: T.ouidah.fuseau });
const quand = (iso: string) => leQuand.format(Date.parse(iso));
const un = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type Recherche = Promise<{ cle?: string | string[]; section?: string | string[]; langue?: string | string[] }>;

export async function EcranContenu({ role, section: fixe, recherche }: { role: Role; section?: SectionContenu; recherche: Recherche }) {
  const s = await exigerDroit("site", role);
  if (!s) {
    if (role === "admins") redirect("/admins");
    return <SansDroit role="agents" actif="contenu" />;
  }
  const q = await recherche;
  const demandee = un(q.section);
  const section: SectionContenu = fixe ?? SECTIONS_CONTENU.find((x) => x === demandee) ?? "pages";
  const langue = normaliserLangue(un(q.langue));
  const bases = (Object.keys(REGISTRE) as CleContenu[]).filter((c) => REGISTRE[c].section === section);
  const cles = bases.map((c) => cleEdition(c, traduisible(c) ? langue : "FR"));
  // rubriques verrouillées (sans rendu public ou lues par le code) : repliées sous « Archives », jamais ouvertes d'office
  const archives = cles.filter((c) => REGISTRE[decomposerCle(c).cle].verrouille);
  const actives = cles.filter((c) => !archives.includes(c));
  const voulue = un(q.cle);
  const baseVoulue = estCleEdition(voulue) ? decomposerCle(voulue).cle : null;
  const cle: CleEdition = baseVoulue && bases.includes(baseVoulue) ? cleEdition(baseVoulue, traduisible(baseVoulue) ? langue : "FR") : (actives[0] ?? cles[0]);
  const nom = (c: CleEdition) => C.rubriquesNoms[decomposerCle(c).cle] ?? decomposerCle(c).cle;
  const entree = REGISTRE[decomposerCle(cle).cle];
  const adresse = (c: CleEdition) => (role === "admins" ? `/admins/${section}?cle=${encodeURIComponent(c)}&langue=${langue}` : `/agents/contenu?section=${section}&cle=${encodeURIComponent(c)}&langue=${langue}`);
  const actif = role === "admins" ? section : "contenu";
  const x = sectionDe(role, actif);
  const [ligne, versions, brouillons, edition] = await Promise.all([lireLigne(cle), lireVersions(cle), lireBrouillons(cles), preparerEdition(cle)]);
  const minute = minuteServeur();
  const rubrique = (c: CleEdition) => (
    <li key={c}>
      <Link href={adresse(c)} aria-current={c === cle ? "page" : undefined} data-cle={c}>
        <span>{nom(c)}</span>
        {brouillons.has(c) && <span className="ct-pastille">{C.enAttente}</span>}
      </Link>
    </li>
  );

  const forme = edition?.forme ?? formeDe(decomposerCle(cle).cle);
  const publiee = ligne && edition ? fusionEdition(cle, ligne.valeur, edition.source) : null;
  const courante = ligne?.brouillon && edition ? fusionEdition(cle, ligne.brouillon, edition.source) : publiee;

  return (
    <Enveloppe role={role} session={s} actif={actif} minute={minute}>
      <Tete titre={x?.nom ?? ""} sous={role === "admins" ? C.sous : C.sousAgent} />
      <div className="esp-contenu construit" style={vars({ "--i": 1 })} data-contenu={section}>
        {role === "admins" && section === "traductions" && <TraductionAutomatique />}
        {role === "agents" && (
          <nav className="ct-onglets" aria-label={C.sections}>
            <ul>
              {SECTIONS_CONTENU.map((id) => (
                <li key={id}>
                  <Link href={`/agents/contenu?section=${id}&langue=${langue}`} aria-current={id === section ? "page" : undefined}>
                    {sectionDe("admins", id)?.nom ?? id}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {traduisible(decomposerCle(cle).cle) && (
          <nav className="ct-onglets" aria-label={C.langues}>
            <ul>{LANGUES.map((l) => <li key={l}><Link href={`${role === "admins" ? `/admins/${section}` : `/agents/contenu?section=${section}`}${role === "admins" ? "?" : "&"}cle=${encodeURIComponent(decomposerCle(cle).cle)}&langue=${l}`} aria-current={l === langue ? "page" : undefined} hrefLang="fr">{l}</Link></li>)}</ul>
          </nav>
        )}
        <div className="ct-grille">
          <nav className="ct-rubriques" aria-label={C.rubriques}>
            <ul>{actives.map(rubrique)}</ul>
            {archives.length > 0 && (
              <details className="ct-archives" open={archives.includes(cle)}>
                <summary>{C.archives}</summary>
                <ul>{archives.map(rubrique)}</ul>
              </details>
            )}
          </nav>
          {!ligne || publiee === null || courante === null ? (
            <section className="ct-editeur" aria-label={nom(cle)}>
              <Vide texte={[C.indisponible, ""]} />
            </section>
          ) : (
            <EditeurCollection
              key={cle}
              cle={cle}
              titre={nom(cle)}
              forme={forme}
              valeur={courante}
              publiee={publiee}
              version={ligne.version}
              etat={{
                publie: ligne.publie_le ? C.etat.publie(quand(ligne.publie_le), ligne.publiePar) : C.etat.jamais,
                brouillon: ligne.brouillon && ligne.modifie_le ? C.etat.brouillon(quand(ligne.modifie_le), ligne.modifiePar) : null,
              }}
              aBrouillon={ligne.brouillon !== null}
              peutPublier={s.role === "admin"}
              versions={(versions ?? []).map((v) => ({ id: v.id, texte: C.historique.ligne(v.version, v.etat, quand(v.le), v.auteur) }))}
              adresses={[...slugs(forme, publiee)]}
              medias={prefixesMedias()}
              page={langue === "FR" || !traduisible(decomposerCle(cle).cle) ? entree.page : `/${langue.toLowerCase()}${entree.page === "/" ? "" : entree.page}`}
              verrouille={entree.verrouille}
              protege={entree.protege}
            />
          )}
        </div>
      </div>
    </Enveloppe>
  );
}
