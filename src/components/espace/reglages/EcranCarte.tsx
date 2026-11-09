import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { espace as T, logos } from "@/content/espace";
import { reglages as R } from "@/content/espace-reglages";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { lireCarte } from "@/lib/serveur/equipe/reglages/lectures";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { Bloc, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { Tete } from "../Tete";
import "./reglages.css";

// Carte de visite (lot « reglages ») : celle du compte connecté, faite de son seul profil (nom, rôle, langues, téléphone
// s'il est renseigné, e-mail professionnel), l'emblème rond de la marque et un QR qui contient la fiche vCard (rendu SVG
// par le serveur, qrcode). Rien d'inventé : un champ vide n'apparaît pas. Fiche .vcf téléchargeable (agents/carte/vcard).
const C = R.carte;

export async function EcranCarte() {
  const s = await exigerRole("agents");
  if (!s) redirect("/agents");
  const c = await lireCarte();
  const nom = c ? `${c.moi.prenom} ${c.moi.nom}` : "";
  return (
    <Enveloppe role="agents" session={s} actif="carte" minute={minuteServeur()}>
      <Tete titre={C.titre} sous={C.sous} />
      <div className="esp-reglages">
        {!c ? (
          <div className="esp-grille">
            <Bloc id="r-car" titre={C.titre} s={12} i={1}>
              <Vide texte={[T.vides.indisponible, ""]} />
            </Bloc>
          </div>
        ) : (
          <>
            <section className="carte-visite" aria-labelledby="r-car-nom" data-carte={c.moi.role}>
              <div className="identite">
                <Image className="embleme" src={logos.enteteMobile.src} alt={logos.enteteMobile.alt} width={56} height={56} sizes="56px" />
                <div>
                  <h2 id="r-car-nom">{nom}</h2>
                  <p className="role">
                    {C.role[c.moi.role]} · {C.organisation}
                  </p>
                </div>
                <dl>
                  <div>
                    <dt>{C.langues}</dt>
                    <dd>{c.moi.langues.map((l) => T.langues[l] ?? l).join(", ")}</dd>
                  </div>
                  {c.moi.telephone && (
                    <div>
                      <dt>{C.telephone}</dt>
                      <dd>{c.moi.telephone}</dd>
                    </div>
                  )}
                  <div>
                    <dt>{C.email}</dt>
                    <dd>{c.moi.email}</dd>
                  </div>
                </dl>
              </div>
              {/* SVG produit par qrcode à partir de la fiche vCard (des chemins seulement, aucun texte saisi) */}
              <span className="qr" role="img" aria-label={C.qr(nom)} dangerouslySetInnerHTML={{ __html: c.qr }} />
            </section>
            <div className="esp-grille">
              <Bloc id="r-car-v" titre={C.telecharger} s={12} i={2}>
                <p className="mention">{C.qrAide}</p>
                {!c.moi.telephone && (
                  <p className="aide">
                    {C.sansTelephone} <Link href="/agents/profil">{C.completer}</Link>
                  </p>
                )}
                <div className="reg-pied">
                  <a className="bouton" href="/agents/carte/vcard" download>
                    {C.telecharger}
                  </a>
                </div>
              </Bloc>
            </div>
          </>
        )}
      </div>
    </Enveloppe>
  );
}
