import Link from "@/components/ui/LienPublic";
import LienLangue from "next/link";
import { ButtonPrimary, LinkLine } from "@/components/ui/Buttons";
import { Icon } from "@/components/ui/Icon";
import { adresseListe, LIENS_BLOG, LOCALES_BLOG, NOMS_LANGUES_BLOG, type LangueBlogSite, type TexteBlog } from "@/content/blog-site";
import type { ArticlePublic, PagePubliee } from "@/lib/serveur/blog/public";
import { Carte, type Forme } from "./Carte";
import { PropositionLangue } from "./PropositionLangue";
import "./blog.css";

// Liste du blog /blog : haut de page abysse (titre, filtres par catégorie en liens ?categorie=, langues du journal), article
// à la une en grand sur la première page, puis la grille éditoriale sur blanc pur (rangées de 2 puis de 3 articles), puis
// la pagination. Aucun faux article : sans publication, un état vide qui le dit et renvoie vers l'histoire de la ville.
// Mouvement (transform et opacity, coupé par « mouvement réduit ») : le titre monte de son masque, la photo de la une
// remonte derrière son cadre, les cartes de la grille montent au défilement (CSS view(), sans JS).
// Sans lecture serveur : rendue par la page statique (vue par défaut) et par ListeFiltree dans le navigateur (vue filtrée).

type Props = {
  T: TexteBlog;
  mois: readonly string[] | undefined; // noms des mois de la langue (dictionnaire de suivi éditable), pour les dates
  langue: LangueBlogSite;
  categorie: string | null;
  resultat: PagePubliee;
  categories: { nom: string; nombre: number }[];
  langues: LangueBlogSite[];
};

/** Rangées de la grille : 2 articles, puis 3, puis 2… ; une rangée d'un seul article prend toute la largeur. */
function rangees(articles: ArticlePublic[]): { forme: Forme; articles: ArticlePublic[] }[] {
  const r: { forme: Forme; articles: ArticlePublic[] }[] = [];
  for (let i = 0, n = 2; i < articles.length; i += n, n = n === 2 ? 3 : 2) {
    const morceau = articles.slice(i, i + n);
    r.push({ forme: morceau.length === 1 ? "seule" : morceau.length === 2 ? "large" : "moyenne", articles: morceau });
  }
  return r;
}

export function Liste({ T, mois, langue, categorie, resultat, categories, langues }: Props) {
  const { articles, page, pages, total } = resultat;
  const une = page === 1 ? articles[0] : undefined;
  const grille = une ? articles.slice(1) : articles;
  const disponibles = langues.map((l) => ({ langue: l, href: adresseListe({ langue: l }) }));

  return (
    <div className="jo" lang={LOCALES_BLOG[langue].lang}>
      <section className="jo-tete on-dark" aria-labelledby="jo-titre">
        <div className="container-oht">
          <h1 id="jo-titre" className="jo-titre">
            <span className="jo-masque">
              <span>{T.titre}</span>
            </span>
          </h1>
          <p className="jo-phrase">{T.phrase}</p>
          <PropositionLangue actuelle={langue} disponibles={disponibles} />
          {langues.length > 1 ? (
            <nav className="jo-langues" aria-label={T.langue.aria}>
              <ul>
                {langues.map((l) => (
                  <li key={l}>
                    <LienLangue href={adresseListe({ langue: l })} hrefLang={LOCALES_BLOG[l].lang} lang={LOCALES_BLOG[l].lang} aria-current={l === langue ? "page" : undefined}>
                      {NOMS_LANGUES_BLOG[l]}
                    </LienLangue>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          {categories.length ? (
            <nav className="jo-filtres" aria-label={T.filtres.aria}>
              <ul>
                <li>
                  <Link href={adresseListe({ langue })} aria-current={categorie ? undefined : "page"}>
                    {T.filtres.tous}
                  </Link>
                </li>
                {categories.map((c) => (
                  <li key={c.nom}>
                    <Link href={adresseListe({ langue, categorie: c.nom })} aria-current={c.nom === categorie ? "page" : undefined}>
                      {c.nom}
                      <span className="jo-nombre">{c.nombre}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>
        {une ? (
          <div className="container-oht jo-une-zone" aria-label={T.une} role="group">
            <Carte a={une} T={T} mois={mois} forme="une" titre="h2" />
          </div>
        ) : null}
      </section>

      {total === 0 || articles.length === 0 ? (
        <Vide T={T} langue={langue} categorie={categorie} horsPages={total > 0} />
      ) : grille.length ? (
        <section className="jo-grille-zone" aria-labelledby="jo-titre-grille">
          <div className="container-oht">
            <h2 id="jo-titre-grille" className="jo-titre-grille">
              {categorie ? T.liste.categorie(categorie) : T.liste.tous}
            </h2>
            <div className="jo-grille">
              {rangees(grille).map((r, i) => (
                <div key={i} className={`jo-rangee jo-rangee-${r.forme}`}>
                  {r.articles.map((a) => (
                    <Carte key={a.id} a={a} T={T} mois={mois} forme={r.forme} />
                  ))}
                </div>
              ))}
            </div>
            <Pagination T={T} langue={langue} categorie={categorie} page={page} pages={pages} />
          </div>
        </section>
      ) : pages > 1 ? (
        <section className="jo-grille-zone">
          <div className="container-oht">
            <Pagination T={T} langue={langue} categorie={categorie} page={page} pages={pages} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Pagination({ T, langue, categorie, page, pages }: { T: TexteBlog; langue: LangueBlogSite; categorie: string | null; page: number; pages: number }) {
  if (pages <= 1) return null;
  return (
    <nav className="jo-pages" aria-label={T.pages.aria}>
      {page > 1 ? (
        <Link className="jo-page-lien" href={adresseListe({ langue, categorie, page: Math.min(page - 1, pages) })} rel="prev">
          <Icon name="arrow-left" className="size-5" />
          {T.pages.recents}
        </Link>
      ) : (
        <span />
      )}
      <p className="jo-page-n" aria-current="page">
        {T.pages.page(page, pages)}
      </p>
      {page < pages ? (
        <Link className="jo-page-lien" href={adresseListe({ langue, categorie, page: page + 1 })} rel="next">
          {T.pages.anciens}
          <Icon name="arrow-right" className="size-5" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

function Vide({ T, langue, categorie, horsPages }: { T: TexteBlog; langue: LangueBlogSite; categorie: string | null; horsPages: boolean }) {
  const filtre = Boolean(categorie) || horsPages;
  return (
    <section className="jo-vide" aria-labelledby="jo-titre-vide">
      <div className="container-oht jo-vide-grille">
        <h2 id="jo-titre-vide">{horsPages ? T.vide.horsPages : categorie ? T.vide.categorie(categorie) : T.vide.titre}</h2>
        <div>
          <p>{filtre ? T.vide.texteCategorie : T.vide.texte}</p>
          <div className="jo-vide-actions">
            {filtre ? (
              <ButtonPrimary href={adresseListe({ langue })}>{T.vide.tous}</ButtonPrimary>
            ) : (
              <>
                <ButtonPrimary href={LIENS_BLOG.histoire}>{T.vide.histoire}</ButtonPrimary>
                <LinkLine href={LIENS_BLOG.devis}>{T.vide.voyage}</LinkLine>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
