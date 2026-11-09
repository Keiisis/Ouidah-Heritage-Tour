import Image from "next/image";
import Link from "@/components/ui/LienPublic";
import { adresseArticle, type TexteBlog } from "@/content/blog-site";
import type { ArticlePublic } from "@/lib/serveur/blog/public";
import { dateLongue, TAILLES } from "./outils";

// Carte d'article : photo (si l'article en a une), catégorie, titre, chapô, date et temps de lecture. Toute la carte est
// cliquable par le lien du titre (étiré sur la carte) : un seul lien par article pour le clavier et les lecteurs d'écran.
// Forme : « une » (à la une), « seule » (seule sur sa rangée), « large » (2 par rangée), « moyenne » (3 par rangée).
export type Forme = "une" | "seule" | "large" | "moyenne";

export function Carte({ a, T, mois, forme, titre = "h3" }: { a: ArticlePublic; T: TexteBlog; mois: readonly string[] | undefined; forme: Forme; titre?: "h2" | "h3" }) {
  const Titre = titre;
  return (
    <article className={`jo-carte jo-${forme}${a.couverture ? "" : " jo-sans-photo"}`}>
      {a.couverture ? (
        <div className="jo-carte-photo">
          <div className="jo-carte-cadre">
            <Image src={a.couverture.src} alt={a.couverture.alt} fill sizes={TAILLES[forme]} preload={forme === "une"} />
          </div>
        </div>
      ) : null}
      <div className="jo-carte-texte">
        {a.categorie ? <p className="jo-cat">{a.categorie}</p> : null}
        <Titre className="jo-carte-titre">
          <Link href={adresseArticle(a.langue, a.slug)} className="jo-etire">
            {a.titre}
          </Link>
        </Titre>
        <span className="jo-carte-trait" aria-hidden="true" />
        {a.chapo ? <p className="jo-carte-chapo">{a.chapo}</p> : null}
        <p className="jo-meta">
          <time dateTime={a.publieLe}>{dateLongue(a.publieLe, a.langue, mois)}</time>
          <span>{T.minutes(a.tempsLecture)}</span>
        </p>
      </div>
    </article>
  );
}
