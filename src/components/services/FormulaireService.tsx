"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import type { CopieServices } from "@/content/services";
import type { LangueService } from "@/lib/serveur/services/regles";
import type { CreneauPublic } from "@/lib/serveur/services/public";
import { useFormatsSite } from "@/lib/formats-site";
import { adresseLangue } from "@/lib/adresses-langues";
import { Icon } from "@/components/ui/Icon";
import "./services.css";

const abonnement = (f: () => void) => { window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); };
const jetonFragment = () => new URLSearchParams(window.location.hash.slice(1)).get("acces") ?? "";
// mêmes règles que le serveur (lib/serveur/services/regles.ts) : le navigateur prévient, le serveur décide
const EMAIL = /^[^\s@*%"\\(),]+@[^\s@*%"\\(),]+\.[^\s@*%"\\(),]{2,}$/;
const TELEPHONE = /^\+?[\d () .-]{6,32}$/;
const JETON = /^[A-Za-z0-9_-]{43}$/;
type Champ = "creneau" | "nom" | "email" | "telephone" | "organisation" | "activite" | "ville" | "site" | "consentement";
type Type = "rendez-vous" | "partenaires" | "mes-donnees";

function httpsValide(v: string) {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** Erreurs du formulaire, lues dans le DOM (le remplissage automatique ne passe pas toujours par React). */
function verifier(f: HTMLFormElement, type: Type, T: CopieServices, telephoneRequis: boolean): Partial<Record<Champ, string>> {
  const v = (n: string) => String(new FormData(f).get(n) ?? "").trim();
  const e: Partial<Record<Champ, string>> = {};
  if (type === "rendez-vous" && !v("creneau")) e.creneau = T.creneauRequis;
  if (type !== "mes-donnees" && !v("nom")) e.nom = T.requis;
  if (!v("email")) e.email = T.requis;
  else if (!EMAIL.test(v("email").toLowerCase())) e.email = T.emailInvalide;
  if (type !== "mes-donnees") {
    if (!v("telephone") && telephoneRequis) e.telephone = T.requis;
    else if (v("telephone") && !TELEPHONE.test(v("telephone"))) e.telephone = T.telephoneInvalide;
  }
  if (type === "partenaires") {
    for (const n of ["organisation", "activite", "ville"] as const) if (!v(n)) e[n] = T.requis;
    if (v("site") && !httpsValide(v("site"))) e.site = T.siteInvalide;
  }
  if (!(f.elements.namedItem("consentement") as HTMLInputElement | null)?.checked) e.consentement = T.consentementRequis;
  return e;
}

export function FormulaireService({ type, T, langue, creneaux = [], indisponible = false }: { type: Type; T: CopieServices; langue: LangueService; creneaux?: CreneauPublic[]; indisponible?: boolean }) {
  const debut = useRef<number | null>(null), formulaire = useRef<HTMLFormElement>(null), recuRef = useRef<HTMLDivElement>(null);
  const [occupe, setOccupe] = useState(false), [erreur, setErreur] = useState(""), [recu, setRecu] = useState(""), [reference, setReference] = useState(""), [choisi, setChoisi] = useState("");
  const [erreurs, setErreurs] = useState<Partial<Record<Champ, string>>>({});
  const [verif, setVerif] = useState(false); // après un premier envoi incomplet, les messages suivent la saisie
  // Le remplissage automatique peut précéder le premier focus React ; le délai commence aussi au montage.
  useEffect(() => { debut.current ??= Date.now(); }, []);
  // validation du site dès que la page répond ; avant (page pas encore prête), celle du navigateur empêche un envoi vide
  useEffect(() => { if (formulaire.current) formulaire.current.noValidate = true; });
  useEffect(() => { if (recu) recuRef.current?.focus(); }, [recu]);
  const jeton = useSyncExternalStore(abonnement, jetonFragment, () => "");
  const { date } = useFormatsSite();
  const format = date({ day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Porto-Novo" });
  const creneau = creneaux.find((c) => c.id === choisi);
  const telephoneRequis = creneau?.mode === "telephone";
  const erreurDe = (e: unknown) => (typeof e === "string" && ["indisponible", "jeton", "limite"].includes(e) ? T[e as "indisponible" | "jeton" | "limite"] : T.erreur);
  const adresse = (chemin: string) => adresseLangue(chemin, langue);

  function relire() {
    if (verif && formulaire.current) setErreurs(verifier(formulaire.current, type, T, telephoneRequis));
  }
  async function envoyer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget, fautes = verifier(f, type, T, telephoneRequis);
    setVerif(true);
    setErreurs(fautes);
    setErreur("");
    const premiere = Object.keys(fautes)[0];
    if (premiere) {
      // premier champ fautif dans l'ordre de la page (et non dans l'ordre des règles)
      const champs = [...f.querySelectorAll<HTMLElement>("[name]")].filter((x) => fautes[(x.getAttribute("name") ?? "") as Champ]);
      (champs[0] ?? (f.elements.namedItem(premiere) as HTMLElement | null))?.focus();
      return;
    }
    const donnees = Object.fromEntries(new FormData(f));
    setOccupe(true);
    try {
      const r = await fetch(`/api/${type}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...donnees, langue, consentement: donnees.consentement === "on", duree: Date.now() - (debut.current ?? Date.now()) }) });
      const b = await r.json();
      if (!r.ok) { setErreur(erreurDe(b.erreur)); return; }
      setRecu(type === "rendez-vous" ? T.rdvRecu : type === "partenaires" ? T.candidatureRecue : T.lienEnvoye);
      setReference(typeof b.id === "string" ? b.id : "");
    } catch { setErreur(T.erreur); } finally { setOccupe(false); }
  }
  async function acces(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget), action = f.get("action");
    if (action === "effacement" && f.get("confirmation") !== "on") {
      setErreurs({ consentement: T.confirmerRequis });
      (e.currentTarget.elements.namedItem("confirmation") as HTMLElement | null)?.focus();
      return;
    }
    setErreurs({});
    setOccupe(true); setErreur("");
    try {
      const r = await fetch("/api/mes-donnees/acces", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${jeton}` }, body: JSON.stringify({ action, confirmation: f.get("confirmation") === "on", langue }) });
      if (!r.ok) { const b = await r.json(); setErreur(erreurDe(b.erreur)); return; }
      if (action === "export") { const blob = await r.blob(), url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = "oht-mes-donnees.json"; a.click(); URL.revokeObjectURL(url); setRecu(T.exporter); }
      // effacement fait côté serveur : le client lit ce qui reste et pourquoi (pièces comptables)
      else { const b = (await r.json()) as { garde?: boolean; deja?: boolean }; setRecu(b.deja ? T.effacementFait : `${T.effacementFait} ${b.garde ? T.effacementGarde : T.effacementRien}`); }
      window.history.replaceState(null, "", window.location.pathname); window.dispatchEvent(new Event("hashchange"));
    } catch { setErreur(T.erreur); } finally { setOccupe(false); }
  }

  // bouton « Pastille double » du site (globals.css, .oht-btn) ; pendant l'envoi : « En cours… », sans second envoi
  const bouton = (libelle: string, attente = false) => (
    <button type="submit" className={`oht-btn services-envoi ${attente ? "is-attente" : ""}`} aria-disabled={attente || undefined} onClick={(e) => attente && e.preventDefault()}>
      <span className="oht-btn-pastille is-gauche" aria-hidden="true"><Icon name="arrow-right" /></span>
      <span className="oht-btn-pilule">{attente ? T.enCours : libelle}</span>
      <span className="oht-btn-pastille is-droite" aria-hidden="true"><Icon name="arrow-right" /></span>
    </button>
  );
  const message = (n: Champ) => (erreurs[n] ? <span id={`svc-${n}-erreur`} className="services-champ-erreur">{erreurs[n]}</span> : null);
  const aria = (n: Champ) => ({ "aria-invalid": erreurs[n] ? true : undefined, "aria-describedby": erreurs[n] ? `svc-${n}-erreur` : undefined });
  const libelle = (texte: string, facultatif: boolean) => <span className="services-libelle">{texte}{facultatif ? <small>{T.facultatif}</small> : null}</span>;
  const champ = (nom: Champ | "message", label: string, o: { type?: string; facultatif?: boolean; max?: number; auto?: string; mode?: "email" | "tel" | "url" } = {}) => (
    <label>
      {libelle(label, Boolean(o.facultatif))}
      <input name={nom} type={o.type ?? "text"} required={!o.facultatif && nom !== "message"} maxLength={o.max ?? 120} autoComplete={o.auto} inputMode={o.mode} {...(nom === "message" ? {} : aria(nom))} />
      {nom === "message" ? null : message(nom)}
    </label>
  );
  const accord = (nom: "consentement" | "confirmation", texte: ReactNode) => (
    <div className="services-accord">
      <label className="services-case">
        <input name={nom} type="checkbox" required {...aria("consentement")} />
        <span>{texte}</span>
      </label>
      {message("consentement")}
    </div>
  );
  // résumé lisible, dans l'ordre de la page : « À compléter : Prénom et nom, E-mail et votre accord. »
  const noms: Record<Champ, string> = { creneau: T.creneau, nom: T.nom, email: T.email, telephone: T.telephone, organisation: T.organisation, activite: T.activite, ville: T.ville, site: T.site, consentement: T.accord };
  const manquants = (["creneau", "nom", "email", "telephone", "organisation", "activite", "ville", "site", "consentement"] as const).filter((n) => erreurs[n]).map((n) => noms[n]);
  const liste = manquants.length < 2 ? manquants.join("") : `${manquants.slice(0, -1).join(", ")} ${T.et} ${manquants.at(-1)}`;
  const resume = manquants.length ? T.resume.replace("{champs}", liste) : "";

  if (recu) return <div ref={recuRef} tabIndex={-1} className="services-recu" role="status"><p>{recu}</p>{reference ? <p>{T.reference}<br /><strong>{reference}</strong></p> : null}{type === "rendez-vous" && creneau ? <p>{format.format(new Date(creneau.debut))}<br />{creneau.lieu}</p> : null}<a href={adresse("/")}>{T.retour}</a></div>;
  // lien personnel : un jeton mal formé est refusé dès l'arrivée, sans attendre un clic
  if (type === "mes-donnees" && jeton && !JETON.test(jeton)) return <div className="services-acces" role="alert"><p className="services-erreur">{T.jeton}</p><a href={adresse("/mes-donnees")}>{T.nouveauLien}</a></div>;
  if (type === "mes-donnees" && jeton) return (
    <div className="services-acces">
      <form onSubmit={acces}><input type="hidden" name="action" value="export" />{bouton(T.exporter, occupe)}</form>
      <form onSubmit={acces} noValidate>
        <input type="hidden" name="action" value="effacement" />
        <p>{T.effacementNotice}</p>
        {accord("confirmation", T.confirmerEffacement)}
        <button className="services-bouton secondaire" aria-disabled={occupe || undefined}>{T.effacer}</button>
      </form>
      {erreur ? <p role="alert" className="services-erreur">{erreur}</p> : null}
      <a href={adresse("/mes-donnees")}>{T.nouveauLien}</a>
    </div>
  );
  // aucun créneau : une autre façon de parler à l'équipe, jamais une impasse
  if (type === "rendez-vous" && (!creneaux.length || indisponible)) return (
    <div className="services-vide">
      <p>{indisponible ? T.erreur : T.aucun}</p>
      <a href={adresse(T.ecrire.href)} className="oht-btn services-envoi">
        <span className="oht-btn-pastille is-gauche" aria-hidden="true"><Icon name="arrow-right" /></span>
        <span className="oht-btn-pilule">{T.ecrire.label}</span>
        <span className="oht-btn-pastille is-droite" aria-hidden="true"><Icon name="arrow-right" /></span>
      </a>
    </div>
  );
  return <form ref={formulaire} className="services-form" method="post" onSubmit={envoyer} onInput={relire} onChange={relire} onFocusCapture={() => { debut.current ??= Date.now(); }}>
    <div className="services-piege" aria-hidden="true"><label>Website<input name="piege" tabIndex={-1} autoComplete="off" /></label></div>
    {type === "rendez-vous" ? <label>{libelle(T.creneau, false)}<select name="creneau" required value={choisi} onChange={(e) => setChoisi(e.target.value)} {...aria("creneau")}><option value="">{T.choisir}</option>{creneaux.map((c) => <option key={c.id} value={c.id}>{format.format(new Date(c.debut))}</option>)}</select>{creneau ? <small>{creneau.mode === "telephone" ? T.telephoneMode : T.surPlace} : {creneau.lieu}</small> : null}{message("creneau")}</label> : null}
    {type !== "mes-donnees" ? champ("nom", T.nom, { auto: "name" }) : null}
    {champ("email", T.email, { type: "email", max: 254, auto: "email", mode: "email" })}
    {type !== "mes-donnees" ? champ("telephone", T.telephone, { type: "tel", facultatif: !telephoneRequis, max: 32, auto: "tel", mode: "tel" }) : null}
    {type === "partenaires" ? <>{champ("organisation", T.organisation, { max: 160, auto: "organization" })}{champ("activite", T.activite)}{champ("ville", T.ville, { auto: "address-level2" })}{champ("site", T.site, { type: "url", facultatif: true, max: 500, auto: "url", mode: "url" })}</> : null}
    {type !== "mes-donnees" ? <label>{libelle(T.message, true)}<textarea name="message" maxLength={2000} rows={4} /></label> : null}
    {accord("consentement", <>{T.consentement} <a href={adresse(T.confidentialite.href)}>{T.confidentialite.label}</a></>)}
    <p className="services-resume" role="status" aria-live="polite">{resume}</p>
    {erreur ? <p role="alert" className="services-erreur">{erreur}</p> : null}
    {bouton(type === "rendez-vous" ? T.reserver : type === "partenaires" ? T.candidature : T.envoyerLien, occupe)}
  </form>;
}
