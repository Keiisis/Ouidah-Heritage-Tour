import type { ReactNode } from "react";
import type { Bloc, EnLigne } from "@/lib/serveur/blog/regles";

// Rendu de l'arbre de blocs d'un article (regles.ts, rendreMarkdown) : seulement des éléments React et des chaînes, que
// React échappe ; aucun HTML injecté. Liens externes : rel="noopener nofollow" (porté par l'arbre). Aperçu de l'éditeur :
// `nouvelOnglet` ouvre chaque lien dans un nouvel onglet (le brouillon en cours n'est pas quitté). Les images sont
// montrées en fond (le compartiment site-medias n'est pas dans images.remotePatterns de next.config.ts).

function ligne(e: EnLigne[], nouvelOnglet: boolean): ReactNode[] {
  return e.map((x, i) => {
    switch (x.t) {
      case "texte":
        return x.v;
      case "gras":
        return <strong key={i}>{ligne(x.e, nouvelOnglet)}</strong>;
      case "italique":
        return <em key={i}>{ligne(x.e, nouvelOnglet)}</em>;
      case "lien":
        return (
          <a key={i} href={x.href} rel={x.rel ?? (nouvelOnglet ? "noopener" : undefined)} target={nouvelOnglet ? "_blank" : undefined}>
            {ligne(x.e, nouvelOnglet)}
          </a>
        );
    }
  });
}

export function Rendu({ blocs, nouvelOnglet = false }: { blocs: Bloc[]; nouvelOnglet?: boolean }) {
  return (
    <>
      {blocs.map((b, i) => {
        switch (b.t) {
          case "h2":
            return <h2 key={i}>{ligne(b.e, nouvelOnglet)}</h2>;
          case "h3":
            return <h3 key={i}>{ligne(b.e, nouvelOnglet)}</h3>;
          case "p":
            return <p key={i}>{ligne(b.e, nouvelOnglet)}</p>;
          case "ul":
          case "ol": {
            const Liste = b.t;
            return (
              <Liste key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>{ligne(it, nouvelOnglet)}</li>
                ))}
              </Liste>
            );
          }
          case "citation":
            return (
              <blockquote key={i}>
                {b.paragraphes.map((p, j) => (
                  <p key={j}>{ligne(p, nouvelOnglet)}</p>
                ))}
              </blockquote>
            );
          case "image":
            return (
              <figure key={i}>
                <div className="bl-image" role="img" aria-label={b.alt} style={{ backgroundImage: `url("${b.src}")` }} />
              </figure>
            );
        }
      })}
    </>
  );
}
