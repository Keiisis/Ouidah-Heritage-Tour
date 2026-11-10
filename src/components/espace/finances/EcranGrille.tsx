import Link from "next/link";
import { redirect } from "next/navigation";
import type { Role } from "@/content/equipe";
import { espace as T } from "@/content/espace";
import { CATEGORIES_SAISIES, finances as F } from "@/content/espace-finances";
import { lireContenu } from "@/lib/contenu";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { basculerPrix, enregistrerPrix } from "@/lib/serveur/equipe/finances/actions";
import { lireGrille, type Prix } from "@/lib/serveur/equipe/finances/lectures";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { Bloc, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { Tete } from "../Tete";
import { Montant } from "./commun";
import { BoutonAction, FormAction } from "./Envoi";
import "./finances.css";

// Grille tarifaire (lot L7) : prix des entrées et de la conciergerie, en FCFA et en € (taux fixe). L'admin édite (ajout,
// modification, retrait) ; l'agent lit les prix actifs. Les circuits ne s'y saisissent plus (10/11) : leur prix par
// personne vient de leur fiche (fr.tours publié) et s'affiche ici en lecture ; les anciennes lignes « circuit » restent en
// base, ignorées. Rendu sous <Suspense> ; le serveur revérifie le rôle.
const G = F.grille;

function Champs({ p, uid }: { p?: Prix; uid: string }) {
  return (
    <div className="champs">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="champ">
        <label htmlFor={`${uid}-cat`}>{G.categorie}</label>
        <select id={`${uid}-cat`} name="categorie" defaultValue={p?.categorie ?? ""} required>
          <option value="" disabled>
            {F.champs.categorie}
          </option>
          {CATEGORIES_SAISIES.map((c) => (
            <option key={c} value={c}>
              {F.categories[c]}
            </option>
          ))}
        </select>
      </div>
      <div className="champ large">
        <label htmlFor={`${uid}-lib`}>{G.libelle}</label>
        <input id={`${uid}-lib`} name="libelle" maxLength={90} defaultValue={p?.libelle ?? ""} autoComplete="off" required />
      </div>
      <div className="champ">
        <label htmlFor={`${uid}-uni`}>{G.unite}</label>
        <input id={`${uid}-uni`} name="unite" maxLength={40} defaultValue={p?.unite ?? ""} autoComplete="off" aria-describedby={`${uid}-uni-a`} />
        <span className="aide" id={`${uid}-uni-a`}>
          {G.uniteAide}
        </span>
      </div>
      <div className="champ">
        <label htmlFor={`${uid}-prix`}>{G.prix}</label>
        <input id={`${uid}-prix`} name="prix" inputMode="numeric" defaultValue={p ? String(p.prix) : ""} autoComplete="off" required aria-describedby={`${uid}-prix-a`} />
        <span className="aide" id={`${uid}-prix-a`}>
          {G.prixAide}
        </span>
      </div>
    </div>
  );
}

export async function EcranGrille({ role }: { role: Role }) {
  const s = await exigerRole(role);
  if (!s) redirect(`/${role}`);
  const admin = s.role === "admin" && role === "admins";
  const [prix, tours] = await Promise.all([lireGrille(admin), lireContenu("fr.tours")]);
  return (
    <Enveloppe role={role} session={s} actif="grille" minute={minuteServeur()}>
      <Tete titre={G.titre} sous={admin ? G.sousAdmin : G.sousAgent} />
      <div className="esp-finances">
        <div className="esp-grille">
          {admin && (
            <Bloc id="g-aj" titre={G.ajouter} s={12} i={1}>
              <FormAction action={enregistrerPrix} nom={G.ajouter} bouton={G.enregistrer} reussite={G.enregistre} enfants={<Champs uid="g-nouveau" />} />
            </Bloc>
          )}
          <Bloc id="g-circuit" titre={F.categories.circuit} compte={tours.length} s={12} i={2}>
            <p className="mention">
              {G.circuits.note} <Link href={role === "admins" ? "/admins/circuits" : "/agents/contenu?section=circuits"}>{G.circuits.lien}</Link>
            </p>
            <div className="tableau-defile">
              <table className="tableau">
                <thead>
                  <tr>
                    <th scope="col">{G.cols.libelle}</th>
                    <th scope="col">{G.cols.unite}</th>
                    <th scope="col">{G.cols.prix}</th>
                    <th scope="col">{G.cols.etat}</th>
                  </tr>
                </thead>
                <tbody>
                  {tours.map((t) => (
                    <tr key={t.slug} data-circuit={t.slug}>
                      <td data-col={G.cols.libelle}>
                        <b>{t.title}</b>
                      </td>
                      <td data-col={G.cols.unite}>{G.circuits.unite}</td>
                      <td data-col={G.cols.prix}>{t.price === null ? G.circuits.sansPrix : <Montant n={t.price} />}</td>
                      <td data-col={G.cols.etat}>{t.price !== null && t.priceVisible ? G.circuits.affiche : G.circuits.masque}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Bloc>
          {!prix ? (
            <Bloc id="g-liste" titre={G.titre} s={12} i={3}>
              <Vide texte={[T.vides.indisponible, ""]} />
            </Bloc>
          ) : !prix.some((p) => p.categorie !== "circuit") ? (
            <Bloc id="g-liste" titre={G.titre} s={12} i={3}>
              <Vide texte={admin ? G.vide : G.videAgent} />
            </Bloc>
          ) : (
            CATEGORIES_SAISIES.map((c, k) => {
              const lignes = prix.filter((p) => p.categorie === c);
              return (
                <Bloc key={c} id={`g-${c}`} titre={F.categories[c]} compte={lignes.length} s={12} i={3 + k}>
                  {lignes.length ? (
                    <div className="tableau-defile">
                      <table className="tableau">
                        <thead>
                          <tr>
                            <th scope="col">{G.cols.libelle}</th>
                            <th scope="col">{G.cols.unite}</th>
                            <th scope="col">{G.cols.prix}</th>
                            {admin && <th scope="col">{G.cols.etat}</th>}
                            {admin && (
                              <th scope="col">
                                <span className="invisible">{G.modifier}</span>
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {lignes.map((p) => (
                            <tr key={p.id} data-prix={p.id}>
                              <td data-col={G.cols.libelle}>
                                <b>{p.libelle}</b>
                              </td>
                              <td data-col={G.cols.unite}>{p.unite ?? ""}</td>
                              <td data-col={G.cols.prix}>
                                <Montant n={p.prix} />
                              </td>
                              {admin && <td data-col={G.cols.etat}>{!p.active && <span className="etat" data-e="retiree">{G.retiree}</span>}</td>}
                              {admin && (
                                <td className="actions">
                                  <BoutonAction action={basculerPrix} args={[p.id, !p.active]} libelle={p.active ? G.retirer : G.remettre} nom={p.active ? G.retirerDe(p.libelle) : `${G.remettre} : ${p.libelle}`} reussite={G.enregistre} />
                                  <details>
                                    <summary className="bouton-2 bouton-petit" aria-label={G.modifierDe(p.libelle)}>
                                      {G.modifier}
                                    </summary>
                                    <FormAction action={enregistrerPrix} nom={G.modifierDe(p.libelle)} bouton={G.enregistrer} reussite={G.enregistre} garder enfants={<Champs p={p} uid={`g-${p.id}`} />} />
                                  </details>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Vide texte={[admin ? G.vide[0] : G.videAgent[0], ""]} />
                  )}
                </Bloc>
              );
            })
          )}
        </div>
      </div>
    </Enveloppe>
  );
}
