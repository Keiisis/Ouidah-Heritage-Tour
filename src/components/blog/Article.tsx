import Image from "next/image";
import Link from "@/components/ui/LienPublic";
import LienLangue from "next/link";
import { ButtonPrimary } from "@/components/ui/Buttons";
import { adresseArticle, adresseListe, texteBlog, LIENS_BLOG, LOCALES_BLOG, NOMS_LANGUES_BLOG, type LangueBlogSite } from "@/content/blog-site";
import { lireContenu } from "@/lib/contenu";
import type { ArticlePublic, ArticlePublieDetail } from "@/lib/serveur/blog/public";
import { Carte } from "./Carte";
import { Corps } from "./Corps";
import { Progression } from "./Progression";
import { dateLongue, nomAuteur, TAILLES } from "./outils";
import "./blog.css";

// Article du blog : couverture pleine largeur et titre d'abord (titre posé sur la photo ; sous 640 px, photo entière puis
// titre dessous, rien de recadré), puis chapô, auteur, date et temps de lecture, langues où l'article existe, le corps
// (arbre de blocs sûrs), un appel discret vers /devis, et 3 articles de la même catégorie sur navy.
// Mouvement (transform et opacity, coupé par « mouvement réduit ») : la photo se pose et le titre monte à l'ouverture,
// le trait Soleil des intertitres et les citations entrent au défilement (CSS view()), le filet de lecture suit le corps.

type Props = {
  a: ArticlePublieDetail;
  langues: { langue: LangueBlogSite; slug: string }[];
  lies: ArticlePublic[];
};

export async function Article({ a, langues, lies }: Props) {
  const [copies, suivi] = await Promise.all([lireContenu("blog-site.copiesBlog"), lireContenu("suivi.suivi")]);
  const T = texteBlog(copies, a.langue);
  const auteur = nomAuteur(a.auteur);
  const autres = langues.filter((l) => l.langue !== a.langue);

  return (
    <div className="jo" lang={LOCALES_BLOG[a.langue].lang}>
      <Progression cible="jo-texte" />
      <header className={`jo-couv on-dark${a.couverture ? "" : " jo-couv-nue"}`}>
        {a.couverture ? (
          <div className="jo-couv-photo">
            <Image src={a.couverture.src} alt={a.couverture.alt} width={2400} height={1350} sizes={TAILLES.couverture} preload />
          </div>
        ) : null}
        <div className="jo-couv-texte">
          <div className="container-oht">
            {a.categorie ? (
              <p className="jo-cat">
                <Link href={adresseListe({ langue: a.langue, categorie: a.categorie })}>{a.categorie}</Link>
              </p>
            ) : null}
            <h1 className="jo-couv-titre">{a.titre}</h1>
          </div>
        </div>
      </header>

      <div className="container-oht jo-page">
        <div className="jo-intro">
          <Link className="oht-lien jo-retour" href={adresseListe({ langue: a.langue })}>
            {T.article.retour}
          </Link>
          {a.chapo ? <p className="jo-chapo">{a.chapo}</p> : null}
          <p className="jo-signature">
            {auteur ? <span className="jo-auteur">{T.par(auteur)}</span> : null}
            <span>
              {T.publieLe} <time dateTime={a.publieLe}>{dateLongue(a.publieLe, a.langue, suivi[a.langue].mois)}</time>
            </span>
            <span>{T.minutes(a.tempsLecture)}</span>
          </p>
          {autres.length ? (
            <nav className="jo-traductions" aria-label={T.article.lireEn}>
              <span aria-hidden="true">{T.article.lireEn}</span>
              <ul>
                {autres.map((l) => (
                  <li key={l.langue}>
                    <LienLangue href={adresseArticle(l.langue, l.slug)} hrefLang={LOCALES_BLOG[l.langue].lang} lang={LOCALES_BLOG[l.langue].lang}>
                      {NOMS_LANGUES_BLOG[l.langue]}
                    </LienLangue>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>

        <div id="jo-texte" className="jo-corps">
          <Corps blocs={a.blocs} />
        </div>

        <aside className="jo-cta" aria-labelledby="jo-titre-cta">
          <p id="jo-titre-cta" className="jo-cta-titre">
            {T.article.cta.titre}
          </p>
          <p className="jo-cta-texte">{T.article.cta.texte}</p>
          <ButtonPrimary href={LIENS_BLOG.devis}>{T.article.cta.bouton}</ButtonPrimary>
        </aside>
      </div>

      {lies.length ? (
        <section className="jo-lies on-dark" aria-labelledby="jo-titre-lies">
          <div className="container-oht">
            <h2 id="jo-titre-lies" className="jo-titre-grille">
              {T.article.lies}
            </h2>
            <div className={`jo-rangee jo-rangee-${lies.length === 1 ? "seule" : lies.length === 2 ? "large" : "moyenne"}`}>
              {lies.map((l) => (
                <Carte key={l.id} a={l} T={T} mois={suivi[l.langue].mois} forme={lies.length === 1 ? "seule" : lies.length === 2 ? "large" : "moyenne"} />
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
