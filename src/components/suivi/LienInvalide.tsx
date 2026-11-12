import Link from "next/link";
import { headers } from "next/headers";
import { lireContenu } from "@/lib/contenu";
import { adresseLangue } from "@/lib/adresses-langues";
import { langueNavigateur, type LangueDoc } from "@/lib/suivi";
import { Icon } from "@/components/ui/Icon";
import "./lien-invalide.css";

// Écran d'un lien client faux, incomplet ou retiré (/suivi/<jeton>, /payer/<jeton>) : sans dossier, la langue est celle
// du navigateur. Une issue claire : l'e-mail public de l'agence (mentions légales, modifiable dans l'admin) et le billet.
export async function langueVisiteur(): Promise<LangueDoc> {
  return langueNavigateur((await headers()).get("accept-language"));
}

export async function titreLienInvalide(): Promise<string> {
  const [langue, suivi] = await Promise.all([langueVisiteur(), lireContenu("suivi.suivi")]);
  return suivi[langue].invalide.metaTitre;
}

export async function LienInvalide({ langue }: { langue?: LangueDoc }) {
  const l = langue ?? (await langueVisiteur());
  const [suivi, legal] = await Promise.all([lireContenu("suivi.suivi"), lireContenu("legal")]);
  const T = suivi[l].invalide;
  const email = legal.societe.email.visible ? legal.societe.email.valeur : null;
  return (
    <div className="li-page" lang={suivi[l].html}>
      <div aria-hidden="true" className="h-20 bg-abyss" />
      <section className="li-carte" aria-labelledby="li-titre">
        <h1 id="li-titre">{T.titre}</h1>
        <p>{T.texte}</p>
        {email ? (
          <p className="li-ecrire">
            {T.ecrire}{" "}
            <a className="li-email" href={`mailto:${email}`}>
              {email}
            </a>
          </p>
        ) : null}
        <Link href={adresseLangue("/devis", l)} className="oht-btn li-devis">
          <span className="oht-btn-pastille is-gauche" aria-hidden="true">
            <Icon name="arrow-right" />
          </span>
          <span className="oht-btn-pilule">{T.devis}</span>
          <span className="oht-btn-pastille is-droite" aria-hidden="true">
            <Icon name="arrow-right" />
          </span>
        </Link>
      </section>
    </div>
  );
}
