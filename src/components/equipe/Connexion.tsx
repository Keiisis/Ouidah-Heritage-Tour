"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type AnimationEvent, type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { equipe as T, type Role } from "@/content/equipe";
import { useMouvementReduit } from "@/lib/mouvement";
import "./equipe.css";

// Connexion de l'équipe (/agents, /admins), maquette G « Le porte-badge » : la pochette de verre reste posée sur la photo
// de la paillote ; à chaque étape, l'accréditation remonte par la fente et la suivante se loge (aller), elle est recrachée
// quand le serveur refuse. Parcours : connexion → réussite → arrivée, ou « Mot de passe oublié » / « Première connexion »
// → code à 6 chiffres → nouveau mot de passe → réussite → arrivée. Chaque appel passe par /api/equipe : rien n'est accepté
// ici, et la réponse « pas_encore » (liaison pas encore faite) s'affiche telle quelle, sans faux succès.
// Les essais sont comptés ici pour l'affichage ; la limite qui compte est celle du serveur (429 « trop »). Une fois
// l'arrivée jouée, router.refresh() relit la session côté serveur : la page affiche alors l'espace connecté.

type Etape = "connexion" | "oubli" | "code" | "nouveau" | "succes";
type Anim = "" | "sort" | "entre" | "recrache";
type Reponse = { ok?: boolean; prenom?: unknown; erreur?: string };
type Entree = RefObject<HTMLInputElement | null>;

const CLE = "oht-equipe-email"; // l'appareil se souvient de l'e-mail, jamais du mot de passe
const ESSAIS_MAX = 5;
const PAUSE = 15 * 60_000;
const VALIDITE = 10 * 60_000;
const RENVOI = 60_000;
const VIDE = ["", "", "", "", "", ""];
const DOMAINES = ["gmail.com", "outlook.com", "hotmail.com", "hotmail.fr", "yahoo.fr", "yahoo.com", "live.com", "icloud.com", "orange.fr"];

// heure des gestes (jamais lue au rendu : seulement dans les gestionnaires et les minuteurs)
const horloge = () => Date.now();
const emailValide = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const masquer = (m: string) => {
  const [u, d] = m.split("@");
  return `${u.slice(0, 1)}•••@${d}`;
};
// domaine mal tapé : à 1 ou 2 lettres d'un domaine courant (« gmial.com » → « gmail.com »), jamais le domaine lui-même
function proche(a: string, b: string) {
  if (a === b) return false;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length] <= 2;
}
function suggerer(v: string) {
  const [u, dom] = v.trim().toLowerCase().split("@");
  const bon = dom ? DOMAINES.find((x) => proche(dom, x)) : undefined;
  return bon ? `${u}@${bon}` : "";
}
function texteErreur(e?: string) {
  if (e === "pas_encore") return T.pasEncore;
  if (e === "identifiants") return T.erreur;
  if (e === "code") return T.codeErreur;
  if (e === "faible") return T.faible;
  if (e === "trop") return T.bloque;
  if (e === "trop_tot") return T.tropTot;
  if (e === "expire") return T.expire;
  if (e === "bloquee") return T.bloquee;
  return T.reseau;
}
async function appeler(corps: Record<string, string>): Promise<Reponse> {
  try {
    const r = await fetch("/api/equipe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corps) });
    const j = (await r.json().catch(() => ({}))) as Reponse;
    return r.ok && j.ok ? j : { erreur: j.erreur ?? "reseau" };
  } catch {
    return { erreur: "reseau" };
  }
}

// e-mail retenu (lu une fois côté client) et heure de Ouidah à la minute : rien de tout ça n'existe au rendu serveur
const rien = () => () => {};
const lireSouvenir = () => {
  try {
    return localStorage.getItem(CLE) ?? "";
  } catch {
    return "";
  }
};
const fmtHeure = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: T.fuseau });
const suivreHeure = (cb: () => void) => {
  const id = setInterval(cb, 30_000);
  return () => clearInterval(id);
};
const lireHeure = () => fmtHeure.format(new Date());

// pictos au trait de la maquette
const TRACES = {
  oeil: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  oeilBarre: (
    <>
      <path d="M3 3l18 18M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.5 4.5-1.2" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  fleche: <path d="M5 12h14M13 6l6 6-6 6" />,
  retour: <path d="M19 12H5M11 6l-6 6 6 6" />,
  alerte: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16.5v.5" />
    </>
  ),
};
function Picto({ nom }: { nom: keyof typeof TRACES }) {
  const fin = nom === "oeil" || nom === "oeilBarre";
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={fin ? 1.8 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {TRACES[nom]}
    </svg>
  );
}

function Message({ id, texte }: { id: string; texte?: string }) {
  return (
    <div className="message erreur" id={id} role="alert" hidden={!texte}>
      {texte ? (
        <>
          <Picto nom="alerte" />
          <span>{texte}</span>
        </>
      ) : null}
    </div>
  );
}

// bouton billet : libellé et carré à flèche ; pendant l'appel, la roue et le texte d'attente
function Bouton({ id, texte, attente, occupe }: { id: string; texte: string; attente: string; occupe: boolean }) {
  return (
    <button className="bouton" type="submit" id={id} aria-busy={occupe}>
      {occupe ? (
        <>
          <span className="roue" aria-hidden="true" />
          <span>{attente}</span>
        </>
      ) : (
        <>
          <span>{texte}</span>
          <Picto nom="fleche" />
        </>
      )}
    </button>
  );
}

function Email({ id, valeur, changer, entree, invalide, fige, children }: { id: string; valeur: string; changer: (v: string) => void; entree: Entree; invalide: boolean; fige: boolean; children?: ReactNode }) {
  const vers = suggerer(valeur);
  return (
    <div className="champ">
      <label htmlFor={id}>{T.email}</label>
      <div className="saisie">
        <input ref={entree} id={id} name={id} type="email" autoComplete="email" inputMode="email" required value={valeur} readOnly={fige} aria-invalid={invalide || undefined} onChange={(e) => changer(e.target.value)} />
      </div>
      <button
        className="suggestion"
        type="button"
        data-suggere={id}
        hidden={!vers}
        onClick={() => {
          changer(vers);
          entree.current?.focus();
        }}
      >
        {vers ? T.suggere(vers) : ""}
      </button>
      {children}
    </div>
  );
}

// mot de passe : œil pour l'afficher, majuscules signalées (sur les champs où l'on tape un mot de passe à retenir)
function Secret({ id, libelle, valeur, changer, auto, entree, maj = false, invalide = false, fige = false }: { id: string; libelle: string; valeur: string; changer: (v: string) => void; auto: string; entree: Entree; maj?: boolean; invalide?: boolean; fige?: boolean }) {
  const [voir, setVoir] = useState(false);
  const [majOn, setMajOn] = useState(false);
  const lire = (e: KeyboardEvent<HTMLInputElement>) => setMajOn(e.getModifierState("CapsLock"));
  return (
    <div className="champ">
      <label htmlFor={id}>{libelle}</label>
      <div className="saisie">
        <input
          ref={entree}
          id={id}
          name={id}
          type={voir ? "text" : "password"}
          autoComplete={auto}
          required
          value={valeur}
          readOnly={fige}
          aria-invalid={invalide || undefined}
          onChange={(e) => changer(e.target.value)}
          onKeyDown={maj ? lire : undefined}
          onKeyUp={maj ? lire : undefined}
          onBlur={() => setMajOn(false)}
        />
        <button
          className="oeil"
          type="button"
          data-oeil={id}
          aria-label={voir ? T.masquer : T.afficher}
          onClick={() => {
            setVoir((v) => !v);
            entree.current?.focus();
          }}
        >
          <Picto nom={voir ? "oeilBarre" : "oeil"} />
        </button>
      </div>
      {maj ? (
        <p className="maj" data-maj={id} hidden={!majOn}>
          {T.maj}
        </p>
      ) : null}
    </div>
  );
}

export function Connexion({ role }: { role: Role }) {
  const R = T.role[role];
  const router = useRouter();
  const reduit = useMouvementReduit();
  const heure = useSyncExternalStore(suivreHeure, lireHeure, () => "");
  const salut = heure ? T.salut(Number(heure.slice(0, 2))) : "";
  const souvenir = useSyncExternalStore(rien, lireSouvenir, () => "");

  // étapes et mouvements de la carte
  const [etape, setEtape] = useState<Etape>("connexion");
  const [anim, setAnim] = useState<Anim>("");
  const [occupe, setOccupe] = useState<Etape | null>(null);
  const [msg, setMsg] = useState<Partial<Record<Etape, string>>>({});
  const [annonce, setAnnonce] = useState("");
  const [succes, setSucces] = useState(false);
  const [arrivee, setArrivee] = useState(false);
  const [prenom, setPrenom] = useState<string | null>(null);

  // saisies
  const [emailSaisi, setEmailSaisi] = useState<string | null>(null);
  const email = emailSaisi ?? souvenir;
  const [oublie, setOublie] = useState(false);
  const [mdp, setMdp] = useState("");
  const [emailFaux, setEmailFaux] = useState(false);
  const [mdpFaux, setMdpFaux] = useState(false);
  const [fort, setFort] = useState(false);
  const [premiere, setPremiere] = useState(false);
  const [emailOubli, setEmailOubli] = useState("");
  const [oubliFaux, setOubliFaux] = useState(false);
  const [emailCourant, setEmailCourant] = useState("");
  const [mdp1, setMdp1] = useState("");
  const [mdp2, setMdp2] = useState("");

  // code en volets
  const [chiffres, setChiffres] = useState(VIDE);
  const [tics, setTics] = useState([0, 0, 0, 0, 0, 0]); // chaque chiffre posé relance la chute du rabat
  const [actif, setActif] = useState<number | null>(null);
  const [defile, setDefile] = useState(false);
  const [secoue, setSecoue] = useState(false);
  const [finCode, setFinCode] = useState(0);
  const [finRenvoi, setFinRenvoi] = useState(0);
  const [maintenant, setMaintenant] = useState(0);

  const rEmail = useRef<HTMLInputElement>(null);
  const rMdp = useRef<HTMLInputElement>(null);
  const rEmailOubli = useRef<HTMLInputElement>(null);
  const rMdp1 = useRef<HTMLInputElement>(null);
  const rMdp2 = useRef<HTMLInputElement>(null);
  const cases = useRef<(HTMLInputElement | null)[]>([]);
  const code = useRef([...VIDE]);
  const essais = useRef(0);
  const pauseFin = useRef(0);
  const verifEnCours = useRef(false);
  const enTransit = useRef(false);
  const minuteurs = useRef(new Set<ReturnType<typeof setTimeout>>());

  const plusTard = (f: () => void, ms: number) => {
    const id = setTimeout(() => {
      minuteurs.current.delete(id);
      f();
    }, ms);
    minuteurs.current.add(id);
  };
  const attendre = (ms: number) => new Promise<void>((r) => plusTard(r, reduit ? 0 : ms));
  useEffect(() => {
    const m = minuteurs.current;
    return () => m.forEach(clearTimeout);
  }, []);

  // l'étape affichée prend le focus sur son premier champ, sauf si l'on a déjà commencé à la remplir
  useEffect(() => {
    const id = setTimeout(() => {
      const cible = etape === "code" ? cases.current[0] : { connexion: rEmail, oubli: rEmailOubli, nouveau: rMdp1, succes: null }[etape]?.current;
      if (cible?.form?.contains(document.activeElement)) return;
      cible?.focus({ preventScroll: true });
    }, 50);
    return () => clearTimeout(id);
  }, [etape]);

  // compte à rebours du renvoi et validité du code, à la seconde, tant que l'étape du code est affichée
  useEffect(() => {
    if (etape !== "code") return;
    const id = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(id);
  }, [etape]);

  // l'insert de l'étape finie remonte par la fente, le suivant descend et se loge sous le verre
  const aller = (nom: Etape) => {
    if (reduit || nom === etape) return setEtape(nom);
    if (enTransit.current) return;
    enTransit.current = true;
    setAnim("sort");
    plusTard(() => {
      enTransit.current = false;
      setEtape(nom);
      setAnim("entre");
    }, 380);
  };
  const finAnim = (e: AnimationEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && e.animationName !== "eq-sort") setAnim("");
  };
  // un message d'erreur : la carte est recrachée par la fente puis retombe
  const dire = (e: Etape, texte: string) => {
    setMsg((m) => ({ ...m, [e]: texte }));
    if (texte && !reduit) setAnim("recrache");
  };

  // 9-10. réussite (tampon, anneau, reflet qui scelle) puis arrivée (la carte remonte, rideau, l'espace se construit)
  const reussir = (p: unknown) => {
    setPrenom(typeof p === "string" && p.trim() ? p.trim() : null);
    aller("succes");
    setSucces(true);
    setAnnonce(`${T.succesTitre}. ${T.succesSous}`);
    plusTard(() => {
      setArrivee(true);
      plusTard(() => router.refresh(), reduit ? 0 : 1800); // l'espace s'est construit (dernier bloc : 1 080 ms + 600 ms)
    }, reduit ? 0 : 2300); // le temps de voir le tampon et l'anneau se poser
  };

  // 1-3. connexion
  const connecter = async (e: FormEvent) => {
    e.preventDefault();
    if (occupe) return;
    const m = email.trim();
    if (pauseFin.current > horloge()) return dire("connexion", T.bloque);
    if (pauseFin.current) {
      pauseFin.current = 0;
      essais.current = 0;
    }
    if (!m || !mdp) return dire("connexion", T.vide);
    if (!emailValide(m)) {
      setEmailFaux(true);
      rEmail.current?.focus();
      return dire("connexion", T.emailInvalide);
    }
    setOccupe("connexion");
    dire("connexion", "");
    const [r] = await Promise.all([appeler({ action: "connexion", role, email: m, mdp }), attendre(900)]);
    setOccupe(null);
    if (r.ok) {
      try {
        localStorage.setItem(CLE, m);
      } catch {
        // stockage refusé par le navigateur : l'adresse ne sera pas retenue
      }
      return reussir(r.prenom);
    }
    if (r.erreur !== "identifiants") return dire("connexion", texteErreur(r.erreur));
    essais.current += 1;
    const n = essais.current;
    if (n >= ESSAIS_MAX) pauseFin.current = horloge() + PAUSE;
    dire("connexion", n >= ESSAIS_MAX ? T.bloque : n >= 3 ? T.essaisRestants(ESSAIS_MAX - n) : T.erreur);
    setMdp("");
    setMdpFaux(true);
    setFort(true);
    rMdp.current?.focus();
  };
  const pasVous = () => {
    setEmailSaisi("");
    setOublie(true);
    try {
      localStorage.removeItem(CLE);
    } catch {
      // stockage indisponible : rien à effacer
    }
    rEmail.current?.focus();
  };

  // 4. oubli ou première connexion : même chemin, titre et consigne propres
  const ouvrirOubli = (p: boolean) => {
    setPremiere(p);
    if (!emailOubli) setEmailOubli(email.trim());
    aller("oubli");
  };
  const demarrerMinuteurs = () => {
    const t = horloge();
    setMaintenant(t);
    setFinCode(t + VALIDITE);
    setFinRenvoi(t + RENVOI);
  };
  const demanderCode = async (e: FormEvent) => {
    e.preventDefault();
    if (occupe) return;
    const m = emailOubli.trim();
    if (!emailValide(m)) {
      setOubliFaux(true);
      rEmailOubli.current?.focus();
      return dire("oubli", T.emailInvalide);
    }
    setOubliFaux(false);
    setOccupe("oubli");
    dire("oubli", "");
    const [r] = await Promise.all([appeler({ action: "code", role, email: m }), attendre(700)]);
    setOccupe(null);
    if (!r.ok) return dire("oubli", texteErreur(r.erreur));
    setEmailCourant(m);
    viderCode();
    dire("code", "");
    demarrerMinuteurs();
    aller("code");
  };

  // 5-7. code : volets qui basculent, collage du code entier, envoi au 6e chiffre
  const poser = (i: number, ch: string) => {
    code.current[i] = ch;
    setChiffres([...code.current]);
    if (ch) setTics((t) => t.map((v, k) => (k === i ? v + 1 : v)));
  };
  const viderCode = () => {
    code.current = [...VIDE];
    setChiffres(VIDE);
  };
  const complet = () => code.current.every(Boolean);
  const verifierCode = async () => {
    if (verifEnCours.current) return;
    verifEnCours.current = true;
    setOccupe("code");
    setDefile(true); // les deux groupes se resserrent, les chiffres défilent
    const [r] = await Promise.all([appeler({ action: "verifier", role, email: emailCourant, code: code.current.join("") }), attendre(1200)]);
    setDefile(false);
    setOccupe(null);
    verifEnCours.current = false;
    if (r.ok) return aller("nouveau");
    if (r.erreur !== "code") return dire("code", texteErreur(r.erreur));
    dire("code", T.codeErreur);
    if (!reduit) setSecoue(true);
    plusTard(() => {
      viderCode();
      cases.current[0]?.focus();
    }, reduit ? 0 : 420);
  };
  const coller = (txt: string, depuis: number) => {
    const liste = txt.slice(0, 6 - depuis).split("");
    liste.forEach((ch, k) => plusTard(() => poser(depuis + k, ch), reduit ? 0 : k * 60));
    plusTard(() => {
      cases.current[Math.min(5, depuis + liste.length - 1)]?.focus();
      if (complet()) verifierCode();
    }, reduit ? 0 : liste.length * 60 + 40);
  };
  const saisirCase = (i: number, v: string) => {
    const d = v.replace(/\D/g, "");
    if (d.length > 1) return coller(d, i);
    poser(i, d);
    if (d && i < 5) cases.current[i + 1]?.focus();
    if (complet()) verifierCode();
  };
  const toucheCase = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code.current[i] && i > 0) {
      poser(i - 1, "");
      cases.current[i - 1]?.focus();
      e.preventDefault();
    }
    if (e.key === "ArrowLeft" && i > 0) cases.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < 5) cases.current[i + 1]?.focus();
  };
  const collerPressePapiers = async () => {
    try {
      const t = (await navigator.clipboard.readText()).replace(/\D/g, "");
      cases.current[0]?.focus();
      if (t) coller(t, 0);
    } catch {
      cases.current[0]?.focus();
    }
  };
  const envoyerCode = (e: FormEvent) => {
    e.preventDefault();
    if (complet()) verifierCode();
    else cases.current[code.current.findIndex((c) => !c)]?.focus();
  };
  const renvoyer = async () => {
    const t = horloge();
    setMaintenant(t);
    setFinRenvoi(t + RENVOI); // bouton verrouillé pendant l'appel
    const r = await appeler({ action: "code", role, email: emailCourant });
    if (!r.ok) {
      setFinRenvoi(0);
      return dire("code", texteErreur(r.erreur));
    }
    setAnnonce(T.renvoye);
    viderCode();
    dire("code", "");
    demarrerMinuteurs();
    cases.current[0]?.focus();
  };
  const attenteRenvoi = Math.max(0, Math.ceil((finRenvoi - maintenant) / 1000));
  const restant = finCode ? Math.max(0, finCode - maintenant) : VALIDITE;
  const boite = T.messagerie[(emailCourant.split("@")[1] ?? "").toLowerCase()];

  // 8. nouveau mot de passe : exigences vivantes
  const base = (emailCourant || email).toLowerCase();
  const ex = {
    longueur: mdp1.length >= 12,
    email: mdp1.length > 0 && mdp1.toLowerCase() !== base && !(base && mdp1.toLowerCase().includes(base.split("@")[0])),
    pareil: mdp1.length > 0 && mdp1 === mdp2,
  };
  const enregistrer = async (e: FormEvent) => {
    e.preventDefault();
    if (occupe) return;
    if (!(ex.longueur && ex.email && ex.pareil)) return (ex.longueur && ex.email ? rMdp2 : rMdp1).current?.focus();
    setOccupe("nouveau");
    dire("nouveau", "");
    const [r] = await Promise.all([appeler({ action: "nouveau", role, email: emailCourant, mdp: mdp1 }), attendre(800)]);
    setOccupe(null);
    if (!r.ok) return dire("nouveau", texteErreur(r.erreur));
    reussir(r.prenom);
  };

  const on = (e: Etape) => `etape${etape === e ? " on" : ""}`;
  const i = (n: number) => ({ "--i": n }) as CSSProperties;

  return (
    <div className={`eq${arrivee ? " arrivee" : ""}`} data-role={role} data-espace-equipe>
      <figure className="photo" aria-hidden="true">
        <Image src={T.photo.src} alt="" width={T.photo.largeur} height={T.photo.hauteur} sizes="100vw" preload />
      </figure>
      <p className="legende">{T.photo.legende}</p>
      <div className="rideau" aria-hidden="true" />

      <div className={`scene${succes ? " succes" : ""}`} id="scene">
        <span className="cordon" aria-hidden="true" />
        <section className="carte" aria-labelledby="titre">
          <span className="reflet" aria-hidden="true" />
          <div className={`insert${anim ? ` ${anim}` : ""}`} id="insert" onAnimationEnd={finAnim}>
            <div className="bandeau">
              <span id="role-nom">{R.nom}</span>
              <span className="serie">{T.serie}</span>
            </div>
            <div className="corps">
              <div className="entete">
                <Image src={T.logoEncre.src} alt={T.logoEncre.alt} width={48} height={48} />
                <p className="heure" id="heure" aria-live="off">
                  {heure ? (
                    <>
                      {salut}
                      {T.heure.separateur}
                      <b>{heure.replace(":", " h ")}</b>
                      {T.heure.apres}
                    </>
                  ) : null}
                </p>
              </div>

              {/* 1-3. connexion, vérification, erreur */}
              <form className={on("connexion")} id="e-connexion" noValidate onSubmit={connecter}>
                <h1 id="titre">{R.titre}</h1>
                <p className="sous" id="sous-connexion">
                  {T.sousConnexion}
                </p>
                <Message id="msg-connexion" texte={msg.connexion} />
                <Email
                  id="email"
                  valeur={email}
                  changer={(v) => {
                    setEmailSaisi(v);
                    setEmailFaux(false);
                  }}
                  entree={rEmail}
                  invalide={emailFaux}
                  fige={occupe === "connexion"}
                >
                  <p className="souvenir" id="souvenir" hidden={!souvenir || oublie}>
                    <span>{T.souvenir}</span>{" "}
                    <button type="button" id="pas-vous" onClick={pasVous}>
                      {T.pasVous}
                    </button>
                  </p>
                </Email>
                <Secret
                  id="mdp"
                  libelle={T.mdp}
                  valeur={mdp}
                  changer={(v) => {
                    setMdp(v);
                    setMdpFaux(false);
                  }}
                  auto="current-password"
                  entree={rMdp}
                  maj
                  invalide={mdpFaux}
                  fige={occupe === "connexion"}
                />
                <div className="liens">
                  <button className={`lien${fort ? " fort" : ""}`} type="button" data-aller="oubli" id="lien-oubli" onClick={() => ouvrirOubli(false)}>
                    {T.oubli}
                  </button>
                  <button className="lien" type="button" data-aller="oubli" data-premiere="" id="lien-premiere" onClick={() => ouvrirOubli(true)}>
                    {T.premiere}
                  </button>
                </div>
                <Bouton id="b-connexion" texte={T.connecter} attente={T.verification} occupe={occupe === "connexion"} />
              </form>

              {/* 4. mot de passe oublié ou première connexion */}
              <form className={on("oubli")} id="e-oubli" noValidate onSubmit={demanderCode}>
                <button
                  className="retour"
                  type="button"
                  data-aller="connexion"
                  onClick={() => {
                    setPremiere(false);
                    aller("connexion");
                  }}
                >
                  <Picto nom="retour" />
                  <span>{T.retour}</span>
                </button>
                <h1 id="titre-oubli">{premiere ? T.premiereTitre : T.oubliTitre}</h1>
                <p className="sous" id="sous-oubli">
                  {premiere ? T.premiereSous : T.oubliSous}
                </p>
                <Message id="msg-oubli" texte={msg.oubli} />
                <Email
                  id="email-oubli"
                  valeur={emailOubli}
                  changer={(v) => {
                    setEmailOubli(v);
                    setOubliFaux(false);
                  }}
                  entree={rEmailOubli}
                  invalide={oubliFaux}
                  fige={occupe === "oubli"}
                />
                <Bouton id="b-oubli" texte={T.recevoir} attente={T.recevoir} occupe={occupe === "oubli"} />
              </form>

              {/* 5-7. code, vérification du code, erreur de code */}
              <form className={on("code")} id="e-code" noValidate onSubmit={envoyerCode}>
                <button className="retour" type="button" data-aller="oubli" onClick={() => aller("oubli")}>
                  <Picto nom="retour" />
                  <span>{T.retour}</span>
                </button>
                <h1 id="titre-code">{T.codeTitre}</h1>
                <p className="sous" id="sous-code">
                  {emailCourant ? T.codeSous(masquer(emailCourant)) : ""}
                </p>
                {boite ? (
                  <a className="messagerie" id="messagerie" href={boite[1]} target="_blank" rel="noopener">
                    {boite[0]}
                  </a>
                ) : null}
                <Message id="msg-code" texte={msg.code} />
                <fieldset>
                  <legend className="eq-invisible" id="legende-code">
                    {T.legende}
                  </legend>
                  <div
                    className={`volets${defile ? " defile" : ""}${secoue ? " secoue" : ""}`}
                    id="volets"
                    onAnimationEnd={(e) => {
                      if (e.target === e.currentTarget) setSecoue(false);
                    }}
                  >
                    {chiffres.map((c, n) => (
                      <div key={n} className={`volet${c && !reduit ? " tombe" : ""}${actif === n ? " actif" : ""}`}>
                        <input
                          ref={(el) => {
                            cases.current[n] = el;
                          }}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={1}
                          autoComplete={n === 0 ? "one-time-code" : "off"}
                          aria-label={T.chiffre(n + 1)}
                          value={c}
                          disabled={defile}
                          onChange={(e) => saisirCase(n, e.target.value)}
                          onKeyDown={(e) => toucheCase(n, e)}
                          onPaste={(e) => {
                            e.preventDefault();
                            coller((e.clipboardData.getData("text") || "").replace(/\D/g, ""), 0);
                          }}
                          onFocus={(e) => {
                            setActif(n);
                            e.currentTarget.select();
                          }}
                          onBlur={() => setActif((a) => (a === n ? null : a))}
                        />
                        <div className="face">
                          <span>{c}</span>
                        </div>
                        <div className="rabat" aria-hidden="true" key={tics[n]} />
                      </div>
                    ))}
                  </div>
                </fieldset>
                <button className="coller" type="button" id="coller" onClick={collerPressePapiers}>
                  {T.coller}
                </button>
                <div className="code-info">
                  <span id="validite">{finCode ? T.valideEncore(Math.ceil(restant / 60_000)) : T.validite}</span>
                  <button className="lien" type="button" id="renvoyer" disabled={attenteRenvoi > 0} onClick={renvoyer}>
                    {attenteRenvoi > 0 ? T.renvoyerDans(attenteRenvoi) : T.renvoyer}
                  </button>
                </div>
                <div className="validite" aria-hidden="true">
                  <i id="validite-barre" style={{ transform: `scaleX(${restant / VALIDITE})` }} />
                </div>
                <Bouton id="b-code" texte={T.valider} attente={T.verification} occupe={occupe === "code"} />
              </form>

              {/* 8. nouveau mot de passe */}
              <form className={on("nouveau")} id="e-nouveau" noValidate onSubmit={enregistrer}>
                <h1 id="titre-nouveau">{T.nouveauTitre}</h1>
                <p className="sous" id="sous-nouveau">
                  {T.nouveauSous}
                </p>
                <Message id="msg-nouveau" texte={msg.nouveau} />
                <Secret id="mdp1" libelle={T.mdp1} valeur={mdp1} changer={setMdp1} auto="new-password" entree={rMdp1} maj fige={occupe === "nouveau"} />
                <Secret id="mdp2" libelle={T.mdp2} valeur={mdp2} changer={setMdp2} auto="new-password" entree={rMdp2} fige={occupe === "nouveau"} />
                <ul className="exigences" id="exigences">
                  {(Object.keys(T.exigences) as (keyof typeof T.exigences)[]).map((k) => (
                    <li key={k} data-ex={k} className={ex[k] ? "ok" : undefined}>
                      {T.exigences[k]}
                    </li>
                  ))}
                </ul>
                <Bouton id="b-nouveau" texte={T.enregistrer} attente={T.verification} occupe={occupe === "nouveau"} />
              </form>

              {/* 9. réussite */}
              <div className={`${on("succes")} etape-succes`} id="e-succes" role="status">
                <h1 id="titre-succes">{T.succesTitre}</h1>
                <p className="sous" id="sous-succes">
                  {T.succesSous}
                </p>
              </div>

              <div className="tampon" aria-hidden="true">
                <i />
                <div>
                  <b>{T.tamponMarque}</b>
                  <span id="tampon-txt">{R.tampon}</span>
                </div>
              </div>
            </div>
            <div className="perfo" aria-hidden="true" />
            <div className="talon">
              <span id="talon-1">{T.talon1}</span>
              <strong id="talon-2">{T.talon2}</strong>
            </div>
          </div>
        </section>
      </div>

      {/* 10. arrivée : squelette de l'espace, aucun chiffre */}
      <div className="espace" id="espace" aria-hidden={!arrivee}>
        <aside>
          <Image src={T.logoClair.src} alt="" width={40} height={40} />
          <div className="barre-lien" />
          <div className="barre-lien" />
          <div className="barre-lien" />
          <div className="barre-lien" />
        </aside>
        <div className="tableau">
          <h2 className="construit" style={i(0)}>
            <span id="bonjour">{T.accueil(salut, prenom)}</span>
            {prenom ? (
              <>
                {" "}
                <span id="prenom">{prenom}</span>
              </>
            ) : null}
          </h2>
          <div className="grille">
            <div className="bloc construit" style={i(1)} />
            <div className="bloc construit" style={i(2)} />
            <div className="bloc construit" style={i(3)} />
          </div>
          <div className="ligne-blocs">
            <div className="bloc construit" style={i(4)} />
            <div className="bloc construit" style={i(5)} />
          </div>
          <div className="bloc large construit" style={i(6)} />
        </div>
      </div>

      <p className="eq-invisible" id="annonce" aria-live="polite">
        {annonce}
      </p>
    </div>
  );
}
