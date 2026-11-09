import Link from "@/components/ui/LienPublic";
import type { ReactNode } from "react";
import { lireContenuPage as lireContenu } from "@/lib/serveur/contenu-page";
import { ListeCredits } from "@/components/ui/ListeCredits";
import { BoutonChoixCookies, SommaireLegal } from "./SommaireLegal";
import "./legal.css";

// Pages légales (mentions, confidentialité et cookies, CGV), maquette A « Le document » validée par Kevin le 29/10/2026.
// Tout le texte vient de content/legal.json (éditable depuis l'admin) : chaque information de la société a une valeur et
// un interrupteur « visible » ; une information masquée ou vide disparaît partout (ligne de fiche, phrase qui la cite).

type Champ = { libelle: string; valeur: string | string[] | null; visible: boolean };
type Bloc = { p?: string; liste?: string[]; fiche?: (string | [string, string])[]; tableau?: { colonnes: string[]; lignes: string[][] }; composant?: string };
type Section = { id: string; titre: string; blocs: Bloc[] };
export type Page = { titre: string; metaTitre: string; metaDescription: string; intro: string; sections: Section[] };
export type CheminLegal = "/mentions-legales" | "/politique-de-confidentialite" | "/conditions-generales-de-vente";

type Societe = Record<string, Champ>;
/** Page légale publiée (ou défaut de content/legal.json). */
export const pageLegale = async (chemin: CheminLegal) => ((await lireContenu("legal")).pages as Record<CheminLegal, Page>)[chemin];

// valeur affichable d'une information de la société, ou null si elle est masquée ou vide
function champ(societe: Societe, cle: string): ReactNode | null {
  const c = societe[cle];
  const v = c?.visible ? c.valeur : null;
  if (v == null || v === "" || (Array.isArray(v) && !v.length)) return null;
  if (cle === "email") return <a href={`mailto:${v}`}>{v}</a>;
  if (Array.isArray(v))
    return v.map((t, i) => (
      <span key={t}>
        {i ? " · " : ""}
        {cle === "telephones" ? <a href={`tel:${t.replace(/\s/g, "")}`}>{t}</a> : t}
      </span>
    ));
  return v;
}

// texte avec liens [texte](adresse) et informations {clé} ; null si une information citée est masquée
export function texte(s: string, societe: Societe): ReactNode[] | null {
  const morceaux = s.split(/(\[[^\]]+\]\([^)]+\)|\{\w+\})/);
  const out: ReactNode[] = [];
  for (const [i, m] of morceaux.entries()) {
    const lien = m.match(/^\[([^\]]+)\]\(([^)]+)\)$/), cle = m.match(/^\{(\w+)\}$/);
    if (lien) out.push(/^https?:/.test(lien[2]) ? <a key={i} href={lien[2]} target="_blank" rel="noopener noreferrer">{lien[1]}</a> : <Link key={i} href={lien[2]}>{lien[1]}</Link>);
    else if (cle) {
      const v = champ(societe, cle[1]);
      if (v == null) return null;
      out.push(<span key={i}>{v}</span>);
    } else if (m) out.push(m);
  }
  return out;
}

function Bloc({ b, societe, intro }: { b: Bloc; societe: Societe; intro: string }) {
  if (b.p) {
    const t = texte(b.p, societe);
    return t ? <p>{t}</p> : null;
  }
  if (b.liste)
    return (
      <ul>
        {b.liste.map((x) => {
          const t = texte(x, societe);
          return t ? <li key={x}>{t}</li> : null;
        })}
      </ul>
    );
  if (b.fiche)
    return (
      <dl className="lg-fiche">
        {b.fiche.map((r) => {
          const [k, v] = typeof r === "string" ? [societe[r]?.libelle, `{${r}}`] : r;
          const t = k ? texte(v, societe) : null;
          return t ? (
            <div key={k} className="lg-ligne">
              <dt>{k}</dt>
              <dd>{t}</dd>
            </div>
          ) : null;
        })}
      </dl>
    );
  if (b.tableau) {
    const c = b.tableau.colonnes;
    return (
      <table className="lg-tableau">
        <thead>
          <tr>{c.map((x) => <th key={x} scope="col">{x}</th>)}</tr>
        </thead>
        <tbody>
          {b.tableau.lignes.map((l) => (
            <tr key={l[0]}>
              {l.map((x, i) => (
                <td key={i} data-col={c[i]}>{texte(x, societe)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (b.composant === "choixCookies") return <BoutonChoixCookies />;
  if (b.composant === "credits")
    return (
      <>
        <p>{intro}</p>
        <ListeCredits />
      </>
    );
  return null;
}

export async function PageLegale({ chemin }: { chemin: CheminLegal }) {
  const [legal, creditsPage, footer, T] = await Promise.all([lireContenu("legal"), lireContenu("fr.creditsPage"), lireContenu("fr.footer"), lireContenu("legal-ui.legalUi")]);
  const onglets = footer.legal.filter((l) => Object.hasOwn(legal.pages, l.href));
  const P = (legal.pages as Record<CheminLegal, Page>)[chemin];
  const societe = legal.societe as Societe;
  return (
    <div className="lg">
      <section className="lg-bandeau">
        <div className="container-oht">
          <h1>{P.titre}</h1>
          <p className="lg-intro">{P.intro}</p>
          <p className="lg-maj">{T.miseAJour} {legal.miseAJour}</p>
          <nav className="lg-onglets" aria-label={footer.legalLabel}>
            {onglets.map((l) => (
              <Link key={l.href} href={l.href} aria-current={l.href === chemin ? "page" : undefined}>
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </section>
      <div className="container-oht lg-doc">
        <SommaireLegal sections={P.sections.map((s) => ({ id: s.id, titre: s.titre }))} />
        <article className="lg-corps">
          {P.sections.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-titre`}>
              <h2 id={`${s.id}-titre`}>{s.titre}</h2>
              {s.blocs.map((b, i) => (
                <Bloc key={i} b={b} societe={societe} intro={creditsPage.intro} />
              ))}
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}
