import Image from "next/image";
import Link from "@/components/ui/LienPublic";
import { lireContenuPage as lireContenu } from "@/lib/serveur/contenu-page";
import { Objet3D } from "@/components/ui/Objet3D";
import { AjouterVoyage } from "./AjouterVoyage";
import { CarteAnneaux } from "./CarteAnneaux";
import { Curseur } from "./Curseur";
import type { DonneesLieu, Vue } from "./donnees";
import "./fiche-lieu.css";

// Fiche lieu, piste A « Hier, aujourd'hui » (Kevin, 30/10/2026). Le lieu hier et aujourd'hui côte à côte (diptyque fixe ;
// curseur seulement si l'admin coche « même cadrage ») ; sans paire d'images (la plupart des lieux), la scène est la carte
// à anneaux centrée sur le lieu. Puis le récit (paragraphes de la page Histoire qui parlent du lieu), la fiche pratique,
// les circuits qui y passent et ce qu'il y a autour. Rendu serveur ; le mouvement est en CSS (transform, opacity), coupé
// par « mouvement réduit » ; seuls le bouton d'ajout et le curseur sont des composants client.

const photo = (v: Vue, sizes: string, classe = "") => <Image className={classe} src={v.src} alt={v.alt} fill sizes={sizes} />;

export async function FicheLieu({ d }: { d: DonneesLieu }) {
  const T = await lireContenu("fiche-lieu.ficheLieu");
  const { scene } = d;
  const lireChapitre = d.chapitre ? { href: `${T.histoire}#${d.chapitre.id}`, label: d.chapitre.partiel ? T.lireChapitre : T.toutHistoire } : null;
  const gauche = d.description || d.chapitre;

  return (
    <div className="fl">
      <section className="fl-tete">
        <div className="container-oht fl-tete-grille">
          <Link className="oht-lien fl-retour" href={T.retour.href}>
            {T.retour.label}
          </Link>
          <div>
            <h1>{d.nom}</h1>
            {d.sousTitre ? <p className="fl-sous-titre">{d.sousTitre}</p> : null}
          </div>
          <div className="fl-actions">
            <AjouterVoyage slug={d.slug} nom={d.nom} clair />
            {d.circuits.length ? (
              <a className="oht-lien" href="#fl-circuits">
                {T.voirCircuits}
              </a>
            ) : null}
          </div>
        </div>
      </section>

      {scene ? (
        <section className="fl-scene" aria-label={scene.mode === "carte" ? T.scene.carte : scene.mode === "photo" ? d.nom : T.scene.paire}>
          {scene.mode === "photo" ? (
            <figure className="fl-panneau fl-seule">
              <div className="fl-entree">{photo(scene.vue, "100vw")}</div>
            </figure>
          ) : scene.mode === "diptyque" ? (
            <div className="fl-diptyque">
              <figure className="fl-panneau">
                {photo(scene.hier, "(max-width: 639px) 100vw, 50vw")}
                <span className="fl-marque">{scene.marque}</span>
              </figure>
              <figure className="fl-panneau">
                <div className="fl-entree">
                  {photo(scene.auj, "(max-width: 639px) 100vw, 50vw")}
                  <span className="fl-marque">{T.aujourdhui}</span>
                </div>
              </figure>
            </div>
          ) : scene.mode === "curseur" ? (
            <Curseur hier={photo(scene.hier, "100vw")} auj={photo(scene.auj, "100vw")} marqueHier={scene.marque} />
          ) : (
            <>
              <CarteAnneaux d={d} format="large" avecPhoto onde className="fl-vue-large" />
              <CarteAnneaux d={d} format="moyen" avecPhoto onde className="fl-vue-moyen" />
              <CarteAnneaux d={d} format="etroit" avecPhoto onde className="fl-vue-etroit" />
            </>
          )}
          <div className="container-oht fl-legendes">
            {scene.mode === "carte" || scene.mode === "photo" ? (
              d.photo ? (
                <p>{d.photo.alt}</p>
              ) : null
            ) : (
              <>
                <p>{scene.hier.legende}</p>
                <p>{scene.auj.legende}</p>
              </>
            )}
          </div>
        </section>
      ) : null}

      <div className={`container-oht fl-corps ${gauche ? "" : "fl-seul"}`}>
        {gauche ? (
          <div className="fl-gauche">
            {d.description ? <p className="fl-chapeau">{d.description}</p> : null}
            {d.chapitre ? (
              <article className="fl-recit" aria-labelledby="fl-recit-titre">
                <h2 id="fl-recit-titre">{d.chapitre.titre}</h2>
                {d.chapitre.repere ? <p className="fl-repere">{d.chapitre.repere}</p> : null}
                <div className="fl-texte">
                  {d.recit.map((p) => (
                    <p key={p.slice(0, 40)}>{p}</p>
                  ))}
                </div>
                {d.archives.map((a) => (
                  <figure key={a.src} className="fl-archive">
                    <div className="fl-tirage">
                      <Image src={a.src} alt={a.legende} width={a.largeur} height={a.hauteur} sizes="(max-width: 1023px) 100vw, 60vw" />
                      <span className="fl-rideau" aria-hidden="true" />
                    </div>
                    <figcaption>{a.legende}</figcaption>
                  </figure>
                ))}
                {lireChapitre ? (
                  <Link className="oht-lien fl-suite" href={lireChapitre.href}>
                    {lireChapitre.label}
                  </Link>
                ) : null}
              </article>
            ) : null}
          </div>
        ) : null}
        <aside className="fl-fiche" aria-labelledby="fl-fiche-titre">
          <h2 id="fl-fiche-titre">{T.enPratique}</h2>
          <dl>
            {d.lignes.map((l) => (
              <div key={l.cle} className="fl-ligne">
                <dt>
                  <Objet3D nom={l.objet} taille={40} />
                  {T.lignes[l.cle]}
                </dt>
                <dd>
                  {l.href && l.texte ? (
                    <a href={l.href} {...(l.externe ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                      {l.texte}
                    </a>
                  ) : (
                    l.texte
                  )}
                  {l.lien ? (
                    <>
                      {l.texte ? <br /> : null}
                      <a className="fl-aller" href={l.lien.href} target="_blank" rel="noopener noreferrer">
                        {l.lien.label}
                      </a>
                    </>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
          <AjouterVoyage slug={d.slug} nom={d.nom} clair />
        </aside>
      </div>

      {d.circuits.length ? (
        <section className="fl-circuits" id="fl-circuits" aria-labelledby="fl-circuits-titre">
          <div className="container-oht">
            <h2 id="fl-circuits-titre">{T.circuits}</h2>
            <ul className="fl-liste-circuits">
              {d.circuits.map((c) => (
                <li key={c.slug}>
                  <Link className="fl-carte-circuit" href={c.href}>
                    {c.image ? (
                      <div className="fl-photo-circuit">
                        <Image src={c.image.src} alt={c.image.alt} fill sizes="(max-width: 639px) 100vw, 50vw" />
                      </div>
                    ) : null}
                    <div className="fl-texte-circuit">
                      <h3>{c.titre}</h3>
                      <p className="fl-tag">{[c.tag, T.etape(c.rang + 1, c.etapes.length)].filter(Boolean).join(" · ")}</p>
                      <ol className="fl-etapes">
                        {c.etapes.map((e, i) => (
                          <li key={e} className={i === c.rang ? "fl-ici" : undefined}>
                            {e}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {d.autour.length ? (
        <section className="fl-autour" aria-labelledby="fl-autour-titre">
          <div className="container-oht">
            <h2 id="fl-autour-titre">{T.autour}</h2>
            <p className="fl-note">{T.note}</p>
            <div className={`fl-autour-grille ${scene?.mode === "carte" ? "fl-sans-plan" : ""}`}>
              {scene?.mode !== "carte" ? (
                <div className="fl-plan">
                  <CarteAnneaux d={d} format="carre" avecPhoto={false} onde={false} className="fl-vue-pas-etroit" />
                  <CarteAnneaux d={d} format="etroit" avecPhoto={false} onde={false} className="fl-vue-etroit" />
                </div>
              ) : null}
              <div className="fl-blocs">
                {d.autour.map((g) => (
                  <div key={g.nom} className="fl-bloc">
                    <h3>{g.nom}</h3>
                    <ol>
                      {g.voisins.map((v) => (
                        <li key={v.slug}>
                          {v.href ? (
                            <Link href={v.href}>
                              <span className="fl-n">{v.nom}</span>
                              <span className="fl-d">{[T.metres(v.m), v.temps].filter(Boolean).join(" · ")}</span>
                            </Link>
                          ) : (
                            <span className="fl-voisin">
                              <span className="fl-n">{v.nom}</span>
                              <span className="fl-d">{[T.metres(v.m), v.temps].filter(Boolean).join(" · ")}</span>
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
