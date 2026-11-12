"use client";

import Image from "next/image";
import Link from "@/components/ui/LienPublic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { LANGUES_ASSISTANT, LIMITES, type LangueAssistant } from "@/content/assistant";
import { assistantSite as ASSISTANT_SITE, NOMS_LANGUES as NOMS_LANGUES_DEFAUT, PHOTOS_ASSISTANT as PHOTOS_ASSISTANT_DEFAUT, type CodeErreur, type Compte, type TexteAssistant } from "@/content/assistant-site";
import { collage as COLLAGE, consentement as CONSENTEMENT, DEVIS, finalMask as FINAL_MASK } from "@/content/fr";
import { useContenu } from "@/components/ui/ContenuSite";
import { choixActuel, useConsentement } from "@/lib/consentement";
import { langueDetectee, rien } from "@/lib/langue";
import { Icon } from "@/components/ui/Icon";
import { ECO_FACTEUR, lireEco } from "@/components/mesure/eco";
import "./assistant-site.css";

// Assistant public du site, maquette C « la conversation devient le programme » (Kevin, 04/11/2026), avec les grandes
// photos de la maquette D. À gauche on parle (assistant IA Groq ou personne de l'équipe), à droite le programme se compose
// avec les `actions` reçues de /api/assistant ; sur téléphone, plein écran et programme rangé en onglet.
// Contrat : en-têtes de src/app/api/assistant/route.ts et agent/route.ts. Texte de l'assistant rendu en nœuds texte React
// (équivalent textContent) : seuls « **gras** » et les lignes « - » sont interprétés, les liens viennent des actions.
// Kevin, 04/11 : l'assistant IA d'OHT répond sans accord à donner ; la conversation reste en mémoire seulement et son
// effacement est demandé quand le visiteur quitte la page (/api/assistant/fin). Le programme, lui, reste sur l'appareil.

type Etat = "ouvert" | "conversation" | "agent" | "horsligne" | "langues";
type TypeEtape = "circuit" | "lieu" | "evenement";
type Etape = { type: TypeEtape; id: string; titre: string; url: string; image: string | null };
type Action = { type: "devis"; circuit: string | null; url: string } | { type: TypeEtape | "article"; id: string; titre: string; url: string; image: string | null } | { type: "agent" };
type Message = { cle: string; auteur: "visiteur" | "assistant" | "agent"; texte: string; actions?: Action[]; ajout?: Compte | null; transmis?: boolean; suggestions?: string[]; prenom?: string | null };
type Dispo = { ia: boolean; agent: boolean; enLigne: boolean };
type Json = Record<string, unknown> | null;

const MEMOIRE = "oht-assistant-programme";
const TYPES_ETAPE: readonly string[] = ["circuit", "lieu", "evenement"] satisfies TypeEtape[];
const AVEC_SAISIE: readonly Etat[] = ["ouvert", "conversation", "agent"];
// en-têtes des POST : aucun accord demandé au visiteur (Kevin, 04/11) ; la mesure d'audience n'est signalée qu'avec
// demandé au visiteur, décision de Kevin du 04/11) ; la mesure d'audience n'est signalée qu'avec l'accord « mesure »
const entetes = () => ({ "content-type": "application/json", ...(choixActuel()?.mesure ? { "x-oht-mesure": "1" } : {}) });
const mesurer = (evenement: "assistant_ouvert" | "devis_demarre") => {
  if (choixActuel()?.mesure !== true) return;
  try {
    navigator.sendBeacon("/api/mesure", JSON.stringify({ evenement }));
  } catch {
    /* mesure facultative : jamais bloquante */
  }
};

let numero = 0;
const cle = () => `m${++numero}`;
/** Pas de l'interrogation de l'agent, `depuis` ms après le dernier message échangé. */
const delaiAgent = (depuis: number, eco: boolean) => (depuis < 120_000 ? 5_000 : depuis < 300_000 ? 15_000 : 30_000) * (eco ? ECO_FACTEUR : 1);
const interne = (u: unknown): u is string => typeof u === "string" && u.startsWith("/") && !u.startsWith("//");
const estLangue = (l: string): l is LangueAssistant => (LANGUES_ASSISTANT as readonly string[]).includes(l);
const estEtape = (a: Action): a is Etape => TYPES_ETAPE.includes(a.type);
const compter = (e: Etape[]): Compte => ({ circuit: e.filter((x) => x.type === "circuit").length, lieu: e.filter((x) => x.type === "lieu").length, evenement: e.filter((x) => x.type === "evenement").length });

async function lireJson(r: Response): Promise<Json> {
  try {
    const j: unknown = await r.json();
    return j && typeof j === "object" ? (j as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Refus de l'API (403, 404, 409, 429, 503…) → message à afficher dans la langue du visiteur. */
function codeDe(status: number, j: Json): CodeErreur {
  const e = typeof j?.erreur === "string" ? j.erreur : "";
  if (status === 403) return "ia";
  if (status === 404) return "conversation";
  if (status === 429) return e === "budget" ? "budget" : "limite";
  if (status === 400) return e === "long" || e === "vide" || e === "contact" ? e : "illisible";
  if (status === 409) return e === "assistant" || e === "deja" ? e : "agent";
  if (status === 503) return j?.ia === false ? "ia" : e === "occupe" ? "occupe" : "indisponible";
  return "panne";
}

/** Actions de fin de réponse, gardées seulement si leur forme est celle du contrat et leur adresse interne au site. */
function lireActions(v: unknown): Action[] {
  if (!Array.isArray(v)) return [];
  const out: Action[] = [];
  for (const brut of v) {
    if (!brut || typeof brut !== "object") continue;
    const a = brut as Record<string, unknown>;
    if (a.type === "agent") out.push({ type: "agent" });
    else if (a.type === "devis" && interne(a.url)) out.push({ type: "devis", circuit: typeof a.circuit === "string" ? a.circuit : null, url: a.url });
    else if ((a.type === "circuit" || a.type === "lieu" || a.type === "evenement" || a.type === "article") && typeof a.id === "string" && typeof a.titre === "string" && interne(a.url))
      out.push({ type: a.type, id: a.id, titre: a.titre, url: a.url, image: interne(a.image) ? a.image : null });
  }
  return out;
}

/** Réponses rapides de l'événement final : 3 textes au plus, de 40 caractères au plus, sans doublon. */
const lireSuggestions = (v: unknown) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim()))].filter((x) => x && x.length <= 40).slice(0, 3) : [];

/** Programme gardé sur l'appareil (simple confort : un stockage bloqué ne gêne rien). */
function lireProgramme(): Etape[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(MEMOIRE) ?? "[]");
    if (!Array.isArray(v)) return [];
    return lireActions(v).filter(estEtape).slice(0, 40);
  } catch {
    return [];
  }
}

// Le lanceur ne couvre jamais les sections protégées de l'accueil (ouverture, collage « Une ville qui se vit. », appel
// final « OUIDAH »), ni les barres fixées en bas d'écran (boutique, signature, panneau du devis), ni le bandeau des choix
// tant qu'il est ouvert sur un écran où il passerait dessous, ni les calques ouverts (feuille du billet, talon, tiroirs et
// menu de la boutique), ni aucun bouton, lien, champ ou texte visible de la page (titres, paragraphes, listes) : il se
// range, en glissant hors de l'écran (transform : aucun décalage de mise en page), le temps que l'obstacle passe. Les
// textes d'action comptent aussi : libellés, légendes, alertes, aides et erreurs reliées à un champ (aria-describedby).
// Une réserve en bas de page (as-reserve) lui laisse une place libre sous le pied de page.
const CONTROLES = "a[href], button, input, select, textarea, summary, label, legend, h1, h2, h3, h4, h5, h6, p, li, dt, dd, blockquote, figcaption, th, td, [role='alert'], [role='button'], [role='link'], [role='tab'], [role='checkbox'], [role='radio'], [role='switch'], [role='combobox'], [role='slider'], [contenteditable='true'], [tabindex]:not([tabindex='-1'])";
const CALQUES = ".barre, .sg-barre, .bt-panneau, .bt-talon, .tiroir.ouvert, .menu-tout.ouvert, .panneau-filtres, dialog[open]";
type Gene = "libre" | "cache";
function gene(lanceur: HTMLElement | null, bandeauOuvert: boolean, labelCollage: string, motFinal: string): Gene {
  if (!lanceur) return "cache";
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (bandeauOuvert && w < 1360) return "cache";
  // coin bas droit réel du lanceur (position fixe : offsetLeft/offsetTop ignorent sa translation quand il est rangé), marge
  // et encoche du téléphone (safe-area) comprises : la zone suit le CSS au lieu de le supposer. Sa taille ne change jamais
  // (aucun état réduit) : la zone testée ne dépend pas de l'état courant.
  const droite = lanceur.offsetLeft + lanceur.offsetWidth;
  const bas = lanceur.offsetTop + lanceur.offsetHeight;
  const z = { g: droite - lanceur.offsetWidth - 12, h: bas - lanceur.offsetHeight - 12, d: w, b: h };
  const t = (o: Element) => {
    const r = o.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.left < z.d && r.right > z.g && r.top < z.b && r.bottom > z.h;
  };
  const obstacles: Element[] = [...document.querySelectorAll(CALQUES)];
  const hero = document.querySelector('select[id^="hero-"]')?.closest("section");
  if (hero) obstacles.push(hero);
  for (const s of document.querySelectorAll("section")) {
    if (s.getAttribute("aria-label") === labelCollage || s.querySelector(':scope > p[aria-hidden="true"]')?.textContent === motFinal) obstacles.push(s);
  }
  const relies = [...document.querySelectorAll("[aria-describedby]")].flatMap((c) => (c.getAttribute("aria-describedby") ?? "").split(/\s+/).map((id) => (id ? document.getElementById(id) : null)));
  const controles = [...document.querySelectorAll(CONTROLES), ...relies].filter((c): c is Element => !!c && !c.closest(".as-lanceur, .as-panneau"));
  return !obstacles.some(t) && !controles.some((c) => t(c) && c.checkVisibility({ opacityProperty: true, visibilityProperty: true })) ? "libre" : "cache";
}
/** Recalcul au plus une fois par image (défilement, redimensionnement, et chaque seconde pour les barres qui apparaissent
 * sans défilement), plus une fois 200 ms après le dernier défilement : un bloc révélé à l'entrée dans l'écran (opacité 0
 * puis fondu, pied de page) compte dès son apparition, pas une seconde plus tard ; `defile` : le visiteur a fait défiler
 * la page. */
function suivrePage(f: () => void, defile: () => void) {
  let image = 0;
  let fin = 0;
  const maj = () => {
    if (!image) image = requestAnimationFrame(() => ((image = 0), f()));
  };
  const auDefilement = () => (defile(), maj(), window.clearTimeout(fin), (fin = window.setTimeout(maj, 200)));
  window.addEventListener("scroll", auDefilement, { passive: true, capture: true });
  window.addEventListener("resize", maj);
  const t = window.setInterval(maj, 1000);
  // un calque qui s'ouvre (tiroir, feuille du billet, menu) range le lanceur dès l'image suivante
  const obs = new MutationObserver(maj);
  obs.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "open"] });
  maj();
  return () => {
    obs.disconnect();
    window.removeEventListener("scroll", auDefilement, { capture: true });
    window.removeEventListener("resize", maj);
    window.clearInterval(t);
    window.clearTimeout(fin);
    cancelAnimationFrame(image);
  };
}

const gras = (s: string) => s.split(/\*\*(.+?)\*\*/g).map((x, i) => (i % 2 ? <strong key={i}>{x}</strong> : x));

/** Markdown restreint du contrat : **gras** et lignes « - » consécutives en liste ; tout le reste reste du texte. */
function Riche({ texte }: { texte: string }) {
  const blocs: ReactNode[] = [];
  let puces: string[] = [];
  const vider = (k: string) => {
    if (!puces.length) return;
    const l = puces;
    blocs.push(
      <ul key={k}>
        {l.map((x, i) => (
          <li key={i}>{gras(x)}</li>
        ))}
      </ul>,
    );
    puces = [];
  };
  texte.split("\n").forEach((ligne, i) => {
    const m = /^\s*- (.*)$/.exec(ligne);
    if (m) {
      puces.push(m[1]);
      return;
    }
    vider(`u${i}`);
    if (ligne.trim()) blocs.push(<p key={i}>{gras(ligne)}</p>);
  });
  vider("fin");
  return <>{blocs}</>;
}

function Scene({ src, titre, chapo }: { src: string; titre: string; chapo?: string }) {
  return (
    <div className="as-scene">
      <Image src={src} alt="" fill sizes="(max-width: 1023px) 100vw, 520px" className="as-photo" />
      <span className="as-volet" aria-hidden="true" />
      <div className="as-comptoir">
        <h2>{titre}</h2>
        {chapo ? <p>{chapo}</p> : null}
      </div>
    </div>
  );
}

// « as-redondant » : déjà visible à côté quand le programme est affiché (≥ 1024 px) ; masqué alors, pour un seul bouton
// devis et aucune étape répétée
// réponses rapides : sous la dernière réponse de l'assistant seulement, retirées dès que le visiteur écrit (`pastilles`)
function Fil({ msgs, T, occupe, agent, prog, pastilles = false, surAgent, surLien, surQuestion }: { msgs: Message[]; T: TexteAssistant; occupe: boolean; agent: boolean; prog: Etape[]; pastilles?: boolean; surAgent: () => void; surLien: () => void; surQuestion?: (q: string) => void }) {
  const PHOTOS_ASSISTANT = useContenu("assistant-site.PHOTOS_ASSISTANT", PHOTOS_ASSISTANT_DEFAUT);
  const derniere = msgs.findLastIndex((m) => m.auteur === "assistant");
  return (
    <div className="as-log" role="log" aria-live="polite" aria-busy={occupe}>
      {msgs.map((m, n) =>
        m.auteur === "visiteur" ? (
          <p key={m.cle} className="as-q-vis">
            {m.texte}
          </p>
        ) : m.auteur === "agent" ? (
          <div key={m.cle} className="as-msg-ag">
            <p className="as-qui">{T.agent.qui(m.prenom ?? null)}</p>
            <Riche texte={m.texte} />
          </div>
        ) : (
          <div key={m.cle} className="as-r">
            <p className="as-r-qui">
              <Image src={PHOTOS_ASSISTANT.embleme} alt="" width={20} height={20} />
              {T.conversation.qui}
            </p>
            {m.texte ? (
              <div className="as-r-ia">
                <Riche texte={m.texte} />
              </div>
            ) : (
              <p className="as-ecrit" data-attente={occupe ? "1" : undefined}>
                {T.conversation.ecrit}
              </p>
            )}
            {m.ajout ? (
              <p className="as-ajout">
                <Icon name="check" className="as-ic as-ic-petit" />
                {T.conversation.ajout(m.ajout)}
              </p>
            ) : null}
            {m.transmis ? (
              <p className="as-transmis">
                <Icon name="check" className="as-ic as-ic-petit" />
                {T.programme.sceau}
              </p>
            ) : null}
            {m.actions?.length ? (
              <ul className="as-actions">
                {m.actions.map((a, i) =>
                  a.type === "agent" ? (
                    agent ? (
                      <li key={i}>
                        <button type="button" className="as-action" onClick={surAgent}>
                          <b>{T.conversation.actions.agent}</b>
                          <Icon name="arrow-right" className="as-ic" />
                        </button>
                      </li>
                    ) : null
                  ) : a.type === "devis" ? (
                    <li key={i} className="as-redondant">
                      <Link className="as-action as-action-devis" href={a.url} onClick={surLien}>
                        <b>{T.conversation.actions.devis}</b>
                        <Icon name="arrow-right" className="as-ic" />
                      </Link>
                    </li>
                  ) : (
                    <li key={i} className={prog.some((e) => e.type === a.type && e.id === a.id) ? "as-redondant" : undefined}>
                      <Link className="as-action" href={a.url} onClick={surLien}>
                        <b>{a.titre}</b>
                        <small>{T.conversation.actions[a.type]}</small>
                        <Icon name="arrow-up-right" className="as-ic" />
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            ) : null}
            {pastilles && surQuestion && n === derniere && m.suggestions?.length ? (
              <div className="as-pastilles" role="group" aria-label={T.conversation.pastilles}>
                {m.suggestions.map((x) => (
                  <button key={x} type="button" disabled={occupe} onClick={() => surQuestion(x)}>
                    {x}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ),
      )}
    </div>
  );
}

export function AssistantSite() {
  const assistantSite = useContenu("assistant-site.assistantSite", ASSISTANT_SITE);
  const NOMS_LANGUES = useContenu("assistant-site.NOMS_LANGUES", NOMS_LANGUES_DEFAUT);
  const PHOTOS_ASSISTANT = useContenu("assistant-site.PHOTOS_ASSISTANT", PHOTOS_ASSISTANT_DEFAUT);
  const bandeau = useContenu("fr.consentement", CONSENTEMENT);
  const collage = useContenu("fr.collage", COLLAGE);
  const finalMask = useContenu("fr.finalMask", FINAL_MASK);
  const detectee = useSyncExternalStore(rien, langueDetectee, () => LANGUES_ASSISTANT[0] as string);
  const [choisie, setChoisie] = useState<LangueAssistant | null>(null);
  const langue: LangueAssistant = choisie ?? (estLangue(detectee) ? detectee : "FR");
  const T = assistantSite[langue];
  const accord = useConsentement();

  const lanceur = useRef<HTMLButtonElement>(null);
  const boite = useRef<HTMLDivElement>(null);
  const corps = useRef<HTMLDivElement>(null);
  const liste = useRef<HTMLDivElement>(null);
  const dernier = useRef(0); // dernier message lu par l'interrogation de l'agent
  const echange = useRef(0); // heure du dernier message (envoyé ou reçu) avec l'agent : règle la cadence de l'interrogation
  const relance = useRef<(() => void) | null>(null); // prochaine interrogation ramenée au pas court (message envoyé)
  const mesure = useRef(false); // « assistant ouvert » compté une fois par page
  const aEffacer = useRef<string | null>(null); // conversation avec l'assistant, effacée quand le visiteur quitte la page

  const [ouvert, setOuvert] = useState(false);
  const [etat, setEtat] = useState<Etat>("ouvert");
  const [avantLangues, setAvantLangues] = useState<Etat>("ouvert");
  const [dispo, setDispo] = useState<Dispo | "panne" | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [debutAgent, setDebutAgent] = useState(0);
  const [c, setC] = useState<string | null>(null);
  const [mode, setMode] = useState<"ia" | "agent">("ia");
  const [occupe, setOccupe] = useState(false);
  const [saisie, setSaisie] = useState("");
  const [alerte, setAlerte] = useState<CodeErreur | null>(null);
  const [programme, setProgramme] = useState<Etape[] | null>(null); // null : pas encore lu
  const [vueProg, setVueProg] = useState(false);
  const [enLigne, setEnLigne] = useState(false);
  const [contactDonne, setContactDonne] = useState(false);
  const [transmis, setTransmis] = useState<{ demande: string | null; etapes: string[] } | null>(null);
  const [canal, setCanal] = useState<"email" | "whatsapp">("email");
  const [envoiContact, setEnvoiContact] = useState<"non" | "envoi" | "ok">("non");

  // gêne calculée hors du rendu (une fois par image) ; juste après la fermeture du panneau, le lanceur reste montré pour
  // recevoir le focus, jusqu'au prochain défilement
  const geneVue = useRef<Gene>("cache");
  const retour = useRef(false);
  const bandeauOuvert = accord === null;
  const suivre = useCallback(
    (f: () => void) =>
      suivrePage(
        () => {
          geneVue.current = retour.current ? "libre" : gene(lanceur.current, bandeauOuvert, collage.label, finalMask.word);
          f();
        },
        () => (retour.current = false),
      ),
    [bandeauOuvert, collage.label, finalMask.word],
  );
  const place = useSyncExternalStore(suivre, () => geneVue.current, () => "cache" as const);
  const cache = place === "cache";
  const avecAgent = dispo !== null && dispo !== "panne" && dispo.agent;
  const etapes = programme ?? [];
  // le programme suit le visiteur sur /devis (Devis.tsx : circuit, lieux = slugs des destinations, prochaine édition de
  // l'événement) ; un identifiant inconnu y est ignoré
  const circuit = etapes.find((e) => e.type === "circuit");
  const evenement = etapes.find((e) => e.type === "evenement");
  const lieux = etapes.filter((e) => e.type === "lieu").map((e) => e.id);
  const devisParams = new URLSearchParams([
    ...(circuit ? [["circuit", circuit.id]] : []),
    ...(lieux.length ? [["lieux", lieux.slice(0, 30).join(",")]] : []),
    ...(evenement ? [["evenement", evenement.id]] : []),
  ]).toString();

  useEffect(() => {
    if (!programme) return;
    try {
      localStorage.setItem(MEMOIRE, JSON.stringify(programme));
    } catch {
      /* stockage bloqué : le programme tient le temps de la visite */
    }
  }, [programme]);

  useEffect(() => {
    if (ouvert) boite.current?.focus();
  }, [ouvert]);

  // la conversation avec l'assistant n'est gardée nulle part : à la sortie de la page, le serveur est prié de l'effacer
  // (une conversation passée à l'équipe reste, l'équipe y répond)
  useEffect(() => {
    aEffacer.current = mode === "ia" ? c : null;
  }, [mode, c]);
  useEffect(() => {
    const sortie = () => {
      if (aEffacer.current) navigator.sendBeacon("/api/assistant/fin", JSON.stringify({ c: aEffacer.current }));
    };
    window.addEventListener("pagehide", sortie);
    return () => window.removeEventListener("pagehide", sortie);
  }, []);

  // plein écran sur téléphone : la page ne défile plus derrière le panneau
  useEffect(() => {
    if (!ouvert || !window.matchMedia("(max-width: 639px)").matches) return;
    const html = document.documentElement;
    const avant = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = avant;
    };
  }, [ouvert]);

  useEffect(() => {
    const el = corps.current;
    if (el && (etat === "conversation" || etat === "agent")) el.scrollTop = el.scrollHeight;
  }, [msgs, etat]);

  // discussion avec un agent, panneau ouvert seulement : interrogation toutes les 5 s pendant 2 min après un message, puis
  // 15 s jusqu'à 5 min, puis 30 s (ECO_FACTEUR fois plus en mode économie) ; en pause onglet caché, relue dès son retour
  useEffect(() => {
    if (!ouvert || mode !== "agent" || !c) return;
    let fini = false;
    let eco = false;
    void lireEco().then((e) => {
      eco = e;
    });
    const tirer = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch(`/api/assistant/agent?c=${encodeURIComponent(c)}&apres=${dernier.current}`, { cache: "no-store" });
        const j = r.ok ? await lireJson(r) : null;
        if (fini || !j || !Array.isArray(j.messages)) return;
        const lus = (j.messages as Record<string, unknown>[]).filter((x) => typeof x?.id === "number" && x.id > dernier.current);
        if (lus.length) dernier.current = Math.max(...lus.map((x) => x.id as number));
        const reponses = lus.filter((x) => x.auteur === "agent" && typeof x.texte === "string");
        if (reponses.length) {
          echange.current = Date.now();
          setMsgs((m) => [
            ...m,
            ...reponses
              .filter((x) => !m.some((y) => y.cle === `a${String(x.id)}`))
              .map((x): Message => ({ cle: `a${String(x.id)}`, auteur: "agent", texte: x.texte as string, prenom: typeof x.agent === "string" ? x.agent : null })),
          ]);
          setEtat((e) => (e === "horsligne" ? "agent" : e));
        }
        setEnLigne(j.enLigne === true);
        if (j.contact === true) setContactDonne(true);
      } catch {
        /* réseau : nouvel essai au tour suivant */
      }
    };
    let t: number | undefined;
    let enCours = false;
    const suite = () => {
      window.clearTimeout(t);
      if (!fini && !enCours && document.visibilityState === "visible") t = window.setTimeout(() => void tour(), delaiAgent(Date.now() - echange.current, eco));
    };
    const tour = async () => {
      window.clearTimeout(t);
      if (fini || enCours || document.visibilityState !== "visible") return;
      enCours = true;
      await tirer();
      enCours = false;
      suite();
    };
    void tour();
    relance.current = suite;
    const vu = () => (document.visibilityState === "visible" ? void tour() : window.clearTimeout(t));
    document.addEventListener("visibilitychange", vu);
    return () => {
      fini = true;
      relance.current = null;
      window.clearTimeout(t);
      document.removeEventListener("visibilitychange", vu);
    };
  }, [ouvert, mode, c]);

  const aller = (e: Etat) => {
    setAlerte(null);
    setVueProg(false);
    setEtat(e);
  };
  const fermer = () => {
    retour.current = true;
    geneVue.current = "libre";
    setOuvert(false);
    setVueProg(false);
    requestAnimationFrame(() => lanceur.current?.focus());
  };
  const quitter = () => setOuvert(false); // lien suivi : la page change, le panneau se range
  const ouvrir = () => {
    setOuvert(true);
    if (!mesure.current) {
      mesure.current = true;
      mesurer("assistant_ouvert");
    }
    setProgramme((p) => p ?? lireProgramme());
    fetch("/api/assistant", { cache: "no-store" })
      .then((r) => (r.ok ? lireJson(r) : null))
      .then((j) => setDispo(j ? { ia: j.ia === true, agent: j.agent === true, enLigne: j.enLigne === true } : "panne"))
      .catch(() => setDispo((d) => (d && d !== "panne" ? d : "panne")));
  };
  const versLangues = () => {
    if (etat !== "langues") setAvantLangues(etat);
    aller(etat === "langues" ? avantLangues : "langues");
  };
  const clavier = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      fermer();
      return;
    }
    if (e.key !== "Tab" || !boite.current) return;
    const f = [...boite.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled])")].filter((x) => x.getClientRects().length > 0);
    if (!f.length) return;
    const premier = f[0];
    const dernierEl = f[f.length - 1];
    const actif = document.activeElement as HTMLElement | null;
    if (!actif || !f.includes(actif)) {
      e.preventDefault();
      (e.shiftKey ? dernierEl : premier).focus();
    } else if (e.shiftKey && actif === premier) {
      e.preventDefault();
      dernierEl.focus();
    } else if (!e.shiftKey && actif === dernierEl) {
      e.preventDefault();
      premier.focus();
    }
  };

  // ajoute au programme les circuits, lieux et événements proposés ; rend ce qui est nouveau
  const ajouter = (actions: Action[]): Compte | null => {
    const neuves = actions.filter(estEtape).filter((a) => !etapes.some((x) => x.type === a.type && x.id === a.id));
    if (!neuves.length) return null;
    setProgramme((p) => {
      const base = p ?? [];
      return [...base, ...neuves.filter((a) => !base.some((x) => x.type === a.type && x.id === a.id)).map(({ type, id, titre, url, image }) => ({ type, id, titre, url, image }))];
    });
    return compter(neuves);
  };
  const retirer = (e: Etape) => {
    setProgramme((p) => (p ?? []).filter((x) => !(x.type === e.type && x.id === e.id)));
    requestAnimationFrame(() => liste.current?.focus());
  };

  async function demanderIA(q: string) {
    const k = cle();
    const maj = (p: Partial<Message>) => setMsgs((m) => m.map((x) => (x.cle === k ? { ...x, ...p } : x)));
    setAlerte(null);
    setOccupe(true);
    setMsgs((m) => [...m, { cle: `${k}q`, auteur: "visiteur", texte: q }, { cle: k, auteur: "assistant", texte: "" }]);
    let texte = "";
    try {
      const r = await fetch("/api/assistant", {
        method: "POST",
        headers: entetes(),
        body: JSON.stringify({ ...(c ? { c } : {}), message: q, langue }),
      });
      if (!r.ok || !r.body) {
        const code = codeDe(r.status, await lireJson(r));
        setMsgs((m) => m.filter((x) => x.cle !== k));
        if (code === "agent") {
          setMode("agent");
          setDebutAgent(msgs.length);
          aller("agent");
          await envoyerAgent(q, true);
          return;
        }
        if (code === "conversation") setC(null);
        if (code === "ia") setDispo((d) => (d && d !== "panne" ? { ...d, ia: false } : d));
        setAlerte(code);
        return;
      }
      let tampon = "";
      let fin = false;
      let erreur: CodeErreur = "occupe";
      const traiter = (ligne: string) => {
        if (!ligne.trim()) return;
        let o: Record<string, unknown>;
        try {
          o = JSON.parse(ligne) as Record<string, unknown>;
        } catch {
          return;
        }
        if (typeof o.c === "string") setC(o.c);
        if (typeof o.t === "string") {
          texte += o.t;
          maj({ texte });
        }
        if (typeof o.remplace === "string") {
          texte = o.remplace;
          maj({ texte });
        }
        if (o.erreur === "occupe") erreur = "occupe";
        if (o.fin === true) {
          fin = true;
          const actions = lireActions(o.actions);
          maj({ texte, actions, ajout: ajouter(actions), transmis: o.transmis === true, suggestions: lireSuggestions(o.suggestions) });
        }
      };
      const lecteur = r.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { value, done } = await lecteur.read();
        if (done) break;
        const lignes = (tampon + value).split("\n");
        tampon = lignes.pop() ?? "";
        lignes.forEach(traiter);
      }
      traiter(tampon);
      if (!fin) {
        setMsgs((m) => m.filter((x) => x.cle !== k || texte));
        setAlerte(erreur);
      }
    } catch {
      setMsgs((m) => m.filter((x) => x.cle !== k || texte));
      setAlerte("reseau");
    } finally {
      setOccupe(false);
    }
  }

  async function envoyerAgent(q: string, dejaAffiche = false) {
    if (!dejaAffiche) setMsgs((m) => [...m, { cle: cle(), auteur: "visiteur", texte: q }]);
    echange.current = Date.now();
    relance.current?.();
    setAlerte(null);
    setOccupe(true);
    try {
      const r = await fetch("/api/assistant/agent", { method: "POST", headers: entetes(), body: JSON.stringify({ etape: "message", c, message: q }) });
      if (!r.ok) setAlerte(codeDe(r.status, await lireJson(r)));
    } catch {
      setAlerte("reseau");
    } finally {
      setOccupe(false);
    }
  }

  // passage à une personne de l'équipe : la question écrite et le programme partent avec la conversation
  async function passer(q: string | null) {
    const avant = etat;
    const question = q?.trim() || null;
    const message = [question ?? "", etapes.length ? T.agent.messageProgramme(etapes.map((e) => e.titre).join(", ")) : ""].filter(Boolean).join("\n\n").slice(0, LIMITES.message);
    setAlerte(null);
    setOccupe(true);
    setDebutAgent(msgs.length);
    aller("agent");
    try {
      const r = await fetch("/api/assistant/agent", { method: "POST", headers: entetes(), body: JSON.stringify({ etape: "passage", ...(c ? { c } : {}), langue, ...(message ? { message } : {}) }) });
      const j = await lireJson(r);
      if (!r.ok || typeof j?.c !== "string") {
        if (question) setSaisie(question); // rien de perdu : la question revient dans le champ
        setEtat(avant);
        setAlerte(r.ok ? "panne" : codeDe(r.status, j));
        return;
      }
      setC(j.c);
      setMode("agent");
      dernier.current = 0;
      echange.current = Date.now();
      setEnLigne(j.enLigne === true);
      setContactDonne(j.enLigne !== true && j.demanderContact !== true);
      setTransmis({ demande: question ?? msgs.find((m) => m.auteur === "visiteur")?.texte ?? null, etapes: etapes.map((e) => e.titre) });
      if (question) setMsgs((m) => [...m, { cle: cle(), auteur: "visiteur", texte: question }]);
      if (j.enLigne !== true) setEtat("horsligne");
    } catch {
      if (question) setSaisie(question);
      setEtat(avant);
      setAlerte("reseau");
    } finally {
      setOccupe(false);
    }
  }

  async function laisserContact(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const valeur = String(f.get("valeur") ?? "").trim();
    const nom = String(f.get("nom") ?? "").trim();
    const mot = String(f.get("message") ?? "").trim();
    if (!valeur) return setAlerte("contact"); // l'envoi vaut accord (ligne d'information sous les champs)
    setAlerte(null);
    setEnvoiContact("envoi");
    try {
      const r = await fetch("/api/assistant/agent", { method: "POST", headers: entetes(), body: JSON.stringify({ etape: "contact", c, ...(nom ? { nom } : {}), [canal]: valeur, accord: true }) });
      if (!r.ok) {
        setAlerte(codeDe(r.status, await lireJson(r)));
        setEnvoiContact("non");
        return;
      }
      if (mot) {
        const m = await fetch("/api/assistant/agent", { method: "POST", headers: entetes(), body: JSON.stringify({ etape: "message", c, message: mot }) });
        if (m.ok) {
          setMsgs((x) => [...x, { cle: cle(), auteur: "visiteur", texte: mot }]);
          echange.current = Date.now();
          relance.current?.();
        }
        else setAlerte(codeDe(m.status, await lireJson(m)));
      }
      setEnvoiContact("ok");
      setContactDonne(true);
    } catch {
      setAlerte("reseau");
      setEnvoiContact("non");
    }
  }

  // une question tapée ou une amorce : l'assistant IA répond tout de suite ; sans lui, elle part à l'équipe
  const lancer = (q: string) => {
    if (dispo === null || dispo === "panne") return;
    if (dispo.ia) {
      aller("conversation");
      void demanderIA(q);
    } else if (dispo.agent) void passer(q);
  };
  const versEquipe = () => {
    const q = saisie.trim();
    setSaisie("");
    void passer(q || null);
  };
  const envoyer = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = saisie.trim();
    if (!q || occupe) return;
    setSaisie("");
    if (etat === "ouvert") lancer(q);
    else if (etat === "conversation") void demanderIA(q);
    else if (etat === "agent") void envoyerAgent(q);
  };

  const pret = dispo !== null && dispo !== "panne" && (dispo.ia || dispo.agent);
  const bloque = (etat === "ouvert" && !pret) || (etat === "agent" && !transmis);
  // grande photo de l'étape (maquette D) ; l'ouverture a ses amorces illustrées, la conversation laisse la place au fil
  const scene = etat === "ouvert" || etat === "conversation" ? null : { src: PHOTOS_ASSISTANT.scenes[etat], ...T[etat] };
  const politique = (
    <Link href={bandeau.politique.href} className="as-lien" onClick={quitter}>
      {T.horsligne.politique}
    </Link>
  );

  let vue: ReactNode = null;
  if (etat === "ouvert")
    vue = (
      <>
        <h2 className="as-titre">{T.ouvert.titre}</h2>
        <p className="as-chapo">{T.ouvert.chapo}</p>
        {dispo === null ? (
          <p className="as-note as-espace-bas" role="status">
            {T.acces.attente}
          </p>
        ) : !pret ? (
          <p className="as-note as-espace-bas" role="status">
            {T.acces.indisponible}{" "}
            <Link href={DEVIS.question} className="as-lien" onClick={quitter}>
              {T.acces.lienDemande}
            </Link>
          </p>
        ) : null}
        <div className="as-amorces">
          {T.ouvert.amorces.map((a, i) => (
            <button key={a.question} type="button" className="as-amorce" disabled={!pret || occupe} onClick={() => lancer(a.question)}>
              {/* cadre propre à la photo : la carte entière bouge au survol, la photo reste posée dans ce cadre */}
              <span className="as-cadre" aria-hidden="true">
                <Image src={PHOTOS_ASSISTANT.amorces[i % PHOTOS_ASSISTANT.amorces.length]} alt="" fill sizes="(max-width: 1023px) 100vw, 480px" />
              </span>
              <span className="as-vitre">
                <b>{a.titre}</b>
                <small>{a.detail}</small>
              </span>
            </button>
          ))}
        </div>
      </>
    );
  else if (etat === "conversation")
    vue = (
      <>
        {!msgs.length ? (
          <>
            <h2 className="as-titre">{T.conversation.titre}</h2>
            <p className="as-chapo">{T.conversation.chapo}</p>
            <div className="as-sugg">
              {T.ouvert.amorces.map((a) => (
                <button key={a.question} type="button" disabled={occupe} onClick={() => void demanderIA(a.question)}>
                  {a.question}
                </button>
              ))}
            </div>
          </>
        ) : null}
        <Fil msgs={msgs} T={T} occupe={occupe} agent={avecAgent} prog={etapes} pastilles={!saisie} surAgent={() => void passer(null)} surLien={quitter} surQuestion={(q) => void demanderIA(q)} />
      </>
    );
  else if (etat === "agent")
    vue = (
      <>
        {transmis ? (
          <div className="as-resume">
            <h3 className="as-h4">{T.agent.resume}</h3>
            <dl>
              <div>
                <dt>{T.agent.demande}</dt>
                <dd>{transmis.demande ?? T.agent.aPreciser}</dd>
              </div>
              <div>
                <dt>{T.agent.programme}</dt>
                <dd>{transmis.etapes.length ? transmis.etapes.join(", ") : T.agent.aPreciser}</dd>
              </div>
              <div>
                <dt>{T.agent.langue}</dt>
                <dd>{NOMS_LANGUES[langue]}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="as-chapo" role="status">
            {T.agent.passage}
          </p>
        )}
        <Fil msgs={msgs.slice(debutAgent)} T={T} occupe={occupe} agent={false} prog={etapes} surAgent={() => undefined} surLien={quitter} />
        {transmis ? (
          enLigne ? (
            <p className="as-note">{T.agent.enLigne}</p>
          ) : contactDonne ? (
            <p className="as-note">{T.agent.ecrit}</p>
          ) : (
            <>
              <p className="as-note">{T.agent.parti}</p>
              <button type="button" className="as-btn as-trait as-espace" onClick={() => aller("horsligne")}>
                {T.agent.laisser}
              </button>
            </>
          )
        ) : null}
      </>
    );
  else if (etat === "horsligne")
    vue =
      envoiContact === "ok" || contactDonne ? (
        <p className="as-merci" role="status">
          {envoiContact === "ok" ? T.horsligne.merci[canal] : T.horsligne.deja}
        </p>
      ) : (
        <form className="as-form" onSubmit={(e) => void laisserContact(e)} noValidate>
          <fieldset className="as-canal">
            <legend>{T.horsligne.canal}</legend>
            <div>
              {(["email", "whatsapp"] as const).map((k) => (
                <label key={k}>
                  <input type="radio" name="canal" value={k} checked={canal === k} onChange={() => setCanal(k)} />
                  <span>{T.horsligne[k]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="as-champ">
            <span>{canal === "email" ? T.horsligne.champEmail : T.horsligne.champWhatsapp}</span>
            <input key={canal} name="valeur" type={canal === "email" ? "email" : "tel"} inputMode={canal === "email" ? "email" : "tel"} autoComplete={canal === "email" ? "email" : "tel"} maxLength={200} aria-invalid={alerte === "contact" || undefined} />
          </label>
          <label className="as-champ">
            <span>{T.horsligne.nom}</span>
            <input name="nom" autoComplete="name" maxLength={120} />
          </label>
          <label className="as-champ">
            <span>{T.horsligne.message}</span>
            <textarea name="message" placeholder={T.horsligne.exemple} maxLength={LIMITES.message} />
          </label>
          <p className="as-note as-info">
            {T.horsligne.info} {politique}.
          </p>
          <button type="submit" className="as-btn as-plein as-large" disabled={envoiContact === "envoi"}>
            {envoiContact === "envoi" ? T.horsligne.envoi : T.horsligne.envoyer}
          </button>
        </form>
      );
  else
    vue = (
      <ul className="as-langs">
        {LANGUES_ASSISTANT.map((l) => (
          <li key={l}>
            <button
              type="button"
              lang={l.toLowerCase()}
              aria-pressed={l === langue}
              className={l === langue ? "as-actif" : undefined}
              onClick={() => {
                setChoisie(l);
                aller(avantLangues);
                // la liste des langues disparaît avec ce bouton : le focus revient au panneau (Échap le ferme toujours)
                requestAnimationFrame(() => boite.current?.focus());
              }}
            >
              <span className="as-l">{NOMS_LANGUES[l]}</span>
              <span className="as-c">{l}</span>
            </button>
          </li>
        ))}
      </ul>
    );

  const sansIa = dispo !== null && dispo !== "panne" && !dispo.ia;
  const note = etat === "ouvert" ? (sansIa ? T.ouvert.noteEquipe : T.ouvert.note) : etat === "conversation" ? T.saisie.noteIa : T.saisie.noteAgent;
  const consigne = (etat === "ouvert" && dispo === null) || (etat === "agent" && !transmis) ? T.acces.attente : etat === "agent" || (etat === "ouvert" && sansIa) ? T.saisie.agent : T.saisie.question;
  // programme dans l'ordre affiché (lieux, circuits, agenda), numéroté d'un bout à l'autre
  const ordre = (["lieu", "circuit", "evenement"] as const).flatMap((type) => etapes.filter((e) => e.type === type));
  const vignettes = ordre.filter((e): e is Etape & { image: string } => Boolean(e.image)).slice(0, 3);

  return (
    <>
      {/* réserve sous le pied de page : en bas de page, le lanceur se pose sur cette bande vide, jamais sur le contenu */}
      <div aria-hidden="true" className="as-reserve" />
      <button
        ref={lanceur}
        type="button"
        className="as-lanceur"
        data-cache={ouvert || cache ? "1" : undefined}
        inert={ouvert || cache}
        aria-label={`${T.lanceur.bouton} · ${T.lanceur.aria}`}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        onClick={ouvrir}
      >
        <Image src={PHOTOS_ASSISTANT.embleme} alt="" width={40} height={40} className="as-embleme" />
        <span className="as-q" aria-hidden="true">
          <span className="as-defile">
            {T.lanceur.exemples.map((x) => (
              <span key={x}>
                <b>{T.lanceur.demandez}</b> {x}
              </span>
            ))}
          </span>
        </span>
        <span className="as-demander">{T.lanceur.bouton}</span>
      </button>

      {ouvert ? (
        <div
          ref={boite}
          className="as-panneau"
          role="dialog"
          aria-modal="true"
          aria-label={T.entete.dialogue}
          tabIndex={-1}
          lang={langue.toLowerCase()}
          data-lenis-prevent
          data-prog={vueProg ? "1" : undefined}
          onKeyDown={clavier}
        >
          <div className="as-fil">
            <header className="as-ent">
              <Image src={PHOTOS_ASSISTANT.embleme} alt="" width={36} height={36} />
              <p className="as-nom">
                <span className="as-nom-titre">{T.entete.titre}</span>
                <span className="as-nom-sous">{mode === "agent" ? T.entete.sousAgent : T.entete.sousIa}</span>
              </p>
              <button type="button" className="as-bt" aria-label={`${langue} · ${T.entete.langue}`} aria-pressed={etat === "langues"} onClick={versLangues}>
                {langue}
              </button>
              <button type="button" className="as-bt" aria-label={T.entete.fermer} onClick={fermer}>
                <Icon name="close" className="as-ic" />
              </button>
            </header>

            {scene ? <Scene key={etat} src={scene.src} titre={scene.titre} chapo={scene.chapo} /> : null}

            <div ref={corps} className="as-corps">
              <div key={etat} className="as-vue">
                {vue}
              </div>
            </div>

            {etapes.length && etat !== "langues" ? (
              <button type="button" className="as-bande" aria-controls="as-prog" aria-expanded={vueProg} onClick={() => setVueProg(true)}>
                {vignettes.length ? (
                  <span className="as-imgs" aria-hidden="true">
                    {vignettes.map((e) => (
                      <Image key={`${e.type}:${e.id}`} src={e.image} alt="" width={30} height={30} sizes="30px" />
                    ))}
                  </span>
                ) : null}
                <b>{T.programme.onglet}</b>
                <span className="as-compte">{T.programme.compte(compter(etapes))}</span>
                <span className="as-voir">{T.programme.voir}</span>
              </button>
            ) : null}

            {alerte ? (
              <p className="as-alerte" role="alert">
                {T.erreurs[alerte]}
                {(alerte === "ia" || alerte === "budget" || alerte === "occupe") && avecAgent && mode === "ia" ? (
                  <>
                    {" "}
                    <button type="button" className="as-lien" onClick={() => void passer(null)}>
                      {T.conversation.actions.agent}
                    </button>
                  </>
                ) : null}
              </p>
            ) : null}

            {AVEC_SAISIE.includes(etat) ? (
              <form className="as-pied" onSubmit={envoyer}>
                <div className="as-saisie">
                  <input value={saisie} onChange={(e) => setSaisie(e.target.value)} maxLength={LIMITES.message} disabled={bloque} placeholder={consigne} aria-label={consigne} enterKeyHint="send" />
                  <button type="submit" className="as-envoi" disabled={bloque || occupe || !saisie.trim()} aria-label={T.saisie.envoyer}>
                    <Icon name="arrow-right" className="as-ic" />
                  </button>
                </div>
                <p className="as-note">
                  {note}
                  {(etat === "ouvert" || etat === "conversation") && avecAgent && !sansIa ? (
                    <>
                      {" "}
                      <button type="button" className="as-lien as-equipe" disabled={occupe} onClick={versEquipe}>
                        {T.saisie.agent}
                      </button>
                    </>
                  ) : null}
                </p>
              </form>
            ) : null}
          </div>

          <aside id="as-prog" className="as-prog" aria-label={T.programme.titre}>
            <div className="as-tete">
              <button type="button" className="as-retour" onClick={() => setVueProg(false)}>
                <Icon name="arrow-left" className="as-ic" />
                {T.programme.retour}
              </button>
              <h2>{T.programme.titre}</h2>
              <span>{etapes.length ? T.programme.compte(compter(etapes)) : T.programme.vide}</span>
            </div>
            <div ref={liste} className="as-liste" tabIndex={-1}>
              {transmis && (etat === "agent" || etat === "horsligne") ? <p className="as-sceau">{T.programme.sceau}</p> : null}
              {etapes.length ? (
                (["lieu", "circuit", "evenement"] as const).map((type) => {
                  const groupe = etapes.filter((e) => e.type === type);
                  return groupe.length ? (
                    <section key={type} className="as-groupe">
                      <h3 className="as-j">{T.programme.groupes[type]}</h3>
                      <ul>
                        {groupe.map((e) => (
                          <li key={e.id} className={type === "evenement" ? "as-etape as-evt" : "as-etape"} style={{ "--i": ordre.indexOf(e) } as CSSProperties}>
                            {/* vignette : la photo du contenu publié ; sans photo, le numéro de l'étape */}
                            {e.image ? (
                              <Image src={e.image} alt="" width={56} height={56} sizes="56px" className="as-vignette" />
                            ) : (
                              <span className="as-num" aria-hidden="true">
                                {String(ordre.indexOf(e) + 1).padStart(2, "0")}
                              </span>
                            )}
                            <Link href={e.url} onClick={quitter}>
                              <b>{e.titre}</b>
                            </Link>
                            <button type="button" className="as-retirer" aria-label={T.programme.retirer(e.titre)} onClick={() => retirer(e)}>
                              <Icon name="minus" className="as-ic" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null;
                })
              ) : transmis ? null : (
                <div>
                  {T.programme.places.map((p) => (
                    <p key={p} className="as-vide">
                      {p}
                    </p>
                  ))}
                </div>
              )}
            </div>
            <div className="as-bas">
              {etapes.length ? (
                <Link className="as-btn as-soleil" href={devisParams ? `${DEVIS.voyage}?${devisParams}` : DEVIS.voyage}
                  onClick={() => {
                    mesurer("devis_demarre");
                    quitter();
                  }}
                >
                  {T.programme.devis}
                </Link>
              ) : (
                <button type="button" className="as-btn as-soleil" disabled>
                  {T.programme.devisVide}
                </button>
              )}
              <small>{circuit ? T.programme.noteCircuit : T.programme.noteSans}</small>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
