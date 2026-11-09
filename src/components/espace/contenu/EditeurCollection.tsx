"use client";

import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { contenu as C } from "@/content/espace-contenu";
import { altValide, differences, type Ecart, type Forme, IMAGE_MAX, type Json, libelle, MIMES_IMAGE, valider, vide } from "@/lib/contenu-regles";
import { abandonnerBrouillon, enregistrerBrouillon, fermerApercu, finaliserImage, type ImageTeleversee, ouvrirApercu, preparerImage, publierContenu, restaurerVersion, type RetourContenu } from "@/lib/serveur/contenu/actions";
import { Picto } from "../Picto";

// Éditeur générique d'une rubrique du site, généré depuis sa forme (lib/contenu-regles.ts) : texte court ou long avec le
// compte des caractères, nombre, case, choix, couple de valeurs, image (téléversement et texte alternatif obligatoire),
// liste (monter, descendre, ajouter en clonant la forme, retirer après confirmation), dictionnaire de fiches. La même
// relecture que le serveur tourne ici pour marquer les champs (aria-invalid) ; le serveur seul décide. Brouillon, aperçu
// sur le site (mode aperçu), différences avant publication, historique avec « Restaurer ». Retours en aria-live.

type Props = {
  cle: string;
  titre: string;
  forme: Forme;
  valeur: Json;
  publiee: Json;
  version: number;
  etat: { publie: string; brouillon: string | null };
  aBrouillon: boolean;
  peutPublier: boolean;
  versions: { id: number; texte: string }[];
  adresses: string[];
  medias: string[];
  page: string;
  verrouille: boolean;
  protege: boolean;
};
type Etat = { ton: "ok" | "erreur"; texte: string; ecarts?: Ecart[]; adresses?: string[]; refaire?: "brouillon" | "publier"; lien?: string } | null;
type Ctx = { ecarts: Map<string, Ecart>; adresses: Set<string>; medias: string[]; annoncer: (t: string) => void; racine: string };
type Pose = (x: Json) => void;

const estObjet = (v: unknown): v is Record<string, Json> => typeof v === "object" && v !== null && !Array.isArray(v);
const idDe = (chemin: string) => `ct-${chemin.replace(/[^A-Za-z0-9]/g, (c) => `_${c.charCodeAt(0).toString(36)}`)}`;
const lib = (cle: string) => libelle(cle, C.libelles);
const RESUMES = ["title", "titre", "name", "nom", "label", "short", "court", "word", "slug", "id", "key", "code", "oeuvre", "fichier", "quote", "text", "texte", "legende", "alt", "valeur"];
const couper = (t: string, n = 70) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
function resumeDe(x: Json | undefined, i: number): string {
  if (typeof x === "string" || typeof x === "number") return couper(String(x));
  if (Array.isArray(x)) return couper(x.filter((y) => typeof y !== "object").join(", ") || `${i + 1}`);
  if (estObjet(x)) for (const c of RESUMES) if (typeof x[c] === "string" && x[c]) return couper(x[c] as string);
  return `${i + 1}`;
}
const resumeJson = (v: Json | undefined) => (v === undefined || v === null || v === "" ? C.publication.vide : couper(typeof v === "string" ? v : JSON.stringify(v), 160));
/** Chemin lisible : « fr.tours[2].title » → « n° 3 › Titre ». */
function cheminLisible(chemin: string, racine: string) {
  const reste = chemin.startsWith(racine) ? chemin.slice(racine.length) : chemin;
  const morceaux = [...reste.matchAll(/\.([^.[{]+)|\[(\d+)\]|\{([^}]+)\}/g)].map((m) => (m[1] ? lib(m[1]) : m[2] !== undefined ? `n° ${Number(m[2]) + 1}` : m[3]));
  return morceaux.join(" › ") || lib(racine);
}
const contient = (ctx: Ctx, chemin: string) => [...ctx.ecarts.keys()].some((k) => k === chemin || k.startsWith(`${chemin}.`) || k.startsWith(`${chemin}[`) || k.startsWith(`${chemin}{`));

function Erreur({ ctx, chemin }: { ctx: Ctx; chemin: string }) {
  const e = ctx.ecarts.get(chemin);
  return e ? (
    <p className="ct-erreur" id={`${idDe(chemin)}-e`}>
      {C.motifs[e.motif] ?? C.erreurs.champs}
    </p>
  ) : null;
}
const decrit = (ctx: Ctx, chemin: string, ...autres: string[]) => [...autres, ...(ctx.ecarts.has(chemin) ? [`${idDe(chemin)}-e`] : [])].join(" ") || undefined;

/** Groupe repliable ; son contenu n'est rendu qu'ouvert (rubriques de plusieurs centaines d'éléments). Ouvert d'office
 * quand un de ses champs est à corriger. */
function Groupe({ titre, resume, chemin, ctx, ouvert = false, children }: { titre: string; resume?: string; chemin: string; ctx: Ctx; ouvert?: boolean; children: () => ReactNode }) {
  const [ouvre, setOuvre] = useState(ouvert);
  const open = ouvre || contient(ctx, chemin);
  return (
    <details className="ct-groupe" id={idDe(chemin)} open={open} onToggle={(e) => setOuvre(e.currentTarget.open)}>
      <summary>
        <span className="ct-titre-groupe">{titre}</span>
        {resume && <small>{resume}</small>}
        <Picto nom="chevron" className="ic chev" />
      </summary>
      {open && <div className="ct-corps">{children()}</div>}
    </details>
  );
}

function Texte({ f, v, chemin, nom, pose, ctx }: { f: Extract<Forme, { k: "texte" }>; v: Json | undefined; chemin: string; nom: string; pose: Pose; ctx: Ctx }) {
  const id = idDe(chemin);
  const valeur = typeof v === "string" ? v : "";
  const [libre, setLibre] = useState(false);
  // verrou : slug déjà publié à l'ouverture de l'éditeur (un slug neuf qui en recopie un ancien reste modifiable)
  const [initial] = useState(valeur);
  const verrou = f.motif === "slug" && ctx.adresses.has(initial) && valeur === initial && !libre;
  const change = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => pose(e.target.value);
  const commun = { id, value: valeur, maxLength: f.max, onChange: change, readOnly: verrou, "aria-invalid": ctx.ecarts.has(chemin) || undefined, "aria-describedby": decrit(ctx, chemin, `${id}-n`) };
  return (
    <div className={f.long ? "ct-champ large" : "ct-champ"} data-chemin={chemin}>
      <label htmlFor={id}>{nom}</label>
      {f.long ? <textarea {...commun} rows={Math.min(10, Math.max(3, Math.ceil(valeur.length / 90)))} /> : <input type={f.motif === "date" ? "date" : "text"} {...commun} spellCheck={!f.motif} autoComplete="off" />}
      <p className="ct-compte" id={`${id}-n`}>
        {C.champ.caracteres(valeur.length, f.max)}
      </p>
      {verrou && (
        <p className="ct-aide">
          {C.champ.adresseVerrouillee}{" "}
          <button type="button" className="ct-lien" onClick={() => setLibre(true)}>
            {C.boutons.modifierAdresse}
          </button>
        </p>
      )}
      {libre && <p className="ct-alerte">{C.champ.adresseOuverte}</p>}
      <Erreur ctx={ctx} chemin={chemin} />
      {f.motif === "src" && <Televerser alt={null} ctx={ctx} chemin={chemin} surImage={(i) => pose(i.src)} />}
    </div>
  );
}

function Simple({ f, v, chemin, nom, pose, ctx }: { f: Extract<Forme, { k: "nombre" | "booleen" | "choix" }>; v: Json | undefined; chemin: string; nom: string; pose: Pose; ctx: Ctx }) {
  const id = idDe(chemin);
  const invalide = ctx.ecarts.has(chemin) || undefined;
  if (f.k === "booleen") {
    return (
      <div className="ct-champ" data-chemin={chemin}>
        <label className="case">
          <input type="checkbox" id={id} checked={v === true} onChange={(e) => pose(e.target.checked)} aria-invalid={invalide} aria-describedby={decrit(ctx, chemin)} />
          {nom}
        </label>
        <Erreur ctx={ctx} chemin={chemin} />
      </div>
    );
  }
  return (
    <div className="ct-champ" data-chemin={chemin}>
      <label htmlFor={id}>{nom}</label>
      {f.k === "choix" ? (
        <select id={id} value={typeof v === "string" ? v : ""} onChange={(e) => pose(e.target.value)} aria-invalid={invalide} aria-describedby={decrit(ctx, chemin)}>
          {f.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="number"
          id={id}
          inputMode={f.entier ? "numeric" : "decimal"}
          step={f.entier ? 1 : "any"}
          value={typeof v === "number" && Number.isFinite(v) ? v : ""}
          onChange={(e) => pose(e.target.value === "" ? 0 : e.target.valueAsNumber)}
          aria-invalid={invalide}
          aria-describedby={decrit(ctx, chemin)}
        />
      )}
      <Erreur ctx={ctx} chemin={chemin} />
    </div>
  );
}

/** Téléversement d'une image : préparation (URL de dépôt signée), envoi direct au dépôt privé, conversion WebP par le
 * serveur. `alt` : le texte alternatif déjà saisi dans la fiche, sinon un champ ici. */
function Televerser({ alt, ctx, chemin, surImage }: { alt: string | null; ctx: Ctx; chemin: string; surImage: (i: ImageTeleversee) => void }) {
  const id = `${idDe(chemin)}-fichier`;
  const fichier = useRef<HTMLInputElement>(null);
  const [texte, setTexte] = useState("");
  const [message, setMessage] = useState<{ ton: "ok" | "erreur"; texte: string } | null>(null);
  const [occupe, demarrer] = useTransition();
  const envoyer = () => {
    const f = fichier.current?.files?.[0];
    const a = alt ?? texte;
    setMessage(null);
    if (!f) return setMessage({ ton: "erreur", texte: C.erreurs.fichier });
    if (!(MIMES_IMAGE as readonly string[]).includes(f.type)) return setMessage({ ton: "erreur", texte: C.erreurs.type });
    if (f.size > IMAGE_MAX) return setMessage({ ton: "erreur", texte: C.erreurs.taille });
    if (!altValide(a)) return setMessage({ ton: "erreur", texte: C.erreurs.alt });
    demarrer(async () => {
      try {
        const p = await preparerImage(f.type, f.size);
        if (!("ok" in p) || !p.url || !p.objet) return setMessage({ ton: "erreur", texte: "erreur" in p ? (C.erreurs[p.erreur] ?? C.erreurs.panne) : C.erreurs.panne });
        setMessage({ ton: "ok", texte: C.retours.envoiImage });
        const r = await fetch(p.url, { method: "PUT", headers: { "content-type": f.type, "x-upsert": "false" }, body: f });
        if (!r.ok) return setMessage({ ton: "erreur", texte: r.status === 413 ? C.erreurs.taille : C.erreurs.stockage });
        const fin = await finaliserImage(p.objet, a);
        if (!("ok" in fin) || !fin.image) return setMessage({ ton: "erreur", texte: "erreur" in fin ? (C.erreurs[fin.erreur] ?? C.erreurs.panne) : C.erreurs.panne });
        surImage(fin.image);
        if (fichier.current) fichier.current.value = "";
        setTexte("");
        setMessage({ ton: "ok", texte: C.retours.image });
        ctx.annoncer(C.retours.image);
      } catch {
        setMessage({ ton: "erreur", texte: C.erreurs.reseau });
      }
    });
  };
  return (
    <div className="ct-televerser" data-televerser={chemin}>
      <div className="ct-champ">
        <label htmlFor={id}>{C.image.fichier}</label>
        <input ref={fichier} id={id} type="file" accept={MIMES_IMAGE.join(",")} aria-describedby={`${id}-note`} />
        <p className="ct-aide" id={`${id}-note`}>
          {C.image.note}
        </p>
      </div>
      {alt === null && (
        <div className="ct-champ">
          <label htmlFor={`${id}-alt`}>{C.image.alt}</label>
          <input id={`${id}-alt`} type="text" value={texte} maxLength={300} onChange={(e) => setTexte(e.target.value)} />
        </div>
      )}
      <button type="button" className="bouton-2 bouton-petit" onClick={envoyer} disabled={occupe} aria-busy={occupe || undefined}>
        {C.boutons.televerser}
      </button>
      <p className="ct-message" role={message?.ton === "erreur" ? "alert" : "status"} data-ton={message?.ton}>
        {message?.texte ?? ""}
      </p>
    </div>
  );
}

function ImageObjet({ f, v, chemin, nom, pose, ctx }: { f: Extract<Forme, { k: "objet" }>; v: Record<string, Json>; chemin: string; nom: string; pose: Pose; ctx: Ctx }) {
  const src = typeof v.src === "string" ? v.src : "";
  const montrable = src !== "" && !valider(f.champs.src.f, src, "", { medias: ctx.medias }).length;
  const alt = typeof v.alt === "string" ? v.alt : null;
  return (
    <fieldset className="ct-image" id={idDe(chemin)} data-chemin={chemin}>
      <legend>{nom}</legend>
      <div className="ct-vignette" role="img" aria-label={montrable ? `${C.image.apercu} : ${alt ?? (typeof v.legende === "string" ? v.legende : nom)}` : C.image.sans} style={montrable ? { backgroundImage: `url("${src}")` } : undefined} />
      <div className="ct-champs">
        {Object.entries(f.champs).map(([c, ch]) =>
          c === "src" && ch.f.k === "texte" ? (
            <Texte key={c} f={{ ...ch.f, motif: undefined }} v={v[c]} chemin={`${chemin}.${c}`} nom={lib(c)} pose={(x) => pose({ ...v, [c]: x })} ctx={ctx} />
          ) : (
            <Noeud key={c} f={ch.f} v={v[c]} chemin={`${chemin}.${c}`} cle={c} pose={(x) => pose({ ...v, [c]: x })} ctx={ctx} />
          ),
        )}
      </div>
      <Erreur ctx={ctx} chemin={`${chemin}.src`} />
      <Televerser
        alt={"alt" in f.champs ? (alt ?? "") : "legende" in f.champs && typeof v.legende === "string" ? v.legende : null}
        ctx={ctx}
        chemin={chemin}
        surImage={(i) => pose({ ...v, src: i.src, ...("alt" in f.champs ? { alt: i.alt } : {}), ...("largeur" in f.champs ? { largeur: i.largeur } : {}), ...("hauteur" in f.champs ? { hauteur: i.hauteur } : {}) })}
      />
    </fieldset>
  );
}

function Liste({ f, v, chemin, nom, pose, ctx, racine = false }: { f: Extract<Forme, { k: "liste" }>; v: Json | undefined; chemin: string; nom: string; pose: Pose; ctx: Ctx; racine?: boolean }) {
  const l = Array.isArray(v) ? v : [];
  const [aRetirer, setARetirer] = useState<number | null>(null);
  const [variante, setVariante] = useState(0);
  const de = f.de;
  const simple = de !== null && ["texte", "nombre", "booleen", "choix", "paire", "nul"].includes(de.k) && !(de.k === "nul" && de.de.k === "objet");
  const deplacer = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= l.length) return;
    const n = [...l];
    [n[i], n[j]] = [n[j], n[i]];
    pose(n);
    ctx.annoncer(C.retours.deplace(resumeDe(l[i], i), j + 1, l.length));
    requestAnimationFrame(() => document.getElementById(`${idDe(chemin)}-${j}-${d < 0 ? "m" : "d"}`)?.focus());
  };
  const retirer = (i: number) => {
    pose(l.filter((_, j) => j !== i));
    setARetirer(null);
    ctx.annoncer(C.retours.retire(resumeDe(l[i], i)));
  };
  const ajouter = () => {
    if (!de) return;
    pose([...l, vide(de.k === "un" ? de.options[variante] : de) ?? null]);
    ctx.annoncer(C.retours.ajoute(l.length + 1));
  };
  const corps = (
    <div className="ct-liste" id={racine ? idDe(chemin) : undefined}>
      <ol>
        {l.map((x, i) => {
          const r = resumeDe(x, i);
          const ch = `${chemin}[${i}]`;
          return (
            <li key={i} className={simple ? "ct-element simple" : "ct-element"}>
              {de &&
                (simple ? (
                  <Noeud f={de} v={x} chemin={ch} cle={`${nom} · ${i + 1}`} pose={(y) => pose(l.map((z, j) => (j === i ? y : z)))} ctx={ctx} brut />
                ) : (
                  <Groupe titre={C.champ.element(i + 1, r)} chemin={ch} ctx={ctx}>
                    {() => <Noeud f={de} v={x} chemin={ch} cle={r} pose={(y) => pose(l.map((z, j) => (j === i ? y : z)))} ctx={ctx} dedans />}
                  </Groupe>
                ))}
              <div className="ct-ordre">
                <button type="button" className="ct-icone" id={`${idDe(chemin)}-${i}-m`} onClick={() => deplacer(i, -1)} disabled={i === 0} aria-label={C.boutons.monter(r)}>
                  <Picto nom="chevron" className="ic haut" />
                </button>
                <button type="button" className="ct-icone" id={`${idDe(chemin)}-${i}-d`} onClick={() => deplacer(i, 1)} disabled={i === l.length - 1} aria-label={C.boutons.descendre(r)}>
                  <Picto nom="chevron" className="ic" />
                </button>
                {!f.identite && (
                  <button type="button" className="ct-icone" onClick={() => setARetirer(i)} disabled={l.length <= f.min} aria-label={C.boutons.retirer(r)} aria-expanded={aRetirer === i}>
                    <Picto nom="fermer" className="ic" />
                  </button>
                )}
              </div>
              {aRetirer === i && (
                <div className="ct-confirmer" role="group" aria-label={C.boutons.retirer(r)}>
                  <button type="button" className="bouton-2 bouton-petit danger" onClick={() => retirer(i)} autoFocus>
                    {C.boutons.confirmerRetrait}
                  </button>
                  <button type="button" className="bouton-2 bouton-petit" onClick={() => setARetirer(null)}>
                    {C.boutons.garder}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {de && !f.identite && l.length < f.max && (
        <div className="ct-ajout">
          {de.k === "un" && (
            <div className="ct-champ">
              <label htmlFor={`${idDe(chemin)}-variante`}>{C.champ.variante}</label>
              <select id={`${idDe(chemin)}-variante`} value={variante} onChange={(e) => setVariante(Number(e.target.value))}>
                {de.options.map((o, j) => (
                  <option key={j} value={j}>
                    {nomVariante(o, de.options, j)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button type="button" className="bouton-2 bouton-petit" onClick={ajouter}>
            <Picto nom="plus" className="ic" />
            {C.boutons.ajouter}
          </button>
        </div>
      )}
      <Erreur ctx={ctx} chemin={chemin} />
    </div>
  );
  return racine ? corps : (
    <Groupe titre={nom} resume={C.champ.elements(l.length)} chemin={chemin} ctx={ctx}>
      {() => corps}
    </Groupe>
  );
}

function Dict({ f, v, chemin, nom, pose, ctx, racine = false }: { f: Extract<Forme, { k: "dict" }>; v: Json | undefined; chemin: string; nom: string; pose: Pose; ctx: Ctx; racine?: boolean }) {
  const o = estObjet(v) ? v : {};
  const [neuve, setNeuve] = useState("");
  const [aRetirer, setARetirer] = useState<string | null>(null);
  const idNeuve = `${idDe(chemin)}-neuve`;
  const neuveOk = /^[a-z0-9][a-z0-9-]{0,79}$/.test(neuve) && !(neuve in o);
  const corps = (
    <div className="ct-liste" id={racine ? idDe(chemin) : undefined}>
      <ul>
        {Object.entries(o).map(([k, x]) => (
          <li key={k} className="ct-element">
            <Groupe titre={k} chemin={`${chemin}{${k}}`} ctx={ctx}>
              {() => <Noeud f={f.de} v={x} chemin={`${chemin}{${k}}`} cle={k} pose={(y) => pose({ ...o, [k]: y })} ctx={ctx} dedans />}
            </Groupe>
            <div className="ct-ordre">
              <button type="button" className="ct-icone" onClick={() => setARetirer(k)} aria-label={C.boutons.retirer(k)} aria-expanded={aRetirer === k}>
                <Picto nom="fermer" className="ic" />
              </button>
            </div>
            {aRetirer === k && (
              <div className="ct-confirmer" role="group" aria-label={C.boutons.retirer(k)}>
                {ctx.adresses.has(k) && <p className="ct-alerte">{C.champ.adresseVerrouillee}</p>}
                <button
                  type="button"
                  className="bouton-2 bouton-petit danger"
                  autoFocus
                  onClick={() => {
                    pose(Object.fromEntries(Object.entries(o).filter(([c]) => c !== k)));
                    setARetirer(null);
                    ctx.annoncer(C.retours.retire(k));
                  }}
                >
                  {C.boutons.confirmerRetrait}
                </button>
                <button type="button" className="bouton-2 bouton-petit" onClick={() => setARetirer(null)}>
                  {C.boutons.garder}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {Object.keys(o).length < f.max && (
        <div className="ct-ajout">
          <div className="ct-champ">
            <label htmlFor={idNeuve}>{C.champ.nouvelleFiche}</label>
            <input id={idNeuve} type="text" value={neuve} maxLength={80} onChange={(e) => setNeuve(e.target.value.toLowerCase())} autoComplete="off" spellCheck={false} />
          </div>
          <button
            type="button"
            className="bouton-2 bouton-petit"
            disabled={!neuveOk}
            onClick={() => {
              pose({ ...o, [neuve]: vide(f.de) ?? null });
              ctx.annoncer(C.retours.ajoute(Object.keys(o).length + 1));
              setNeuve("");
            }}
          >
            <Picto nom="plus" className="ic" />
            {C.boutons.ajouterFiche}
          </button>
        </div>
      )}
      <Erreur ctx={ctx} chemin={chemin} />
    </div>
  );
  return racine ? corps : (
    <Groupe titre={nom} resume={C.champ.elements(Object.keys(o).length)} chemin={chemin} ctx={ctx}>
      {() => corps}
    </Groupe>
  );
}

/** Nom d'une variante : la valeur de son « type », sinon les champs qu'elle seule possède. */
function nomVariante(o: Forme, toutes: Forme[], j: number) {
  if (o.k === "objet") {
    const t = o.champs.type?.f;
    if (t?.k === "fixe" && typeof t.v === "string") return t.v;
    const propres = Object.keys(o.champs).filter((c) => !toutes.every((x) => x.k === "objet" && c in x.champs));
    if (propres.length) return propres.map(lib).join(" + ");
    return `${C.champ.variante} ${j + 1}`;
  }
  return o.k === "texte" ? lib("texte") : `${C.champ.variante} ${j + 1}`;
}
const indexVariante = (f: Extract<Forme, { k: "un" }>, v: Json | undefined, medias: string[]) => {
  const scores = f.options.map((o) => valider(o, v, "", { medias }).filter((e) => e.motif === "type" || e.motif === "inconnu" || e.motif === "manquant" || e.motif === "fixe").length);
  return scores.indexOf(Math.min(...scores));
};

/** Un champ de la forme, quel qu'il soit. `brut` : sans groupe autour (élément simple d'une liste) ; `dedans` : objet
 * déjà dans un groupe (élément de liste, fiche). */
function Noeud({ f, v, chemin, cle, pose, ctx, brut = false, dedans = false }: { f: Forme; v: Json | undefined; chemin: string; cle: string; pose: Pose; ctx: Ctx; brut?: boolean; dedans?: boolean }) {
  const nom = brut || dedans ? cle : lib(cle);
  switch (f.k) {
    case "code":
      return null;
    case "fixe":
      return v !== null && typeof v === "object" ? null : (
        <p className="ct-fixe" data-chemin={chemin}>
          <span>{nom}</span> <code>{v === null || v === undefined ? C.champ.vide : String(v)}</code> <small>{C.champ.fixe}</small>
        </p>
      );
    case "texte":
      return <Texte f={f} v={v} chemin={chemin} nom={nom} pose={pose} ctx={ctx} />;
    case "nombre":
    case "booleen":
    case "choix":
      return <Simple f={f} v={v} chemin={chemin} nom={nom} pose={pose} ctx={ctx} />;
    case "nul":
      return v === null || v === undefined ? (
        <div className="ct-nul" data-chemin={chemin}>
          <span className="ct-nom">{nom}</span>
          <span className="ct-aide">{C.champ.vide}</span>
          <button type="button" className="bouton-2 bouton-petit" onClick={() => pose(vide(f.de) ?? null)}>
            {C.boutons.renseigner(nom.toLowerCase())}
          </button>
        </div>
      ) : (
        <div className="ct-nul plein">
          <Noeud f={f.de} v={v} chemin={chemin} cle={cle} pose={pose} ctx={ctx} brut={brut} dedans={dedans} />
          <button type="button" className="ct-lien" onClick={() => pose(null)}>
            {C.boutons.vider(nom.toLowerCase())}
          </button>
        </div>
      );
    case "paire": {
      const l = Array.isArray(v) ? v : [];
      const noms = C.paires[cle];
      return (
        <fieldset className="ct-paire" id={idDe(chemin)} data-chemin={chemin}>
          <legend>{nom}</legend>
          {f.de.map((x, i) => (
            <Noeud key={i} f={x} v={l[i]} chemin={`${chemin}[${i}]`} cle={noms?.[i] ?? C.champ.partie(nom, i + 1)} pose={(y) => pose(f.de.map((_, j) => (j === i ? y : (l[j] ?? null))))} ctx={ctx} brut />
          ))}
          <Erreur ctx={ctx} chemin={chemin} />
        </fieldset>
      );
    }
    case "liste":
      return <Liste f={f} v={v} chemin={chemin} nom={nom} pose={pose} ctx={ctx} racine={chemin === ctx.racine} />;
    case "dict":
      return <Dict f={f} v={v} chemin={chemin} nom={nom} pose={pose} ctx={ctx} racine={chemin === ctx.racine} />;
    case "un": {
      const i = indexVariante(f, v, ctx.medias);
      return (
        <div className="ct-un" data-chemin={chemin}>
          <div className="ct-champ">
            <label htmlFor={`${idDe(chemin)}-forme`}>{`${C.champ.variante} · ${nom}`}</label>
            <select
              id={`${idDe(chemin)}-forme`}
              value={i}
              onChange={(e) => {
                const neuve = vide(f.options[Number(e.target.value)]) ?? null;
                // les champs communs aux deux formes gardent leur valeur
                pose(estObjet(neuve) && estObjet(v) ? { ...neuve, ...Object.fromEntries(Object.entries(v).filter(([c]) => c in neuve && c !== "type")) } : neuve);
              }}
            >
              {f.options.map((o, j) => (
                <option key={j} value={j}>
                  {nomVariante(o, f.options, j)}
                </option>
              ))}
            </select>
          </div>
          <Noeud f={f.options[i]} v={v} chemin={chemin} cle={cle} pose={pose} ctx={ctx} brut={brut} dedans={dedans} />
        </div>
      );
    }
    case "objet": {
      const o = estObjet(v) ? v : {};
      if (f.champs.src?.f.k === "texte" && f.champs.src.f.motif === "src") return <ImageObjet f={f} v={o} chemin={chemin} nom={nom} pose={pose} ctx={ctx} />;
      const champs = (
        <div className="ct-champs">
          {Object.entries(f.champs).map(([c, ch]) =>
            ch.opt && o[c] === undefined ? (
              <div key={c} className="ct-nul" data-chemin={`${chemin}.${c}`}>
                <span className="ct-nom">{lib(c)}</span>
                <span className="ct-aide">{C.champ.vide}</span>
                <button type="button" className="bouton-2 bouton-petit" onClick={() => pose({ ...o, [c]: vide(ch.f) ?? null })}>
                  {C.boutons.renseigner(lib(c).toLowerCase())}
                </button>
              </div>
            ) : (
              <div key={c} className="ct-facultatif">
                <Noeud f={ch.f} v={o[c]} chemin={`${chemin}.${c}`} cle={c} pose={(x) => pose({ ...o, [c]: x })} ctx={ctx} />
                {ch.opt && (
                  <button type="button" className="ct-lien" onClick={() => pose(Object.fromEntries(Object.entries(o).filter(([k]) => k !== c)))}>
                    {C.boutons.vider(lib(c).toLowerCase())}
                  </button>
                )}
              </div>
            ),
          )}
          <Erreur ctx={ctx} chemin={chemin} />
        </div>
      );
      if (dedans || chemin === ctx.racine) return champs;
      return (
        <Groupe titre={nom} chemin={chemin} ctx={ctx}>
          {() => champs}
        </Groupe>
      );
    }
  }
}

export function EditeurCollection(p: Props) {
  const uid = useId();
  const [v, setV] = useState<Json>(p.valeur);
  const [vu, setVu] = useState(p.version);
  const [montrer, setMontrer] = useState(false);
  const [etat, setEtat] = useState<Etat>(null);
  const [n, setN] = useState(0);
  const [annonce, setAnnonce] = useState("");
  const [diff, setDiff] = useState<ReturnType<typeof differences> | null>(null);
  const [occupe, demarrer] = useTransition();
  const panneau = useRef<HTMLHeadingElement>(null);
  // nouvelle version rendue par le serveur (enregistrement, restauration) : l'éditeur repart d'elle
  if (vu !== p.version) {
    setVu(p.version);
    setV(p.valeur);
    setMontrer(false);
    setDiff(null);
  }
  const ecartsLocaux = useMemo(() => valider(p.forme, v, p.cle, { medias: p.medias }), [p.forme, v, p.cle, p.medias]);
  const modifie = useMemo(() => JSON.stringify(v) !== JSON.stringify(p.valeur), [v, p.valeur]);
  const ctx: Ctx = {
    ecarts: new Map(montrer ? [...(etat?.ecarts ?? []), ...ecartsLocaux].map((e) => [e.chemin, e]) : []),
    adresses: new Set(p.adresses),
    medias: p.medias,
    annoncer: setAnnonce,
    racine: p.cle,
  };
  useEffect(() => {
    if (diff) panneau.current?.focus();
  }, [diff]);

  const lancer = (faire: () => Promise<RetourContenu>, reussite: (r: { version?: number }) => string, refaire?: "brouillon" | "publier", lien?: string) => {
    setEtat(null);
    setN((x) => x + 1);
    demarrer(async () => {
      try {
        const r = await faire();
        if ("ok" in r) {
          setEtat({ ton: "ok", texte: reussite(r), lien });
          setDiff(null);
        } else setEtat({ ton: "erreur", texte: C.erreurs[r.erreur] ?? C.erreurs.panne, ecarts: r.ecarts, adresses: r.adresses, refaire: r.erreur === "adresses" ? refaire : undefined });
      } catch {
        setEtat({ ton: "erreur", texte: C.erreurs.reseau });
      }
    });
  };
  const relu = () => {
    setMontrer(true);
    if (!ecartsLocaux.length) return true;
    setEtat({ ton: "erreur", texte: C.retours.aCorriger(ecartsLocaux.length), ecarts: ecartsLocaux });
    setN((x) => x + 1);
    return false;
  };
  const brouillon = (confirmer = false) => relu() && lancer(() => enregistrerBrouillon(p.cle, v, p.version, confirmer), (r) => C.retours.brouillon(r.version ?? 0), "brouillon");
  const publier = (confirmer = false) => relu() && lancer(() => publierContenu(p.cle, v, p.version, confirmer), (r) => C.retours.publie(r.version ?? 0), "publier");
  const soumettre = (e: FormEvent) => {
    e.preventDefault();
    brouillon();
  };
  const apercu = () => {
    if (modifie) {
      setEtat({ ton: "erreur", texte: C.retours.enregistrerAvant });
      setN((x) => x + 1);
      return;
    }
    // le lien s'ouvre une fois le mode aperçu posé sur ce navigateur (un onglet ouvert avant verrait la version publiée)
    lancer(ouvrirApercu, () => C.retours.apercu, undefined, p.page);
  };
  const resumeEcarts = etat?.ecarts?.slice(0, 12) ?? [];

  return (
    <section className="ct-editeur" aria-labelledby={`${uid}-t`} data-editeur={p.cle} data-version={p.version}>
      <header className="ct-tete">
        <h2 id={`${uid}-t`}>{p.titre}</h2>
        <p className="ct-etat" data-publie={p.etat.publie}>
          {p.etat.publie}
          {p.etat.brouillon && <span data-brouillon> {p.etat.brouillon}</span>}
          {modifie && <span data-modifie> {C.etat.modifie}</span>}
        </p>
        {p.verrouille && <p className="ct-aide">{C.verrouille}</p>}
        {p.protege && <p className="ct-aide">{C.protege}</p>}
      </header>

      {p.verrouille ? (
        <pre className="ct-lecture" tabIndex={0}>
          {JSON.stringify(p.valeur, null, 2)}
        </pre>
      ) : (
        <form className="ct-form" onSubmit={soumettre} noValidate aria-describedby={`${uid}-r`}>
          <Noeud f={p.forme} v={v} chemin={p.cle} cle={p.titre} pose={setV} ctx={ctx} dedans />
          <div className="ct-actions">
            <button type="submit" className="bouton" disabled={occupe} aria-busy={occupe || undefined} data-action="brouillon">
              {C.boutons.brouillon}
            </button>
            {p.peutPublier && (
              <button
                type="button"
                className="bouton-2"
                disabled={occupe}
                data-action="publier"
                onClick={() => {
                  if (relu()) setDiff(differences(p.publiee, v, p.cle));
                }}
              >
                {C.boutons.publier}
              </button>
            )}
            <button type="button" className="bouton-2" onClick={apercu} disabled={occupe} data-action="apercu">
              {C.boutons.apercu}
            </button>
            <button type="button" className="bouton-2" onClick={() => lancer(fermerApercu, () => C.retours.apercuFerme)} disabled={occupe}>
              {C.boutons.quitterApercu}
            </button>
            {modifie && (
              <button type="button" className="bouton-2" onClick={() => { setV(p.valeur); setMontrer(false); setEtat(null); }}>
                {C.boutons.annuler}
              </button>
            )}
            {p.aBrouillon && (
              <button type="button" className="bouton-2" disabled={occupe} onClick={() => lancer(() => abandonnerBrouillon(p.cle, p.version), () => C.retours.abandonne)} data-action="abandonner">
                {C.boutons.abandonner}
              </button>
            )}
          </div>
          <div className="ct-retour" id={`${uid}-r`} role={etat?.ton === "erreur" ? "alert" : "status"} data-ton={etat?.ton} data-envoi={n}>
            {etat && (
              <>
                <p>{etat.texte}</p>
                {etat.lien && (
                  <a className="bouton-2 bouton-petit" href={etat.lien} target="_blank" rel="noopener" data-lien-apercu>
                    {C.boutons.ouvrirApercu}
                  </a>
                )}
                {etat.adresses && etat.adresses.length > 0 && (
                  <ul>
                    {etat.adresses.map((a) => (
                      <li key={a}>
                        <code>{a}</code>
                      </li>
                    ))}
                  </ul>
                )}
                {resumeEcarts.length > 0 && (
                  <ul>
                    {resumeEcarts.map((e) => (
                      <li key={e.chemin}>
                        <a href={`#${idDe(e.chemin)}`}>{cheminLisible(e.chemin, p.cle)}</a> : {C.motifs[e.motif] ?? C.erreurs.champs}
                      </li>
                    ))}
                  </ul>
                )}
                {etat.refaire && (
                  <button type="button" className="bouton-2 bouton-petit danger" onClick={() => (etat.refaire === "publier" ? publier(true) : brouillon(true))} data-action="confirmer-adresses">
                    {etat.refaire === "publier" ? C.boutons.publierMalgre : C.boutons.malgre}
                  </button>
                )}
              </>
            )}
          </div>
        </form>
      )}

      {diff && (
        <section className="ct-publication" aria-labelledby={`${uid}-p`} data-publication>
          <h3 id={`${uid}-p`} ref={panneau} tabIndex={-1}>
            {C.publication.titre}
          </h3>
          {diff.length ? (
            <ul>
              {diff.slice(0, 40).map((d) => (
                <li key={d.chemin}>
                  <b>{cheminLisible(d.chemin, p.cle)}</b>
                  <span>
                    {C.publication.avant} : {resumeJson(d.avant)}
                  </span>
                  <span>
                    {C.publication.apres} : {resumeJson(d.apres)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>{C.retours.rien}</p>
          )}
          {diff.length > 40 && <p className="ct-aide">{C.publication.plus(diff.length - 40)}</p>}
          <div className="ct-actions">
            <button type="button" className="bouton" disabled={occupe} onClick={() => publier()} data-action="publier-maintenant">
              {C.boutons.publierMaintenant}
            </button>
            <button type="button" className="bouton-2" onClick={() => setDiff(null)}>
              {C.boutons.revenir}
            </button>
          </div>
        </section>
      )}

      <section className="ct-historique" aria-labelledby={`${uid}-h`}>
        <h3 id={`${uid}-h`}>{C.historique.titre}</h3>
        <p className="ct-aide">{C.historique.note}</p>
        {p.versions.length ? (
          <ol>
            {p.versions.map((x) => (
              <li key={x.id} data-version-id={x.id}>
                <span>{x.texte}</span>
                {!p.verrouille && (
                  <button type="button" className="bouton-2 bouton-petit" disabled={occupe} aria-label={`${C.boutons.restaurer} : ${x.texte}`} onClick={() => lancer(() => restaurerVersion(p.cle, x.id, p.version), (r) => C.retours.restaure(r.version ?? 0))}>
                    {C.boutons.restaurer}
                  </button>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p>{C.historique.vide}</p>
        )}
      </section>
      <p className="invisible" aria-live="polite">
        {annonce}
      </p>
    </section>
  );
}
