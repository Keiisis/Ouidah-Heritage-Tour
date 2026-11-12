"use client";

import { useFormatsSite } from "@/lib/formats-site";

import Image from "next/image";
import Link from "@/components/ui/LienPublic";
import { useSearchParams } from "next/navigation";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { cheminsIntro as CHEMINS_INTRO, conciergerie as CONCIERGERIE, datesSection as DATES_SECTION, destinations as DESTINATIONS, devisPage as DEVIS_PAGE, evenements as EVENEMENTS, nav as NAV, tenReasons as TEN_REASONS, tours as TOURS } from "@/content/fr";
import { EquivalentDevise } from "@/components/ui/EquivalentDevise";
import { oublierRetour, retenirRetour } from "./RetourBillet";
import { useContenu, useLangue } from "@/components/ui/ContenuSite";
import PAYS from "@/content/pays.json";
import type { LieuReleve } from "@/content/types";
import { useDossier, type Dossier } from "@/lib/voyage";
import { modifierChemin } from "@/lib/chemin";
import { servicesDemandes } from "@/lib/conciergerie";
import { ecrireSejour } from "@/lib/sejour";
import { useVisiteur } from "@/lib/visiteur";
import { useMouvementReduit } from "@/lib/mouvement";
import { dateDuJour, jourDe, jourOuidah, prochaine } from "@/lib/jours";
import { rien } from "@/lib/langue";
import { EMAIL, INTENTIONS, manques, type ChampsDevis, type Demande, type Intention, type ReponsesDevis } from "@/lib/demande";
import { Objet3D } from "@/components/ui/Objet3D";
import { Icon } from "@/components/ui/Icon";
import { Palettes } from "@/components/ui/Palettes";
import { adresseRetour, lancerPaiement, type NomPasserelle, type Preparee } from "@/lib/paiement";
import "./billet.css";

// carnet des lieux (circuits, lieux, recherche, carte) : chargé au premier « Choisir mes lieux » seulement
const Carnet = lazy(() => import("./Carnet").then((m) => ({ default: m.Carnet })));

// Page /devis, piste E « Le billet pour Ouidah » (choisie par Kevin le 26/10/2026). Le dossier de voyage composé sur
// l'accueil est lu en direct et inscrit sur le billet en lettres à palettes ; chaque partie a son « Modifier ». Ce qui
// manque se remplit dans des cases jaunes ; le talon porte les coordonnées et l'envoi. Le talon ne se déchire, et la
// confirmation n'apparaît, qu'après la réponse 201 du serveur.
// classes du billet : feuille globale billet.css, toutes préfixées « bt- »
const s = new Proxy({} as Record<string, string>, { get: (_, k) => `bt-${String(k)}` });
const BROUILLON = "oht-devis";
type Etat = "saisie" | "envoi" | "echec" | "limite" | "dechirure" | "envoye";
type Brouillon = { reponses: Omit<ReponsesDevis, "langue"> & { langue: string | null }; champs: ChampsDevis };
type Cle = "ville" | "dates" | "lieux" | "qui" | "occasion" | "pays" | "langue";
const VIDE: Brouillon = { reponses: { qui: null, adultes: 0, enfants: 0, occasion: null, pays: null, langue: null, conseilDates: false, conseilLieux: false }, champs: { nom: "", email: "", whatsapp: "", message: "" } };

function lireBrouillon(): Brouillon {
  try {
    const m = JSON.parse(localStorage.getItem(BROUILLON) ?? "null") as Partial<Brouillon> | null;
    return { reponses: { ...VIDE.reponses, ...m?.reponses }, champs: { ...VIDE.champs, ...m?.champs } };
  } catch {
    return VIDE;
  }
}

function useDevisFormats() {
  const { date, locale, nombre } = useFormatsSite();
  return useMemo(() => {
const fmtLong = date({ day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const fmtCourt = date({ day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtJour = date({ day: "numeric", timeZone: "UTC" });
const fmtJourMois = date({ day: "numeric", month: "long", timeZone: "UTC" });
const nomsPays = new Intl.DisplayNames([locale], { type: "region" });
const PAYS_TRIES = (PAYS as string[]).map((c) => ({ v: c, l: nomsPays.of(c) ?? c })).sort((a, b) => a.l.localeCompare(b.l, locale));

    return { fmtLong, fmtCourt, fmtJour, fmtJourMois, nomsPays, PAYS_TRIES, nombre };
  }, [date, locale, nombre]);
}
const plat = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const SANS_COMPTE = ["Seul(e)", "En couple"];
const ecoule = (depuis: number) => Math.round(performance.now() - depuis); // horloge lue hors du rendu
const aujourdhui = () => jourOuidah(Date.now());
const ISO = (n: number) => dateDuJour(n).toISOString().slice(0, 10);
const deIso = (v: string) => {
  const [y, m, j] = v.split("-").map(Number);
  return y && m && j ? jourDe(y, m - 1, j) : null;
};
// période d'un événement, sans l'année : « du 2 au 9 janvier », « du 30 mars au 2 avril »


const tailleVille = (v: string) => (v.length <= 7 ? "grand" : v.length <= 11 ? "moyen" : "petit");
// panneau en feuille posée en bas de l'écran : téléphone, ou écran bas (téléphone couché) ; même règle que billet.css
const FEUILLE = "(max-width: 700px), (max-height: 500px)";
const FOCUSABLES = "a[href], button:not(:disabled), input:not(:disabled):not([type=hidden]):not([tabindex='-1']), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])";
const visibles = (racine: ParentNode) => [...racine.querySelectorAll<HTMLElement>(FOCUSABLES)].filter((el) => el.getClientRects().length > 0);

export function Devis() {
  const tours = useContenu("fr.tours", TOURS);
  const evenements = useContenu("fr.evenements", EVENEMENTS);
  const destinations = useContenu("fr.destinations", DESTINATIONS);
  const lieuxConnus = useMemo(() => new Set(destinations.map((d) => d.slug)), [destinations]);
  const client = useSyncExternalStore(rien, () => true, () => false);
  const p = useSearchParams();
  const demande = p.get("demande");
  const intention: Intention = INTENTIONS.includes(demande as Intention) ? (demande as Intention) : "voyage";
  const circuit = tours.find((t) => t.slug === p.get("circuit")) ?? null;
  // programme composé dans l'assistant du site : lieux connus (destinations ou relevé « r:… ») et un événement, tout
  // identifiant inconnu ignoré ; ils s'ajoutent au dossier du visiteur sans l'écraser
  const lieuxLien = [...new Set((p.get("lieux") ?? "").split(",").map((x) => x.trim()).filter((x) => lieuxConnus.has(x) || /^r:[\w-]{1,80}$/.test(x)))].slice(0, 30);
  const evenement = evenements.find((e) => e.slug === p.get("evenement"))?.slug ?? null;
  // rendu serveur : coquille seule ; le dossier et le brouillon vivent sur l'appareil
  return client ? <Billet intention={intention} circuit={circuit?.slug ?? null} lieuxLien={lieuxLien} evenement={evenement} /> : <Coquille intention={intention} />;
}

export function Coquille({ intention = "voyage" }: { intention?: Intention }) {
  const T = useContenu("fr.devisPage", DEVIS_PAGE);
  return (
    <div className={s.coquille}>
      <div className={s.bande}>
        <h1 className={s.titre}>{T.titre[intention]}</h1>
        <p className={s.phrase}>{intention === "voyage" ? T.intro.compose : T.intro[intention]}</p>
      </div>
    </div>
  );
}

function Billet({ intention, circuit, lieuxLien = [], evenement = null }: { intention: Intention; circuit: string | null; lieuxLien?: string[]; evenement?: string | null }) {
  const { fmtLong, fmtCourt, fmtJour, fmtJourMois, nomsPays, nombre } = useDevisFormats();
  const T = useContenu("fr.devisPage", DEVIS_PAGE);
  const tours = useContenu("fr.tours", TOURS);
  const evenements = useContenu("fr.evenements", EVENEMENTS);
  const destinations = useContenu("fr.destinations", DESTINATIONS);
  const tenReasons = useContenu("fr.tenReasons", TEN_REASONS);
  const nav = useContenu("fr.nav", NAV);
  const chemins = useContenu("fr.cheminsIntro", CHEMINS_INTRO);
  const datesSection = useContenu("fr.datesSection", DATES_SECTION);
  const periode =(a: number, z: number) => {
    const da = dateDuJour(a), dz = dateDuJour(z);
    // le libellé « Du … au … » de l'agenda ouvre une phrase ; sur le tampon il la continue (« pendant les Vodun Days du … »)
    const r = datesSection.scrub.range(da.getUTCMonth() === dz.getUTCMonth() ? fmtJour.format(da) : fmtJourMois.format(da), fmtJourMois.format(dz));
    return a === z ? fmtJourMois.format(dz) : r.charAt(0).toLocaleLowerCase() + r.slice(1);
  };
  const conciergerie = useContenu("fr.conciergerie", CONCIERGERIE);
  const dossier = useDossier();
  const { visiteur, changer } = useVisiteur(intention !== "question");
  const reduit = useMouvementReduit();
  const [b, setB] = useState<Brouillon>(lireBrouillon);
  const langueSite = useLangue();
  const [etat, setEtat] = useState<Etat>("saisie");
  const [verif, setVerif] = useState(false);
  const [envoye, setEnvoye] = useState<{ reference: string; copie: boolean; suivi: string | null } | null>(null);
  const [consent, setConsent] = useState(false);
  const [emailVu, setEmailVu] = useState(false);
  const [ouvert, setOuvert] = useState<Cle | null>(null);
  const [carnet, setCarnet] = useState(false);
  // lieux venus de l'adresse (?circuit=, ?lieux=) : affichés en plus de la mémoire jusqu'à l'ouverture du carnet, qui les y
  // reprend ; ensuite la mémoire de l'accueil (« oht-chemin ») est la seule source de la case « Vos lieux »
  const [fusion, setFusion] = useState(false);
  const [circuitDepart] = useState(circuit);
  const [releve, setReleve] = useState<LieuReleve[] | null>(null);
  const releveLu = useContenu("lieux-ouidah", useMemo(() => ({ lieux: releve ?? [] }), [releve]));
  const debut = useRef(0);
  const scene = useRef<HTMLDivElement>(null);
  const corps = useRef<HTMLElement>(null);
  const talon = useRef<HTMLElement>(null);
  const panneau = useRef<HTMLDivElement>(null);
  const titre = useRef<HTMLHeadingElement>(null);
  const rendre = useRef(false); // le panneau se ferme sur un choix : le focus revient à sa case
  const dernier = useRef<Cle | null>(null);

  const r = b.reponses, c = b.champs;
  const langue = r.langue ?? langueSite;
  const base: Dossier = dossier ?? { sejour: null, lieux: [], raisons: [], services: {}, devise: null, ville: null, billets: [] };
  // événement venu du lien : sans dates choisies, le séjour proposé est sa prochaine édition (modifiable comme les autres)
  const [jour] = useState(aujourdhui);
  const sejourLien = useMemo(() => {
    const e = evenements.find((x) => x.slug === evenement);
    if (!e) return null;
    const [arrivee, depart] = prochaine(e.quand, jour);
    return depart >= jour ? { arrivee, depart } : null;
  }, [evenement, jour, evenements]);
  const d: Dossier = { ...base, sejour: base.sejour ?? sejourLien, lieux: !fusion && lieuxLien.length ? [...new Set([...base.lieux, ...lieuxLien])] : base.lieux };
  const tourLien = tours.find((t) => t.slug === circuit) ?? null;
  const lieux = useMemo(() => (fusion ? d.lieux : [...new Set([...(tourLien?.stops ?? []), ...d.lieux])]), [fusion, tourLien, d.lieux]);
  // case « Vos lieux » : « Circuit « … » » quand la sélection est exactement ses étapes (ou le circuit de l'adresse, avant le carnet)
  const tour = fusion ? (tours.find((t) => t.stops.length === lieux.length && t.stops.every((x) => lieux.includes(x))) ?? null) : tourLien;
  const tourDepart = tours.find((t) => t.slug === circuitDepart) ?? null;
  const circuitEnvoye = !fusion ? circuit : tourDepart && tourDepart.stops.every((x) => lieux.includes(x)) ? circuitDepart : null;
  const services = servicesDemandes(d.services, conciergerie);
  const compose = Boolean(d.sejour || lieux.length || services.length);
  // ville : celle que le visiteur a choisie (gardée) ou, à défaut, celle que propose sa connexion ; toujours modifiable
  const ville = d.ville ?? visiteur?.ville ?? null;
  const villeChoisie = Boolean(d.ville);
  // départ du Bénin : aucun vol jusqu'à Cotonou, la route mène directement à Ouidah
  const depuisBenin = Boolean(ville && visiteur?.pays === "BJ" && visiteur.ville === ville);
  const paysPropose = visiteur?.pays && (PAYS as string[]).includes(visiteur.pays) ? visiteur.pays : null;
  const fini = etat === "envoye" || etat === "dechirure";

  // billets choisis dans l'Agenda (dossier unique) : un seul événement au prix publié se paie avec l'envoi, si une
  // passerelle est active ; le reste part en devis
  const billets = d.billets.flatMap((x) => {
    const e = evenements.find((v) => v.slug === x.evenement);
    if (!e) return [];
    const cat = e.offre.type === "billet" ? e.offre.categories[x.formule] : { nom: e.offre.nom, prix: e.offre.prix };
    return cat ? [{ ...x, court: e.short, formuleNom: cat.nom, prix: cat.prix }] : [];
  });
  const payables = billets.filter((x) => x.prix !== null);
  const [passerelles, setPasserelles] = useState<NomPasserelle[]>([]);
  const [choisie, setChoisie] = useState<NomPasserelle | null>(null);
  useEffect(() => {
    if (!payables.length) return;
    let vivant = true;
    fetch("/api/paiement/passerelles")
      .then((x) => x.json() as Promise<{ passerelles?: NomPasserelle[] }>)
      .then((x) => vivant && setPasserelles(x.passerelles ?? []))
      .catch(() => vivant && setPasserelles([]));
    return () => {
      vivant = false;
    };
  }, [payables.length]);
  const enLigne = payables.length === 1 && passerelles.length > 0;
  const passerelle = enLigne ? (choisie && passerelles.includes(choisie) ? choisie : passerelles[0]) : null;
  const aPayer = enLigne ? payables[0] : null;
  const montant = aPayer ? aPayer.prix! * aPayer.quantite : null;
  const fcfa = (n: number) => `${nombre().format(n)} FCFA`;

  useEffect(() => {
    debut.current = performance.now();
    oublierRetour(); // de retour sur le billet : la pastille de l'accueil n'a plus lieu d'être
  }, []);
  // brouillon gardé sur l'appareil à chaque changement (un échec d'envoi ou un rechargement ne perd rien)
  useEffect(() => {
    try {
      localStorage.setItem(BROUILLON, JSON.stringify(b));
    } catch {
      /* navigation privée : non gardé */
    }
  }, [b]);
  // noms des lieux du relevé (« r:… ») : chargés seulement s'il y en a
  const aReleve = d.lieux.some((l) => l.startsWith("r:"));
  useEffect(() => {
    if (!aReleve) return;
    let annule = false;
    import("@/content/lieux-ouidah.json").then((m) => !annule && setReleve(m.default.lieux as LieuReleve[]));
    return () => {
      annule = true;
    };
  }, [aReleve]);
  // ouverture : le billet monte, le talon le rejoint ; vignettes, objets et tampon se posent ensuite
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !corps.current) return;
    const E: KeyframeAnimationOptions = { duration: 900, easing: "cubic-bezier(.16, 1, .3, 1)", fill: "backwards" };
    corps.current.animate([{ opacity: 0, transform: "translateY(80px) rotate(-1.5deg)" }, { opacity: 1, transform: "none" }], E);
    talon.current?.animate([{ opacity: 0, transform: "translate(40px, 90px) rotate(2deg)" }, { opacity: 1, transform: "none" }], { ...E, delay: 140 });
    corps.current.querySelectorAll<HTMLElement>("[data-pose]").forEach((el, i) => el.animate([{ opacity: 0, transform: "translateY(18px) scale(.94)" }, { opacity: 1, transform: "none" }], { duration: 600, delay: 900 + i * 70, easing: "cubic-bezier(.16, 1, .3, 1)", fill: "backwards" }));
    corps.current.querySelector<HTMLElement>("[data-tampon]")?.animate([{ opacity: 0, transform: "rotate(-24deg) scale(2)" }, { opacity: 1, transform: "rotate(-9deg) scale(1)" }], { duration: 340, delay: 1500, easing: "cubic-bezier(.55, 0, 1, .45)", fill: "backwards" });
  }, []); // une seule fois, à l'arrivée sur la page

  // panneau : posé sous sa case (au téléphone, feuille en bas de l'écran, voir la feuille de style)
  useLayoutEffect(() => {
    if (!ouvert) return;
    const placer = () => {
      const p = panneau.current, cible = document.getElementById(`trou-${ouvert}`), sc = scene.current;
      if (!p || !cible || !sc || matchMedia(FEUILLE).matches) return;
      const a = sc.getBoundingClientRect(), q = cible.getBoundingClientRect();
      const x = Math.max(0, Math.min(q.left - a.left - 8, a.width - p.offsetWidth));
      const dessous = q.bottom + 12 + p.offsetHeight < innerHeight - 12 || q.top - p.offsetHeight - 12 < 90;
      p.style.left = `${x}px`;
      p.style.top = `${dessous ? q.bottom - a.top + 12 : q.top - a.top - p.offsetHeight - 12}px`;
    };
    placer();
    const p = panneau.current;
    (p?.querySelector<HTMLElement>("input, [aria-checked='true'], [aria-pressed='true']") ?? p)?.focus({ preventScroll: true });
    if (!reduit) p?.animate([{ opacity: 0, transform: "translateY(-8px) scale(.98)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "cubic-bezier(.16, 1, .3, 1)" });
    addEventListener("resize", placer);
    return () => removeEventListener("resize", placer);
  }, [ouvert, reduit]);
  useEffect(() => {
    if (ouvert) {
      dernier.current = ouvert;
      return;
    }
    const k = dernier.current;
    dernier.current = null;
    if (!k || !rendre.current) return;
    rendre.current = false;
    (document.getElementById(`trou-${k}`) ?? document.getElementById(`trou-${k}-suite`))?.focus({ preventScroll: true });
  }, [ouvert]);
  // Échap ferme (le focus revient sur la case), un clic ailleurs aussi. Clavier : le panneau, placé après le formulaire
  // dans la page, se parcourt comme s'il suivait sa case. Tab depuis la case entre dans le panneau ; Maj+Tab depuis son
  // premier élément revient à la case ; Tab après son dernier élément ferme le panneau et passe à la case suivante du
  // billet ; le focus parti ailleurs le ferme aussi.
  useEffect(() => {
    if (!ouvert) return;
    const caseDe = () => document.getElementById(`trou-${ouvert}`);
    const clavier = (e: KeyboardEvent) => {
      const p = panneau.current, cible = caseDe();
      if (e.key === "Escape") {
        cible?.focus();
        setOuvert(null);
        return;
      }
      if (e.key !== "Tab" || !p || !cible) return;
      const dedans = visibles(p), actif = document.activeElement as HTMLElement | null;
      if (!e.shiftKey && actif === cible && dedans.length) {
        e.preventDefault();
        dedans[0].focus();
      } else if (e.shiftKey && (actif === dedans[0] || actif === p)) {
        e.preventDefault();
        cible.focus();
      } else if (!e.shiftKey && (actif === dedans.at(-1) || (actif === p && !dedans.length))) {
        const suivant = visibles(document).find((el) => !p.contains(el) && cible.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
        if (!suivant) return;
        e.preventDefault();
        setOuvert(null);
        suivant.focus();
      }
    };
    const dehors = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!panneau.current?.contains(t) && !t.closest?.(`#trou-${ouvert}`)) setOuvert(null);
    };
    const focus = (e: FocusEvent) => {
      const t = e.target as Node | null;
      if (t && !panneau.current?.contains(t) && t !== caseDe()) setOuvert(null);
    };
    document.addEventListener("keydown", clavier);
    document.addEventListener("pointerdown", dehors);
    document.addEventListener("focusin", focus);
    return () => {
      document.removeEventListener("keydown", clavier);
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("focusin", focus);
    };
  }, [ouvert]);

  const fiche = (id: string) => {
    const x = destinations.find((y) => y.slug === id);
    // lieu sans photo dans le catalogue : la vraie photo de la raison qui le mentionne (section 7), s'il y en a une
    if (x) return { id, nom: x.name, image: x.image ?? tenReasons.find((t) => t.lieux.includes(id))?.image ?? null };
    const l = releveLu.lieux.find((y) => `r:${y.slug}` === id);
    return l ? { id, nom: l.nom, image: null } : null;
  };
  const fiches = lieux.map(fiche).filter((x): x is NonNullable<ReturnType<typeof fiche>> => !!x);
  // événements que le séjour recoupe : le premier va sur le tampon, avec ses vraies dates
  const pendant = d.sejour
    ? evenements
        .map((e) => {
          const [a, z] = prochaine(e.quand, d.sejour!.arrivee);
          return a <= d.sejour!.depart && z >= d.sejour!.arrivee ? { e, a, z } : null;
        })
        .filter((x) => x !== null)
    : [];

  const demande: Demande = {
    intention,
    circuit: circuitEnvoye,
    dossier: { sejour: d.sejour, lieux: d.lieux, raisons: d.raisons, services: d.services, devise: d.devise, ville },
    reponses: { ...r, langue },
    champs: c,
    consentement: consent,
    piege: "",
    duree: 0,
  };
  const manque = manques(demande);
  const prenom = c.nom.trim().split(/\s+/)[0] ?? "";
  const rep = (x: Partial<Brouillon["reponses"]>) => setB((v) => ({ ...v, reponses: { ...v.reponses, ...x } }));
  const champ = (x: Partial<ChampsDevis>) => setB((v) => ({ ...v, champs: { ...v.champs, ...x } }));
  const erreur = (k: string) => verif && manque.includes(k);
  const emailFaux = (emailVu || verif) && c.email.trim() !== "" && !EMAIL.test(c.email.trim());

  const envoyer = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (etat === "envoi" || fini) return;
    if (manque.length) {
      setVerif(true);
      const m = manque[0];
      document.getElementById(m === "consent" ? "devis-consent" : ["nom", "email", "message"].includes(m) ? `devis-${m}` : `trou-${m}`)?.focus();
      return;
    }
    setOuvert(null);
    setEtat("envoi");
    const piege = String(new FormData(e.currentTarget).get("site") ?? "");
    try {
      const res = await fetch("/api/devis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...demande, piege, duree: ecoule(debut.current), billets: billets.map(({ evenement, formule, quantite }) => ({ evenement, formule, quantite })), passerelle }),
      });
      const corpsJson = (await res.json().catch(() => null)) as { reference?: string; copie?: boolean; suivi?: string | null; reservation?: Preparee } | null;
      if (res.status !== 201 || !corpsJson?.reference) return setEtat(res.status === 429 ? "limite" : "echec");
      // billet payé avec l'envoi : paiement chez la passerelle, puis retour sur l'accueil où le talon montre les billets
      const prep = corpsJson.reservation;
      if (prep) return await lancerPaiement(prep, corpsJson.reference, (transaction) => window.location.assign(adresseRetour(prep, transaction)));
      setEnvoye({ reference: corpsJson.reference, copie: corpsJson.copie === true, suivi: typeof corpsJson.suivi === "string" ? corpsJson.suivi : null });
      try {
        localStorage.removeItem(BROUILLON);
      } catch {
        /* rien à effacer */
      }
      await dechirer();
      setEtat("envoye");
      requestAnimationFrame(() => titre.current?.focus({ preventScroll: true }));
    } catch {
      setEtat("echec");
    }
  };
  // le talon se déchire le long des pointillés et s'envole (seulement après la réponse 201)
  const dechirer = async () => {
    setEtat("dechirure");
    const t = talon.current;
    if (reduit || !t) return;
    const vertical = matchMedia("(max-width: 1100px)").matches;
    t.style.transformOrigin = vertical ? "0 0" : "0 100%";
    const vol = vertical
      ? [{ transform: "none" }, { transform: "rotate(-1.2deg)", offset: 0.14 }, { transform: "rotate(.8deg)", offset: 0.24 }, { transform: "translate(16px, 20px) rotate(3deg)", offset: 0.36, opacity: 1 }, { transform: "translate(70%, 520px) rotate(16deg)", opacity: 0 }]
      : [{ transform: "none" }, { transform: "rotate(-1.4deg)", offset: 0.14 }, { transform: "rotate(.9deg)", offset: 0.24 }, { transform: "translate(26px, -14px) rotate(4deg)", offset: 0.36, opacity: 1 }, { transform: "translate(340px, -820px) rotate(24deg)", opacity: 0 }];
    await t.animate(vol, { duration: 1100, easing: "cubic-bezier(.45, 0, .8, .35)", fill: "forwards" }).finished;
  };

  // ——— cases jaunes
  const ouvrirCarnet = () => {
    if (!fusion) {
      const ajouts = lieux.filter((x) => !base.lieux.includes(x));
      if (ajouts.length) modifierChemin(ajouts, []);
      setFusion(true);
      if (circuit || lieuxLien.length) {
        const u = new URL(location.href);
        u.searchParams.delete("circuit");
        u.searchParams.delete("lieux");
        window.history.replaceState(null, "", u);
      }
    }
    setOuvert(null);
    setCarnet(true);
  };
  const ouvrir = (k: Cle) => (k === "lieux" ? ouvrirCarnet() : setOuvert((o) => (o === k ? null : k)));
  const cadreCorps = useCallback(() => corps.current?.getBoundingClientRect() ?? null, []);
  // carnet refermé (Valider, croix, Échap, clic dehors) : le focus revient à la case, Tab continue dans le billet
  const carnetVu = useRef(false);
  useEffect(() => {
    if (carnet) carnetVu.current = true;
    else if (carnetVu.current) {
      carnetVu.current = false;
      document.getElementById("trou-lieux")?.focus();
    }
  }, [carnet]);
  // choix fait dans le panneau : il se ferme et le focus revient sur la case (ou, si elle a laissé place aux dates, sur
  // leur « Modifier »), jamais perdu en haut de la page
  const choisi = () => {
    rendre.current = true;
    setOuvert(null);
  };
  const caseJaune = (k: Cle, valeur: string | null, vide: string, opts: { libre?: boolean; sr?: string; libelle: string }) => (
    <button
      id={`trou-${k}`}
      type="button"
      aria-haspopup="dialog"
      aria-expanded={k === "lieux" ? carnet : ouvert === k}
      aria-label={`${opts.libelle} : ${opts.sr ?? valeur ?? vide}${fini ? "" : `, ${chemins.location.change.toLocaleLowerCase()}`}`}
      aria-describedby={erreur(k) ? "devis-manque" : undefined}
      disabled={fini}
      onClick={() => ouvrir(k)}
      className={`${s.case} ${valeur ? s.rempli : opts.libre ? s.libre : ""} ${ouvert === k || (k === "lieux" && carnet) ? s.actif : ""} ${erreur(k) ? s.erreur : ""}`}
    >
      {valeur ? (
        <>
          <span className={s.sr}>{opts.sr ?? valeur}</span>
          <Palettes texte={valeur} taille="ligne" />
        </>
      ) : (
        vide
      )}
    </button>
  );
  const quiValeur = r.qui;
  const quiNote = r.qui && !SANS_COMPTE.includes(r.qui) ? T.qui.nombre(r.adultes, r.enfants) : "";
  const paysNom = r.pays ? (nomsPays.of(r.pays) ?? r.pays) : null;
  const langueNom = nav.languages.find((l) => l.code === langue)?.label ?? langue;
  const occasionValeur = r.occasion ?? (fini ? T.occasion.aucune : null);

  const contenuPanneau: Record<Exclude<Cle, "lieux">, () => ReactNode> = {
    ville: () => <PanVille ville={ville} onVille={async (n) => (await changer(n)) && (choisi(), true)} />,
    dates: () => (
      <PanDates
        conseil={r.conseilDates}
        onConseil={() => {
          rep({ conseilDates: true });
          choisi();
        }}
        onDates={(x) => {
          ecrireSejour(x);
          rep({ conseilDates: false });
          choisi();
        }}
      />
    ),
    qui: () => (
      <PanQui
        qui={r.qui}
        adultes={r.adultes}
        enfants={r.enfants}
        onQui={(id) => {
          const o = T.qui.options.find((x) => x.id === id)!;
          const seul = SANS_COMPTE.includes(id); // seul(e), en couple : le nombre est dans le mot
          rep({ qui: id, adultes: seul || r.adultes < 1 ? o.adultes : r.adultes, enfants: seul ? 0 : r.enfants });
        }}
        onNombre={(a, e) => rep({ adultes: a, enfants: e })}
        onValider={() => choisi()}
      />
    ),
    occasion: () => (
      <>
        <p className={s.panTitre}>{T.occasion.titre}</p>
        <p className={s.panNote}>{T.occasion.note}</p>
        <div className={s.puces}>
          {T.occasion.options.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={r.occasion === o.id}
              className={s.puce}
              onClick={() => {
                rep({ occasion: r.occasion === o.id ? null : o.id });
                choisi();
              }}
            >
              {o.phrase.charAt(0).toLocaleUpperCase() + o.phrase.slice(1)}
            </button>
          ))}
        </div>
      </>
    ),
    pays: () => (
      <PanPays
        pays={r.pays}
        propose={paysPropose}
        onPays={(v) => {
          rep({ pays: v });
          choisi();
        }}
      />
    ),
    langue: () => (
      <>
        <p className={s.panTitre}>{T.langue.titre}</p>
        <p className={s.panNote}>{T.langue.aide}</p>
        <div className={s.puces} role="radiogroup" aria-label={T.langue.lib}>
          {nav.languages.map((l) => (
            <button
              key={l.code}
              type="button"
              role="radio"
              aria-checked={langue === l.code}
              className={s.puce}
              onClick={() => {
                rep({ langue: l.code });
                choisi();
              }}
            >
              {l.label}
              {l.code === langueSite ? <small>{T.langue.note}</small> : null}
            </button>
          ))}
        </div>
      </>
    ),
  };

  const voyage = intention !== "question";
  const tampon = pendant[0];
  return (
    <div ref={scene} className={s.scene}>
      <form onSubmit={envoyer} noValidate className={`${s.billet} ${etat === "envoye" ? s.envoye : ""}`}>
        <article ref={corps} className={s.corps} aria-labelledby="devis-titre">
          <span className={`${s.encoche} ${s.e1}`} aria-hidden="true" />
          <span className={`${s.encoche} ${s.e2}`} aria-hidden="true" />
          <header className={s.bande} aria-live="polite">
            <h1 id="devis-titre" ref={titre} tabIndex={-1} className={s.titre}>
              {fini && envoye ? T.merci.titre(prenom) : T.titre[intention]}
            </h1>
            <p className={s.phrase}>
              {fini && envoye ? (
                <>
                  {T.merci.texte(T.langues[langue] ?? langue, c.email.trim())} {envoye.copie ? T.merci.copie : null}
                </>
              ) : intention === "voyage" ? (
                compose ? T.intro.compose : T.intro.vide
              ) : (
                T.intro[intention]
              )}
            </p>
            {fini && envoye?.suivi ? (
              <Link href={`/suivi/${envoye.suivi}`} prefetch={false} className={s.suivre}>
                {T.merci.suivre}
              </Link>
            ) : null}
            {fini && envoye ? (
              <Link href={T.merci.retour.href} className={`oht-btn is-clair ${s.retour}`}>
                <span className="oht-btn-pastille is-gauche" aria-hidden="true">
                  <Icon name="arrow-right" />
                </span>
                <span className="oht-btn-pilule">{T.merci.retour.label}</span>
                <span className="oht-btn-pastille is-droite" aria-hidden="true">
                  <Icon name="arrow-right" />
                </span>
              </Link>
            ) : null}
            {voyage ? (
              <div className={s.ref}>
                <span className={s.lib}>{fini && envoye ? T.reference.lib2 : T.reference.lib}</span>
                {fini && envoye ? (
                  <>
                    <span className={s.sr}>{envoye.reference}</span>
                    <Palettes texte={envoye.reference} taille="mini" entree />
                  </>
                ) : (
                  <span className={s.note}>{T.reference.note}</span>
                )}
              </div>
            ) : null}
          </header>
          {/* téléphone et tablette : le talon est sous le billet ; ce qui manque reste visible en haut pendant qu'on complète
              les cases (le résumé lu par les lecteurs d'écran est celui du talon, role=status) */}
          {verif && manque.length > 0 && etat !== "envoi" && !fini ? (
            <p className={s.manqueHaut} aria-hidden="true">
              {T.talon.manque(manque.map((k) => T.talon.noms[k] ?? k))}
            </p>
          ) : null}

          {voyage ? (
            <>
              {/* trajet : ville proposée (modifiable) → aéroport de Cotonou → Ouidah ; depuis le Bénin, la route seule */}
              <section className={`${s.trajet} ${depuisBenin ? s.trajetRoute : ""}`} aria-label={depuisBenin ? `${T.trajet.depart} : ${ville}, ${T.trajet.route}, Ouidah` : `${T.trajet.depart} : ${ville ?? T.trajet.villeTrou}, ${T.trajet.aeroport.nom}, Ouidah`}>
                <div className={s.escale}>
                  <span className={s.lib}>{T.trajet.depart}</span>
                  {ville ? (
                    <>
                      <span className={s.sr}>{ville}</span>
                      <Palettes texte={ville.toLocaleUpperCase("fr")} taille={tailleVille(ville)} entree delai={350} />
                      <span className={`${s.note} ${s.ville}`}>
                        {villeChoisie ? T.trajet.choisie : T.trajet.detectee}
                        {fini ? null : (
                          <button type="button" id="trou-ville" className={s.modifier} aria-haspopup="dialog" aria-expanded={ouvert === "ville"} onClick={() => ouvrir("ville")}>
                            {chemins.location.change}
                          </button>
                        )}
                      </span>
                    </>
                  ) : (
                    <>
                      {caseJaune("ville", null, T.trajet.villeTrou, { libre: true, libelle: T.trajet.depart })}
                      <span className={s.note}>{T.trajet.villeNote}</span>
                    </>
                  )}
                </div>
                {depuisBenin ? null : (
                  <>
                    <div className={s.liaison}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M21 12c0-.8-.7-1.5-1.5-1.5H15L10 3H8l2.5 7.5H6L4.5 8.5H3l1 3.5-1 3.5h1.5L6 13.5h4.5L8 21h2l5-7.5h4.5c.8 0 1.5-.7 1.5-1.5z" />
                      </svg>
                      <span className={s.note}>{T.trajet.vol}</span>
                    </div>
                    <div className={s.escale}>
                      <span className={s.lib}>{T.trajet.arrivee}</span>
                      <Palettes texte={T.trajet.aeroport.code} taille="grand" entree delai={550} />
                      <span className={s.note}>{T.trajet.aeroport.nom}</span>
                    </div>
                  </>
                )}
                <div className={s.liaison}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5.5 16.5H4a1 1 0 0 1-1-1v-3l2.2-4.6A1.6 1.6 0 0 1 6.6 7h10.8a1.6 1.6 0 0 1 1.4.9L21 12.5v3a1 1 0 0 1-1 1h-1.5M9.5 16.5h5M4 12.5h16" />
                    <circle cx="7.5" cy="16.5" r="2" />
                    <circle cx="16.5" cy="16.5" r="2" />
                  </svg>
                  <span className={s.note}>{depuisBenin ? T.trajet.route : T.trajet.navette(T.trajet.aeroport.km)}</span>
                </div>
                <div className={`${s.escale} ${s.dest}`}>
                  <span className={s.lib}>{T.trajet.destination}</span>
                  <Palettes texte={T.trajet.ouidah} taille="grand" entree delai={750} />
                  <span className={s.note}>{T.trajet.pays}</span>
                </div>
              </section>

              {/* dates (section 6) et l'événement qu'elles recoupent */}
              <div className={`${s.rang} ${s.rang1}`}>
                {d.sejour ? (
                  <>
                    <div className={s.cel}>
                      <span className={s.lib}>{T.dates.aller}</span>
                      <span className={s.sr}>{fmtLong.format(dateDuJour(d.sejour.arrivee))}</span>
                      <Palettes texte={fmtCourt.format(dateDuJour(d.sejour.arrivee))} taille="ligne" entree delai={1000} />
                    </div>
                    <div className={s.cel}>
                      <span className={s.lib}>{T.dates.retour}</span>
                      <span className={s.sr}>{fmtLong.format(dateDuJour(d.sejour.depart))}</span>
                      <Palettes texte={fmtCourt.format(dateDuJour(d.sejour.depart))} taille="ligne" entree delai={1100} />
                    </div>
                    <div className={`${s.cel} ${s.sejour}`}>
                      <span className={s.lib}>{T.dates.sejour}</span>
                      <div className={s.ligne}>
                        <span className={s.sr}>{T.dates.nuits(d.sejour.depart - d.sejour.arrivee)}</span>
                        <Palettes texte={T.dates.nuits(d.sejour.depart - d.sejour.arrivee)} taille="ligne" entree delai={1200} />
                        {fini ? null : (
                          <Link id="trou-dates-suite" href={T.dates.modifier.href} className={s.modifier} onClick={retenirRetour}>
                            {T.dates.modifier.label}
                          </Link>
                        )}
                      </div>
                      {tampon ? (
                        <div className={s.tampon} data-tampon>
                          <span>{T.dates.pendant}</span>
                          <b>{tampon.e.short}</b>
                          <span>{periode(tampon.a, tampon.z)}</span>
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className={`${s.cel} ${s.datesVides}`}>
                    <span className={s.lib}>{T.dates.allerRetour}</span>
                    {caseJaune("dates", r.conseilDates ? T.dates.conseillees : null, T.dates.trou, { libelle: T.dates.sejour })}
                  </div>
                )}
              </div>

              {/* ce qui manque : passagers, occasion, pays, langue */}
              <div className={`${s.rang} ${s.rang2}`}>
                <div className={s.cel}>
                  <span className={s.lib}>{T.qui.lib}</span>
                  {caseJaune("qui", quiValeur, T.qui.trou, { libelle: T.qui.lib, sr: [quiValeur, quiNote].filter(Boolean).join(", ") || undefined })}
                  <span className={s.note}>{quiNote}</span>
                </div>
                <div className={s.cel}>
                  <span className={s.lib}>{T.occasion.lib}</span>
                  {caseJaune("occasion", occasionValeur, T.occasion.trou, { libre: true, libelle: T.occasion.lib })}
                  <span className={s.note}>{r.occasion || fini ? "" : T.occasion.note}</span>
                </div>
                <div className={s.cel}>
                  <span className={s.lib}>{T.pays.lib}</span>
                  {caseJaune("pays", paysNom, T.pays.trou, { libelle: T.pays.lib })}
                  <span className={s.note} />
                </div>
                <div className={s.cel}>
                  <span className={s.lib}>{T.langue.lib}</span>
                  {caseJaune("langue", langueNom, langueNom, { libelle: T.langue.lib })}
                  <span className={s.note}>{langue === langueSite ? T.langue.note : ""}</span>
                </div>
              </div>

              {/* lieux gardés (section 5) et services (section 9) */}
              <div className={`${s.rang} ${s.rang3}`}>
                <div className={s.cel}>
                  <div className={s.teteBloc}>
                    <span className={s.lib}>{lieux.length ? (tour ? T.lieux.circuit(tour.title) : T.lieux.titre(lieux.length)) : T.lieux.titreVide}</span>
                    {lieux.length && !fini ? (
                      <button type="button" id="trou-lieux" className={s.modifier} aria-haspopup="dialog" aria-expanded={carnet} onClick={ouvrirCarnet}>
                        {T.lieux.modifier.label}
                      </button>
                    ) : null}
                  </div>
                  {lieux.length ? (
                    <div className={s.vignettes}>
                      {fiches.map((f) => (
                        <figure key={f.id} className={s.vignette} data-pose>
                          <span className={s.photo}>{f.image ? <Image src={f.image.src} alt={f.image.alt} fill sizes="(min-width: 1100px) 180px, 45vw" /> : null}</span>
                          <span>{f.nom}</span>
                        </figure>
                      ))}
                    </div>
                  ) : (
                    caseJaune("lieux", r.conseilLieux ? T.lieux.conseilles : null, T.lieux.trou, { libelle: T.lieux.titreVide })
                  )}
                </div>
                <div className={s.cel}>
                  <div className={s.teteBloc}>
                    <span className={s.lib}>{services.length ? T.services.titre(services.length) : T.services.titreVide}</span>
                    {services.length && !fini ? (
                      <Link href={T.services.modifier.href} className={s.modifier} onClick={retenirRetour}>
                        {T.services.modifier.label}
                      </Link>
                    ) : null}
                  </div>
                  {services.length ? (
                    <div className={s.objets}>
                      {services.map((q) => (
                        <div key={q.id} className={s.objet} data-pose>
                          <Objet3D nom={q.objet} taille={54} className="size-12 md:size-[54px]" />
                          <div>
                            <b>{q.court}</b>
                            <span>{d.services[q.id].join(", ")}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className={s.aucun}>
                      {T.services.aucun} <Link href={T.services.aucunLien.href} onClick={retenirRetour}>{T.services.aucunLien.label}</Link>.
                    </p>
                  )}
                </div>
              </div>

              {/* billets d'événement choisis dans l'Agenda : à payer maintenant ou sur devis */}
              {billets.length ? (
                <div className={`${s.rang} ${s.rang4}`}>
                  <div className={s.cel}>
                    <div className={s.teteBloc}>
                      <span className={s.lib}>{T.billets.titre(billets.length)}</span>
                      {!fini ? (
                        <Link href={T.billets.modifier.href} className={s.modifier} onClick={retenirRetour}>
                          {T.billets.modifier.label}
                        </Link>
                      ) : null}
                    </div>
                    <div className={s.objets}>
                      {billets.map((x) => (
                        <div key={x.evenement} className={s.objet} data-pose>
                          <Objet3D nom="billet" taille={54} className="size-12 md:size-[54px]" />
                          <div>
                            <b>{T.billets.ligne(x.court, x.formuleNom, x.quantite)}</b>
                            <span>
                              {x === aPayer && montant !== null ? (
                                <>
                                  {T.billets.aPayer(fcfa(montant))}
                                  <EquivalentDevise xof={montant} />
                                </>
                              ) : (
                                T.billets.surDevis
                              )}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {payables.length > 1 ? <p className={s.note}>{T.billets.unSeul}</p> : null}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </article>

        {etat !== "envoye" ? (
          <aside ref={talon} className={s.talon} aria-labelledby="devis-talon">
            <span className={`${s.encoche} ${s.e1}`} aria-hidden="true" />
            <span className={`${s.encoche} ${s.e2}`} aria-hidden="true" />
            <div className={s.talonBande}>
              <p className={s.marque}>
                <span className={s.sceau}>
                  <Image src={nav.embleme.src} alt="" width={48} height={48} />
                </span>
                {T.talon.logo}
              </p>
              <h2 id="devis-talon">{voyage ? T.talon.titre : T.talon.titreQuestion}</h2>
            </div>
            <div className={s.form}>
              <label className={s.champ}>
                <span>{T.talon.champs.nom}</span>
                <input id="devis-nom" className={s.saisie} name="nom" autoComplete="name" maxLength={120} value={c.nom} onChange={(e) => champ({ nom: e.target.value })} aria-invalid={erreur("nom") || undefined} aria-describedby={erreur("nom") ? "devis-nom-erreur" : undefined} />
                {erreur("nom") ? (
                  <span id="devis-nom-erreur" className={s.champErreur}>
                    {T.talon.manque([T.talon.noms.nom])}
                  </span>
                ) : null}
              </label>
              <label className={s.champ}>
                <span>{T.talon.champs.email}</span>
                <input id="devis-email" className={s.saisie} name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} value={c.email} onBlur={() => setEmailVu(true)} onChange={(e) => champ({ email: e.target.value })} aria-invalid={erreur("email") || emailFaux || undefined} aria-describedby={emailFaux || erreur("email") ? "devis-email-erreur" : undefined} />
                {emailFaux || erreur("email") ? (
                  <span id="devis-email-erreur" className={s.champErreur}>
                    {emailFaux ? T.talon.emailInvalide : T.talon.manque([T.talon.noms.email])}
                  </span>
                ) : null}
              </label>
              <label className={s.champ}>
                <span>
                  {T.talon.champs.whatsapp} <small>{T.talon.champs.facultatif}</small>
                </span>
                <input id="devis-whatsapp" className={s.saisie} name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" maxLength={32} placeholder={T.talon.champs.whatsappAide} value={c.whatsapp} onChange={(e) => champ({ whatsapp: e.target.value })} />
              </label>
              <label className={s.champ}>
                <span>
                  {voyage ? T.talon.champs.message : T.talon.champs.messageQuestion} {voyage ? <small>{T.talon.champs.facultatif}</small> : null}
                </span>
                <textarea id="devis-message" className={s.saisie} name="message" rows={voyage ? 2 : 5} maxLength={4000} placeholder={T.talon.champs.messageAide} value={c.message} onChange={(e) => champ({ message: e.target.value })} aria-invalid={erreur("message") || undefined} aria-describedby={erreur("message") ? "devis-message-erreur" : undefined} />
                {erreur("message") ? (
                  <span id="devis-message-erreur" className={s.champErreur}>
                    {T.talon.manque([T.talon.noms.message])}
                  </span>
                ) : null}
              </label>
              {/* piège à robots : invisible et hors du parcours clavier */}
              <input type="text" name="site" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
              {enLigne ? (
                <fieldset className={s.moyens}>
                  <legend>{T.talon.payerAvec}</legend>
                  {passerelles.map((p) => (
                    <label key={p} className={`${s.moyen} ${passerelle === p ? s.on : ""}`}>
                      <input type="radio" name="devis-passerelle" checked={passerelle === p} onChange={() => setChoisie(p)} />
                      <Image src={`/paiement/${p}.svg`} alt={datesSection.talon.passerelles[p]?.nom ?? p} width={96} height={22} className={s.logo} />
                      <small>{datesSection.talon.passerelles[p]?.moyens}</small>
                    </label>
                  ))}
                </fieldset>
              ) : null}
              <label className={s.accord}>
                <input id="devis-consent" className={s.sr} type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-invalid={erreur("consent") || undefined} aria-describedby={erreur("consent") ? "devis-consent-erreur" : undefined} />
                <i aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M6 12.5l4 4L18 8" />
                  </svg>
                </i>
                <span>
                  {voyage ? T.talon.consent : T.talon.consentQuestion} <Link href={T.talon.confidentialite.href}>{T.talon.confidentialite.label}</Link>
                </span>
              </label>
              {erreur("consent") ? (
                <span id="devis-consent-erreur" className={s.champErreur}>
                  {T.talon.manque([T.talon.noms.consent])}
                </span>
              ) : null}
              <div className={s.envoi}>
                <button type="submit" aria-disabled={etat === "envoi" || undefined} className={`oht-btn ${etat === "envoi" ? "is-attente" : ""}`}>
                  <span className="oht-btn-pastille is-gauche" aria-hidden="true">
                    <Icon name="arrow-right" />
                  </span>
                  <span className="oht-btn-pilule">{etat === "envoi" ? T.talon.envoi : etat === "echec" ? T.talon.reessayer : montant !== null ? T.talon.payer(fcfa(montant)) : T.talon.bouton}</span>
                  <span className="oht-btn-pastille is-droite" aria-hidden="true">
                    {etat === "envoi" ? <span className="oht-tourne" /> : <Icon name="arrow-right" />}
                  </span>
                </button>
                <p className={s.promesse}>{T.talon.promesse}</p>
                <p id="devis-manque" role="status" className={`${s.manque} ${etat === "echec" || etat === "limite" || (verif && manque.length) ? s.manqueErreur : ""}`}>
                  {etat === "echec" ? T.talon.echec : etat === "limite" ? T.talon.limite : manque.length && etat !== "envoi" ? T.talon.manque(manque.map((k) => T.talon.noms[k] ?? k)) : ""}
                </p>
                {voyage ? <Reprise demande={demande} /> : null}
              </div>
            </div>
          </aside>
        ) : null}
      </form>

      {ouvert && ouvert !== "lieux" && !fini ? (
        <div ref={panneau} className={s.panneau} role="dialog" aria-modal="false" aria-label={T.talon.noms[ouvert] ?? ouvert} tabIndex={-1}>
          {contenuPanneau[ouvert]()}
        </div>
      ) : null}
      <Suspense fallback={null}>
        {carnet && !fini ? (
          <Carnet
            gardes={lieux}
            cadre={cadreCorps}
            onFermer={() => setCarnet(false)}
            onConseil={() => rep({ conseilLieux: true })}
            onMessage={(ligne) =>
              setB((v) => {
                const m = v.champs.message;
                return m.includes(ligne) ? v : { ...v, champs: { ...v.champs, message: [m.trim(), ligne].filter(Boolean).join("\n").slice(0, 4000) } };
              })
            }
          />
        ) : null}
      </Suspense>
    </div>
  );
}

function PanVille({ ville, onVille }: { ville: string | null; onVille: (nom: string) => Promise<boolean> }) {
  const T = useContenu("fr.devisPage", DEVIS_PAGE);
  const [v, setV] = useState(ville ?? "");
  const [perdu, setPerdu] = useState(false);
  const [cherche, setCherche] = useState(false);
  return (
    <>
      <p className={s.panTitre}>{T.trajet.villeTitre}</p>
      <label className={s.recherche}>
        <span className={s.sr}>{T.trajet.villeTitre}</span>
        <input
          className={s.saisie}
          value={v}
          placeholder={T.trajet.villeAide}
          autoComplete="address-level2"
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.currentTarget.closest("[role=dialog]")?.querySelector("[data-garder]") as HTMLButtonElement | null)?.click();
            }
          }}
        />
      </label>
      {perdu ? <p className={s.panErreur}>{T.trajet.villeIntrouvable}</p> : null}
      <div className={s.panPied}>
        <button
          type="button"
          data-garder
          disabled={cherche || !v.trim()}
          className={s.petitBouton}
          onClick={async () => {
            setCherche(true);
            const ok = await onVille(v.trim());
            setCherche(false);
            setPerdu(!ok);
          }}
        >
          {T.trajet.villeOk}
        </button>
      </div>
    </>
  );
}

function PanDates({ conseil, onConseil, onDates }: { conseil: boolean; onConseil: () => void; onDates: (x: { arrivee: number; depart: number }) => void }) {
  const T = useContenu("fr.devisPage", DEVIS_PAGE);
  const [a, setA] = useState("");
  const [z, setZ] = useState("");
  // « manque » : une des deux dates n'est pas choisie ; « ordre » : dates choisies mais impossibles
  const [faux, setFaux] = useState<"manque" | "ordre" | null>(null);
  const [auj] = useState(aujourdhui);
  const champA = useRef<HTMLInputElement>(null), champZ = useRef<HTMLInputElement>(null);
  const garder = () => {
    if (!a || !z) {
      setFaux("manque");
      (a ? champZ : champA).current?.focus();
      return;
    }
    const x = deIso(a), y = deIso(z);
    if (x === null || y === null || x < auj || y <= x || y > auj + 3 * 366) {
      setFaux("ordre");
      champZ.current?.focus();
      return;
    }
    onDates({ arrivee: x, depart: y });
  };
  const fauxA = faux === "manque" ? !a : faux === "ordre" && (deIso(a) ?? auj) < auj;
  const fauxZ = faux === "manque" ? !z : faux === "ordre";
  return (
    <>
      <p className={s.panTitre}>{T.dates.trou.replace(/^./, (x) => x.toUpperCase())}</p>
      <div className={s.puces}>
        <button type="button" aria-pressed={conseil} className={s.puce} onClick={onConseil}>
          {T.dates.conseil}
        </button>
      </div>
      <div className={s.separation}>
        <p className={s.lib}>{T.dates.choisir}</p>
        <div className={s.dates}>
          <label>
            {T.dates.arrivee}
            <input ref={champA} type="date" className={s.saisie} min={ISO(auj)} value={a} aria-invalid={fauxA || undefined} aria-describedby={fauxA ? "devis-dates-erreur" : undefined} onChange={(e) => (setA(e.target.value), setFaux(null))} />
          </label>
          <label>
            {T.dates.depart}
            <input ref={champZ} type="date" className={s.saisie} min={a || ISO(auj + 1)} value={z} aria-invalid={fauxZ || undefined} aria-describedby={fauxZ ? "devis-dates-erreur" : undefined} onChange={(e) => (setZ(e.target.value), setFaux(null))} />
          </label>
        </div>
        {faux ? (
          <p id="devis-dates-erreur" role="alert" className={s.panErreur}>
            {faux === "manque" ? T.dates.manquantes : T.dates.invalides}
          </p>
        ) : null}
        <div className={s.panPied}>
          <button type="button" className={s.petitBouton} onClick={garder}>
            {T.dates.garder}
          </button>
        </div>
      </div>
    </>
  );
}

function PanQui({ qui, adultes, enfants, onQui, onNombre, onValider }: { qui: string | null; adultes: number; enfants: number; onQui: (id: string) => void; onNombre: (a: number, e: number) => void; onValider: () => void }) {
  const T = useContenu("fr.devisPage", DEVIS_PAGE);
  const compteur = (nom: string, v: number, min: number, poserN: (n: number) => void) => (
    <div className={s.compteur}>
      <span>{nom}</span>
      <button type="button" className={s.rond} aria-label={T.qui.moins(nom)} disabled={v <= min} onClick={() => poserN(v - 1)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14" />
        </svg>
      </button>
      <span className={s.sr} aria-live="polite">
        {v}
      </span>
      <Palettes texte={String(v)} taille="ligne" />
      <button type="button" className={s.rond} aria-label={T.qui.plus(nom)} disabled={v >= 99} onClick={() => poserN(v + 1)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14M12 5v14" />
        </svg>
      </button>
    </div>
  );
  return (
    <>
      <p className={s.panTitre}>{T.qui.titre}</p>
      <div className={s.puces} role="radiogroup" aria-label={T.qui.titre}>
        {T.qui.options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={qui === o.id} className={s.puce} onClick={() => onQui(o.id)}>
            {o.phrase.charAt(0).toLocaleUpperCase() + o.phrase.slice(1)}
          </button>
        ))}
      </div>
      {qui && !SANS_COMPTE.includes(qui) ? (
        <div className={s.compteurs}>
          {compteur(T.qui.adultes, adultes, 1, (n) => onNombre(n, enfants))}
          {compteur(T.qui.enfants, enfants, 0, (n) => onNombre(adultes, n))}
        </div>
      ) : null}
      <div className={s.panPied}>
        <button type="button" className={s.petitBouton} onClick={onValider} disabled={!qui}>
          {T.qui.valider}
        </button>
      </div>
    </>
  );
}

function PanPays({ pays, propose, onPays }: { pays: string | null; propose: string | null; onPays: (v: string) => void }) {
  const { PAYS_TRIES } = useDevisFormats();
  const T = useContenu("fr.devisPage", DEVIS_PAGE);
  const [q, setQ] = useState("");
  const n = plat(q.trim());
  const liste = n
    ? [...PAYS_TRIES.filter((p) => plat(p.l).startsWith(n)), ...PAYS_TRIES.filter((p) => !plat(p.l).startsWith(n) && plat(p.l).includes(n))]
    : [...(propose ? PAYS_TRIES.filter((p) => p.v === propose) : []), ...PAYS_TRIES.filter((p) => p.v !== propose)];
  return (
    <>
      <p className={s.panTitre}>{T.pays.titre}</p>
      <label className={s.recherche}>
        <span className={s.sr}>{T.pays.recherche}</span>
        <input
          className={s.saisie}
          type="text"
          enterKeyHint="search"
          placeholder={T.pays.recherche}
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && liste[0]) {
              e.preventDefault();
              onPays(liste[0].v);
            }
          }}
        />
      </label>
      <div className={s.pays} role="listbox" aria-label={T.pays.lib}>
        {liste.slice(0, 6).map((p) => (
          <button key={p.v} type="button" role="option" aria-selected={p.v === pays} onClick={() => onPays(p.v)}>
            {p.l}
            {p.v === propose && !n ? <small>{T.pays.propose}</small> : null}
          </button>
        ))}
        {!liste.length ? <p className={s.panNote}>{T.pays.aucun}</p> : null}
      </div>
    </>
  );
}

function Reprise({ demande }: { demande: Demande }) {
  const T = useContenu("fr.devisPage", DEVIS_PAGE);
  const [etat, setEtat] = useState<"idle" | "creation" | "erreur" | "copie">("idle");
  const [lien, setLien] = useState<string | null>(null);
  const creer = async () => {
    setEtat("creation");
    try {
      const res = await fetch("/api/devis/brouillon", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...demande, champs: undefined, consentement: false }) });
      const corps = (await res.json().catch(() => null)) as { lien?: string } | null;
      if (res.status === 201 && corps?.lien) {
        setLien(corps.lien);
        setEtat("idle");
      } else setEtat("erreur");
    } catch {
      setEtat("erreur");
    }
  };
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(lien!);
      setEtat("copie");
    } catch {
      /* presse-papiers refusé : le lien reste lisible et sélectionnable */
    }
  };
  return (
    <div className={s.reprise} aria-live="polite">
      {lien ? (
        <>
          <p>
            <b>{T.talon.reprise.lien}</b>
          </p>
          <p className={`${s.lien} select-all`}>{lien}</p>
          <p>
            <button type="button" onClick={copier}>
              {etat === "copie" ? T.talon.reprise.copie : T.talon.reprise.copier}
            </button>{" "}
            {T.talon.reprise.note}
          </p>
        </>
      ) : (
        <>
          <button type="button" onClick={creer} disabled={etat === "creation"}>
            {etat === "creation" ? T.talon.reprise.creation : T.talon.reprise.bouton}
          </button>
          {etat === "erreur" ? <span className={s.champErreur}>{T.talon.reprise.erreur}</span> : null}
        </>
      )}
    </div>
  );
}

