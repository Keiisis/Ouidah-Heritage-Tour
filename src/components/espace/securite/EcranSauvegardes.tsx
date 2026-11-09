import { redirect } from "next/navigation";
import { espace as T } from "@/content/espace";
import { securite as S } from "@/content/espace-securite";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { lireMembres, lireSauvegardes } from "@/lib/serveur/equipe/securite/lectures";
import { FORMATS } from "@/lib/serveur/equipe/securite/regles";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { Bloc, vars, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { Picto } from "../Picto";
import { Tete } from "../Tete";
import { moment, noms } from "./commun";
import "./securite.css";

// Sauvegardes (lot « securite », admins/sauvegardes), rendu sous <Suspense> : admin connecté seulement. Chaque table
// exportable, son nombre réel de lignes, son dernier export (lu au journal) et deux téléchargements servis par la route
// /admins/sauvegardes/export, qui relit la session. Ce que l'export retire est dit à l'écran ; la sauvegarde automatique
// de la base relève de Supabase, et l'écran le dit aussi.
const V = S.sauvegardes;

export async function EcranSauvegardes() {
  const s = await exigerRole("admins");
  if (!s) redirect("/admins");
  const [tables, membres] = await Promise.all([lireSauvegardes(), lireMembres()]);
  const nomDe = noms(membres);
  return (
    <Enveloppe role="admins" session={s} actif="sauvegardes" minute={minuteServeur()}>
      <Tete titre={V.titre} sous={V.sous} />
      <div className="esp-securite">
        <section className="perimetre construit" style={vars({ "--i": 1 })} aria-label={V.bloc}>
          <Picto nom="bouclier" />
          <div>
            <p>{V.exclus}</p>
            <p>{V.supabase}</p>
          </div>
        </section>
        <div className="esp-grille">
          <Bloc id="v-tab" titre={V.bloc} compte={tables ? tables.length : null} s={12} i={2}>
            {!tables ? (
              <Vide texte={[T.vides.indisponible, ""]} />
            ) : (
              <table className="tableau" id="table-sauvegardes">
                <caption className="invisible">{V.bloc}</caption>
                <thead>
                  <tr>
                    {Object.values(V.cols).map((c) => (
                      <th scope="col" key={c}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tables.map((t, k) => {
                    const [nom, garde] = V.tables[t.table] ?? [t.table, ""];
                    return (
                      <tr key={t.table} className="sec-arrivee" style={vars({ "--k": Math.min(k, 12) })} data-table={t.table}>
                        <td>
                          <b>{nom}</b>
                          <span className="sous-cell">{garde}</span>
                        </td>
                        <td className="num">{t.lignes ?? V.inconnu}</td>
                        <td data-dernier-export={t.dernier?.quand ?? ""}>{t.dernier ? V.dernier(moment(t.dernier.quand), t.dernier.par ? (nomDe.get(t.dernier.par) ?? null) : null, t.dernier.format.toUpperCase()) : <span className="meta">{V.jamais}</span>}</td>
                        <td>
                          <div className="telechargements">
                            {FORMATS.map((f) => (
                              <a key={f} className="bouton-2 bouton-petit" href={`/admins/sauvegardes/export?table=${t.table}&format=${f}`} download aria-label={V.lienDe(nom, f.toUpperCase())} data-format={f}>
                                {V[f]}
                              </a>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Bloc>
        </div>
      </div>
    </Enveloppe>
  );
}
