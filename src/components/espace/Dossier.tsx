"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { finances as FIN } from "@/content/espace-finances";
import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import type { Role } from "@/content/equipe";
import { espace as T } from "@/content/espace";
import { jourOuidah, minuitOuidah } from "@/lib/jours";
import { useMouvementReduit } from "@/lib/mouvement";
import type { MembreActif, MomentDossier, VueDossier } from "@/lib/serveur/equipe/dossiers";
import { ajouterMoment, attribuer, changerEtape, cloreMoment, deplacerMoment, enregistrerDevis, envoyerDevis, noterDossier, proposerMoments, supprimerMoment, type RetourDossier } from "@/lib/serveur/equipe/dossiers-actions";
import { CLOS_A_LA_FIN, enOuidah, ETAPES_MANUELLES, etatMoment, kmEntre, LIMITES_MOMENT, LIMITES_NOTE, lireDevis, lireMoment, TYPES_MOMENT } from "@/lib/serveur/equipe/dossiers-regles";
import { useMinute } from "./Cadre";
import { ArcDuJour, CarteOuidah, surCarte } from "./CarteOuidah";
import { corpsDevis, EditeurDevis, ligneVide, type SaisieDevis } from "./EditeurDevis";
import { fcfa, hm, ilYa, minutesOuidah, soleil } from "./outils";
import { Picto, PICTO_MOMENT } from "./Picto";
import "./agents.css";
import "./dossier.css";

// Le dossier d'une demande (lot L4, maquette E ?ecran=dossier), dans le tiroir qui glisse de la droite (plein écran en
// 390), à son adresse propre (/agents/demandes/<id>) : fermer le tiroir ramène à la liste. Le parcours (carte de Ouidah,
// itinéraire numéroté, course du soleil du jour du voyage, moments : ajout, déplacement, suppression, clôture), le
// voyage tel que le client l'a demandé, l'étape, l'agent et la note de l'équipe, le devis, l'historique tiré du journal.
// Tout ce qui s'écrit passe par les actions serveur (dossiers-actions.ts), qui relisent la session et le dossier ; le
// serveur renvoie le dossier à jour (refresh). Rien d'inventé : un champ vide le dit.

type Props = { role: Role; d: VueDossier; admin: boolean; membres: MembreActif[] | null };
const MIN = 60_000;
const regions = new Intl.DisplayNames(["fr"], { type: "region" });
const nomPays = (c: string | null) => {
  if (!c) return null;
  try {
    return regions.of(c) ?? c;
  } catch {
    return c;
  }
};
const dateLongue = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const leJour = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: T.ouidah.fuseau });
const jourIso = (s: string) => Math.floor(Date.parse(`${s}T00:00:00Z`) / 86_400_000);
const heureDe = (ms: number) => hm(minutesOuidah(Math.floor(ms / MIN)));

const saisieDe = (d: VueDossier): SaisieDevis =>
  d.devis
    ? { lignes: d.devis.lignes.map((l) => ({ libelle: l.libelle, quantite: String(l.quantite), prix: String(l.prix_unitaire) })), note: d.devis.note ?? "", valable: d.devis.valable ?? "" }
    : { lignes: d.intention === "question" ? [] : [ligneVide()], note: "", valable: "" };

function messageRefus(e: Exclude<RetourDossier, { ok: true }>["erreur"]) {
  if (e === "pages" || e === "publie" || e === "pdf") return T.devis.erreurs[e];
  if (e === "dates" || e === "lieux" || e === "court" || e === "hors" || e === "etat") return T.moments.erreurs[e];
  return T.refus[e === "champs" ? "champs" : e === "refuse" ? "refuse" : "panne"];
}

export function Dossier({ role, d, admin, membres }: Props) {
  const router = useRouter();
  const reduit = useMouvementReduit();
  const minute = useMinute();
  const uid = useId();
  const panneau = useRef<HTMLDialogElement>(null);
  const titre = useRef<HTMLHeadingElement>(null);
  const formMoment = useRef<HTMLFormElement>(null);
  const [annonce, setAnnonce] = useState<{ texte: string; erreur: boolean } | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [, demarrer] = useTransition();
  const [devis, setDevis] = useState<SaisieDevis>(() => saisieDe(d));
  const [erreursDevis, setErreursDevis] = useState<string[]>([]);
  const [envoye, setEnvoye] = useState<{ numero: string; lien: string | null; courriel: boolean } | null>(null);
  const [note, setNote] = useState(d.note ?? "");
  const [erreursMoment, setErreursMoment] = useState<string[]>([]);
  const [etape, setEtape] = useState(ETAPES_MANUELLES.includes(d.etape) ? d.etape : "");

  useEffect(() => {
    const p = panneau.current;
    if (p && !p.open) {
      p.showModal();
      titre.current?.focus();
    }
  }, []);

  const t = minute * MIN;
  const aujourdhui = enOuidah(t).date;
  const annoncer = (texte: string, erreur = false) => setAnnonce({ texte, erreur });
  const D = T.dossier, M = T.moments, V = T.devis, C = T.carte;

  /** Ferme le tiroir (il repart d'où il est venu), puis revient à la liste. */
  const fermer = () => {
    const p = panneau.current;
    const partir = () => router.push(`/${role}/demandes`, { scroll: false });
    if (!p?.open || reduit) {
      p?.close();
      return partir();
    }
    const bas = matchMedia("(max-width: 760px)").matches;
    const a = p.animate([{ transform: "none" }, { transform: bas ? "translateY(100%)" : "translateX(100%)" }], { duration: 360, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
    const fin = () => {
      p.close();
      a.cancel();
      partir();
    };
    a.finished.then(fin, fin);
  };

  const agir = (cle: string, appel: () => Promise<RetourDossier>, reussi: (r: Extract<RetourDossier, { ok: true }>) => void, champs?: (c: string[]) => void) => {
    if (occupe) return;
    setOccupe(cle);
    demarrer(async () => {
      try {
        const r = await appel();
        if ("ok" in r) reussi(r);
        else if (r.erreur === "champs" && champs) {
          champs(r.champs ?? []);
          annoncer(T.refus.champs, true);
        } else annoncer(messageRefus(r.erreur), true);
      } catch {
        annoncer(T.refus.reseau, true);
      }
      setOccupe(null);
    });
  };

  // ---------- parcours ----------
  const surLaCarte = d.moments.filter((m): m is MomentDossier & { lieu: { coords: [number, number] } } => Boolean(m.lieu?.coords && surCarte(m.lieu.coords)));
  const etapes = surLaCarte.map((m) => ({ cle: m.id, nom: m.lieu.nom, coords: m.lieu.coords }));
  const rang = new Map(surLaCarte.map((m, i) => [m.id, i + 1]));
  const suivante = new Map(surLaCarte.slice(0, -1).map((m, i) => [m.id, kmEntre(m.lieu.coords, surLaCarte[i + 1].lieu.coords)]));
  const fonds = d.lieuxPossibles.flatMap((l) => (l.coords ? [{ cle: l.id, nom: l.nom, coords: l.coords }] : []));
  const total = surLaCarte.slice(1).reduce((s, m, i) => s + kmEntre(surLaCarte[i].lieu.coords, m.lieu.coords), 0);
  // jour du voyage : l'arrivée du séjour ; sans dates, le jour du premier moment
  const jourVoyage = d.sejour ? jourIso(d.sejour.arrivee) : d.moments[0] ? jourOuidah(d.moments[0].debut) : null;
  const solJour = jourVoyage !== null ? soleil((minuitOuidah(jourVoyage) + 12 * 3_600_000) / MIN) : null;
  const dateJour = jourVoyage !== null ? dateLongue.format(jourVoyage * 86_400_000) : "";
  const possibles = new Set(d.lieuxPossibles.map((l) => l.id));
  const quoi = (m: MomentDossier) => `${M.types[m.type]}${m.lieu ? `, ${m.lieu.nom}` : ""}`;

  const ajouter = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const brut = { type: f.get("type"), lieu: f.get("lieu"), date: f.get("date"), heure: f.get("heure"), duree: Number(f.get("duree")), note: f.get("note") ?? "" };
    const lu = lireMoment(brut, possibles);
    if (!lu.ok) {
      setErreursMoment(lu.champs);
      return annoncer(T.refus.champs, true);
    }
    setErreursMoment([]);
    agir("ajout", () => ajouterMoment(d.id, brut), () => {
      formMoment.current?.reset();
      annoncer(M.annonces.ajoute);
    }, setErreursMoment);
  };
  const deplacer = (m: MomentDossier, e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    agir(`dep:${m.id}`, () => deplacerMoment(d.id, m.id, { date: f.get("date"), heure: f.get("heure") }), () => annoncer(M.annonces.deplace));
  };

  // ---------- devis ----------
  const lecture = Boolean(d.devis && d.devis.statut !== "brouillon");
  const brouillon = () => {
    const corps = corpsDevis(devis);
    const lu = lireDevis(corps, aujourdhui, true);
    if (!lu.ok) {
      setErreursDevis(lu.champs);
      return annoncer(V.resume, true);
    }
    setErreursDevis([]);
    agir("brouillon", () => enregistrerDevis(d.id, corps), (r) => annoncer(V.enregistre(fcfa(r.montant ?? 0))), setErreursDevis);
  };
  const envoyer = () => {
    const corps = corpsDevis(devis);
    const lu = lireDevis(corps, aujourdhui, false);
    if (!lu.ok) {
      setErreursDevis(lu.champs);
      return annoncer(V.resume, true);
    }
    setErreursDevis([]);
    agir(
      "envoi",
      async () => {
        const r = await envoyerDevis(d.id, corps);
        if (!("ok" in r) && r.erreur === "pages") setErreursDevis(["pages"]);
        return r;
      },
      (r) => {
        setEnvoye({ numero: r.numero ?? "", lien: r.lien ?? null, courriel: r.courriel === true });
        annoncer(V.pret(r.numero ?? ""));
      },
      setErreursDevis,
    );
  };
  const lien = envoye?.lien ?? (lecture ? d.lienClient : null);
  const copier = () => {
    if (!lien) return;
    navigator.clipboard.writeText(`${location.origin}${lien}`).then(
      () => annoncer(V.copie),
      () => annoncer(T.refus.reseau, true),
    );
  };

  const titreId = `${uid}-t`;
  return (
    <div className="esp-dossiers">
      <dialog
        ref={panneau}
        className="esp-tiroir tiroir-dossier"
        aria-labelledby={titreId}
        data-dossier={d.id}
        onCancel={(e) => {
          e.preventDefault();
          fermer();
        }}
        onClick={(e) => e.target === e.currentTarget && fermer()}
      >
        <div className="tiroir-cadre">
          <header className="tiroir-tete">
            <div>
              <span className="type">{T.admin.demandes.types[d.intention] ?? d.intention}</span>
              <h2 id={titreId} ref={titre} tabIndex={-1}>
                {d.client.nom}
              </h2>
              <p>{D.recue(d.reference, ilYa(d.recue, minute), (T.langues[d.client.langue] ?? d.client.langue).toLowerCase())}</p>
            </div>
            <button type="button" className="icone-bouton" aria-label={D.fermer} onClick={fermer}>
              <Picto nom="fermer" />
            </button>
          </header>

          <div className="tiroir-corps" data-lenis-prevent>
            {/* le parcours : la carte d'abord (visible sans défiler en 390), puis la course du soleil du jour et les moments */}
            <section className="section parcours-s" aria-labelledby={`${uid}-par`}>
              <h3 id={`${uid}-par`}>{C.titre}</h3>
              {solJour && <p className="mention">{C.jour(dateJour, hm(solJour.lever), hm(solJour.coucher))}</p>}
              <div className="parcours">
                <div className="plan">
                  <CarteOuidah etapes={etapes} fonds={fonds} />
                </div>
                <div>
                  {solJour && (
                    <ArcDuJour
                      s={solJour}
                      nom={C.jourNom(dateJour, hm(solJour.lever), hm(solJour.coucher))}
                      points={d.moments.filter((m) => jourOuidah(m.debut) === jourVoyage).map((m) => ({ rang: rang.get(m.id) ?? null, minute: minutesOuidah(Math.floor(m.debut / MIN)) }))}
                    />
                  )}
                  {d.moments.length ? (
                    <ol className="etapes-l" id="moments-dossier" aria-label={M.titre}>
                      {d.moments.map((m, i) => {
                        const e = etatMoment(m, t);
                        const r = rang.get(m.id);
                        const ici = enOuidah(m.debut);
                        return (
                          <li key={m.id} data-moment={m.id} data-etat={e} style={{ ["--d" as string]: i }}>
                            <b className={r ? "rang-l" : "rang-l sans"} aria-hidden="true">
                              {r ?? <Picto nom={PICTO_MOMENT[m.type]} />}
                            </b>
                            <span className="moment-texte">
                              <span className="creneau-l">
                                {leJour.format(m.debut)}, {M.creneau(heureDe(m.debut), heureDe(m.fin))}
                              </span>
                              <span className="titre">{quoi(m)}</span>
                              {m.note && <span className="meta">{m.note}</span>}
                              {m.lieu?.coords && !r && <span className="meta">{C.horsCarte}</span>}
                              {suivante.has(m.id) && <span className="meta">{C.vers(C.km(suivante.get(m.id) ?? 0))}</span>}
                              {(e === "aclore" || e === "fait") && (
                                <span className="etat" data-e={e}>
                                  {e === "aclore" ? M.aClore : M.fait}
                                </span>
                              )}
                            </span>
                            <div className="actions-moment">
                              {(e === "aclore" || (e === "encours" && !CLOS_A_LA_FIN.includes(m.type))) && (
                                <button type="button" className="bouton-2 bouton-petit" data-clore={m.id} aria-label={M.cloreDe(quoi(m))} aria-busy={occupe === `clo:${m.id}`} onClick={() => agir(`clo:${m.id}`, () => cloreMoment(d.id, m.id), () => annoncer(M.annonces.clos))}>
                                  <Picto nom="coche" />
                                  {M.clore}
                                </button>
                              )}
                              <details className="deplacer">
                                <summary className="bouton-2 bouton-petit" aria-label={M.deplacerDe(quoi(m))}>
                                  <Picto nom="calendrier" />
                                  {M.deplacer}
                                </summary>
                                <form onSubmit={(ev) => deplacer(m, ev)} data-deplacer={m.id}>
                                  <label>
                                    <span>{M.date}</span>
                                    <input type="date" name="date" defaultValue={ici.date} required />
                                  </label>
                                  <label>
                                    <span>{M.heure}</span>
                                    <input type="time" name="heure" defaultValue={ici.heure} step={300} required />
                                  </label>
                                  <button type="submit" className="bouton bouton-petit" aria-busy={occupe === `dep:${m.id}`}>
                                    {M.valider}
                                  </button>
                                </form>
                              </details>
                              <button type="button" className="bouton-2 bouton-petit" data-supprimer={m.id} aria-label={M.supprimerDe(quoi(m))} aria-busy={occupe === `sup:${m.id}`} onClick={() => agir(`sup:${m.id}`, () => supprimerMoment(d.id, m.id), () => annoncer(M.annonces.supprime))}>
                                <Picto nom="fermer" />
                                {M.supprimer}
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <p className="mention">{M.vide}</p>
                  )}
                  {etapes.length > 1 && <p className="mention">{C.total(C.km(total), etapes.length)}</p>}
                </div>
              </div>

              <div className="outils-parcours">
                {d.lieux.length > 0 && (
                  <div className="proposer">
                    <button type="button" className="bouton-2" id="proposer-creneaux" aria-describedby={`${uid}-pa`} aria-busy={occupe === "proposer"} onClick={() => agir("proposer", () => proposerMoments(d.id), (r) => annoncer(M.annonces.proposes(r.nombre ?? 0)))}>
                      <Picto nom="soleil" />
                      {M.proposer}
                    </button>
                    <span className="aide" id={`${uid}-pa`}>
                      {M.proposerAide}
                    </span>
                  </div>
                )}
                <details className="ajout-moment" open={!d.moments.length || undefined}>
                  <summary>
                    <Picto nom="plus" />
                    {M.ajouter}
                  </summary>
                  <form ref={formMoment} id="form-moment" noValidate onSubmit={ajouter}>
                    <div className="champs">
                      <div className="champ">
                        <label htmlFor={`${uid}-ty`}>{M.type}</label>
                        <select id={`${uid}-ty`} name="type" defaultValue="visite" aria-invalid={erreursMoment.includes("type")}>
                          {TYPES_MOMENT.map((x) => (
                            <option key={x} value={x}>
                              {M.types[x]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="champ">
                        <label htmlFor={`${uid}-li`}>{M.lieu}</label>
                        <select id={`${uid}-li`} name="lieu" defaultValue="" aria-invalid={erreursMoment.includes("lieu")}>
                          <option value="">{M.sansLieu}</option>
                          {d.lieuxPossibles.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.nom}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="champ">
                        <label htmlFor={`${uid}-da`}>{M.date}</label>
                        <input id={`${uid}-da`} type="date" name="date" defaultValue={d.sejour?.arrivee ?? aujourdhui} aria-invalid={erreursMoment.includes("date")} />
                      </div>
                      <div className="champ">
                        <label htmlFor={`${uid}-he`}>{M.heure}</label>
                        <input id={`${uid}-he`} type="time" name="heure" defaultValue="09:00" step={300} aria-invalid={erreursMoment.includes("heure")} />
                      </div>
                      <div className="champ">
                        <label htmlFor={`${uid}-du`}>{M.duree}</label>
                        <select id={`${uid}-du`} name="duree" defaultValue="60" aria-invalid={erreursMoment.includes("duree")}>
                          {M.durees.map((n) => (
                            <option key={n} value={n}>
                              {M.minutes(n)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="champ">
                        <label htmlFor={`${uid}-no`}>{M.note}</label>
                        <input id={`${uid}-no`} type="text" name="note" maxLength={LIMITES_MOMENT.note} autoComplete="off" aria-invalid={erreursMoment.includes("note")} />
                      </div>
                    </div>
                    {erreursMoment.length > 0 && (
                      <p className="erreur" role="alert">
                        {erreursMoment.map((c) => M.erreurs[c]).filter(Boolean).join(" ")}
                      </p>
                    )}
                    <button type="submit" className="bouton" id="ajouter-moment" aria-busy={occupe === "ajout"}>
                      <Picto nom="plus" />
                      {M.ajout}
                    </button>
                  </form>
                </details>
              </div>
            </section>

            <section className="section" aria-labelledby={`${uid}-voy`}>
              <h3 id={`${uid}-voy`}>{D.voyage}</h3>
              <dl className="paires">
                <div>
                  <dt>{D.dates}</dt>
                  <dd>{d.sejour ? D.du(dateLongue.format(jourIso(d.sejour.arrivee) * 86_400_000), dateLongue.format(jourIso(d.sejour.depart) * 86_400_000)) : D.sansDates}</dd>
                </div>
                <div>
                  <dt>{D.voyageurs}</dt>
                  <dd>{d.voyageurs.adultes + d.voyageurs.enfants ? D.personnes(d.voyageurs.adultes, d.voyageurs.enfants) : D.nonPrecise}</dd>
                </div>
                <div>
                  <dt>{D.pays}</dt>
                  <dd>{nomPays(d.client.pays) ?? D.nonPrecise}</dd>
                </div>
                <div>
                  <dt>{D.langue}</dt>
                  <dd>{T.langues[d.client.langue] ?? d.client.langue}</dd>
                </div>
                <div>
                  <dt>{D.email}</dt>
                  <dd>
                    <a className="lien" href={`mailto:${d.client.email}`}>
                      {d.client.email}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>{D.tel}</dt>
                  <dd>{d.client.telephone ?? D.nonPrecise}</dd>
                </div>
                {d.circuit && (
                  <div>
                    <dt>{D.circuit}</dt>
                    <dd>{d.circuit}</dd>
                  </div>
                )}
              </dl>
              {d.lieux.length > 0 && (
                <>
                  <p className="mention">{D.lieux}</p>
                  <div className="puces">
                    {d.lieux.map((l) => (
                      <span className="puce" key={l.id}>
                        <Picto nom="repere" />
                        {l.nom}
                      </span>
                    ))}
                  </div>
                </>
              )}
              {d.services.length > 0 && (
                <>
                  <p className="mention">{D.services}</p>
                  <div className="puces">
                    {d.services.map((x) => (
                      <span className="puce" key={x.nom}>
                        <Picto nom="voiture" />
                        {x.nom} : {x.choix.join(", ")}
                      </span>
                    ))}
                  </div>
                </>
              )}
              {d.message && (
                <>
                  <p className="mention">{D.message}</p>
                  <blockquote className="message-client" lang={d.client.langue.toLowerCase()}>
                    {d.message}
                  </blockquote>
                </>
              )}
            </section>

            <section className="section" aria-labelledby={`${uid}-dos`}>
              <h3 id={`${uid}-dos`}>{D.suivi}</h3>
              <div className="champs">
                <div className="champ">
                  <span className="libelle">{D.etape}</span>
                  <span className="etat" data-e={d.etape} id="etape-dossier">
                    {T.etapes[d.etape]}
                  </span>
                </div>
                <form
                  className="champ"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (etape) agir("etape", () => changerEtape(d.id, etape), () => annoncer(D.etapeChangee(T.etapes[etape])));
                  }}
                >
                  <label htmlFor={`${uid}-et`}>{D.changerEtape}</label>
                  <span className="en-ligne">
                    <select id={`${uid}-et`} name="etape" value={etape} onChange={(e) => setEtape(e.target.value as typeof etape)} aria-describedby={`${uid}-eta`}>
                      <option value="" disabled>
                        {T.etapes[d.etape]}
                      </option>
                      {ETAPES_MANUELLES.map((x) => (
                        <option key={x} value={x}>
                          {T.etapes[x]}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="bouton-2 bouton-petit" aria-busy={occupe === "etape"}>
                      {T.moments.valider}
                    </button>
                  </span>
                  <span className="aide" id={`${uid}-eta`}>
                    {D.etapeAide}
                  </span>
                </form>
                {admin && membres && (
                  <div className="champ large">
                    <label htmlFor={`${uid}-ag`}>{D.agent}</label>
                    <select
                      id={`${uid}-ag`}
                      value={d.agent?.id ?? ""}
                      data-attribuer={d.id}
                      onChange={(e) => {
                        const v = e.target.value;
                        const m = membres.find((x) => x.id === v);
                        agir("agent", () => attribuer(d.id, v || null), () => annoncer(m ? T.demandes.annonces.attribuee(d.client.nom, `${m.prenom} ${m.nom}`) : T.demandes.annonces.retiree(d.client.nom)));
                      }}
                    >
                      <option value="">{T.demandes.nonAttribuee}</option>
                      {membres.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.prenom} {m.nom}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <form
                  className="champ large"
                  onSubmit={(e) => {
                    e.preventDefault();
                    agir("note", () => noterDossier(d.id, note), () => annoncer(D.noteEnregistree));
                  }}
                >
                  <label htmlFor={`${uid}-nt`}>{D.note}</label>
                  <textarea id={`${uid}-nt`} name="note" rows={3} maxLength={LIMITES_NOTE} value={note} onChange={(e) => setNote(e.target.value)} aria-describedby={`${uid}-nta`} />
                  <span className="aide" id={`${uid}-nta`}>
                    {D.noteAide(note.length)}
                  </span>
                  <button type="submit" className="bouton-2 bouton-petit" aria-busy={occupe === "note"}>
                    {D.enregistrerNote}
                  </button>
                </form>
              </div>
            </section>

            <section className="section" aria-labelledby={`${uid}-dev`} id="section-devis">
              <h3 id={`${uid}-dev`}>{V.titre}</h3>
              {d.intention === "question" && !d.devis && <p className="mention">{V.question}</p>}
              {lecture && d.devis && <p className="mention devis-etat">{V.publie(d.devis.numero ?? "", d.devis.publie ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: T.ouidah.fuseau }).format(Date.parse(d.devis.publie)) : "")}</p>}
              {erreursDevis.includes("pages") && (
                <p className="message-erreur" role="alert">
                  {V.erreurs.pages}
                </p>
              )}
              <EditeurDevis valeur={devis} changer={setDevis} erreurs={erreursDevis} lecture={lecture} />
              {(lecture || envoye) && (
                <div className="lien-client">
                  {lien ? (
                    <>
                      <span>
                        <Picto nom="lien" />
                        <b>{V.lienClient}</b>
                      </span>
                      <code>{lien}</code>
                      <button type="button" className="bouton-2 bouton-petit" onClick={copier}>
                        {V.copier}
                      </button>
                    </>
                  ) : (
                    <p className="mention">{V.sansLien}</p>
                  )}
                  <p className="mention" data-courriel={(envoye?.courriel ?? d.devis?.courriel) ? "parti" : "manque"}>
                    {(envoye?.courriel ?? d.devis?.courriel) ? V.parti : V.manque}
                  </p>
                </div>
              )}
              <p className="mention" id={`${uid}-lp`}>
                {d.devis?.statut === "pret" ? FIN.dossier.lienPret : FIN.dossier.lienAvant}
              </p>
            </section>

            <section className="section" aria-labelledby={`${uid}-his`}>
              <h3 id={`${uid}-his`}>{D.historique}</h3>
              {d.historique.length ? (
                <ul className="fil-act historique">
                  {d.historique.map((h, k) => {
                    const texte = D.journal(h.action, h.qui, { ...h.details, etape: h.details.etape ? T.etapes[h.details.etape] : undefined, type: h.details.type ? M.types[h.details.type] : undefined });
                    return texte ? (
                      <li key={k} data-action={h.action}>
                        <time dateTime={h.quand}>{ilYa(h.quand, minute)}</time>
                        <span>{texte}</span>
                      </li>
                    ) : null;
                  })}
                </ul>
              ) : (
                <p className="mention">{D.historiqueVide}</p>
              )}
            </section>
          </div>

          <footer className="tiroir-pied">
            <p className="annonce-tiroir" role="status" aria-live="polite" data-ton={annonce?.erreur ? "erreur" : undefined}>
              {annonce?.texte}
            </p>
            {d.devis?.statut === "pret" ? (
              // lot L7 : le devis envoyé ouvre l'écran des liens avec ce devis choisi d'avance (total du devis, sans acompte)
              <Link className="bouton-2" href={`/${role}/liens?devis=${d.devis.id}`} aria-describedby={`${uid}-lp`} id="lien-paiement">
                <Picto nom="lien" />
                {V.lienPaiement}
              </Link>
            ) : (
              <button type="button" className="bouton-2" disabled aria-describedby={`${uid}-lp`} id="lien-paiement">
                <Picto nom="lien" />
                {V.lienPaiement}
              </button>
            )}
            {!lecture && (
              <>
                <button type="button" className="bouton-2" id="brouillon-devis" aria-busy={occupe === "brouillon"} onClick={brouillon}>
                  {V.brouillon}
                </button>
                <button type="button" className="bouton accent" id="envoyer-devis" aria-busy={occupe === "envoi"} disabled={occupe === "envoi"} onClick={envoyer}>
                  <Picto nom="courrier" />
                  {occupe === "envoi" ? V.envoi : V.envoyer}
                </button>
              </>
            )}
          </footer>
        </div>
      </dialog>
    </div>
  );
}
