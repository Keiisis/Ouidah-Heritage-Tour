"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { boutique as BOUTIQUE } from "@/content/boutique";
import { DEVIS, nav as NAV } from "@/content/fr";
import { useContenu } from "@/components/ui/ContenuSite";
import PAYS from "@/content/pays.json";
import { zoneLivraison, type DemandeCommande, type Produit, type ReponseCommande } from "@/lib/boutique-types";
import { EMAIL } from "@/lib/demande";
import { langueDuSite } from "@/lib/langue";
import { changerQuantite, cleLigne, nbArticles, QUANTITE_MAX, usePanier, viderPanier } from "@/lib/panier";
import { Icon } from "@/components/ui/Icon";
import { bloquer, pieger, useBoutique } from "./Cadre";
import { ChampsOptions, choixVide, manque, phraseManque, Quantite, versOptions, type Choix } from "./Options";
import { Picto } from "./Pictos";
import { fabrication, prix, quantiteMax, resume, total } from "./outils";

// Tiroirs latéraux droits (MOTION-I 2.5) : ajout rapide d'un article à composer, et panier avec son étape « Commander ».
// Balisage et styles du tiroir de commun.js / variables.css (refait le 23/10 : en-tête fin, lignes photo, pied collant).

const nomsPays = new Intl.DisplayNames(["fr"], { type: "region" });
const PAYS_TRIES = (PAYS as string[]).map((c) => ({ v: c, l: nomsPays.of(c) ?? c })).sort((a, b) => a.l.localeCompare(b.l, "fr"));

// ouverture d'un tiroir : focus sur la croix, page figée, Échap ferme
function useTiroir(ouvert: boolean, fermer: () => void) {
  const croix = useRef<HTMLButtonElement>(null);
  const boite = useRef<HTMLDivElement>(null);
  const fermeture = useRef(fermer);
  useEffect(() => {
    fermeture.current = fermer;
  });
  useEffect(() => {
    if (!ouvert) return;
    bloquer(true);
    const t = setTimeout(() => croix.current?.focus({ preventScroll: true }), 60);
    const echap = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && fermeture.current();
    document.addEventListener("keydown", echap);
    return () => {
      clearTimeout(t);
      bloquer(false);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);
  return { croix, boite };
}

// ---------- ajout rapide : « Choisir les options » d'une carte ----------
export function AjoutRapide({ etat, fermer }: { etat: { p: Produit; ouvert: boolean; n: number; apres?: () => void } | null; fermer: (rendre?: boolean) => void }) {
  const T = useContenu("boutique.boutique", BOUTIQUE);
  const ouvert = !!etat?.ouvert;
  const { croix, boite } = useTiroir(ouvert, () => fermer());
  return (
    <aside className={`tiroir ajout-rapide ${ouvert ? "ouvert" : ""}`} aria-label={T.options.titre} inert={!ouvert} data-lenis-prevent onClick={(e) => e.target === e.currentTarget && fermer()}>
      <div ref={boite} className="tiroir-in" role="dialog" aria-modal="true" aria-labelledby="bq-ar-titre" onKeyDown={(e) => pieger(e, boite.current)}>
        <div className="tiroir-tete">
          <h2 id="bq-ar-titre">{T.options.titre}</h2>
          <button ref={croix} className="tiroir-x" type="button" aria-label={T.options.fermer} onClick={() => fermer()}>
            <Icon name="close" />
          </button>
        </div>
        {etat ? <FormRapide key={etat.n} p={etat.p} fermer={fermer} apres={etat.apres} /> : null}
      </div>
    </aside>
  );
}

function FormRapide({ p, fermer, apres }: { p: Produit; fermer: (rendre?: boolean) => void; apres?: () => void }) {
  const T = useContenu("boutique.boutique", BOUTIQUE);
  const b = useBoutique();
  const id = useId();
  const [c, setC] = useState<Choix>(choixVide);
  const [alerte, setAlerte] = useState(false);
  const set = (x: Partial<Choix>) => {
    setC((v) => ({ ...v, ...x }));
    setAlerte(false);
  };
  const m = manque(p, c);
  const envoyer = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (m.length) {
      setAlerte(true);
      const champ = { taille: `${id}-taille`, mesures: `${id}-mesures`, coloris: `${id}-coloris` }[m[0]];
      const el = document.getElementById(champ ?? "");
      (el?.querySelector<HTMLElement>("input") ?? el)?.focus();
      return;
    }
    fermer(false);
    if (b.ajouter(p, p.unique ? 1 : c.qte, versOptions(p, c, T))) apres?.();
  };
  return (
    <form className="ar-form" noValidate onSubmit={envoyer}>
      <div className="tiroir-corps">
        <div className="ar-piece">
          <span className="ar-image">{p.photos[0] ? <Image src={p.photos[0].url} alt={p.photos[0].alt || p.nom} fill sizes="96px" /> : <span className="photo-vide" />}</span>
          <div>
            <p className="ar-nom">{p.nom}</p>
            <p className="ar-prix">{prix(p.prixXof, b.devise, b.usd, b.langue)}</p>
          </div>
        </div>
        <ChampsOptions p={p} c={c} set={set} id={id} msg={`${id}-msg`} erreurs={alerte ? m : []} />
        {p.unique ? null : (
          <div>
            <span className="lib-qte" id={`${id}-qte`}>
              {T.options.quantite}
            </span>
            <Quantite n={c.qte} set={(qte) => set({ qte })} label={T.options.quantite} className="qte" max={quantiteMax(p, QUANTITE_MAX)} />
          </div>
        )}
        <p className={`achat-msg ${alerte ? "alerte" : ""}`} id={`${id}-msg`} role={alerte ? "alert" : undefined}>
          {alerte && m.length ? phraseManque(m, T) : ""}
        </p>
      </div>
      <div className="tiroir-pied">
        <button className="btn-soleil" type="submit">
          {T.options.ajouter}
        </button>
      </div>
    </form>
  );
}

// ---------- tiroir panier, puis « Commander », puis la référence ----------
export function TiroirPanier({ ouvert, etape, setEtape, fermer }: { ouvert: boolean; etape: "panier" | "commande"; setEtape: (e: "panier" | "commande") => void; fermer: () => void }) {
  const T = useContenu("boutique.boutique", BOUTIQUE);
  const b = useBoutique();
  const lignes = usePanier();
  const [reference, setReference] = useState<string | null>(null);
  const [suivi, setSuivi] = useState<string | null>(null);
  const [aPayer, setAPayer] = useState(false); // paiement immédiat qui n'a pas pu s'ouvrir : à régler depuis le suivi
  const finir = () => {
    fermer();
    setTimeout(() => {
      setReference(null);
      setSuivi(null);
      setAPayer(false);
      setEtape("panier");
    }, 320);
  };
  const { croix, boite } = useTiroir(ouvert, finir);
  const vues = lignes.flatMap((l) => {
    const p = b.produit(l.slug);
    return p ? [{ l, p, cle: cleLigne(l.slug, l.options) }] : [];
  });
  const n = nbArticles(vues.map((x) => x.l));
  const somme = total(vues.map((x) => ({ p: x.p, n: x.l.quantite })));
  const commande = etape === "commande" && !reference && vues.length > 0;

  return (
    <aside className={`tiroir tiroir-panier ${ouvert ? "ouvert" : ""}`} aria-label={T.panier.titre} inert={!ouvert} data-lenis-prevent onClick={(e) => e.target === e.currentTarget && finir()}>
      <div ref={boite} className="tiroir-in" role="dialog" aria-modal="true" aria-labelledby="bq-panier-titre" onKeyDown={(e) => pieger(e, boite.current)}>
        <div className="tiroir-tete">
          <h2 id="bq-panier-titre">
            {commande ? (
              <button className="tiroir-retour" type="button" aria-label={T.commande.retour} onClick={() => setEtape("panier")}>
                <Icon name="arrow-left" />
              </button>
            ) : null}
            {commande ? T.commande.titre : T.panier.titre} {commande || reference ? null : <span>({n})</span>}
          </h2>
          <button ref={croix} className="tiroir-x" type="button" aria-label={T.panier.fermer} onClick={finir}>
            <Icon name="close" />
          </button>
        </div>

        {reference ? (
          <div className="merci" role="status">
            <p className="merci-titre">{T.commande.merciTitre}</p>
            <p className="merci-ref">{T.commande.merci(reference)[0]}</p>
            <p className="merci-texte">{aPayer ? T.commande.paiementPlusTard : T.commande.merci(reference)[1]}</p>
            {suivi ? (
              <a className="merci-suivi" href={`/suivi/${suivi}`}>
                {T.commande.suivi}
              </a>
            ) : null}
            <button className="btn-soleil" type="button" onClick={finir}>
              {T.commande.fin}
            </button>
          </div>
        ) : commande ? (
          <Commande vues={vues} somme={somme} n={n} fini={(ref, lien, payer) => (viderPanier(), setReference(ref), setSuivi(lien), setAPayer(payer))} />
        ) : vues.length ? (
          <>
            <div className="tiroir-corps">
              <ul className="tiroir-liste">
                {vues.map(({ l, p, cle }) => {
                  const extra = resume(l.options, T);
                  const fabrique = fabrication(p, T, l.options);
                  // toutes les lignes de l'article (variantes) comptent contre le stock disponible
                  const pris = vues.filter((v) => v.p.slug === p.slug).reduce((q, v) => q + v.l.quantite, 0);
                  return (
                    <li key={cle}>
                      <span className="tiroir-image">{p.photos[0] ? <Image src={p.photos[0].url} alt={p.photos[0].alt || p.nom} fill sizes="80px" /> : <span className="photo-vide" />}</span>
                      <div className="tiroir-info">
                        <p className="tiroir-nom">{p.nom}</p>
                        {extra ? <p className="tiroir-opt">{extra}</p> : null}
                        {fabrique ? <p className="tiroir-opt">{fabrique}</p> : null}
                        <p className="tiroir-prix">{prix(p.prixXof, b.devise, b.usd, b.langue)}</p>
                        <div className="tiroir-actions">
                          {p.unique ? (
                            <span className="tiroir-unique">{T.panier.unique}</span>
                          ) : (
                            <div className="qte" role="group" aria-label={T.panier.quantite(p.nom)}>
                              <button type="button" aria-label={T.panier.moins(p.nom)} onClick={() => changerQuantite(cle, l.quantite - 1)}>
                                <Icon name="minus" />
                              </button>
                              <span>{l.quantite}</span>
                              <button type="button" aria-label={T.panier.plus(p.nom)} disabled={l.quantite >= QUANTITE_MAX || pris >= quantiteMax(p, Number.MAX_SAFE_INTEGER)} onClick={() => changerQuantite(cle, l.quantite + 1)}>
                                <Icon name="plus" />
                              </button>
                            </div>
                          )}
                          <button className="tiroir-retirer" type="button" aria-label={T.panier.retirerAria(p.nom)} onClick={() => changerQuantite(cle, 0)}>
                            {T.panier.retirer}
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="tiroir-pied">
              <p className="tiroir-total">
                <span>{T.panier.sousTotal}</span>
                <strong>{prix(somme, b.devise, b.usd, b.langue)}</strong>
              </p>
              <p className="tiroir-note">{T.panier.note}</p>
              <button className="btn-soleil" type="button" onClick={() => setEtape("commande")}>
                {T.panier.commander}
              </button>
              <button className="tiroir-continuer" type="button" onClick={finir}>
                {T.panier.continuer}
              </button>
            </div>
          </>
        ) : (
          <div className="tiroir-vide">
            <Picto nom="sac" />
            <p className="tiroir-vide-titre">{T.panier.videTitre}</p>
            <p className="tiroir-vide-texte">{T.panier.videTexte}</p>
            <button className="btn-soleil" type="button" onClick={() => (finir(), b.filtrer({}))}>
              {T.panier.videBouton}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

// ---------- étape « Commander » : coordonnées, retrait ou livraison, message ; confirmation après la réponse du serveur ----------
type Vue = { l: { slug: string; quantite: number; options: DemandeCommande["lignes"][number]["options"] }; p: Produit; cle: string };
const VIDE = { prenom: "", nom: "", email: "", telephone: "", pays: "", mode: "retrait" as "retrait" | "livraison", adresse: "", ville: "", paysLivraison: "", message: "" };
// nom du champ dans la réponse du serveur (contact.email, remise.ville…) → champ du formulaire
const DEPUIS_SERVEUR: Record<string, keyof typeof VIDE> = { "contact.prenom": "prenom", "contact.nom": "nom", "contact.email": "email", "contact.telephone": "telephone", "contact.pays": "pays", "remise.adresse": "adresse", "remise.ville": "ville", "remise.pays": "paysLivraison", message: "message" };

function Commande({ vues, somme, n, fini }: { vues: Vue[]; somme: number | null; n: number; fini: (reference: string, suivi: string | null, aPayer: boolean) => void }) {
  const nav = useContenu("fr.nav", NAV);
  const T = useContenu("boutique.boutique", BOUTIQUE);
  const b = useBoutique();
  const id = useId();
  const [f, setF] = useState(VIDE);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [lignesKo, setLignesKo] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const debut = useRef(0);
  const formulaire = useRef<HTMLFormElement>(null);
  useEffect(() => {
    debut.current = Date.now();
  }, []);

  const set = (x: Partial<typeof VIDE>) => {
    setF((v) => ({ ...v, ...x }));
    setErreurs((e) => e.filter((k) => !(k in x)));
  };
  const verifier = () => {
    const e: string[] = [];
    if (!f.prenom.trim()) e.push("prenom");
    if (!f.nom.trim()) e.push("nom");
    if (!EMAIL.test(f.email.trim())) e.push("email");
    if (!/^[\d+ ().-]{6,30}$/.test(f.telephone.trim())) e.push("telephone");
    if (!f.pays) e.push("pays");
    if (f.mode === "livraison") {
      if (!f.adresse.trim()) e.push("adresse");
      if (!f.ville.trim()) e.push("ville");
      if (!f.paysLivraison) e.push("paysLivraison");
    }
    return e;
  };
  const montrer = (e: string[]) => {
    setErreurs(e);
    setTimeout(() => formulaire.current?.querySelector<HTMLElement>(`#${CSS.escape(`${id}-${e[0]}`)}`)?.focus(), 0);
  };

  const envoyer = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (envoi) return;
    const manque = verifier();
    setMessage("");
    setLignesKo([]);
    if (manque.length) return montrer(manque);
    setEnvoi(true);
    const corps: DemandeCommande = {
      lignes: vues.map((v) => v.l),
      contact: { prenom: f.prenom.trim(), nom: f.nom.trim(), email: f.email.trim(), telephone: f.telephone.trim(), pays: f.pays },
      remise: f.mode === "livraison" ? { mode: "livraison", adresse: f.adresse.trim(), ville: f.ville.trim(), pays: f.paysLivraison } : { mode: "retrait" },
      ...(f.message.trim() ? { message: f.message.trim() } : {}),
      devise: b.devise as DemandeCommande["devise"],
      site: String(new FormData(e.currentTarget).get("site") ?? ""),
      debut: debut.current,
      langue: langueDuSite(nav.languages.map((l) => l.code)),
    };
    try {
      const res = await fetch("/api/boutique/commande", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corps) });
      const r = (await res.json().catch(() => null)) as ReponseCommande | null;
      if (r?.ok && r.payer) {
        // paiement immédiat : le stock est réservé, le client part payer (le bouton reste occupé pendant la navigation)
        viderPanier();
        window.location.assign(r.payer);
        return;
      }
      if (r?.ok && r.reference) return fini(r.reference, r.suivi ?? null, r.payer === null);
      const champs = r && !r.ok ? (r.champs ?? []) : [];
      const ko = [...new Set(champs.filter((c) => c.startsWith("lignes")).map((c) => Number(c.split(".")[1])))].map((i) => vues[i]?.p.nom).filter(Boolean) as string[];
      setLignesKo(ko);
      setMessage(champs.includes("remise.zone") ? T.commande.zoneSansPrix : r && !r.ok ? r.erreur : T.commande.echec);
      const locaux = champs.map((c) => DEPUIS_SERVEUR[c]).filter(Boolean);
      if (locaux.length) montrer(locaux);
      setEnvoi(false);
    } catch {
      setMessage(T.commande.echec);
      setEnvoi(false);
    }
  };

  // paiement immédiat (09/11) : frais de la zone du pays de livraison, affichés seulement (le serveur les recalcule) ;
  // zone sans prix ou inactive : non payable en ligne, retrait à Ouidah ou message à un agent
  const enLigne = b.catalogue.paiementEnLigne === true;
  const zone = f.mode === "livraison" && f.paysLivraison ? zoneLivraison(b.catalogue.livraison ?? [], f.paysLivraison, f.ville) : null;
  const sansPrix = f.mode === "livraison" && Boolean(f.paysLivraison) && (!zone || !zone.actif || zone.fraisXof === null);
  const frais = f.mode === "retrait" ? 0 : sansPrix || !f.paysLivraison ? null : zone!.fraisXof;
  const aRegler = somme !== null && frais !== null ? somme + frais : null;
  const err = (k: string) => erreurs.includes(k);
  const champ = (k: keyof typeof VIDE, label: string, attrs: { type?: string; autoComplete?: string; inputMode?: "tel" | "email" | "text"; aide?: string } = {}) => (
    <div>
      <label className="champ">
        <span>{label}</span>
        <input id={`${id}-${k}`} name={k} type={attrs.type ?? "text"} autoComplete={attrs.autoComplete} inputMode={attrs.inputMode} value={f[k]} onChange={(e) => set({ [k]: e.target.value })} aria-invalid={err(k) || undefined} aria-describedby={err(k) ? `${id}-${k}-e` : attrs.aide ? `${id}-${k}-a` : undefined} />
      </label>
      {attrs.aide && !err(k) ? (
        <p className="aide" id={`${id}-${k}-a`}>
          {attrs.aide}
        </p>
      ) : null}
      {err(k) ? (
        <p className="champ-erreur" id={`${id}-${k}-e`}>
          {T.commande.erreurs[k]}
        </p>
      ) : null}
    </div>
  );
  const pays = (k: "pays" | "paysLivraison", label: string, autoComplete: string) => (
    <div>
      <label className="champ">
        <span>{label}</span>
        <select id={`${id}-${k}`} name={k} autoComplete={autoComplete} value={f[k]} onChange={(e) => set({ [k]: e.target.value })} aria-invalid={err(k) || undefined} aria-describedby={err(k) ? `${id}-${k}-e` : undefined}>
          <option value="">{T.commande.choisirPays}</option>
          {PAYS_TRIES.map((p) => (
            <option key={p.v} value={p.v}>
              {p.l}
            </option>
          ))}
        </select>
      </label>
      {err(k) ? (
        <p className="champ-erreur" id={`${id}-${k}-e`}>
          {T.commande.erreurs[k]}
        </p>
      ) : null}
    </div>
  );

  return (
    <form ref={formulaire} className="ar-form" noValidate onSubmit={envoyer}>
      <div className="tiroir-corps commande">
        <p className="recap">
          <b>{T.commande.recap(n)}</b> · {prix(somme, b.devise, b.usd, b.langue)}
          <br />
          {vues.map((v) => `${v.p.nom}${v.l.quantite > 1 ? ` × ${v.l.quantite}` : ""}`).join(", ")}
        </p>
        {lignesKo.length ? <p className="commande-erreur">{T.commande.lignes(lignesKo.join(", "))}</p> : null}
        <fieldset>
          <legend>{T.commande.coordonnees}</legend>
          <div className="duo">
            {champ("prenom", T.commande.prenom, { autoComplete: "given-name" })}
            {champ("nom", T.commande.nom, { autoComplete: "family-name" })}
          </div>
          {champ("email", T.commande.email, { type: "email", autoComplete: "email", inputMode: "email" })}
          {champ("telephone", T.commande.telephone, { type: "tel", autoComplete: "tel", inputMode: "tel", aide: T.commande.telephoneAide })}
          {pays("pays", T.commande.pays, "country")}
        </fieldset>
        <fieldset>
          <legend>{T.commande.remise}</legend>
          <label className="choix">
            <input type="radio" name="mode" checked={f.mode === "retrait"} onChange={() => set({ mode: "retrait" })} />
            {T.commande.retrait}
          </label>
          <label className="choix">
            <input type="radio" name="mode" checked={f.mode === "livraison"} onChange={() => set({ mode: "livraison" })} />
            {T.commande.livraison}
          </label>
          {f.mode === "livraison" ? (
            <>
              {champ("adresse", T.commande.adresse, { autoComplete: "street-address" })}
              {champ("ville", T.commande.ville, { autoComplete: "address-level2" })}
              {pays("paysLivraison", T.commande.paysLivraison, "shipping country")}
              {sansPrix ? (
                <p className="commande-erreur" role="status">
                  {T.commande.zoneSansPrix} <a href={DEVIS.question}>{T.commande.nousEcrire}</a>
                </p>
              ) : zone?.delaiJours ? (
                <p className="aide">{T.commande.delaiLivraison.replace("{n}", String(zone.delaiJours))}</p>
              ) : null}
            </>
          ) : null}
        </fieldset>
        <label className="champ">
          <span>{T.commande.message}</span>
          <textarea name="message" rows={3} maxLength={1000} value={f.message} placeholder={T.commande.messageIndice} onChange={(e) => set({ message: e.target.value })} />
        </label>
        {/* piège à robots : invisible et hors du parcours clavier, doit rester vide */}
        <div className="piege" aria-hidden="true">
          <label>
            {T.commande.site}
            <input type="text" name="site" tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>
      </div>
      <div className="tiroir-pied">
        {message ? (
          <p className="commande-erreur" role="alert">
            {message}
            {erreurs.length ? ` ${T.commande.corriger}` : ""}
          </p>
        ) : erreurs.length ? (
          <p className="commande-erreur" role="alert">
            {T.commande.corriger}
          </p>
        ) : null}
        <p className="tiroir-total">
          <span>{T.commande.fraisLivraison}</span>
          <strong>{frais === 0 ? T.commande.gratuit : prix(frais, b.devise, b.usd, b.langue)}</strong>
        </p>
        <p className="tiroir-total">
          <span>{T.commande.totalPayer}</span>
          <strong>{prix(aRegler, b.devise, b.usd, b.langue)}</strong>
        </p>
        <p className="tiroir-note">{enLigne ? `${T.commande.reservation} ${T.commande.note}` : T.commande.note}</p>
        <button className="btn-soleil" type="submit" disabled={envoi || sansPrix} aria-busy={envoi || undefined}>
          {envoi ? (enLigne ? T.commande.paiement : T.commande.envoi) : enLigne ? T.commande.payer : T.commande.envoyer}
        </button>
      </div>
    </form>
  );
}
