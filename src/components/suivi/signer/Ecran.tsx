"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent as EvPointeur, type ReactNode } from "react";
import type { TexteEcranSigner } from "@/content/suivi";
import { heure, jourLong, remplir, type Langage } from "./format";

// Écran de signature (maquette E « signer ») : la feuille du devis (carte, lignes, total, rendus par le serveur) et ses
// deux cartes de signature, le panneau « Signer le devis » et, sur téléphone, la barre fixe. On signe en traçant
// (pointeurs : souris, toucher, stylet) ou en tapant ; le bouton reste bloqué tant que manquent le nom, la signature ou
// l'accord, et l'aide dit ce qui manque. Après l'envoi (POST /api/suivi/<jeton>/signer), la signature se pose dans le
// devis avec la date, l'heure de Ouidah et l'empreinte du devis émis, telles que le serveur les a enregistrées.
export type Signee = { nom: string; mode: "trace" | "tape"; texte: string | null; trace: string | null; signe_le: string; empreinte: string };
type Props = {
  T: TexteEcranSigner;
  L: Langage;
  langue: string;
  jeton: string;
  nomClient: string;
  titreCarte: string; // « Bon pour accord »
  titreFeuille: string;
  montant: string; // déjà formaté, sans devise
  valable: string | null; // « valable jusqu'au … »
  verifier: string; // « Vérifier ce devis : »
  adresse: string; // adresse de vérification affichée
  document: string; // lien du PDF
  expire: boolean;
  signee: Signee | null;
  carte: ReactNode;
  corps: ReactNode;
  direction: ReactNode;
};
type Trait = [number, number][];
type Manque = "nom" | "signature" | "accord";

export function Ecran(p: Props) {
  const { T } = p;
  const [nom, setNom] = useState(p.nomClient);
  const [mode, setMode] = useState<"trace" | "tape">("trace");
  const [tape, setTape] = useState("");
  const [accord, setAccord] = useState(false);
  const [encre, setEncre] = useState({ traits: 0, signe: false }); // traits posés ; signe : un trait de plus de 2 points
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [signee, setSignee] = useState<Signee | null>(p.signee);
  const [barre, setBarre] = useState(false);
  const toile = useRef<HTMLCanvasElement>(null), zone = useRef<HTMLDivElement>(null), bouton = useRef<HTMLButtonElement>(null);
  const champNom = useRef<HTMLInputElement>(null), champTape = useRef<HTMLInputElement>(null), champAccord = useRef<HTMLInputElement>(null);
  const titreSigne = useRef<HTMLHeadingElement>(null), carteClient = useRef<HTMLElement>(null), panneau = useRef<HTMLElement>(null);
  const traits = useRef<Trait[]>([]), courant = useRef<Trait | null>(null);
  const compter = () => setEncre({ traits: traits.current.length, signe: traits.current.some((t) => t.length > 2) });

  // toile : points gardés en coordonnées relatives pour survivre au redimensionnement
  const peindre = useCallback(() => {
    const c = toile.current, ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.strokeStyle = getComputedStyle(c).getPropertyValue("--sg-ocean").trim() || "#122460";
    ctx.lineWidth = 2.3 * (window.devicePixelRatio || 1);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const t of traits.current) {
      const q = t.map(([x, y]) => [x * c.width, y * c.height] as const);
      ctx.beginPath();
      ctx.moveTo(q[0][0], q[0][1]);
      if (q.length === 1) ctx.lineTo(q[0][0] + 0.1, q[0][1] + 0.1);
      for (let i = 1; i < q.length - 1; i++) ctx.quadraticCurveTo(q[i][0], q[i][1], (q[i][0] + q[i + 1][0]) / 2, (q[i][1] + q[i + 1][1]) / 2);
      if (q.length > 1) ctx.lineTo(q[q.length - 1][0], q[q.length - 1][1]);
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    const c = toile.current;
    if (!c || signee) return;
    const ajuster = () => {
      const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      if (!r.width) return;
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      peindre();
    };
    const ro = new ResizeObserver(ajuster);
    ro.observe(c);
    return () => ro.disconnect();
  }, [peindre, signee, mode]);

  const point = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = toile.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  const bas = (e: EvPointeur<HTMLDivElement>) => {
    if (signee || envoi || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    courant.current = [point(e)];
    traits.current.push(courant.current);
    peindre();
    compter();
  };
  const bouge = (e: EvPointeur<HTMLDivElement>) => {
    if (!courant.current) return;
    const evs = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const ev of evs.length ? evs : [e]) courant.current.push(point(ev));
    peindre();
  };
  const haut = () => {
    if (!courant.current) return;
    courant.current = null;
    compter();
  };
  const effacer = () => {
    traits.current = [];
    peindre();
    compter();
  };

  // signature rognée à son encre (900 px de large au plus), pour la poser sur la ligne du devis
  const rogner = () => {
    const c = toile.current!, pts = traits.current.flat(), m = 6 * (window.devicePixelRatio || 1);
    const xs = pts.map((q) => q[0] * c.width), ys = pts.map((q) => q[1] * c.height);
    const x = Math.max(0, Math.min(...xs) - m), y = Math.max(0, Math.min(...ys) - m);
    const w = Math.min(c.width, Math.max(...xs) + m) - x, h = Math.min(c.height, Math.max(...ys) + m) - y;
    const s = Math.min(1, 900 / w);
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.ceil(w * s));
    out.height = Math.max(1, Math.ceil(h * s));
    out.getContext("2d")!.drawImage(c, x, y, w, h, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  };

  const manques: Manque[] = [];
  if (nom.trim().length < 2) manques.push("nom");
  if (mode === "trace" ? !encre.signe : !tape.trim()) manques.push("signature");
  if (!accord) manques.push("accord");
  const aide = p.expire
    ? T.aide.expire
    : erreur ?? (manques.length ? remplir(T.aide.manque[manques.length > 1 ? 1 : 0], { liste: manques.length > 1 ? `${manques.slice(0, -1).map((m) => T.aide[m]).join(", ")} ${T.aide.et} ${T.aide[manques[manques.length - 1]]}` : T.aide[manques[0]] }) : T.aide.pret);
  const bloque = p.expire || envoi || manques.length > 0;

  const choisir = (m: "trace" | "tape") => {
    setMode(m);
    setErreur(null);
    if (m === "tape") {
      if (!tape.trim()) setTape(nom.trim());
      requestAnimationFrame(() => champTape.current?.focus());
    }
  };

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    if (bloque) return;
    setEnvoi(true);
    setErreur(null);
    const n = nom.trim(), trace = mode === "trace" ? rogner() : null, texte = mode === "tape" ? tape.trim() : null;
    let r: Response | null = null;
    try {
      r = await fetch(`/api/suivi/${p.jeton}/signer`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nom: n, mode, trace, texte, accepte: true, langue: p.langue }) });
    } catch {
      r = null;
    }
    const j = (await r?.json().catch(() => null)) as { signe_le?: string; empreinte?: string; erreur?: keyof TexteEcranSigner["erreurs"] } | null;
    setEnvoi(false);
    if (r?.status !== 201 || !j?.signe_le || !j.empreinte) {
      setErreur(T.erreurs[j?.erreur && j.erreur in T.erreurs ? j.erreur : "base"]);
      return;
    }
    setSignee({ nom: n, mode, texte, trace, signe_le: j.signe_le, empreinte: j.empreinte });
  };

  // après la signature : le titre prend le focus ; grand écran, on voit la signature se poser ; téléphone, la confirmation
  const etaitSignee = useRef(!!p.signee);
  useEffect(() => {
    if (!signee || etaitSignee.current) return;
    etaitSignee.current = true;
    titreSigne.current?.focus({ preventScroll: true });
    const doux = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    const large = innerWidth > 1100;
    (large ? carteClient.current : panneau.current)?.scrollIntoView({ block: large ? "center" : "start", behavior: doux });
  }, [signee]);

  // barre fixe du téléphone : visible tant que le bouton du panneau est plus bas que l'écran
  useEffect(() => {
    const b = bouton.current;
    if (!b || signee) return;
    const io = new IntersectionObserver(([v]) => setBarre(!v.isIntersecting && v.boundingClientRect.top > 0));
    io.observe(b);
    return () => io.disconnect();
  }, [signee]);
  const aller = () => {
    if (!manques.length && !p.expire) return bouton.current?.form?.requestSubmit();
    const cible = manques[0] === "nom" ? champNom.current : manques[0] === "signature" ? (mode === "trace" ? zone.current : champTape.current) : champAccord.current;
    cible?.scrollIntoView({ block: "center" });
    cible?.focus({ preventScroll: true });
  };

  const jour = signee ? jourLong(signee.signe_le, p.L) : "", h = signee ? heure(signee.signe_le, T.heure) : "";
  const court = signee ? `SHA-256 ${signee.empreinte.slice(0, 4)}…${signee.empreinte.slice(-4)}` : "";

  return (
    <>
      <div className="sg-ecran">
        <section className="sg-feuille" aria-label={p.titreFeuille}>
          {p.carte}
          <div className="sg-doc">
            {p.corps}
            <section className="sg-sign" aria-label={T.signature}>
              <article ref={carteClient} className={`sg-carte-s${signee ? " is-scelle" : ""}`}>
                <header>
                  <h2>{p.titreCarte}</h2>
                  <span className={`sg-etat-c${signee ? "" : " is-attente"}`}>
                    <i aria-hidden="true" />
                    <span>{signee ? T.client.signe : T.client.aSigner}</span>
                  </span>
                </header>
                <div className="sg-zone">
                  {signee?.trace ? (
                    <span className="sg-sig-img" role="img" aria-label={remplir(T.client.alt, { nom: signee.nom })} style={{ backgroundImage: `url(${signee.trace})` }} />
                  ) : signee?.texte ? (
                    <p className="sg-tapee">{signee.texte}</p>
                  ) : (
                    <span className="sg-vide is-sig">{T.client.vide}</span>
                  )}
                </div>
                <div className="sg-ligne-nom">
                  <div>
                    <p className="sg-qui">
                      <b>{signee?.nom ?? (nom.trim() || p.nomClient)}</b> <span>· {T.client.role}</span>
                    </p>
                    <p className="sg-preuve">
                      {signee ? (
                        <>
                          {remplir(T.client.le, { jour })}
                          <br />
                          {remplir(T.client.a, { heure: h })}
                        </>
                      ) : (
                        T.client.attente
                      )}
                    </p>
                  </div>
                </div>
                <p className="sg-pied-c">
                  {signee ? (
                    <>
                      {T.client.piedSigne}{" "}
                      <span className="sg-num" title={signee.empreinte}>
                        {court}
                      </span>
                    </>
                  ) : (
                    T.client.pied
                  )}
                </p>
              </article>
              {p.direction}
            </section>
            <p className="sg-verif">
              {p.verifier} <b>{p.adresse}</b>
            </p>
          </div>
        </section>

        <aside ref={panneau} className="sg-panneau" aria-labelledby={signee ? "sg-titre-signe" : "sg-titre-signer"}>
          {signee ? (
            <div className="sg-signe sg-apparait">
              <span className="sg-etat-c">
                <i aria-hidden="true" />
                {T.signe.etat}
              </span>
              <h1 ref={titreSigne} tabIndex={-1} id="sg-titre-signe">
                {T.signe.titre}
              </h1>
              <dl>
                <div>
                  <dt>{T.signe.par}</dt>
                  <dd>{signee.nom + (signee.mode === "tape" ? ` ${T.signe.tapee}` : "")}</dd>
                </div>
                <div>
                  <dt>{T.signe.quand}</dt>
                  <dd>{remplir(T.signe.le, { jour, heure: h })}</dd>
                </div>
                <div>
                  <dt>{T.signe.empreinte}</dt>
                  <dd>
                    <code data-empreinte={signee.empreinte}>
                      {signee.empreinte.slice(0, 32)}
                      <br />
                      {signee.empreinte.slice(32)}
                    </code>
                  </dd>
                </div>
                <div>
                  <dt>{T.signe.verification}</dt>
                  <dd>{p.adresse}</dd>
                </div>
              </dl>
              <a className="sg-lien" href={p.document}>
                {T.signe.telecharger}
              </a>
            </div>
          ) : (
            <form onSubmit={envoyer} noValidate>
              <h1 id="sg-titre-signer">{T.titre}</h1>
              <p className="sg-resume">
                <b>
                  {p.montant}
                  <small>FCFA</small>
                </b>
                {p.valable ? <span>{p.valable}</span> : null}
              </p>
              <div className="sg-champ">
                <label htmlFor="sg-nom">{T.nom}</label>
                <input ref={champNom} id="sg-nom" name="nom" value={nom} maxLength={120} autoComplete="name" required onChange={(e) => { setNom(e.target.value); setErreur(null); }} />
              </div>
              <div className="sg-mode" role="group" aria-label={T.facon}>
                <button type="button" aria-pressed={mode === "trace"} onClick={() => choisir("trace")}>
                  {T.tracer}
                </button>
                <button type="button" aria-pressed={mode === "tape"} onClick={() => choisir("tape")}>
                  {T.taper}
                </button>
              </div>
              {mode === "trace" ? (
                <div>
                  <div className="sg-sig-tete">
                    <span className="sg-lib-s" id="sg-sig-lib">
                      {T.signature}
                    </span>
                    <button type="button" className="sg-effacer" disabled={!encre.traits || envoi} onClick={effacer}>
                      {T.effacer}
                    </button>
                  </div>
                  <div
                    ref={zone}
                    className={`sg-toile${encre.traits ? " is-encre" : ""}`}
                    tabIndex={0}
                    role="img"
                    aria-labelledby="sg-sig-lib"
                    aria-describedby="sg-sig-invite"
                    onPointerDown={bas}
                    onPointerMove={bouge}
                    onPointerUp={haut}
                    onPointerCancel={haut}
                  >
                    <canvas ref={toile} data-encre={encre.traits} />
                    <span className="sg-base" />
                    <span className="sg-invite" id="sg-sig-invite">
                      {T.invite}
                    </span>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="sg-champ">
                    <label htmlFor="sg-tape">{T.tapee}</label>
                    <input ref={champTape} id="sg-tape" name="tape" value={tape} maxLength={120} autoComplete="off" onChange={(e) => { setTape(e.target.value); setErreur(null); }} />
                  </div>
                  <p className="sg-apercu" aria-hidden="true">
                    {tape}
                  </p>
                </div>
              )}
              <label className="sg-accord">
                <input ref={champAccord} type="checkbox" checked={accord} onChange={(e) => { setAccord(e.target.checked); setErreur(null); }} /> {T.accord}
              </label>
              <button ref={bouton} type="submit" className="sg-btn" disabled={bloque} aria-describedby="sg-aide">
                {envoi ? T.envoi : T.bouton}
              </button>
              <p className={`sg-aide${!manques.length && !erreur && !p.expire ? " is-pret" : ""}`} id="sg-aide" aria-live="polite">
                {aide}
              </p>
            </form>
          )}
        </aside>
      </div>

      {signee ? null : (
        <div className="sg-barre" hidden={!barre}>
          <button type="button" className="sg-btn" onClick={aller}>
            {remplir(T.barre, { montant: `${p.montant} FCFA` })}
          </button>
        </div>
      )}
    </>
  );
}
