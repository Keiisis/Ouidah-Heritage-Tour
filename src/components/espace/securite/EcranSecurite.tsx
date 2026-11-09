import Link from "next/link";
import { redirect } from "next/navigation";
import { espace as T } from "@/content/espace";
import { securite as S } from "@/content/espace-securite";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { bloquerIp, leverBlocage, revoquerSession, revoquerSessionsDe } from "@/lib/serveur/equipe/securite/actions";
import { lireBlocages, lireEssais, lireJournal, lireMembres, lireSessions } from "@/lib/serveur/equipe/securite/lectures";
import { adresseFiltres, DUREES, lireFiltres, masque, UUID } from "@/lib/serveur/equipe/securite/regles";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { Bloc, vars, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { Picto } from "../Picto";
import { Tete } from "../Tete";
import { court, moment, noms } from "./commun";
import { BoutonSec, FormSec } from "./Envoi";
import "./securite.css";

// Pare-feu et sessions (lot « securite », admins/securite), rendu sous <Suspense> : admin connecté seulement, sinon
// retour à l'entrée /admins. Le périmètre honnête d'abord (l'espace de l'équipe seulement ; le site entier relève de
// Vercel Firewall), puis les essais refusés des 24 h, les adresses bloquées, les sessions ouvertes et le journal filtré
// (auteur, action, dates ; filtres dans l'adresse, lus après la session). Données réelles ; si la base ne répond pas, on
// le dit. Jamais une adresse IP en clair : personne ne la garde, l'écran montre l'empreinte réduite.
const J = S.journal;
const indispo = <Vide texte={[T.vides.indisponible, ""]} />;

/** Champs d'un blocage : motif et durée (l'empreinte ou l'adresse est donnée à côté). */
function ChampsBlocage({ id }: { id: string }) {
  return (
    <div className="champs">
      <div className="champ">
        <label htmlFor={`${id}-motif`}>{S.champs.motif}</label>
        <input id={`${id}-motif`} name="motif" type="text" maxLength={200} required aria-describedby={`${id}-motif-a`} />
        <span className="aide" id={`${id}-motif-a`}>
          {S.blocages.motifAide}
        </span>
      </div>
      <div className="champ">
        <label htmlFor={`${id}-duree`}>{S.champs.duree}</label>
        <select id={`${id}-duree`} name="duree" defaultValue="24h">
          {Object.keys(DUREES).map((d) => (
            <option key={d} value={d}>
              {S.blocages.durees[d]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** Détails d'une ligne du journal : les identifiants deviennent des noms ou des références courtes. */
function Details({ d, nomDe }: { d: Record<string, unknown>; nomDe: Map<string, string> }) {
  const vus = Object.keys(J.cles).filter((k) => d[k] !== undefined && d[k] !== null && d[k] !== "");
  if (!vus.length) return <span className="meta">–</span>;
  const valeur = (k: string, v: unknown) => {
    if (typeof v === "boolean") return v ? J.oui : J.non;
    if (typeof v !== "string") return String(v);
    if (k === "dossier" && UUID.test(v)) return `DEM-${v.slice(0, 6).toUpperCase()}`;
    if (UUID.test(v)) return nomDe.get(v) ?? court(v);
    return v;
  };
  return (
    <span className="details-journal">
      {vus.map((k) => (
        <span key={k}>
          {J.cles[k]} <b>{valeur(k, d[k])}</b>
        </span>
      ))}
    </span>
  );
}

export async function EcranSecurite({ recherche }: { recherche: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await exigerRole("admins");
  if (!s) redirect("/admins");
  const minute = minuteServeur(); // heure de la requête, lue après la session
  const f = lireFiltres(await recherche);
  const [membres, journal, sessions, essais, blocages] = await Promise.all([lireMembres(), lireJournal(f), lireSessions(), lireEssais(), lireBlocages()]);
  const nomDe = noms(membres);
  const bloquees = new Set(blocages?.blocages.map((b) => b.ip) ?? []);
  const nbEssais = essais?.reduce((n, x) => n + x.echecs, 0) ?? 0;
  // sessions rangées par membre : « toutes ses sessions » sur la première ligne de chacun
  const triees = (sessions ?? []).toSorted((a, b) => (nomDe.get(a.profil) ?? "").localeCompare(nomDe.get(b.profil) ?? "", "fr") || b.vue.localeCompare(a.vue));
  const exportCsv = `/admins/securite/journal${adresseFiltres(f) ? `?${adresseFiltres(f)}` : ""}`;

  return (
    <Enveloppe role="admins" session={s} actif="securite" minute={minute}>
      <Tete titre={S.ecran.titre} sous={S.ecran.sous} />
      <div className="esp-securite">
        <section className="perimetre construit" style={vars({ "--i": 1 })} aria-labelledby="s-per" data-perimetre>
          <Picto nom="bouclier" />
          <div>
            <h2 id="s-per">{S.perimetre.titre}</h2>
            <p>{S.perimetre.texte}</p>
            <p>{S.perimetre.empreinte}</p>
          </div>
        </section>

        <div className="esp-grille">
          <Bloc id="s-ess" titre={S.essais.titre} compte={essais ? nbEssais : null} s={12} i={2}>
            {!essais ? (
              indispo
            ) : !essais.length ? (
              <Vide texte={S.essais.vide} />
            ) : (
              <>
                <p className="mention">{S.essais.resume(nbEssais, essais.length)}</p>
                <table className="tableau" id="table-essais">
                  <caption className="invisible">{S.essais.titre}</caption>
                  <thead>
                    <tr>
                      {Object.values(S.essais.cols).map((c) => (
                        <th scope="col" key={c}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {essais.map((e, k) => (
                      <tr key={e.ip} className="sec-arrivee" style={vars({ "--k": k })} data-essais-ip={masque(e.ip)}>
                        <td>
                          <span className="empreinte">{masque(e.ip)}</span>
                          <span className="sous-cell">{e.types.map((t) => S.essais.types[t] ?? t).join(", ")}</span>
                        </td>
                        <td className="num">{e.echecs}</td>
                        <td>
                          {[...e.comptes.map((c) => nomDe.get(c) ?? court(c)), ...(e.inconnus ? [S.essais.sansCompte(e.inconnus)] : [])].join(", ")}
                        </td>
                        <td>{moment(e.dernier)}</td>
                        <td>
                          {bloquees.has(e.ip) ? (
                            <span className="etat" data-e="bloquee">
                              {S.essais.bloquee}
                            </span>
                          ) : e.ip === blocages?.moi ? (
                            <span className="meta">{S.sessions.cette}</span>
                          ) : (
                            <details className="sec-repli">
                              <summary aria-label={S.essais.bloquerDe(masque(e.ip))}>
                                <Picto nom="chevron" />
                                {S.essais.bloquer}
                              </summary>
                              <FormSec action={bloquerIp} bouton={S.blocages.bouton} reussite={S.blocages.bloque} nom={S.essais.bloquerDe(masque(e.ip))} enfants={<><input type="hidden" name="empreinte" value={e.ip} /><ChampsBlocage id={`b-${court(e.ip)}`} /></>} />
                            </details>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </Bloc>

          <Bloc id="s-blo" titre={S.blocages.titre} compte={blocages ? blocages.blocages.length : null} s={12} i={3}>
            {!blocages ? (
              indispo
            ) : !blocages.blocages.length ? (
              <Vide texte={S.blocages.vide} />
            ) : (
              <table className="tableau" id="table-blocages">
                <caption className="invisible">{S.blocages.titre}</caption>
                <thead>
                  <tr>
                    {Object.values(S.blocages.cols).map((c) => (
                      <th scope="col" key={c}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {blocages.blocages.map((b, k) => (
                    <tr key={b.id} className="sec-arrivee" style={vars({ "--k": k })} data-blocage={b.id}>
                      <td>
                        <span className="empreinte">{masque(b.ip)}</span>
                        <span className="sous-cell">{moment(b.cree)}</span>
                      </td>
                      <td>{b.motif}</td>
                      <td>{b.expire ? moment(b.expire) : S.blocages.sansFin}</td>
                      <td>{b.par ? (nomDe.get(b.par) ?? court(b.par)) : "–"}</td>
                      <td>
                        <div className="actions">
                          <BoutonSec action={leverBlocage} args={[b.id]} libelle={S.blocages.lever} nom={S.blocages.leverDe(masque(b.ip))} reussite={S.blocages.leve} attr="lever" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <details className="sec-repli" id="bloquer-adresse">
              <summary>
                <Picto nom="chevron" />
                {S.blocages.ajouter}
              </summary>
              <FormSec
                action={bloquerIp}
                bouton={S.blocages.bouton}
                reussite={S.blocages.bloque}
                nom={S.blocages.ajouter}
                enfants={
                  <>
                    <div className="champ">
                      <label htmlFor="b-ip">{S.champs.ip}</label>
                      <input id="b-ip" name="ip" type="text" inputMode="text" autoComplete="off" spellCheck={false} maxLength={45} aria-describedby="b-ip-a" />
                      <span className="aide" id="b-ip-a">
                        {S.blocages.ipAide}
                      </span>
                    </div>
                    <ChampsBlocage id="b-n" />
                  </>
                }
              />
            </details>
          </Bloc>

          <Bloc id="s-ses" titre={S.sessions.titre} compte={sessions ? sessions.length : null} s={12} i={4}>
            {!sessions ? (
              indispo
            ) : !sessions.length ? (
              <Vide texte={S.sessions.vide} />
            ) : (
              <table className="tableau" id="table-sessions">
                <caption className="invisible">{S.sessions.titre}</caption>
                <thead>
                  <tr>
                    {Object.values(S.sessions.cols).map((c) => (
                      <th scope="col" key={c}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {triees.map((x, k) => {
                    const qui = nomDe.get(x.profil) ?? court(x.profil);
                    const premiere = k === 0 || triees[k - 1].profil !== x.profil;
                    return (
                      <tr key={x.id} data-session-id={x.id} data-profil={x.profil}>
                        <td>
                          <b>{qui}</b>
                          {x.moi && (
                            <span className="etat" data-e="moi">
                              {S.sessions.cette}
                            </span>
                          )}
                        </td>
                        <td>{moment(x.ouverte)}</td>
                        <td>{moment(x.vue)}</td>
                        <td>{moment(x.expire)}</td>
                        <td>
                          <span className="empreinte">{masque(x.ip)}</span>
                        </td>
                        <td>
                          <div className="actions">
                            {!x.moi && <BoutonSec action={revoquerSession} args={[x.id]} libelle={S.sessions.revoquer} nom={S.sessions.revoquerDe(qui)} reussite={S.sessions.revoquee} attr="revoquer" />}
                            {premiere && <BoutonSec action={revoquerSessionsDe} args={[x.profil]} libelle={S.sessions.toutes} nom={S.sessions.toutesDe(qui)} reussite={S.sessions.revoquee} confirmer={S.sessions.confirmerToutes(qui)} attr="toutes" />}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Bloc>

          <Bloc id="s-jou" titre={J.titre} compte={journal ? journal.total : null} s={12} i={5} lien={<a className="lien" href={exportCsv} download data-export-journal>{J.exporter}</a>}>
            <form className="filtres-journal" method="get" action="/admins/securite" aria-label={J.filtres}>
              <div className="champ">
                <label htmlFor="j-auteur">{J.auteur}</label>
                <select id="j-auteur" name="auteur" defaultValue={f.auteur}>
                  <option value="">{J.tous}</option>
                  {(membres ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.prenom} {m.nom}
                    </option>
                  ))}
                </select>
              </div>
              <div className="champ">
                <label htmlFor="j-action">{J.action}</label>
                <select id="j-action" name="action" defaultValue={f.action}>
                  <option value="">{J.toutes}</option>
                  {J.familles.map(([id, nom, prefixes]) => (
                    <optgroup key={id} label={nom}>
                      <option value={`f:${id}`}>
                        {nom} · {J.toutes.toLowerCase()}
                      </option>
                      {Object.entries(J.actions)
                        .filter(([a]) => prefixes.includes(a.split(".")[0]))
                        .map(([a, libelle]) => (
                          <option key={a} value={`a:${a}`}>
                            {libelle}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="champ">
                <label htmlFor="j-du">{J.du}</label>
                <input id="j-du" name="du" type="date" defaultValue={f.du} />
              </div>
              <div className="champ">
                <label htmlFor="j-au">{J.au}</label>
                <input id="j-au" name="au" type="date" defaultValue={f.au} />
              </div>
              <div className="boutons">
                <button type="submit" className="bouton">
                  {J.filtrer}
                </button>
                <Link className="bouton-2" href="/admins/securite">
                  {J.effacer}
                </Link>
              </div>
            </form>
            {!journal ? (
              indispo
            ) : !journal.lignes.length ? (
              <Vide texte={J.vide} />
            ) : (
              <>
                <p className="journal-total" data-journal-total={journal.total}>
                  {J.total(journal.total, journal.lignes.length)}
                </p>
                <table className="tableau" id="table-journal">
                  <caption className="invisible">{J.titre}</caption>
                  <thead>
                    <tr>
                      {Object.values(J.cols).map((c) => (
                        <th scope="col" key={c}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {journal.lignes.map((l) => (
                      <tr key={l.id} data-action={l.action}>
                        <td>{moment(l.quand)}</td>
                        <td>{l.profil ? (nomDe.get(l.profil) ?? court(l.profil)) : J.sansCompte}</td>
                        <td>
                          <b>{J.actions[l.action] ?? l.action}</b>
                        </td>
                        <td>
                          <Details d={l.details} nomDe={nomDe} />
                        </td>
                        <td>
                          <span className="empreinte">{masque(l.ip)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </Bloc>
        </div>
      </div>
    </Enveloppe>
  );
}
