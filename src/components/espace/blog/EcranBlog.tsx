import Link from "next/link";
import { redirect } from "next/navigation";
import type { Role } from "@/content/equipe";
import { espace as T, section } from "@/content/espace";
import { blog as B } from "@/content/espace-blog";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { assistantDisponible } from "@/lib/serveur/equipe/reglages/public";
import { exigerDroit } from "@/lib/serveur/equipe/securite/droits";
import { estUuid, listerArticles, lireArticle, lireAuteurs, lireFamille, lireVersions, mediasBlog } from "@/lib/serveur/blog/lectures";
import { type ActionEtat, ETAT_APRES, ETATS, estEtat, estLangueBlog, LANGUES_BLOG, peutEcrire, transitionPermise } from "@/lib/serveur/blog/regles";
import { vars, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { Tete } from "../Tete";
import { SansDroit } from "../securite/SansDroit";
import { EditeurArticle } from "./EditeurArticle";
import { NouvelArticle } from "./NouvelArticle";
import "../contenu/contenu.css";
import "./blog.css";

// Écran « Blog » de l'espace (admins : /admins/blog ; agents avec le droit « site » : /agents/blog) : la liste filtrable
// (état, langue, auteur, en paramètres de l'adresse) et « Nouvel article », ou l'éditeur d'un article (?id=). Rendu sous
// <Suspense> : la session et l'adresse sont des données de la requête. Sans le droit : l'état « sans droit » (agents) ou
// l'entrée /admins. Un agent lit tous les articles et écrit les siens tant qu'ils ne sont pas publiés.

const leQuand = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: T.ouidah.fuseau });
const quand = (iso: string) => leQuand.format(Date.parse(iso));
const un = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
type Recherche = Promise<Record<string, string | string[] | undefined>>;

export async function EcranBlog({ role, recherche }: { role: Role; recherche: Recherche }) {
  const s = await exigerDroit("site", role);
  if (!s) {
    if (role === "admins") redirect("/admins");
    return <SansDroit role="agents" actif="blog" />;
  }
  const q = await recherche;
  const base = `/${role}/blog`;
  const x = section(role, "blog");
  const minute = minuteServeur();
  const id = un(q.id);

  if (id !== undefined) {
    const lu = estUuid(id) ? await lireArticle(id) : "absent";
    const a = lu && lu !== "absent" ? lu : null;
    const racine = a ? (a.traduction_de ?? a.id) : null;
    const [versions, famille, aide] = a && racine ? await Promise.all([lireVersions(a.id), lireFamille(racine), a.traduction_de ? assistantDisponible() : false]) : [null, null, false];
    const moi = a ? { role: s.role, auteur: a.auteur_id === s.profilId } : null;
    return (
      <Enveloppe role={role} session={s} actif="blog" minute={minute}>
        <Tete titre={x?.nom ?? ""} sous={role === "admins" ? B.sous : B.sousAgent} />
        <div className="esp-contenu esp-blog construit" style={vars({ "--i": 1 })} data-blog="article">
          {!a || !moi ? (
            <section className="ct-editeur">
              <Vide texte={[lu === null ? B.indisponible : B.introuvable, ""]} />
              <Link className="bouton-2" href={base}>
                {B.retourListe}
              </Link>
            </section>
          ) : (
            <EditeurArticle
              key={a.id}
              article={{
                id: a.id,
                version: a.version,
                langue: a.langue,
                etat: a.etat,
                slug: a.slug,
                titre: a.titre,
                chapo: a.chapo,
                corps: a.corps,
                couverture: a.couverture_src && a.couverture_alt ? { src: a.couverture_src, alt: a.couverture_alt } : null,
                categorie: a.categorie ?? "",
                motsCles: a.mots_cles ?? [],
                seoTitre: a.seo_titre ?? "",
                seoDescription: a.seo_description ?? "",
                slugFige: a.publie_le !== null,
                traductionDe: a.traduction_de,
              }}
              meta={B.editeur.meta(a.auteur, quand(a.modifie_le), a.modifiePar)}
              publieLe={a.publie_le ? quand(a.publie_le) : null}
              ecriture={peutEcrire(moi, a.etat)}
              actions={(Object.keys(ETAT_APRES) as ActionEtat[]).filter((k) => transitionPermise(moi, a.etat, k))}
              admin={s.role === "admin"}
              versions={(versions ?? []).map((v) => ({ id: v.id, texte: B.historique.ligne(v.version, B.etats[v.etat], quand(v.le), v.auteur) }))}
              famille={(famille ?? []).map((f) => ({ ...f, original: f.id === racine }))}
              libres={famille ? LANGUES_BLOG.filter((l) => !famille.some((f) => f.langue === l)) : []}
              medias={mediasBlog()}
              aide={aide}
              base={base}
            />
          )}
        </div>
      </Enveloppe>
    );
  }

  const filtre = { etat: estEtat(un(q.etat)) ? un(q.etat) : undefined, langue: estLangueBlog(un(q.langue)) ? un(q.langue) : undefined, auteur: estUuid(un(q.auteur)) ? un(q.auteur) : undefined };
  const [articles, auteurs] = await Promise.all([listerArticles(filtre), lireAuteurs()]);
  const filtre_actif = Boolean(filtre.etat || filtre.langue || filtre.auteur);

  return (
    <Enveloppe role={role} session={s} actif="blog" minute={minute}>
      <Tete titre={x?.nom ?? ""} sous={role === "admins" ? B.sous : B.sousAgent} />
      <div className="esp-contenu esp-blog construit" style={vars({ "--i": 1 })} data-blog="liste">
        <NouvelArticle base={base} />
        <section className="bl-liste" aria-labelledby="bl-liste-t">
          <h2 id="bl-liste-t">{B.liste.titre}</h2>
          <form className="bl-ligne-form" method="get" action={base} aria-label={B.liste.filtres}>
            <div className="bl-champ">
              <label htmlFor="bl-f-etat">{B.liste.etat}</label>
              <select id="bl-f-etat" name="etat" defaultValue={filtre.etat ?? ""}>
                <option value="">{B.liste.tous}</option>
                {ETATS.map((e) => (
                  <option key={e} value={e}>
                    {B.etats[e]}
                  </option>
                ))}
              </select>
            </div>
            <div className="bl-champ">
              <label htmlFor="bl-f-langue">{B.liste.langue}</label>
              <select id="bl-f-langue" name="langue" defaultValue={filtre.langue ?? ""}>
                <option value="">{B.liste.toutes}</option>
                {LANGUES_BLOG.map((l) => (
                  <option key={l} value={l}>
                    {T.langues[l] ?? l}
                  </option>
                ))}
              </select>
            </div>
            <div className="bl-champ">
              <label htmlFor="bl-f-auteur">{B.liste.auteur}</label>
              <select id="bl-f-auteur" name="auteur" defaultValue={filtre.auteur ?? ""}>
                <option value="">{B.liste.tous}</option>
                {(auteurs ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nom || B.liste.sansAuteur}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="bouton-2">
              {B.liste.filtrer}
            </button>
            {filtre_actif && (
              <Link className="bl-lien" href={base}>
                {B.liste.effacer}
              </Link>
            )}
          </form>
          {articles === null ? (
            <Vide texte={[B.indisponible, ""]} />
          ) : articles.length === 0 ? (
            <p className="bl-aide">{filtre_actif ? B.liste.vide : B.liste.aucun}</p>
          ) : (
            <>
              <p className="bl-aide" aria-live="polite">
                {B.liste.nombre(articles.length)}
              </p>
              <div className="bl-tableau" role="region" aria-labelledby="bl-liste-t" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{B.liste.colonnes.titre}</th>
                      <th scope="col">{B.liste.colonnes.langue}</th>
                      <th scope="col">{B.liste.colonnes.etat}</th>
                      <th scope="col">{B.liste.colonnes.auteur}</th>
                      <th scope="col">{B.liste.colonnes.modifie}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {articles.map((a) => (
                      <tr key={a.id} data-article={a.id}>
                        <th scope="row">
                          <Link href={`${base}?id=${a.id}`}>{a.titre}</Link>
                          {a.traduction_de && <small> · {B.liste.traduction}</small>}
                        </th>
                        <td>{T.langues[a.langue] ?? a.langue}</td>
                        <td>
                          <span className="bl-pastille" data-etat={a.etat}>
                            {B.etats[a.etat]}
                          </span>
                        </td>
                        <td>{a.auteur ?? B.liste.sansAuteur}</td>
                        <td>{quand(a.modifie_le)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </Enveloppe>
  );
}
