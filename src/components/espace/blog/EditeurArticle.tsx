"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type KeyboardEvent, useId, useMemo, useRef, useState, useTransition } from "react";
import { espace as T } from "@/content/espace";
import { blog as B } from "@/content/espace-blog";
import { altValide, IMAGE_MAX, MIMES_IMAGE } from "@/lib/contenu-regles";
import { changerEtat, enregistrerArticle, proposerTraduction, restaurerVersion, type RetourBlog, supprimerArticle, traduireArticle } from "@/lib/serveur/blog/actions";
import { type ActionEtat, type ChampBlog, type Couverture, type EcartCorps, ecartsCorps, type EtatBlog, type LangueBlog, LIMITES_BLOG, lireChamps, rendreMarkdown, slugifier, tempsLecture } from "@/lib/serveur/blog/regles";
import { finaliserImage, preparerImage } from "@/lib/serveur/contenu/actions";
import { Rendu } from "./Rendu";

// Éditeur d'un article du blog : titre, slug, chapô, corps markdown (barre de mise en forme, raccourcis Ctrl B et Ctrl I,
// aperçu en direct par le même rendu que le site, regles.ts), couverture téléversée (stockage du contenu du site, alt
// obligatoire), catégorie, mots-clés, SEO avec compteurs. Puis l'état (relecture, publication, retrait), l'historique avec
// « Restaurer », les versions dans les autres langues et l'aide à la traduction (proposition à relire, jamais enregistrée
// seule). La même relecture que le serveur marque les champs (aria-invalid) ; le serveur seul décide. Retours en aria-live.

export type ArticleEditeur = {
  id: string;
  version: number;
  langue: LangueBlog;
  etat: EtatBlog;
  slug: string;
  titre: string;
  chapo: string;
  corps: string;
  couverture: Couverture | null;
  categorie: string;
  motsCles: string[];
  seoTitre: string;
  seoDescription: string;
  slugFige: boolean;
  traductionDe: string | null;
};
type Props = {
  article: ArticleEditeur;
  meta: string;
  publieLe: string | null;
  ecriture: boolean;
  actions: ActionEtat[];
  admin: boolean;
  versions: { id: number; texte: string }[];
  famille: { id: string; langue: LangueBlog; etat: EtatBlog; titre: string; original: boolean }[];
  libres: LangueBlog[];
  medias: string[];
  aide: boolean;
  base: string;
};
type Valeurs = { titre: string; slug: string; chapo: string; corps: string; couverture: Couverture | null; categorie: string; motsCles: string; seoTitre: string; seoDescription: string };
const OUTILS = ["h2", "h3", "gras", "italique", "liste", "numeros", "citation", "lien"] as const;
type Etat = { ton: "ok" | "erreur"; texte: string; champs?: ChampBlog[]; ecarts?: EcartCorps[]; lien?: string } | null;

const valeursDe = (a: ArticleEditeur): Valeurs => ({ titre: a.titre, slug: a.slug, chapo: a.chapo, corps: a.corps, couverture: a.couverture, categorie: a.categorie, motsCles: a.motsCles.join(", "), seoTitre: a.seoTitre, seoDescription: a.seoDescription });
const mots = (t: string) => t.split(",").map((m) => m.trim()).filter(Boolean);
const envoi = (v: Valeurs) => ({ titre: v.titre, slug: v.slug, chapo: v.chapo, corps: v.corps, couverture: v.couverture, categorie: v.categorie, motsCles: mots(v.motsCles), seoTitre: v.seoTitre, seoDescription: v.seoDescription });

/** Téléverse une image (dépôt signé, conversion WebP par le serveur) ; rend l'image ou le texte de l'erreur. */
async function televerser(f: File | undefined, alt: string): Promise<{ src: string; alt: string } | string> {
  if (!f) return B.erreurs.fichier;
  if (!(MIMES_IMAGE as readonly string[]).includes(f.type)) return B.erreurs.type;
  if (f.size > IMAGE_MAX) return B.erreurs.taille;
  if (!altValide(alt)) return B.erreurs.alt;
  try {
    const p = await preparerImage(f.type, f.size);
    if (!("ok" in p) || !p.url || !p.objet) return "erreur" in p && p.erreur === "refuse" ? B.erreurs.refuse : B.erreurs.stockage;
    const r = await fetch(p.url, { method: "PUT", headers: { "content-type": f.type, "x-upsert": "false" }, body: f });
    if (!r.ok) return r.status === 413 ? B.erreurs.taille : B.erreurs.stockage;
    const fin = await finaliserImage(p.objet, alt);
    if (!("ok" in fin) || !fin.image) return "erreur" in fin && fin.erreur === "alt" ? B.erreurs.alt : B.erreurs.stockage;
    return { src: fin.image.src, alt: fin.image.alt };
  } catch {
    return B.erreurs.reseau;
  }
}

function Compteur({ id, n, max }: { id: string; n: number; max: number }) {
  return (
    <p className="bl-compte" id={id} data-trop={n > max || undefined}>
      {B.editeur.compte(n, max)}
    </p>
  );
}

/** Champ d'une ligne (ou zone de texte) avec son compteur et son aide. */
function Champ({ id, nom, valeur, max, pose, invalide, aide, zone, lecture, attrs }: { id: string; nom: string; valeur: string; max: number; pose: (v: string) => void; invalide: boolean; aide?: string; zone?: boolean; lecture?: boolean; attrs?: Record<string, string> }) {
  const decrit = [`${id}-n`, ...(aide ? [`${id}-a`] : [])].join(" ");
  return (
    <div className="bl-champ" {...attrs}>
      <label htmlFor={id}>{nom}</label>
      {zone ? (
        <textarea id={id} value={valeur} onChange={(e) => pose(e.target.value)} aria-invalid={invalide || undefined} aria-describedby={decrit} rows={3} readOnly={lecture} />
      ) : (
        <input id={id} type="text" value={valeur} onChange={(e) => pose(e.target.value)} aria-invalid={invalide || undefined} aria-describedby={decrit} readOnly={lecture} />
      )}
      <Compteur id={`${id}-n`} n={valeur.length} max={max} />
      {aide && (
        <p className="bl-aide" id={`${id}-a`}>
          {aide}
        </p>
      )}
    </div>
  );
}

export function EditeurArticle(p: Props) {
  const uid = useId();
  const router = useRouter();
  const a = p.article;
  const [v, setV] = useState<Valeurs>(() => valeursDe(a));
  const [vu, setVu] = useState(a.version);
  const [montrer, setMontrer] = useState(false);
  const [etat, setEtat] = useState<Etat>(null);
  const [n, setN] = useState(0);
  const [supprimer, setSupprimer] = useState(false);
  const [panneauImage, setPanneauImage] = useState(false);
  const [image, setImage] = useState({ alt: "", message: "" });
  const [couv, setCouv] = useState({ alt: "", message: "" });
  const [cible, setCible] = useState<string>(p.libres[0] ?? "");
  const [proposition, setProposition] = useState<{ titre: string; chapo: string; corps: string } | null>(null);
  const [annonce, setAnnonce] = useState("");
  const [occupe, demarrer] = useTransition();
  const corpsRef = useRef<HTMLTextAreaElement>(null);
  const curseur = useRef<number | null>(null);
  const fichierImage = useRef<HTMLInputElement>(null);
  const fichierCouv = useRef<HTMLInputElement>(null);

  // nouvelle version rendue par le serveur (enregistrement, état, restauration) : l'éditeur repart d'elle
  if (vu !== a.version) {
    setVu(a.version);
    setV(valeursDe(a));
    setMontrer(false);
    setProposition(null);
  }
  const poser = <K extends keyof Valeurs>(k: K, x: Valeurs[K]) => setV((o) => ({ ...o, [k]: x }));
  const lu = useMemo(() => lireChamps(envoi(v), { medias: p.medias }), [v, p.medias]);
  const invalides = new Set<ChampBlog>(montrer && !lu.ok ? lu.champs : (etat?.champs ?? []));
  const ecarts = useMemo(() => ecartsCorps(v.corps, { medias: p.medias }), [v.corps, p.medias]);
  const blocs = useMemo(() => rendreMarkdown(v.corps, { medias: p.medias }), [v.corps, p.medias]);
  const minutes = useMemo(() => tempsLecture(v.corps), [v.corps]);
  const modifie = JSON.stringify(v) !== JSON.stringify(valeursDe(a));
  const ids = (c: string) => `${uid}-${c}`;

  const lancer = (faire: () => Promise<RetourBlog>, reussite: (r: { id?: string; version?: number }) => string, apres?: (r: { id?: string }) => void) => {
    setEtat(null);
    setN((x) => x + 1);
    demarrer(async () => {
      try {
        const r = await faire();
        if ("ok" in r) {
          setEtat({ ton: "ok", texte: reussite(r) });
          apres?.(r);
        } else setEtat({ ton: "erreur", texte: B.erreurs[r.erreur] ?? B.erreurs.panne, champs: r.champs, ecarts: r.ecarts, lien: r.erreur === "existe" && r.id ? `${p.base}?id=${r.id}` : undefined });
      } catch {
        setEtat({ ton: "erreur", texte: B.erreurs.reseau });
      }
    });
  };

  const enregistrer = (e: FormEvent) => {
    e.preventDefault();
    setMontrer(true);
    if (!lu.ok) {
      setEtat({ ton: "erreur", texte: B.retours.aCorriger(lu.champs.length), champs: lu.champs, ecarts: lu.ecarts });
      setN((x) => x + 1);
      return;
    }
    lancer(() => enregistrerArticle({ id: a.id, version: a.version, champs: envoi(v) }), (r) => B.retours.enregistre(r.version ?? 0));
  };

  // ---------- barre de mise en forme ----------
  const appliquer = (f: (s: string, debut: number, fin: number) => { texte: string; debut: number; fin: number }) => {
    const t = corpsRef.current;
    if (!t) return;
    const r = f(v.corps, t.selectionStart, t.selectionEnd);
    poser("corps", r.texte);
    requestAnimationFrame(() => {
      t.focus();
      t.setSelectionRange(r.debut, r.fin);
    });
  };
  const entourer = (marque: string, defaut: string) =>
    appliquer((s, d, f) => {
      const sel = s.slice(d, f) || defaut;
      return { texte: s.slice(0, d) + marque + sel + marque + s.slice(f), debut: d + marque.length, fin: d + marque.length + sel.length };
    });
  const prefixer = (prefixe: (i: number) => string) =>
    appliquer((s, d, f) => {
      const debut = s.lastIndexOf("\n", d - 1) + 1;
      const finLigne = s.indexOf("\n", f);
      const fin = finLigne === -1 ? s.length : finLigne;
      const bloc = s
        .slice(debut, fin)
        .split("\n")
        .map((l, i) => prefixe(i) + l.replace(/^(#{1,6}\s+|[-*+]\s+|\d{1,3}[.)]\s+|>\s?)/, ""))
        .join("\n");
      return { texte: s.slice(0, debut) + bloc + s.slice(fin), debut, fin: debut + bloc.length };
    });
  const lien = () =>
    appliquer((s, d, f) => {
      const sel = s.slice(d, f) || B.outils.texteLien;
      const x = `[${sel}](https://)`;
      const debut = d + sel.length + 3;
      return { texte: s.slice(0, d) + x + s.slice(f), debut, fin: debut + 8 };
    });
  const touches = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "b") {
      e.preventDefault();
      entourer("**", B.outils.texteGras);
    } else if (k === "i") {
      e.preventDefault();
      entourer("*", B.outils.texteItalique);
    }
  };
  const outil = (k: (typeof OUTILS)[number]) => {
    if (k === "h2") prefixer(() => "## ");
    else if (k === "h3") prefixer(() => "### ");
    else if (k === "gras") entourer("**", B.outils.texteGras);
    else if (k === "italique") entourer("*", B.outils.texteItalique);
    else if (k === "liste") prefixer(() => "- ");
    else if (k === "numeros") prefixer((i) => `${i + 1}. `);
    else if (k === "citation") prefixer(() => "> ");
    else lien();
  };

  const insererImage = () => {
    const alt = image.alt.trim();
    setImage((o) => ({ ...o, message: B.image.envoi }));
    demarrer(async () => {
      const r = await televerser(fichierImage.current?.files?.[0], alt);
      if (typeof r === "string") return setImage((o) => ({ ...o, message: r }));
      const pos = curseur.current ?? v.corps.length;
      const ligne = `\n\n![${r.alt.replace(/[[\]]/g, "")}](${r.src})\n\n`;
      setV((o) => ({ ...o, corps: (o.corps.slice(0, pos) + ligne + o.corps.slice(pos)).replace(/^\n+/, "") }));
      if (fichierImage.current) fichierImage.current.value = "";
      setImage({ alt: "", message: "" });
      setPanneauImage(false);
      setAnnonce(B.image.insere);
      requestAnimationFrame(() => corpsRef.current?.focus());
    });
  };
  const poserCouverture = () => {
    const alt = couv.alt.trim();
    setCouv((o) => ({ ...o, message: B.image.envoi }));
    demarrer(async () => {
      const r = await televerser(fichierCouv.current?.files?.[0], alt);
      if (typeof r === "string") return setCouv((o) => ({ ...o, message: r }));
      poser("couverture", r);
      if (fichierCouv.current) fichierCouv.current.value = "";
      setCouv({ alt: "", message: B.image.pret });
      setAnnonce(B.image.pret);
    });
  };

  const aider = () =>
    demarrer(async () => {
      setEtat(null);
      setN((x) => x + 1);
      try {
        const r = await proposerTraduction({ id: a.id });
        if ("ok" in r) setProposition({ titre: r.titre, chapo: r.chapo, corps: r.corps });
        else setEtat({ ton: "erreur", texte: B.erreurs[r.erreur] ?? B.erreurs.panne });
      } catch {
        setEtat({ ton: "erreur", texte: B.erreurs.reseau });
      }
    });

  const resumeChamps = etat?.champs ?? [];
  const resumeEcarts = (etat?.ecarts ?? (montrer ? ecarts : [])).slice(0, 12);
  const ecrit = p.ecriture;

  return (
    <section className="bl-editeur" aria-labelledby={ids("t")} data-article={a.id} data-version={a.version} data-etat={a.etat}>
      <header className="bl-tete">
        <p>
          <Link href={p.base} className="bl-retour">
            {B.retourListe}
          </Link>
        </p>
        <h2 id={ids("t")}>{a.titre}</h2>
        <p className="bl-etat">
          <span className="bl-pastille" data-etat={a.etat}>
            {B.etats[a.etat]}
          </span>{" "}
          <span>{T.langues[a.langue] ?? a.langue}</span>
          {a.traductionDe && <span> · {B.liste.traduction}</span>}
        </p>
        <p className="bl-aide">{p.meta}</p>
        {p.publieLe && <p className="bl-aide">{B.editeur.publieLe(p.publieLe)}</p>}
        {!ecrit && <p className="bl-aide">{B.editeur.lecture}</p>}
        {modifie && (
          <p className="bl-alerte" data-modifie>
            {B.editeur.modifie}
          </p>
        )}
      </header>

      <form className="bl-form" onSubmit={enregistrer} noValidate aria-describedby={ids("r")}>
        <fieldset className="bl-groupe">
          <legend>{B.editeur.texte}</legend>
          <Champ id={ids("titre")} nom={B.editeur.titre} valeur={v.titre} max={LIMITES_BLOG.titre} pose={(x) => poser("titre", x)} invalide={invalides.has("titre")} lecture={!ecrit} attrs={{ "data-champ": "titre" }} />
          <div className="bl-champ" data-champ="slug">
            <label htmlFor={ids("slug")}>{B.editeur.slug}</label>
            <div className="bl-rang">
              <input id={ids("slug")} type="text" value={v.slug} onChange={(e) => poser("slug", e.target.value)} readOnly={!ecrit || a.slugFige} aria-invalid={invalides.has("slug") || undefined} aria-describedby={`${ids("slug")}-n ${ids("slug")}-a`} spellCheck={false} autoCapitalize="none" />
              {ecrit && !a.slugFige && (
                <button type="button" className="bouton-2 bouton-petit" onClick={() => poser("slug", slugifier(v.titre))}>
                  {B.editeur.slugDuTitre}
                </button>
              )}
            </div>
            <Compteur id={`${ids("slug")}-n`} n={v.slug.length} max={LIMITES_BLOG.slug} />
            <p className="bl-aide" id={`${ids("slug")}-a`}>
              {a.slugFige ? B.editeur.slugFige : B.editeur.slugAide}
            </p>
          </div>
          <Champ id={ids("chapo")} nom={B.editeur.chapo} valeur={v.chapo} max={LIMITES_BLOG.chapo} pose={(x) => poser("chapo", x)} invalide={invalides.has("chapo")} aide={B.editeur.chapoAide} zone lecture={!ecrit} attrs={{ "data-champ": "chapo" }} />

          <div className="bl-redaction">
            <div className="bl-champ" data-champ="corps">
              <label htmlFor={ids("corps")}>{B.editeur.corps}</label>
              {ecrit && (
                <div className="bl-outils" role="toolbar" aria-label={B.editeur.outils} aria-controls={ids("corps")}>
                  {OUTILS.map((k) => (
                    <button key={k} type="button" className="bouton-2 bouton-petit" onClick={() => outil(k)}>
                      {B.outils[k]}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="bouton-2 bouton-petit"
                    aria-expanded={panneauImage}
                    aria-controls={ids("img")}
                    onClick={() => {
                      curseur.current = corpsRef.current?.selectionEnd ?? null;
                      setPanneauImage((x) => !x);
                    }}
                  >
                    {B.outils.image}
                  </button>
                </div>
              )}
              {panneauImage && (
                <div className="bl-televerser" id={ids("img")}>
                  <div className="bl-champ">
                    <label htmlFor={ids("img-f")}>{B.image.fichier}</label>
                    <input ref={fichierImage} id={ids("img-f")} type="file" accept={MIMES_IMAGE.join(",")} />
                  </div>
                  <div className="bl-champ">
                    <label htmlFor={ids("img-a")}>{B.image.alt}</label>
                    <input id={ids("img-a")} type="text" value={image.alt} maxLength={LIMITES_BLOG.alt} onChange={(e) => setImage((o) => ({ ...o, alt: e.target.value }))} />
                  </div>
                  <button type="button" className="bouton-2 bouton-petit" onClick={insererImage} disabled={occupe} aria-busy={occupe || undefined}>
                    {B.image.inserer}
                  </button>
                  <button type="button" className="bl-lien" onClick={() => setPanneauImage(false)}>
                    {B.image.fermer}
                  </button>
                  <p className="bl-message" role="status">
                    {image.message}
                  </p>
                </div>
              )}
              <textarea
                ref={corpsRef}
                id={ids("corps")}
                className="bl-corps"
                value={v.corps}
                onChange={(e) => poser("corps", e.target.value)}
                onKeyDown={touches}
                readOnly={!ecrit}
                aria-invalid={invalides.has("corps") || undefined}
                aria-describedby={`${ids("corps")}-n ${ids("corps")}-a${ecarts.length ? ` ${ids("corps")}-e` : ""}`}
                rows={18}
                spellCheck
              />
              <Compteur id={`${ids("corps")}-n`} n={v.corps.length} max={LIMITES_BLOG.corps} />
              <p className="bl-aide" id={`${ids("corps")}-a`}>
                {B.editeur.corpsAide}
              </p>
              {ecarts.length > 0 && (
                <ul className="bl-erreurs" id={`${ids("corps")}-e`}>
                  {ecarts.slice(0, 12).map((x, i) => (
                    <li key={i}>
                      {B.ligne(x.ligne)} : {B.motifs[x.motif]}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <section className="bl-apercu" aria-labelledby={ids("ap")} data-apercu>
              <h3 id={ids("ap")}>{B.editeur.apercu}</h3>
              <p className="bl-aide">{B.editeur.lectureMinutes(minutes)}</p>
              <div className="bl-article">{blocs.length ? <Rendu blocs={blocs} nouvelOnglet /> : <p className="bl-aide">{B.editeur.apercuVide}</p>}</div>
            </section>
          </div>
        </fieldset>

        <fieldset className="bl-groupe" data-champ="couverture">
          <legend>{B.editeur.couverture}</legend>
          {v.couverture ? (
            <div className="bl-couverture">
              <div className="bl-vignette" role="img" aria-label={v.couverture.alt} style={{ backgroundImage: `url("${v.couverture.src}")` }} />
              <div className="bl-champ">
                <label htmlFor={ids("calt")}>{B.editeur.alt}</label>
                <input id={ids("calt")} type="text" value={v.couverture.alt} maxLength={LIMITES_BLOG.alt} readOnly={!ecrit} onChange={(e) => poser("couverture", { src: v.couverture?.src ?? "", alt: e.target.value })} aria-invalid={invalides.has("alt") || invalides.has("couverture") || undefined} aria-describedby={ids("calt-a")} />
                <p className="bl-aide" id={ids("calt-a")}>
                  {B.editeur.altAide}
                </p>
                {ecrit && (
                  <button type="button" className="bl-lien" onClick={() => poser("couverture", null)}>
                    {B.editeur.retirerCouverture}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="bl-aide">{B.editeur.sansCouverture}</p>
          )}
          {ecrit && (
            <div className="bl-televerser">
              <div className="bl-champ">
                <label htmlFor={ids("cf")}>{B.image.fichier}</label>
                <input ref={fichierCouv} id={ids("cf")} type="file" accept={MIMES_IMAGE.join(",")} />
              </div>
              <div className="bl-champ">
                <label htmlFor={ids("ca")}>{B.image.alt}</label>
                <input id={ids("ca")} type="text" value={couv.alt} maxLength={LIMITES_BLOG.alt} onChange={(e) => setCouv((o) => ({ ...o, alt: e.target.value }))} />
              </div>
              <button type="button" className="bouton-2 bouton-petit" onClick={poserCouverture} disabled={occupe} aria-busy={occupe || undefined}>
                {B.image.televerser}
              </button>
              <p className="bl-message" role="status">
                {couv.message}
              </p>
            </div>
          )}
        </fieldset>

        <fieldset className="bl-groupe bl-deux">
          <legend>{B.editeur.classement}</legend>
          <Champ id={ids("cat")} nom={B.editeur.categorie} valeur={v.categorie} max={LIMITES_BLOG.categorie} pose={(x) => poser("categorie", x)} invalide={invalides.has("categorie")} aide={B.editeur.categorieAide} lecture={!ecrit} />
          <div className="bl-champ">
            <label htmlFor={ids("mc")}>{B.editeur.motsCles}</label>
            <input id={ids("mc")} type="text" value={v.motsCles} onChange={(e) => poser("motsCles", e.target.value)} readOnly={!ecrit} aria-invalid={invalides.has("motsCles") || undefined} aria-describedby={ids("mc-a")} />
            <p className="bl-compte" id={ids("mc-a")} data-trop={mots(v.motsCles).length > LIMITES_BLOG.motsCles || undefined}>
              {B.editeur.motsClesAide(mots(v.motsCles).length)}
            </p>
          </div>
        </fieldset>

        <fieldset className="bl-groupe bl-deux">
          <legend>{B.editeur.seo}</legend>
          <Champ id={ids("st")} nom={B.editeur.seoTitre} valeur={v.seoTitre} max={LIMITES_BLOG.seoTitre} pose={(x) => poser("seoTitre", x)} invalide={invalides.has("seoTitre")} aide={B.editeur.seoAide} lecture={!ecrit} />
          <Champ id={ids("sd")} nom={B.editeur.seoDescription} valeur={v.seoDescription} max={LIMITES_BLOG.seoDescription} pose={(x) => poser("seoDescription", x)} invalide={invalides.has("seoDescription")} zone lecture={!ecrit} />
        </fieldset>

        {p.aide && ecrit && (
          <section className="bl-groupe" aria-labelledby={ids("ai")} data-aide-traduction>
            <h3 id={ids("ai")}>{B.aide.titre}</h3>
            <p className="bl-aide">{B.aide.note}</p>
            <button type="button" className="bouton-2 bouton-petit" onClick={aider} disabled={occupe} aria-busy={occupe || undefined}>
              {occupe ? B.aide.attente : B.aide.proposer}
            </button>
            {proposition && (
              <section className="bl-proposition" aria-label={B.aide.proposition} data-proposition>
                <p>
                  <strong>{proposition.titre}</strong>
                </p>
                <p>{proposition.chapo}</p>
                <div className="bl-article">
                  <Rendu blocs={rendreMarkdown(proposition.corps, { medias: p.medias })} nouvelOnglet />
                </div>
                <div className="bl-rang">
                  <button
                    type="button"
                    className="bouton-2 bouton-petit"
                    onClick={() => {
                      setV((o) => ({ ...o, titre: proposition.titre, chapo: proposition.chapo, corps: proposition.corps }));
                      setProposition(null);
                      setAnnonce(B.aide.utilise);
                    }}
                  >
                    {B.aide.utiliser}
                  </button>
                  <button type="button" className="bl-lien" onClick={() => setProposition(null)}>
                    {B.aide.ignorer}
                  </button>
                </div>
              </section>
            )}
          </section>
        )}

        <div className="bl-actions">
          {ecrit && (
            <button type="submit" className="bouton" disabled={occupe} aria-busy={occupe || undefined} data-action="enregistrer">
              {B.boutons.enregistrer}
            </button>
          )}
          {p.actions.map((x) => (
            <button
              key={x}
              type="button"
              className={x === "publier" ? "bouton" : "bouton-2"}
              disabled={occupe || modifie}
              aria-describedby={modifie ? ids("avant") : undefined}
              data-action={x}
              onClick={() => lancer(() => changerEtat({ id: a.id, version: a.version, action: x }), () => B.retours.etat[x])}
            >
              {B.actions[x]}
            </button>
          ))}
          {modifie && (
            <>
              <button type="button" className="bouton-2" onClick={() => { setV(valeursDe(a)); setMontrer(false); setEtat(null); }}>
                {B.boutons.annuler}
              </button>
              {p.actions.length > 0 && (
                <p className="bl-aide" id={ids("avant")}>
                  {B.enregistrerAvant}
                </p>
              )}
            </>
          )}
          {p.admin && !supprimer && (
            <button type="button" className="bouton-2 danger" onClick={() => setSupprimer(true)} data-action="supprimer">
              {B.boutons.supprimer}
            </button>
          )}
          {p.admin && supprimer && (
            <div className="bl-confirmer" role="group" aria-labelledby={ids("sup")}>
              <p id={ids("sup")}>{B.suppression}</p>
              <button type="button" className="bouton-2 danger" disabled={occupe} data-action="supprimer-definitivement" onClick={() => lancer(() => supprimerArticle({ id: a.id }), () => B.retours.supprime, () => router.push(p.base))}>
                {B.boutons.confirmerSuppression}
              </button>
              <button type="button" className="bouton-2" onClick={() => setSupprimer(false)}>
                {B.boutons.garder}
              </button>
            </div>
          )}
        </div>
        <div className="bl-retour-action" id={ids("r")} role={etat?.ton === "erreur" ? "alert" : "status"} data-ton={etat?.ton} data-envoi={n}>
          {etat && (
            <>
              <p>{etat.texte}</p>
              {etat.lien && (
                <p>
                  {B.langues.existe} <Link href={etat.lien}>{B.langues.ouvrir}</Link>
                </p>
              )}
              {resumeChamps.length > 0 && (
                <ul>
                  {resumeChamps.map((c) => (
                    <li key={c}>
                      <a href={`#${ids(c === "alt" ? "calt" : c === "couverture" ? "cf" : c === "motsCles" ? "mc" : c === "categorie" ? "cat" : c === "seoTitre" ? "st" : c === "seoDescription" ? "sd" : c)}`}>{B.champs[c]}</a>
                    </li>
                  ))}
                </ul>
              )}
              {etat.ton === "erreur" && resumeEcarts.length > 0 && (
                <ul>
                  {resumeEcarts.map((x, i) => (
                    <li key={i}>
                      {B.ligne(x.ligne)} : {B.motifs[x.motif]}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </form>

      <section className="bl-groupe" aria-labelledby={ids("la")} data-langues>
        <h3 id={ids("la")}>{B.langues.titre}</h3>
        {p.famille.length > 1 && (
          <>
            <p className="bl-aide">{B.langues.versions}</p>
            <ul className="bl-famille">
              {p.famille.map((x) => (
                <li key={x.id}>
                  {x.id === a.id ? (
                    <span aria-current="page">{T.langues[x.langue] ?? x.langue}</span>
                  ) : (
                    <Link href={`${p.base}?id=${x.id}`}>{T.langues[x.langue] ?? x.langue}</Link>
                  )}{" "}
                  <small>
                    {B.etats[x.etat]}
                    {x.original ? ` · ${B.langues.original}` : ""}
                  </small>
                </li>
              ))}
            </ul>
          </>
        )}
        {p.libres.length ? (
          <div className="bl-rang">
            <div className="bl-champ">
              <label htmlFor={ids("lc")}>{B.langues.langueCible}</label>
              <select id={ids("lc")} value={cible} onChange={(e) => setCible(e.target.value)} aria-describedby={ids("lc-a")}>
                {p.libres.map((l) => (
                  <option key={l} value={l}>
                    {T.langues[l] ?? l}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="bouton-2" disabled={occupe || !cible} data-action="traduire" onClick={() => lancer(() => traduireArticle({ id: a.id, langue: cible }), () => B.retours.traduction, (r) => r.id && router.push(`${p.base}?id=${r.id}`))}>
              {B.langues.creer}
            </button>
            <p className="bl-aide" id={ids("lc-a")}>
              {B.langues.note}
            </p>
          </div>
        ) : (
          <p className="bl-aide">{B.langues.toutes}</p>
        )}
      </section>

      <section className="bl-groupe bl-historique" aria-labelledby={ids("h")}>
        <h3 id={ids("h")}>{B.historique.titre}</h3>
        <p className="bl-aide">{B.historique.note}</p>
        {p.versions.length ? (
          <ol>
            {p.versions.map((x) => (
              <li key={x.id} data-version-id={x.id}>
                <span>{x.texte}</span>
                {ecrit && (
                  <button type="button" className="bouton-2 bouton-petit" disabled={occupe} aria-label={`${B.boutons.restaurer} : ${x.texte}`} data-action="restaurer" onClick={() => lancer(() => restaurerVersion({ id: a.id, version: a.version, versionId: x.id }), (r) => B.retours.restaure(r.version ?? 0))}>
                    {B.boutons.restaurer}
                  </button>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p>{B.historique.vide}</p>
        )}
      </section>
      <p className="invisible" aria-live="polite">
        {annonce}
      </p>
    </section>
  );
}
