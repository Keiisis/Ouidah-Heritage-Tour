"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { deux, terrain } from "@/content/espace-terrain";
import type { ControleEdition, EntreeVue } from "@/lib/serveur/equipe/terrain/billets";
import { validerEntree } from "@/lib/serveur/equipe/terrain/billets-actions";
import { aRejouer, type EntreeFile, lireBillet, numeroBillet, type RetourEntree } from "@/lib/serveur/equipe/terrain/regles";
import { vars, Vide } from "../Bloc";
import { Picto } from "../Picto";
import { appareil, file } from "./file";
import { Volets } from "./Volets";

// Contrôle des billets QR (lot terrain L5, maquette E ?ecran=billets) : plein écran sur téléphone, viseur de la caméra
// (BarcodeDetector s'il lit les QR ; sinon, comme Safari sur iPhone où il reste derrière un réglage expérimental, la
// saisie du numéro), compteur à volets « 00 / 64 » dont seul le chiffre qui change bascule, dernières entrées. Chaque scan
// entre d'abord dans la file du téléphone (file.ts), puis part au serveur, qui seul tranche (signature, paiement,
// événement, déjà entré). Sans réseau, l'entrée reste sur le téléphone et repart au retour du réseau, sans doublon : la
// base n'accepte un billet qu'une fois et reconnaît la même entrée renvoyée (même clé).

const K = terrain.billets;
const R = K.resultat;
type Etat = "valide" | "deja" | "refus" | "attente";
type Ligne = { id: string; numero: string; nom: string; formule: string; heure: number; etat: Etat; arrive: boolean };
type Lecteur = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type ClasseLecteur = { new (o: { formats: string[] }): Lecteur; getSupportedFormats?: () => Promise<string[]> };

const cle = (e: { evenement: string; occurrence: string }) => `${e.evenement}|${e.occurrence}`;
/** Heure à Ouidah (UTC+1 toute l'année) : « 17 h 32 ». */
const hm = (ms: number) => {
  const s = new Date(ms + 3_600_000).toISOString();
  return `${s.slice(11, 13)} h ${s.slice(14, 16)}`;
};
const numeroDe = (code: string) => {
  const b = lireBillet(code);
  return b ? (b.type === "code" ? numeroBillet(b.reservation, b.rang) : b.numero) : code.slice(0, 24);
};
const versLigne = (e: EntreeVue, i: number): Ligne => ({ id: `s${i}-${e.numero}`, numero: e.numero, nom: e.nom, formule: e.formule, heure: e.entre_le, etat: "valide", arrive: false });
function texteRefus(r: Exclude<RetourEntree, { ok: true }>): string {
  if (r.erreur === "autre") return R.autre(r.evenement);
  if (r.erreur === "deja") return R.deja(r.nom, hm(r.entre_le));
  return R[r.erreur];
}

export function Controle({ editions }: { editions: ControleEdition[] }) {
  const [choix, setChoix] = useState(0);
  const choixRef = useRef(0);
  const [comptes, setComptes] = useState<Record<string, number>>(() => Object.fromEntries(editions.map((e) => [cle(e), e.entrees])));
  const [lignes, setLignes] = useState<Record<string, Ligne[]>>(() => Object.fromEntries(editions.map((e) => [cle(e), e.dernieres.map(versLigne)])));
  const [resultat, setResultat] = useState<{ etat: Etat; texte: string } | null>(null);
  const [coup, setCoup] = useState<{ n: number; type: "lu" | "refus" | "" }>({ n: 0, type: "" });
  const [camera, setCamera] = useState(false);
  const [repli, setRepli] = useState<string | null>(null);
  const [saisie, setSaisie] = useState(false);
  const [erreurCode, setErreurCode] = useState("");
  const [annonce, setAnnonce] = useState("");
  const attente = useSyncExternalStore(file.abonner, file.lire, file.serveur);

  const video = useRef<HTMLVideoElement>(null);
  const flux = useRef<MediaStream | null>(null);
  const boucle = useRef<number | undefined>(undefined);
  const pause = useRef(0);
  const envoi = useRef(false);
  const vivantes = useRef(new Set<string>()); // entrées scannées sur cet écran : leur résultat s'affiche
  const minuteur = useRef<number | undefined>(undefined);

  const ed = editions[choix];
  const n = comptes[cle(ed)] ?? 0;
  const enAttente = attente.filter((x) => x.evenement === ed.evenement && x.occurrence === ed.occurrence).length;
  const vues = lignes[cle(ed)] ?? [];
  const texteCompte = `${deux(n)} / ${ed.vendus}`;

  const annoncer = (t: string) => {
    setAnnonce(t);
    clearTimeout(minuteur.current);
    minuteur.current = window.setTimeout(() => setAnnonce(""), 5000);
  };
  const ajouterLigne = (k: string, l: Ligne) => setLignes((m) => ({ ...m, [k]: [l, ...(m[k] ?? []).filter((x) => x.id !== l.id)].slice(0, 30) }));
  const frapper = (type: "lu" | "refus") => setCoup((c) => ({ n: c.n + 1, type }));

  /** Résultat rendu par le serveur pour une entrée de la file. */
  function montrer(r: RetourEntree, e: EntreeFile, vivante: boolean) {
    const k = cle(e);
    if ("ok" in r || r.erreur === "deja") {
      if (r.entrees !== null) setComptes((m) => ({ ...m, [k]: r.entrees as number }));
      else if ("ok" in r && !r.rejoue) setComptes((m) => ({ ...m, [k]: (m[k] ?? 0) + 1 }));
    }
    if ("ok" in r) {
      ajouterLigne(k, { id: e.cle, numero: r.numero, nom: r.nom, formule: r.formule, heure: r.entre_le, etat: "valide", arrive: true });
      if (vivante) {
        setResultat({ etat: "valide", texte: R.valide(r.nom, r.formule) });
        frapper("lu");
      }
      return;
    }
    const deja = r.erreur === "deja";
    ajouterLigne(k, { id: e.cle, numero: deja ? r.numero : numeroDe(e.code), nom: deja ? r.nom : "", formule: "", heure: e.entre_le, etat: deja ? "deja" : "refus", arrive: true });
    if (vivante) {
      setResultat({ etat: deja ? "deja" : "refus", texte: texteRefus(r) });
      frapper("refus");
    }
  }

  /** Envoie la file, une entrée après l'autre ; s'arrête au premier échec du réseau (l'entrée reste et repartira). */
  async function vider() {
    if (envoi.current) return;
    envoi.current = true;
    const tentees = new Set<string>();
    let parties = 0;
    try {
      for (;;) {
        const e = file.lire().find((x) => !tentees.has(x.cle));
        if (!e) break;
        tentees.add(e.cle);
        const vivante = vivantes.current.has(e.cle);
        let r: RetourEntree;
        try {
          r = await validerEntree(e);
        } catch {
          file.horsLigne();
          if (vivante) setResultat({ etat: "attente", texte: R.attente });
          break;
        }
        if (aRejouer(r)) {
          if (vivante && "erreur" in r) setResultat({ etat: "attente", texte: r.erreur === "refuse" ? R.refuse : R.panne });
          break;
        }
        file.retirer(e.cle);
        vivantes.current.delete(e.cle);
        montrer(r, e, vivante);
        if (!vivante) parties++;
      }
    } finally {
      envoi.current = false;
    }
    if (parties) annoncer(K.reseauOk);
  }

  /** Un billet lu par la caméra ou saisi : il entre dans la file, puis part si le réseau le permet. */
  async function traiter(code: string, mode: "camera" | "saisie") {
    const e0 = editions[choixRef.current];
    const k = cle(e0);
    const numero = numeroDe(code);
    if (file.lire().some((x) => cle(x) === k && numeroDe(x.code) === numero)) {
      setResultat({ etat: "attente", texte: R.dejaTel });
      frapper("refus");
      return;
    }
    const horsLigne = !navigator.onLine;
    const deja = horsLigne ? (lignes[k] ?? []).find((l) => l.etat === "valide" && l.numero === numero) : undefined;
    if (deja) {
      setResultat({ etat: "deja", texte: R.deja(deja.nom, hm(deja.heure)) });
      frapper("refus");
      return;
    }
    const e: EntreeFile = { cle: crypto.randomUUID(), code: code.trim(), evenement: e0.evenement, occurrence: e0.occurrence, entre_le: Date.now(), appareil: appareil(), mode, hors_ligne: horsLigne };
    file.ajouter(e);
    vivantes.current.add(e.cle);
    if (horsLigne) {
      setResultat({ etat: "attente", texte: R.attente });
      ajouterLigne(k, { id: e.cle, numero, nom: "", formule: "", heure: e.entre_le, etat: "attente", arrive: true });
      return;
    }
    await vider();
  }

  // ---------- caméra ----------
  function couper() {
    clearTimeout(boucle.current);
    flux.current?.getTracks().forEach((t) => t.stop());
    flux.current = null;
    if (video.current) video.current.srcObject = null;
  }
  function arreter() {
    couper();
    setCamera(false);
  }
  async function demarrer() {
    const Classe = (globalThis as { BarcodeDetector?: ClasseLecteur }).BarcodeDetector;
    const formats = Classe?.getSupportedFormats ? await Classe.getSupportedFormats().catch(() => [] as string[]) : [];
    if (!Classe || !formats.includes("qr_code")) {
      setRepli(K.sansLecteur);
      setSaisie(true);
      return;
    }
    try {
      flux.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    } catch {
      setRepli(K.sansCamera);
      setSaisie(true);
      return;
    }
    const v = video.current;
    if (!v) return couper();
    v.srcObject = flux.current;
    await v.play().catch(() => null);
    setRepli(null);
    setCamera(true);
    const lecteur = new Classe({ formats: ["qr_code"] });
    const tic = async () => {
      if (!flux.current) return;
      if (Date.now() > pause.current && v.readyState >= 2) {
        const lus = await lecteur.detect(v).catch(() => [] as { rawValue: string }[]);
        const c = lus.find((x) => x.rawValue.startsWith("OHT"));
        if (c) {
          pause.current = Date.now() + 1800; // le même billet devant la caméra n'est pas relu aussitôt
          void traiter(c.rawValue, "camera");
        }
      }
      boucle.current = window.setTimeout(tic, 220);
    };
    void tic();
  }

  // la file repart au retour du réseau, au chargement (entrées restées sur le téléphone) et toutes les 30 s
  const surReseau = useEffectEvent(() => {
    if (navigator.onLine && file.lire().length) void vider();
  });
  useEffect(() => {
    const go = () => surReseau();
    window.addEventListener("online", go);
    const t = window.setInterval(go, 30_000);
    go();
    return () => {
      window.removeEventListener("online", go);
      clearInterval(t);
    };
  }, []);
  useEffect(() => () => couper(), []);

  const soumettre = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const champ = ev.currentTarget.elements.namedItem("code") as HTMLInputElement;
    const v = champ.value.trim();
    if (!v || !lireBillet(v)) return setErreurCode(v ? R.champs : K.codeVide);
    setErreurCode("");
    champ.value = "";
    void traiter(v, "saisie");
  };

  return (
    <div className="esp-terrain controle-billets">
      <div className="controle">
        <section className="viseur-zone construit" style={vars({ "--i": 1 })} aria-labelledby="t-viseur">
          <div className="controle-haut">
            <Link className="icone-bouton retour" href="/agents" aria-label={K.retour}>
              <Picto nom="chevron" />
            </Link>
            <h2 id="t-viseur">{ed.titre}</h2>
            <span className="entrees-mini" data-entrees-haut>
              <Volets texte={texteCompte} libelle={K.compteur(n, ed.vendus)} />
            </span>
          </div>
          {editions.length > 1 && (
            <label>
              <span className="invisible">{K.choisir}</span>
              <select
                value={choix}
                onChange={(e) => {
                  choixRef.current = Number(e.target.value);
                  setChoix(Number(e.target.value));
                  setResultat(null);
                }}
              >
                {editions.map((x, i) => (
                  <option key={cle(x)} value={i}>
                    {x.titre}, {x.occurrence}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="viseur" role="img" aria-label={camera ? K.viseur : K.viseurArret}>
            <video ref={video} muted playsInline hidden={!camera} />
            {!camera && (
              <div className="repos" aria-hidden="true">
                <Picto nom="qr" />
              </div>
            )}
            <div key={coup.n} className={`cadre ${coup.type}`} aria-hidden="true">
              <span className="coin c1" />
              <span className="coin c2" />
              <span className="coin c3" />
              <span className="coin c4" />
              <span className="balayage" />
            </div>
          </div>
          <p className="consigne" id="consigne">
            {repli ?? K.consigne}
          </p>
          <div className="controle-actions">
            <button type="button" className="bouton accent grand-bouton" id="scanner" aria-describedby="consigne" aria-pressed={camera} onClick={() => (camera ? arreter() : void demarrer())}>
              <Picto nom="qr" />
              {camera ? K.arreter : K.scanner}
            </button>
            <details className="saisie-code" open={saisie} onToggle={(e) => setSaisie(e.currentTarget.open)}>
              <summary className="bouton-nuit">
                <Picto nom="crayon" />
                {K.saisir}
              </summary>
              <form id="form-code" noValidate onSubmit={soumettre}>
                <label htmlFor="code-billet">{K.code}</label>
                <div className="code-ligne">
                  <input type="text" id="code-billet" name="code" autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-describedby="code-aide code-err" aria-invalid={erreurCode ? true : undefined} maxLength={120} />
                  <button type="submit" className="bouton-nuit">
                    {K.valider}
                  </button>
                </div>
                <span className="aide-nuit" id="code-aide">
                  {K.codeAide}
                </span>
                <span className="erreur-nuit" id="code-err" role="alert">
                  {erreurCode}
                </span>
              </form>
            </details>
          </div>
          <p className="reseau" data-attente={enAttente ? "" : undefined} data-file={enAttente}>
            <Picto nom="coche" />
            <span>{enAttente ? K.enAttente(enAttente) : K.horsLigne}</span>
          </p>
        </section>

        <section className="entrees-zone construit" style={vars({ "--i": 2 })} aria-labelledby="t-entrees">
          <div className="ligne-entrees">
            <div>
              <h2 id="t-entrees">{K.entreesTitre}</h2>
              <p>{K.vendus(ed.vendus)}</p>
            </div>
            <span data-entrees>
              <Volets texte={texteCompte} taille="grand" libelle={K.compteur(n, ed.vendus)} />
            </span>
          </div>
          <div className="horizon-entrees" style={vars({ "--f": ed.vendus ? Math.min(1, n / ed.vendus).toFixed(3) : 0 })} aria-hidden="true">
            <i />
            <span>
              <b />
            </span>
          </div>
          <div className="horizon-legende" aria-hidden="true">
            <span>00</span>
            <span>{ed.vendus}</span>
          </div>
          <p className="resultat" id="resultat" role="status" aria-live="polite" data-etat={resultat?.etat}>
            {resultat && (
              <>
                <span className="etat tampon" data-e={resultat.etat} key={coup.n}>
                  {K.etats[resultat.etat]}
                </span>
                <span>{resultat.texte}</span>
              </>
            )}
          </p>
          <h3>{K.derniers}</h3>
          {vues.length ? (
            <table className="tableau empile" id="table-entrees">
              <caption className="invisible">{K.derniers}</caption>
              <thead>
                <tr>
                  {Object.values(K.cols).map((c) => (
                    <th scope="col" key={c}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vues.map((l) => (
                  <tr key={l.id} className={l.arrive ? "arrive" : undefined} data-numero={l.numero} data-etat={l.etat}>
                    <td data-l={K.cols.heure}>
                      <b>{hm(l.heure)}</b>
                    </td>
                    <td data-l={K.cols.nom}>
                      <b>{l.nom || "?"}</b>
                      <small>{l.numero}</small>
                    </td>
                    <td data-l={K.cols.cat}>{l.formule}</td>
                    <td data-l={K.cols.etat}>
                      <span className="etat" data-e={l.etat}>
                        {K.etats[l.etat]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Vide texte={K.aucun} />
          )}
        </section>
      </div>
      <p className="esp-annonce" role="status" aria-live="polite">
        {annonce}
      </p>
    </div>
  );
}
