"use client";

import { useFormatsSite } from "@/lib/formats-site";

import Image from "next/image";
import Link from "@/components/ui/LienPublic";
import QRCode from "qrcode";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { conciergerie as CONCIERGERIE, datesSection as DATES_SECTION, evenements as EVENEMENTS, nav as NAV } from "@/content/fr";
import { useContenu } from "@/components/ui/ContenuSite";
import type { Evenement } from "@/content/types";
import { Icon } from "@/components/ui/Icon";
import { Objet3D } from "@/components/ui/Objet3D";
import { Palettes } from "@/components/ui/Palettes";
import { poserBillet, QUANTITE_MAX } from "@/lib/billets";
import { CLE_CONCIERGERIE, ecrireConciergerie, lireConciergerie } from "@/lib/conciergerie";
import { useDevise } from "@/lib/devise";
import { telechargerIcs } from "@/lib/ics";
import { dateDuJour, jourDe, occurrence } from "@/lib/jours";
import { langueDuSite } from "@/lib/langue";
import { lancerPaiement, MEMOIRE_PAIEMENT, type NomPasserelle, type Preparee } from "@/lib/paiement";
import type { Sejour } from "@/lib/sejour";
import { useVisiteur } from "@/lib/visiteur";
import "./talon.css";

// Talon de réservation de la section Agenda (talon B v2, validé par Kevin le 27/10/2026) : « Réserver ma place » déplie le
// pass en grand billet perforé. À gauche l'événement, la formule, les places et l'accompagnement (services de la
// Conciergerie, même mémoire) ; à droite le talon : coordonnées, passerelles activées dans l'admin avec leurs logos, total
// en lettres à palettes. Un seul envoi (/api/devis) : les billets se paient, l'accompagnement part en devis, une seule
// référence. Les billets ne s'affichent qu'après la confirmation du serveur (jamais d'après le navigateur).
const s = new Proxy({} as Record<string, string>, { get: (_, k) => `tl-${String(k)}` });
export type Retour = { reservation: string; cle: string; transaction: string | null };
type Billet = { numero: string; code: string };
type Vue = { statut: "attente" | "paye" | "rembourse"; evenement: string; occurrence: string; formule: string; quantite: number; montant: number; devise: string; billets: Billet[]; reference: string; passerelle: NomPasserelle; suivi: string | null };
type Etat = { k: "saisie" } | { k: "envoi" } | { k: "attente"; p: NomPasserelle } | { k: "verification" } | { k: "non_confirme" } | { k: "paye"; vue: Vue };
const BROUILLON_DEVIS = "oht-devis"; // nom et e-mail partagés avec /devis
const UEMOA = new Set(["BJ", "TG", "CI", "SN", "ML", "NE", "BF", "GW"]);
const MOBILE_MONEY: NomPasserelle[] = ["kkiapay", "fedapay"];
const ACCOMPAGNEMENT = [
  { id: "navette", option: 1 },
  { id: "hebergement", option: 0 },
  { id: "vehicule", option: 0 },
];
function useTalonFormats() {
  const { date, nombre } = useFormatsSite();
  return useMemo(() => {
const fmt = (o: Intl.DateTimeFormatOptions) => {
  const f = date({ ...o, timeZone: "UTC" });
  return (n: number) => f.format(dateDuJour(n)).replace(".", "");
};
const fmtJour = fmt({ weekday: "short", day: "numeric", month: "short" });
const fmtLong = fmt({ day: "numeric", month: "long" });
const fcfa = (n: number) => `${nombre().format(n)} FCFA`;
const euros = (n: number) => nombre({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n / 655.957);
const dollars = (n: number, usd: number) => nombre({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n / usd);

const periode = (a: number, b: number) => (a === b ? fmtLong(a) : dateDuJour(a).getUTCMonth() === dateDuJour(b).getUTCMonth() ? `${dateDuJour(a).getUTCDate()}–${fmtLong(b)}` : `${fmtLong(a)} – ${fmtLong(b)}`);
  return { fmtJour, fmtLong, fcfa, euros, dollars, periode, date };
  }, [date, nombre]);
}
const jourIso = (v: string) => {
  const [y, m, j] = v.split("-").map(Number);
  return jourDe(y, m - 1, j);
};


function lireMemoire<T>(cle: string, stockage: "local" | "session"): T | null {
  try {
    return JSON.parse((stockage === "local" ? localStorage : sessionStorage).getItem(cle) ?? "null") as T | null;
  } catch {
    return null;
  }
}

/** État réel d'une réservation, relu par le serveur (qui relit lui-même la passerelle). */
async function verifierServeur(r: Retour): Promise<Vue | null> {
  const rep = await fetch("/api/paiement/verifier", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(r) }).catch(() => null);
  return rep?.ok ? ((await rep.json().catch(() => null)) as Vue | null) : null;
}

export function Talon({ e, a, b, sejour, formule, setFormule, passerelles, retour, onFermer }: { e: Evenement; a: number; b: number; sejour: Sejour | null; formule: number; setFormule: (i: number) => void; passerelles: NomPasserelle[]; retour: Retour | null; onFermer: () => void }) {
  const { fmtJour, fmtLong, fcfa, euros, dollars, periode } = useTalonFormats();
  const D = useContenu("fr.datesSection", DATES_SECTION);
  const T = D.talon;
  const conciergerie = useContenu("fr.conciergerie", CONCIERGERIE);
  const evenements = useContenu("fr.evenements", EVENEMENTS);
  const nav = useContenu("fr.nav", NAV);
  const o = e.offre;
  const cat = o.type === "billet" ? o.categories[formule] : { nom: o.nom, detail: o.inclus, prix: o.prix, logement: true };
  const prix = cat?.prix ?? null;
  const [devise, , , usd] = useDevise();
  const { visiteur } = useVisiteur(true);
  // reprise à l'ouverture (le talon n'existe que dans le navigateur, après un geste ou un retour de paiement) : nom et
  // e-mail de /devis, services de la Conciergerie ; ceux déjà choisis restent cochés et le disent
  const [lus] = useState(() => {
    const champs = lireMemoire<{ champs?: { nom?: string; email?: string } }>(BROUILLON_DEVIS, "local")?.champs;
    const garde = lireConciergerie(localStorage.getItem(CLE_CONCIERGERIE), conciergerie).reponses;
    return { nom: champs?.nom?.trim() ?? "", email: champs?.email?.trim() ?? "", services: garde, deja: new Set(ACCOMPAGNEMENT.filter((x) => garde[x.id]?.length).map((x) => x.id)), le: performance.now() };
  });
  const [quantite, setQuantite] = useState(1);
  const [nom, setNom] = useState(lus.nom);
  const [email, setEmail] = useState(lus.email);
  const repris = Boolean(lus.nom || lus.email);
  const deja = lus.deja;
  const [accord, setAccord] = useState(false);
  const [choisie, setChoisie] = useState<NomPasserelle | null>(null);
  const [etat, setEtat] = useState<Etat>(retour ? { k: "verification" } : { k: "saisie" });
  const [erreur, setErreur] = useState<string | null>(null);
  const [services, setServices] = useState<Record<string, string[]>>(lus.services);
  const titre = useRef<HTMLHeadingElement>(null);

  // passerelles activées par l'admin, la plus adaptée au pays du visiteur en tête (Mobile Money dans l'UEMOA, carte ailleurs)
  const pays = visiteur?.pays ?? null;
  const dansUemoa = pays !== null && UEMOA.has(pays);
  const recommandee = pays === null ? null : (passerelles.find((p) => (dansUemoa ? MOBILE_MONEY.includes(p) : p === "stripe")) ?? passerelles.find((p) => (dansUemoa ? true : !MOBILE_MONEY.includes(p))) ?? null);
  const rangees = useMemo(() => (recommandee ? [recommandee, ...passerelles.filter((p) => p !== recommandee)] : passerelles), [passerelles, recommandee]);
  const active = choisie ?? rangees[0] ?? null;
  const paysNom = pays ? (new Intl.DisplayNames(["fr"], { type: "region" }).of(pays) ?? pays) : null;

  const lignes = ACCOMPAGNEMENT.flatMap((x) => {
    const q = conciergerie.find((c) => c.id === x.id), option = q?.options[x.option];
    // Formule avec logement : pas d'hôtel en plus ; seuls les services et options publiés sont proposés.
    return q && option && !option.passe && !(x.id === "hebergement" && cat?.logement) ? [{ id: q.id, option: option.label, objet: q.objet }] : [];
  });
  const demandes = lignes.filter((x) => services[x.id]?.length);
  const montant = prix !== null ? prix * quantite : null;
  const nomsDemandes = demandes.map((x) => conciergerie.find((c) => c.id === x.id)?.court ?? x.id).join(" et ");
  const nuits = sejour ? sejour.depart - sejour.arrivee : 0;

  const basculer = (id: string, option: string) => {
    const garde = lireConciergerie(localStorage.getItem(CLE_CONCIERGERIE), conciergerie);
    const suivant = { ...garde.reponses };
    if (suivant[id]?.length) delete suivant[id];
    else suivant[id] = [option];
    ecrireConciergerie(suivant, garde.rang);
    setServices(suivant);
  };
  // le choix (formule, places) entre dans le dossier de voyage : l'en-tête et /devis le voient
  const changerQuantite = (n: number) => {
    const q = Math.min(QUANTITE_MAX, Math.max(1, n));
    setQuantite(q);
    poserBillet(e.slug, { formule, quantite: q }, evenements);
  };
  const changerFormule = (i: number) => {
    setFormule(i);
    poserBillet(e.slug, { formule: i, quantite }, evenements);
  };

  const router = useRouter();
  const appliquer = (vue: Vue | null) => {
    if (vue?.statut !== "paye") return setEtat({ k: "non_confirme" });
    poserBillet(vue.evenement, null, evenements); // payé : le billet quitte le dossier à payer
    // paiement qui vient d'aboutir dans cet onglet : le ticket s'imprime puis l'embarquement joue, sur la page de suivi ;
    // un retour plus tard (lien de l'e-mail) reste ici, sans rejouer le film
    const frais = lireMemoire<object>(MEMOIRE_PAIEMENT, "session") !== null;
    try {
      sessionStorage.removeItem(MEMOIRE_PAIEMENT);
    } catch {
      /* rien */
    }
    if (frais && vue.suivi) return router.push(`/suivi/${vue.suivi}?bienvenue=1`);
    setEtat({ k: "paye", vue });
    requestAnimationFrame(() => titre.current?.focus());
  };
  const verifier = (r: Retour) => {
    setEtat({ k: "verification" });
    void verifierServeur(r).then(appliquer);
  };
  // retour de la passerelle (redirection) ou lien de l'e-mail : l'état vient du serveur. L'état initial est déjà
  // « vérification » ; appliquer ne touche qu'à des setters et au stockage, d'où la seule dépendance au retour.
  const appliquerRetour = useEffectEvent(appliquer);
  useEffect(() => {
    if (!retour) return;
    let vivant = true;
    void verifierServeur(retour).then((v) => vivant && appliquerRetour(v));
    return () => {
      vivant = false;
    };
  }, [retour]);

  async function envoyer(ev: React.FormEvent) {
    ev.preventDefault();
    setErreur(null);
    if (!nom.trim() || !email.includes("@") || !accord) return setErreur(T.erreurs.champs);
    if (!active || montant === null) return setErreur(T.erreurs.passerelle);
    try {
      localStorage.setItem(BROUILLON_DEVIS, JSON.stringify({ ...(lireMemoire<object>(BROUILLON_DEVIS, "local") ?? {}), champs: { ...(lireMemoire<{ champs?: object }>(BROUILLON_DEVIS, "local")?.champs ?? {}), nom: nom.trim(), email: email.trim() } }));
    } catch {
      /* navigation privée */
    }
    setEtat({ k: "envoi" });
    const corps = {
      origine: "talon",
      intention: "voyage",
      dossier: { sejour, lieux: [], raisons: [], services, devise, ville: visiteur?.ville ?? null },
      reponses: { qui: null, adultes: quantite, enfants: 0, occasion: null, pays, langue: langueDuSite(nav.languages.map((l) => l.code)), conseilDates: false, conseilLieux: false },
      champs: { nom: nom.trim(), email: email.trim(), whatsapp: "", message: "" },
      consentement: accord,
      piege: (document.getElementById("talon-site") as HTMLInputElement | null)?.value ?? "",
      duree: Math.round(performance.now() - lus.le),
      billets: [{ evenement: e.slug, formule, quantite }],
      passerelle: active,
    };
    const rep = await fetch("/api/devis", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corps) }).catch(() => null);
    const r = rep ? ((await rep.json().catch(() => null)) as { reference?: string; erreur?: string; restantes?: number; reservation?: Preparee } | null) : null;
    if (!rep?.ok || !r?.reservation) {
      setEtat({ k: "saisie" });
      const m = r?.erreur;
      return setErreur(m === "limite" ? T.erreurs.limite : m === "complet" ? T.erreurs.complet(r?.restantes ?? 0) : m === "passerelle" ? T.erreurs.passerelle : m === "incomplet" ? T.erreurs.champs : T.erreurs.indisponible);
    }
    const prep = r.reservation;
    setEtat({ k: "attente", p: active });
    try {
      await lancerPaiement(prep, r.reference, (transaction) => verifier({ reservation: prep.id, cle: prep.cle, transaction }));
    } catch {
      setEtat({ k: "saisie" });
      setErreur(T.erreurs.indisponible);
    }
  }

  const ev = etat.k === "paye" ? (evenements.find((x) => x.slug === etat.vue.evenement) ?? e) : e;
  const image = ev.image ?? D.fallbackImage;
  const nomP = (p: NomPasserelle) => T.passerelles[p]?.nom ?? p;

  return (
    <>
      <div aria-hidden="true" className={s.voile} />
      <section className={`${s.billet} ${etat.k === "saisie" ? s.deplie : ""}`} aria-label={`${T.titre} · ${ev.title}`}>
        <div className={s.corps}>
          <div className={s.bande}>
            <Image src={image.src} alt="" fill sizes="(min-width: 1024px) 480px, 100vw" className="object-cover" />
            <span className={s.voileBande} />
            {e.organisateur.type === "oht" ? <span className={s.puce}>{D.pass.oht}</span> : null}
            <p className={s.titreBande}>
              {ev.short}
              <small>{ev.theme}</small>
            </p>
            <button type="button" onClick={onFermer} className={s.fermer} aria-label={T.fermer}>
              <Icon name="close" className="size-[18px]" />
            </button>
          </div>
          <div className={s.dedans}>
            <dl className={s.resume}>
              <div>
                <dt>{D.pass.date}</dt>
                <dd>{periode(a, b)}</dd>
              </div>
              <div>
                <dt>{sejour ? D.pass.during : D.pass.place}</dt>
                <dd>{sejour ? D.pass.dayOf(a - sejour.arrivee + 1, b - sejour.arrivee + 1) : ev.place.split(",")[0]}</dd>
              </div>
            </dl>
            {etat.k === "saisie" || etat.k === "envoi" ? (
              <>
                {o.type === "billet" ? (
                  <fieldset className={s.formules}>
                    <legend className={s.lib}>{D.pass.formulas}</legend>
                    {o.categories.map((c, i) => (
                      <label key={c.nom} className={`${s.formule} ${formule === i ? s.on : ""}`}>
                        <input type="radio" name="talon-formule" checked={formule === i} onChange={() => changerFormule(i)} />
                        <b>{c.nom}</b>
                        <span>{c.prix !== null ? fcfa(c.prix) : D.pass.onRequest}</span>
                      </label>
                    ))}
                  </fieldset>
                ) : null}
                <div className={s.places}>
                  <p className={s.lib}>
                    {T.places}
                    {o.type === "billet" && o.places !== null && o.jauge !== null ? <small>{T.restantes(o.places, o.jauge)}</small> : null}
                  </p>
                  <span className={s.pas}>
                    <button type="button" onClick={() => changerQuantite(quantite - 1)} disabled={quantite <= 1} aria-label={T.moins}>
                      <Icon name="minus" className="size-4" />
                    </button>
                    <b aria-live="polite">{quantite}</b>
                    <button type="button" onClick={() => changerQuantite(quantite + 1)} disabled={quantite >= QUANTITE_MAX} aria-label={T.plus}>
                      <Icon name="plus" className="size-4" />
                    </button>
                  </span>
                </div>
                {o.type === "billet" && o.places !== null && o.jauge ? (
                  <span className={s.jauge} aria-hidden="true">
                    <i style={{ transform: `scaleX(${(o.jauge - o.places) / o.jauge})` }} />
                  </span>
                ) : null}
                <div className={s.accomp}>
                  <p className={s.lib}>
                    {T.accompagnement} <small>· {T.accompagnementNote}</small>
                  </p>
                  {lignes.map((x) => {
                    const q = conciergerie.find((c) => c.id === x.id);
                    const t = x.id === "navette" ? T.navette(sejour ? fmtJour(sejour.arrivee) : null) : x.id === "hebergement" ? T.hebergement(sejour ? { nuits, du: fmtLong(sejour.arrivee), au: fmtLong(sejour.depart) } : null) : T.vehicule(periode(a, b));
                    const on = Boolean(services[x.id]?.length);
                    return (
                      <button key={x.id} type="button" role="checkbox" aria-checked={on} onClick={() => basculer(x.id, x.option)} className={s.ligne}>
                        <Objet3D nom={x.objet} taille={30} />
                        <span className={s.ligneTexte}>
                          {t.titre}
                          <small>
                            {on && services[x.id][0] !== x.option ? `${q?.court ?? ""} · ${services[x.id].join(", ")}` : t.detail}
                            {deja.has(x.id) ? <em>, {T.deja}</em> : null}
                          </small>
                        </span>
                        <span className={`${s.coche} ${on ? s.on : ""}`}>{on ? <Icon name="check" className="size-[15px]" /> : null}</span>
                      </button>
                    );
                  })}
                </div>
                {demandes.length ? (
                  <p className={s.unique}>
                    <b>{T.unique.titre}</b> {T.unique.texte(nomsDemandes, demandes.length)}
                  </p>
                ) : null}
              </>
            ) : etat.k === "paye" ? (
              // payé : le corps récapitule ce qui est réglé et ce qui part en devis
              <dl className={s.recap}>
                <div>
                  <dt>{T.paye.recap.formule}</dt>
                  <dd>
                    {etat.vue.formule} · {T.paye.recap.places(etat.vue.quantite)}
                  </dd>
                </div>
                <div>
                  <dt>{T.paye.recap.paye}</dt>
                  <dd>{fcfa(etat.vue.montant)}</dd>
                </div>
                {demandes.length ? (
                  <div className={s.recapLarge}>
                    <dt>{T.paye.recap.devis}</dt>
                    <dd>{T.paye.devis(nomsDemandes)}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </div>
        </div>

        <div className={s.talon}>
          <span className={`${s.trou} ${s.h}`} />
          <span className={`${s.trou} ${s.b}`} />
          {etat.k === "saisie" || etat.k === "envoi" ? (
            <form id="talon-form" onSubmit={envoyer} noValidate className={s.formulaire}>
              <h3 className={s.titre}>{T.titre}</h3>
              <label className={s.champ}>
                <span>
                  {T.nom}
                  {repris ? <em>{T.repris}</em> : null}
                </span>
                <input value={nom} onChange={(x) => setNom(x.target.value)} autoComplete="name" required maxLength={120} />
              </label>
              <label className={s.champ}>
                <span>{T.email}</span>
                <input type="email" value={email} onChange={(x) => setEmail(x.target.value)} autoComplete="email" required maxLength={254} />
              </label>
              <input id="talon-site" name="site" tabIndex={-1} autoComplete="off" className={s.piege} aria-hidden="true" />
              <fieldset className={s.moyens}>
                <legend className={s.lib}>{T.payerAvec}</legend>
                {rangees.map((p) => (
                  <label key={p} className={`${s.moyen} ${active === p ? s.on : ""}`}>
                    <input type="radio" name="talon-passerelle" checked={active === p} onChange={() => setChoisie(p)} />
                    <Image src={`/paiement/${p}.svg`} alt={nomP(p)} width={96} height={22} className={s.logo} />
                    <small className={p === recommandee ? s.reco : ""}>{p === recommandee && paysNom ? T.recommande(paysNom) : T.passerelles[p]?.moyens}</small>
                  </label>
                ))}
              </fieldset>
              <label className={s.accord}>
                <input type="checkbox" checked={accord} onChange={(x) => setAccord(x.target.checked)} />
                <span>
                  {T.accord}{" "}
                  <Link href={T.confidentialite.href} target="_blank" rel="noreferrer">
                    {T.confidentialite.label}
                  </Link>
                </span>
              </label>
              <div className={s.compte}>
                <p>{T.aPayer(quantite)}</p>
                {montant !== null ? <Palettes texte={fcfa(montant).toUpperCase()} taille="mini" /> : null}
                {montant !== null && devise === "EUR" ? <small>{T.eur(euros(montant))}</small> : null}
                {montant !== null && devise === "USD" && usd ? <small>{T.usd(dollars(montant, usd))}</small> : null}
              </div>
              <p className={s.erreur} role="alert">
                {erreur}
              </p>
            </form>
          ) : etat.k === "attente" ? (
            <div className={s.attente} aria-live="polite">
              <Image src={`/paiement/${etat.p}.svg`} alt={nomP(etat.p)} width={120} height={28} className={s.logoGrand} />
              <span className={s.fil}>
                <i />
              </span>
              <h3 className={s.titre}>{T.attente.titre(nomP(etat.p))}</h3>
              <p>
                {demandes.length ? `${T.attente.devis} ` : ""}
                {T.attente.texte(nomP(etat.p), montant !== null ? fcfa(montant) : "")}
              </p>
              <button type="button" className={s.lien} onClick={() => setEtat({ k: "saisie" })}>
                {T.attente.autre}
              </button>
            </div>
          ) : etat.k === "verification" ? (
            <div className={s.attente} aria-live="polite">
              <span className={s.fil}>
                <i />
              </span>
              <p>{T.verification}</p>
            </div>
          ) : etat.k === "non_confirme" ? (
            <div className={s.attente} aria-live="polite">
              <h3 className={s.titre}>{T.nonConfirme.titre}</h3>
              <p>{T.nonConfirme.texte}</p>
              <button type="button" className={s.lien} onClick={() => retour && verifier(retour)}>
                {T.nonConfirme.reessayer}
              </button>
            </div>
          ) : (
            <Paye vue={etat.vue} ev={ev} titreRef={titre} />
          )}
        </div>
        {/* barre de paiement : enfant direct du billet (et non du formulaire) pour rester collée en bas de l'écran sur
            téléphone pendant tout le parcours du billet ; reliée au formulaire par l'attribut form */}
        {etat.k === "saisie" || etat.k === "envoi" ? (
          <div className={s.barre}>
            <span className={`${s.trou} ${s.fin}`} />
            <button type="submit" form="talon-form" className={s.payer} disabled={etat.k === "envoi"}>
              <Objet3D nom="billet" taille={28} className="-my-1" />
              {etat.k === "envoi" ? T.envoi : montant !== null ? T.payer(fcfa(montant), demandes.length > 0) : T.envoi}
            </button>
            {active ? <p className={s.note}>{T.note(nomP(active))}</p> : null}
          </div>
        ) : null}
      </section>
    </>
  );
}

function Paye({ vue, ev, titreRef }: { vue: Vue; ev: Evenement; titreRef: React.RefObject<HTMLHeadingElement | null> }) {
  const { fcfa, periode, date } = useTalonFormats();
  const D = useContenu("fr.datesSection", DATES_SECTION);
  const T = D.talon;
  const P = T.paye;
  const [i, setI] = useState(0);
  const [qr, setQr] = useState<string[]>([]);
  const memoire = useMemo(() => lireMemoire<{ reference?: string }>(MEMOIRE_PAIEMENT, "session"), []);
  const debut = jourIso(vue.occurrence);
  let fin = debut;
  if (ev.quand.type === "editions") fin = jourIso(ev.quand.dates.find(([date]) => date === vue.occurrence)?.[1] ?? vue.occurrence);
  else {
    const periode = occurrence(ev.quand, dateDuJour(debut).getUTCFullYear());
    if (periode[0] === debut) fin = periode[1];
  }
  const prenom = (lireMemoire<{ champs?: { nom?: string } }>(BROUILLON_DEVIS, "local")?.champs?.nom ?? "").split(/\s+/)[0];
  useEffect(() => {
    let vivant = true;
    void Promise.all(vue.billets.map((x) => QRCode.toString(x.code, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0f162d", light: "#ffffff" } }))).then((l) => vivant && setQr(l));
    return () => {
      vivant = false;
    };
  }, [vue.billets]);

  async function telecharger() {
    const l = 1080, h = 300 + vue.billets.length * 420;
    const c = Object.assign(document.createElement("canvas"), { width: l, height: h });
    const x = c.getContext("2d")!;
    x.fillStyle = "#ffffff";
    x.fillRect(0, 0, l, h);
    x.fillStyle = "#0f162d";
    x.font = "700 56px Fraunces, Georgia, serif";
    x.fillText(ev.title, 72, 120);
    x.font = "600 30px Manrope, Arial, sans-serif";
    x.fillText(`${periode(debut, fin)} · ${vue.formule} · ${P.entree}`, 72, 180);
    for (const [k, b] of vue.billets.entries()) {
      const y = 260 + k * 420;
      const q = document.createElement("canvas");
      await QRCode.toCanvas(q, b.code, { width: 340, margin: 1, errorCorrectionLevel: "M" });
      x.drawImage(q, 72, y);
      x.font = "700 36px Manrope, Arial, sans-serif";
      x.fillText(P.billet(k + 1, vue.billets.length), 460, y + 120);
      x.font = "600 30px Manrope, Arial, sans-serif";
      x.fillText(P.numero(b.numero), 460, y + 175);
    }
    c.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement("a"), { href: url, download: `billets-${ev.slug}-${vue.occurrence}.png` }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  }

  const b = vue.billets[i];
  return (
    <div className={s.paye}>
      <span className={s.tampon} aria-hidden="true">
        <b>{P.tampon}</b>
        {date({ day: "numeric", month: "short", year: "numeric" }).format(new Date())}
      </span>
      <h3 ref={titreRef} tabIndex={-1} className={s.titre}>
        {prenom ? P.titre(prenom) : P.titreSans}
      </h3>
      <p className={s.pour}>
        {P.resume(vue.quantite, ev.short)}
        <span className="whitespace-nowrap">{periode(debut, fin)}</span>
      </p>
      {b ? (
        <div className={s.billetQr}>
          <span className={s.qr} role="img" aria-label={`${P.billet(i + 1, vue.billets.length)} · ${P.numero(b.numero)}`}>
            {qr[i] ? <span dangerouslySetInnerHTML={{ __html: qr[i] }} /> : null}
            <i className={s.imprime} />
          </span>
          <p>
            <b>{P.billet(i + 1, vue.billets.length)}</b>
            {P.numero(b.numero)}
            <br />
            {P.entree}
          </p>
        </div>
      ) : null}
      {vue.billets.length > 1 ? (
        <div className={s.pagination}>
          <button type="button" onClick={() => setI((i + vue.billets.length - 1) % vue.billets.length)} aria-label={P.precedent}>
            <Icon name="arrow-left" className="size-4" />
          </button>
          <span>
            {i + 1} / {vue.billets.length}
          </span>
          <button type="button" onClick={() => setI((i + 1) % vue.billets.length)} aria-label={P.suivant}>
            <Icon name="arrow-right" className="size-4" />
          </button>
        </div>
      ) : null}
      <div className={s.boutons}>
        <button type="button" className={s.principal} onClick={() => void telecharger()}>
          {P.telecharger}
        </button>
        <button type="button" className={s.rond} onClick={() => telechargerIcs({ e: ev, a: debut, b: fin })} aria-label={D.pass.calendar(ev.short)} title={D.pass.calendar(ev.short)}>
          <Objet3D nom="calendrier" taille={26} />
        </button>
      </div>
      <p className={s.ref}>
        {P.reference} <b>{vue.reference || memoire?.reference}</b>
      </p>
      <p className={s.confirme}>
        <Icon name="check" className="size-4" />
        {P.confirme(fcfa(vue.montant), T.passerelles[vue.passerelle]?.nom ?? vue.passerelle)}
      </p>
      {vue.suivi ? (
        <a className={s.suivi} href={`/suivi/${vue.suivi}`}>
          {P.suivi}
        </a>
      ) : null}
    </div>
  );
}

