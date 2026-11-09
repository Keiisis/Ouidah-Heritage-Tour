import { Fragment } from "react";
import Image from "next/image";
import Link from "@/components/ui/LienPublic";
import type { Bloc, EnLigne } from "@/lib/serveur/blog/public";
import { TAILLES } from "./outils";

// Corps d'un article, rendu depuis l'arbre de blocs sûrs de rendreMarkdown (lib/serveur/blog/regles.ts) : uniquement des
// éléments React et des chaînes, que React échappe. Aucun HTML injecté. Liens externes : nouvel onglet, rel « noopener
// nofollow » ; liens internes par next/link. Images : compartiment site-medias, proportions d'origine (hauteur auto).

const REL_EXTERNE = "noopener nofollow";

function Texte({ e }: { e: EnLigne[] }) {
  return e.map((x, i) => {
    switch (x.t) {
      case "texte":
        return <Fragment key={i}>{x.v}</Fragment>;
      case "gras":
        return (
          <strong key={i}>
            <Texte e={x.e} />
          </strong>
        );
      case "italique":
        return (
          <em key={i}>
            <Texte e={x.e} />
          </em>
        );
      case "lien":
        return x.externe ? (
          <a key={i} href={x.href} target="_blank" rel={x.rel ?? REL_EXTERNE}>
            <Texte e={x.e} />
          </a>
        ) : (
          <Link key={i} href={x.href}>
            <Texte e={x.e} />
          </Link>
        );
    }
  });
}

export function Corps({ blocs }: { blocs: Bloc[] }) {
  return blocs.map((b, i) => {
    switch (b.t) {
      case "h2":
        return (
          <h2 key={i} className="jo-h2">
            <span className="jo-h2-trait" aria-hidden="true" />
            <Texte e={b.e} />
          </h2>
        );
      case "h3":
        return (
          <h3 key={i} className="jo-h3">
            <Texte e={b.e} />
          </h3>
        );
      case "p":
        return (
          <p key={i}>
            <Texte e={b.e} />
          </p>
        );
      case "ul":
      case "ol": {
        const Liste = b.t;
        return (
          <Liste key={i} className={`jo-${b.t}`}>
            {b.items.map((item, j) => (
              <li key={j}>
                <Texte e={item} />
              </li>
            ))}
          </Liste>
        );
      }
      case "citation":
        return (
          <blockquote key={i} className="jo-citation">
            {b.paragraphes.map((p, j) => (
              <p key={j}>
                <Texte e={p} />
              </p>
            ))}
          </blockquote>
        );
      case "image":
        return (
          <figure key={i} className="jo-figure">
            <Image src={b.src} alt={b.alt} width={1600} height={1067} sizes={TAILLES.figure} />
          </figure>
        );
    }
  });
}
