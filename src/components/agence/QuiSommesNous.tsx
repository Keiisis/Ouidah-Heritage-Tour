import Image from "next/image";
import Link from "@/components/ui/LienPublic";
import type { CSSProperties, ElementType } from "react";
import { DEVIS, type Membre } from "@/content/fr";
import type { quiSommesNous } from "@/content/qui-sommes-nous";
import { lireContenuPage as lireContenu } from "@/lib/serveur/contenu-page";
import { ButtonPrimary } from "@/components/ui/Buttons";
import { MouvementAgence } from "./MouvementAgence";
import "./qui-sommes-nous.css";

// Qui sommes-nous, piste A « Les visages » (Kevin, 30/10/2026) : la page présente d'abord des personnes. Le premier membre
// de l'équipe (la présidente aujourd'hui) en grand, son nom en Fraunces géant ; les autres en mosaïque ; notre histoire ;
// une bande navy de trois faits sur l'agence ; nous joindre. Rendu serveur, lisible sans JavaScript ; seul le mouvement
// est côté client (MouvementAgence). Une donnée vide ou masquée n'est jamais rendue, et aucun « [à fournir] » n'apparaît.

type Champ = { libelle: string; valeur: string | string[] | null; visible: boolean };
type Societe = Record<string, Champ>;
type Textes = typeof quiSommesNous;

const plein = (s: string | null | undefined): s is string => typeof s === "string" && s.trim() !== "";
const phrase = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

// information publique de legal.json, ou null si elle est masquée ou vide ; l'IFU et le capital ne sont jamais lus ici
function info(societe: Societe, cle: "forme" | "rccm" | "carte" | "activite" | "quartier" | "ville" | "agence" | "email"): string | null {
  const c = societe[cle];
  return c?.visible && typeof c.valeur === "string" && plein(c.valeur) ? c.valeur.trim() : null;
}
function telephones(societe: Societe): string[] {
  const c = societe.telephones;
  return c?.visible && Array.isArray(c.valeur) ? c.valeur.filter(plein) : [];
}

// trois faits au plus ; la carte professionnelle et sa validité restent dans le détail
type Fait = { valeur: string; libelle: string; detail: string[] };
function faits(societe: Societe, T: Textes): Fait[] {
  const out: Fait[] = [];
  const forme = info(societe, "forme")?.replace(/\s*\([^)]*\)\s*$/, "");
  const rccm = info(societe, "rccm"), carte = info(societe, "carte");
  if (forme) out.push({ valeur: forme, libelle: T.faits.forme, detail: [rccm && phrase(`${T.faits.rccm} ${rccm}`), carte && phrase(carte)].filter(plein) });
  const activite = info(societe, "activite");
  if (activite) out.push({ valeur: activite, libelle: T.faits.activite, detail: [] });
  // siège : champs publics « ville » et « quartier » de legal.json, jamais l'adresse privée (îlot, parcelle, maison)
  const ville = info(societe, "ville"), quartier = info(societe, "quartier");
  const ouidah = info(societe, "agence");
  const agenceOuidah = ouidah && phrase(`${T.faits.agence} : ${ouidah}`);
  if (ville) out.push({ valeur: ville, libelle: T.faits.siege, detail: [quartier && phrase(`${T.faits.quartier} ${quartier}`), agenceOuidah].filter(plein) });
  else if (ouidah) out.push({ valeur: ouidah, libelle: T.faits.agence, detail: [] });
  return out;
}

// nom en lignes masquées (une par mot) ; l'espace entre les mots garde le texte lisible d'un bloc
function Nom({ nom, as: Tag }: { nom: string; as: ElementType }) {
  return (
    <Tag className="qs-nom">
      {nom.trim().split(/\s+/).map((mot, k) => (
        <span key={k} className="qs-masque">
          {k ? " " : null}
          <span style={{ "--qs-k": k } as CSSProperties}>{mot}</span>
        </span>
      ))}
    </Tag>
  );
}

function Cadre({ m, une = false, portrait }: { m: Membre; une?: boolean; portrait: string }) {
  if (!m.portrait || !plein(m.portrait.src)) return null;
  return (
    <figure className={`qs-cadre${une ? " qs-cadre-une" : ""}`}>
      <Image
        src={m.portrait.src}
        alt={plein(m.portrait.alt) ? m.portrait.alt : `${portrait} ${m.nom}`}
        fill
        sizes={une ? "(max-width: 1023px) 480px, 45vw" : "(max-width: 639px) 80vw, (max-width: 1023px) 45vw, 30vw"}
        preload={une}
      />
      <span className="qs-rideau" aria-hidden="true" />
    </figure>
  );
}

const Role = ({ m }: { m: Membre }) => (plein(m.role) ? <p className="qs-role">{m.role}</p> : null);

export async function QuiSommesNous() {
  const [legal, agence, equipe, T] = await Promise.all([lireContenu("legal"), lireContenu("fr.agence"), lireContenu("fr.equipe"), lireContenu("qui-sommes-nous.quiSommesNous")]);
  const societe = legal.societe as Societe;
  const membres = equipe.filter((m) => plein(m.nom));
  const [une, ...autres] = membres;
  const avecPortrait = !!une?.portrait && plein(une.portrait.src);
  const histoire = plein(agence.histoire) ? agence.histoire.split(/\n\s*\n/).map((p) => p.trim()).filter(plein) : [];
  const F = faits(societe, T);
  const tels = telephones(societe), email = info(societe, "email");

  return (
    <div className="qs">
      <section className={`qs-ouverture${avecPortrait ? "" : " qs-sans-portrait"}`} aria-labelledby="qs-titre">
        <div className="container-oht qs-grille">
          <div className="qs-ouverture-texte">
            <h1 id="qs-titre">{T.titre}</h1>
            {plein(agence.accroche) ? <p className="qs-accroche">{agence.accroche}</p> : null}
            <ButtonPrimary href={DEVIS.voyage} className="qs-soleil">
              {T.creer}
            </ButtonPrimary>
          </div>
          {une ? (
            <>
              <Cadre m={une} une portrait={T.portrait} />
              <div className="qs-une-nom">
                <Nom nom={une.nom} as="p" />
                <Role m={une} />
              </div>
            </>
          ) : null}
        </div>
      </section>

      {autres.length ? (
        <section className="qs-equipe" aria-labelledby="qs-titre-equipe">
          <div className="container-oht">
            <h2 id="qs-titre-equipe">{T.equipe}</h2>
            <div className="qs-mosaique">
              {autres.map((m, i) => (
                <article key={`${m.nom}-${i}`} className="qs-membre" data-qs-entree="">
                  <Cadre m={m} portrait={T.portrait} />
                  <div className="qs-nom-bloc">
                    <Nom nom={m.nom} as="h3" />
                    <Role m={m} />
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {histoire.length ? (
        <section className="qs-histoire" aria-labelledby="qs-titre-histoire">
          <div className="container-oht">
            <h2 id="qs-titre-histoire">{T.histoire}</h2>
            <div className="qs-histoire-texte">
              {histoire.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {F.length ? (
        <section className="qs-agence" aria-labelledby="qs-titre-agence">
          <div className="container-oht">
            <h2 id="qs-titre-agence">{T.agence}</h2>
            <div className="qs-faits">
              {F.map((f) => (
                <div key={f.libelle} className="qs-fait">
                  <p className="qs-valeur">{f.valeur}</p>
                  <p className="qs-detail">
                    <b>{phrase(f.libelle)}</b>
                    {f.detail.length ? ` ${f.detail.join(" ")}` : null}
                  </p>
                </div>
              ))}
            </div>
            <Link href={T.legales.href} className="oht-lien qs-legales">
              {T.legales.label}
            </Link>
          </div>
        </section>
      ) : null}

      <section className="qs-joindre" aria-labelledby="qs-titre-joindre">
        <div className="container-oht qs-joindre-grille">
          <h2 id="qs-titre-joindre">{T.joindre}</h2>
          {tels.length || email ? (
            <div className="qs-contacts">
              {tels.map((t) => (
                <a key={t} className="oht-lien" href={`tel:${t.replace(/\s/g, "")}`}>
                  {t}
                </a>
              ))}
              {email ? (
                <a className="oht-lien qs-courriel" href={`mailto:${email}`}>
                  {email}
                </a>
              ) : null}
            </div>
          ) : null}
          <ButtonPrimary href={DEVIS.question} className="qs-ecrire">
            {T.ecrire}
          </ButtonPrimary>
        </div>
      </section>

      <MouvementAgence />
    </div>
  );
}
