"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import { boutiqueAdmin as B } from "@/content/espace-boutique";
import { enregistrerCategorie, enregistrerMatiere, enregistrerProduit, enregistrerZone, publierProduit } from "@/lib/serveur/equipe/boutique/actions";
import { COULEURS, type CatalogueAdmin, type CategorieAdmin, type MatiereAdmin, type PhotoAdmin, type ProduitAdmin, type RetourBoutique, type ZoneAdmin } from "@/lib/serveur/equipe/boutique/regles";
import { Photos } from "./Photos";
import { CHAMPS_TRADUITS, LANGUES_CATALOGUE, type TexteCatalogue, type TraductionsCatalogue, type TypeCatalogue } from "@/lib/boutique-traductions";

const valeur = (fd: FormData, cle: string) => String(fd.get(cle) ?? "").trim();
const nombre = (fd: FormData, cle: string) => valeur(fd, cle) === "" ? null : Number(valeur(fd, cle));
type Champ = keyof typeof B.champs;

function traductionsSaisies(fd: FormData, type: TypeCatalogue, photos: PhotoAdmin[] = []): TraductionsCatalogue {
  return Object.fromEntries(LANGUES_CATALOGUE.map((langue) => [langue, {
    ...Object.fromEntries(Object.keys(CHAMPS_TRADUITS[type]).map((cle) => [cle, valeur(fd, `traduction.${langue}.${cle}`)])),
    ...(type === "matieres" ? {} : { photos: [...new Map(photos.map((p) => [p.src, p])).values()].map((p, i) => ({ src: p.src, alt: valeur(fd, `traduction.${langue}.photo.${i}`) })) }),
  }]));
}

function Traductions({ type, source, photos = [], valeurs = {}, uid }: { type: TypeCatalogue; source?: Partial<Record<TexteCatalogue, string | null>>; photos?: PhotoAdmin[]; valeurs?: TraductionsCatalogue; uid: string }) {
  return <fieldset className="bt-groupe bt-traductions"><legend>{B.traductions}</legend><p className="aide">{B.traductionsAide}</p>
    {LANGUES_CATALOGUE.map((langue) => <details key={langue}><summary>{B.langues[langue]}</summary><div className="champs" lang={langue.toLowerCase()}>
      {Object.entries(CHAMPS_TRADUITS[type]).map(([cle, max]) => {
        const champ = cle as TexteCatalogue, id = `${uid}-traduction-${langue}-${cle}`, name = `traduction.${langue}.${cle}`;
        return <div className={`champ${cle === "description" || cle === "entretien" ? " large" : ""}`} key={cle}>
          <label htmlFor={id} lang="fr">{B.champs[champ]}</label>
          {cle === "description" || cle === "entretien" ? <textarea id={id} name={name} rows={4} maxLength={max} defaultValue={valeurs[langue]?.[champ] ?? ""} placeholder={source?.[champ] ?? ""} /> : <input id={id} name={name} maxLength={max} defaultValue={valeurs[langue]?.[champ] ?? ""} placeholder={source?.[champ] ?? ""} autoComplete="off" />}
        </div>;
      })}
      {[...new Map(photos.map((p) => [p.src, p])).values()].map((p, i) => <div className="champ large" key={p.src}>
        <label htmlFor={`${uid}-traduction-${langue}-photo-${i}`} lang="fr">{B.alt} · {B.image} {i + 1}</label>
        <input id={`${uid}-traduction-${langue}-photo-${i}`} name={`traduction.${langue}.photo.${i}`} maxLength={300} defaultValue={valeurs[langue]?.photos?.find((a) => a.src === p.src)?.alt ?? ""} placeholder={p.alt} autoComplete="off" />
      </div>)}
    </div></details>)}
  </fieldset>;
}

function Formulaire({ action, composer, suite, enfants, verrou }: { action: (v: unknown) => Promise<RetourBoutique>; composer: (fd: FormData) => unknown; suite: (r: Extract<RetourBoutique, { ok: true }>) => void; enfants: ReactNode; verrou?: boolean }) {
  const [retour, setRetour] = useState<RetourBoutique | null>(null);
  const [occupe, demarrer] = useTransition();
  const message = useRef<HTMLDivElement>(null);
  return <form className="fin-form" onSubmit={(e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setRetour(null);
    demarrer(async () => {
      try {
        const r = await action(composer(fd));
        setRetour(r);
        if ("ok" in r) suite(r);
      } catch { setRetour({ erreur: "panne" }); }
      requestAnimationFrame(() => message.current?.focus());
    });
  }}>
    <fieldset disabled={occupe} className="bt-form-champs">{enfants}</fieldset>
    <div className="fin-pied"><button type="submit" className="bouton-2" disabled={occupe || verrou} aria-busy={occupe || undefined}>{occupe ? B.enregistrement : B.enregistrer}</button></div>
    {retour && <div ref={message} tabIndex={-1} className="fin-retour" data-ton={"erreur" in retour ? "erreur" : "ok"} role={"erreur" in retour ? "alert" : "status"}>
      {"erreur" in retour ? B.erreurs[retour.erreur] : B.enregistre}
      {"erreur" in retour && retour.champs?.length ? <ul>{[...new Set(retour.champs.map((cle) => cle.split(".")[0]))].map((cle) => <li key={cle}>{B.champs[cle as Champ] ?? cle}</li>)}</ul> : null}
    </div>}
  </form>;
}

function Texte({ cle, valeur: initiale, uid, max, requis, long, aide, lecture }: { cle: Champ; valeur?: string | number | null; uid: string; max?: number; requis?: boolean; long?: boolean; aide?: string; lecture?: boolean }) {
  const id = `${uid}-${cle}`;
  return <div className={`champ${long ? " large" : ""}`}>
    <label htmlFor={id}>{B.champs[cle]}</label>
    {long ? <textarea id={id} name={cle} defaultValue={initiale ?? ""} maxLength={max} rows={cle === "description" ? 5 : 3} aria-describedby={aide ? `${id}-aide` : undefined} /> : <input id={id} name={cle} defaultValue={initiale ?? ""} maxLength={max} required={requis} readOnly={lecture} autoComplete="off" aria-describedby={aide ? `${id}-aide` : undefined} />}
    {aide && <span className="aide" id={`${id}-aide`}>{aide}</span>}
  </div>;
}
function Nombre({ cle, initiale, uid, aide, max = 2147483647, requis }: { cle: "prix_xof" | "stock" | "ordre" | "broderie" | "delai_fabrication_jours" | "frais_xof" | "delai_jours"; initiale?: number | null; uid: string; aide?: string; max?: number; requis?: boolean }) {
  return <div className="champ"><label htmlFor={`${uid}-${cle}`}>{B.champs[cle]}</label><input type="number" inputMode="numeric" id={`${uid}-${cle}`} name={cle} min={cle === "broderie" || cle === "delai_fabrication_jours" || cle === "delai_jours" ? 1 : 0} max={max} step={1} defaultValue={initiale ?? ""} required={requis} aria-describedby={aide ? `${uid}-${cle}-aide` : undefined} />{aide && <span className="aide" id={`${uid}-${cle}-aide`}>{aide}</span>}</div>;
}

export function FormProduit({ produit: p, categories, matieres }: { produit?: ProduitAdmin; categories: CatalogueAdmin["categories"]; matieres: CatalogueAdmin["matieres"] }) {
  const uid = useId(), router = useRouter();
  const [photos, setPhotos] = useState<PhotoAdmin[]>(p?.photos ?? []);
  const [coloris, setColoris] = useState(p?.coloris ?? []);
  const [envoiImage, setEnvoiImage] = useState(false);
  const [version, setVersion] = useState(p?.modifie_le ?? null);
  const [unique, setUnique] = useState(p?.piece_unique ?? false);
  return <Formulaire action={enregistrerProduit} verrou={envoiImage} suite={(r) => { setVersion(r.version); if (!p) router.replace(`/admins/boutique?produit=${r.id}`); }} composer={(fd) => {
    const tailles = valeur(fd, "tailles").split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
    const broderie = nombre(fd, "broderie");
    return { id: p?.id ?? null, version, slug: valeur(fd, "slug"), nom: valeur(fd, "nom"), categorie: valeur(fd, "categorie"), matiere: valeur(fd, "matiere"), lieu: valeur(fd, "lieu") || null, artisan: valeur(fd, "artisan") || null, dimensions: valeur(fd, "dimensions") || null, description: valeur(fd, "description") || null, entretien: valeur(fd, "entretien") || null, prix_xof: nombre(fd, "prix_xof"), ordre: nombre(fd, "ordre"), stock: nombre(fd, "stock"), delai_fabrication_jours: nombre(fd, "delai_fabrication_jours"), piece_unique: unique, coloris, photos, traductions: traductionsSaisies(fd, "produits", photos), options: { tailles: tailles.length ? tailles : null, surMesure: fd.has("sur_mesure"), broderie: broderie === null ? null : { max: broderie } } };
  }} enfants={<>
    <fieldset className="bt-groupe"><legend>{B.identite}</legend><div className="champs">
      <Texte uid={uid} cle="nom" valeur={p?.nom} max={160} requis />
      <Texte uid={uid} cle="slug" valeur={p?.slug} max={80} requis lecture={Boolean(p)} aide={B.slugAide} />
      {(["categorie", "matiere"] as const).map((cle) => <div className="champ" key={cle}><label htmlFor={`${uid}-${cle}`}>{B.champs[cle]}</label><select id={`${uid}-${cle}`} name={cle} defaultValue={p?.[cle] ?? ""} required><option value="" disabled>{B.choisir}</option>{(cle === "categorie" ? categories : matieres).map((c) => <option key={c.slug} value={c.slug}>{c.nom}</option>)}</select></div>)}
      <Texte uid={uid} cle="artisan" valeur={p?.artisan} max={160} />
      <Texte uid={uid} cle="lieu" valeur={p?.lieu} max={120} />
      <Texte uid={uid} cle="dimensions" valeur={p?.dimensions} max={160} />
      <Nombre uid={uid} cle="ordre" initiale={p?.ordre ?? 0} aide={B.ordreAide} requis />
      <Texte uid={uid} cle="description" valeur={p?.description} max={4000} long />
      <Texte uid={uid} cle="entretien" valeur={p?.entretien} max={2000} long />
    </div></fieldset>
    <fieldset className="bt-groupe"><legend>{B.inventaire}</legend><div className="champs">
      <Nombre uid={uid} cle="prix_xof" initiale={p?.prix_xof} aide={B.prixAide} />
      <Nombre uid={uid} cle="stock" initiale={p?.stock} aide={B.stockAide} max={unique ? 1 : 2147483647} />
      <div className="champ"><label className="bt-case"><input type="checkbox" checked={unique} onChange={(e) => setUnique(e.target.checked)} />{B.champs.piece_unique}</label><span className="aide">{B.uniqueAide}</span></div>
    </div>{p && <p className="aide bt-stock">{B.champs.stock_reserve} : <b>{p.stock_reserve}</b> · {B.champs.disponible} : <b>{p.stock === null ? B.nonSuivi : p.stock - p.stock_reserve}</b></p>}</fieldset>
    <fieldset className="bt-groupe"><legend>{B.variantes}</legend><div className="champs">
      <Texte uid={uid} cle="tailles" valeur={p?.options?.tailles?.join("\n")} long aide={B.taillesAide} />
      <Nombre uid={uid} cle="broderie" initiale={p?.options?.broderie?.max} aide={B.broderieAide} max={200} />
      <Nombre uid={uid} cle="delai_fabrication_jours" initiale={p?.delai_fabrication_jours} aide={B.delaiAide} max={365} />
      <div className="champ"><label className="bt-case"><input type="checkbox" name="sur_mesure" defaultChecked={p?.options?.surMesure ?? false} />{B.champs.sur_mesure}</label></div>
    </div>
    <div className="bt-coloris">{coloris.map((c, i) => <div className="bt-coloris-ligne" key={i}>
      <div className="champ"><label htmlFor={`${uid}-coloris-${i}`}>{B.nomColoris} {i + 1}</label><input id={`${uid}-coloris-${i}`} maxLength={40} required value={c.nom} onChange={(e) => setColoris(coloris.map((v, n) => i === n ? { ...v, nom: e.target.value } : v))} /></div>
      <div className="champ"><label htmlFor={`${uid}-teinte-${i}`}>{B.teinte} {i + 1}</label><input type="color" id={`${uid}-teinte-${i}`} value={c.hex} onChange={(e) => setColoris(coloris.map((v, n) => i === n ? { ...v, hex: e.target.value } : v))} /></div>
      <button type="button" className="bouton-2 bouton-petit" onClick={() => setColoris(coloris.filter((_, n) => n !== i))} aria-label={`${B.retirerColoris} ${i + 1}`}>{B.retirerColoris}</button>
    </div>)}<button type="button" className="bouton-2 bouton-petit" disabled={coloris.length >= 100} onClick={() => setColoris([...coloris, { nom: "", hex: "#122460" }])}>{B.ajouterColoris}</button></div></fieldset>
    <fieldset className="bt-groupe"><legend>{B.photos}</legend><p className="aide">{B.photoAide}</p><Photos photos={photos} changer={setPhotos} occuper={setEnvoiImage} /></fieldset>
    <Traductions uid={uid} type="produits" source={p} photos={photos} valeurs={p?.traductions} />
  </>} />;
}

export function FormCategorie({ categorie: c }: { categorie?: CategorieAdmin }) {
  const uid = useId(), router = useRouter();
  const [photos, setPhotos] = useState(c?.photo ? [c.photo] : []);
  const [occupe, setOccupe] = useState(false);
  const [version, setVersion] = useState(c?.modifie_le ?? null);
  return <Formulaire action={enregistrerCategorie} verrou={occupe} suite={(r) => { setVersion(r.version); if (!c) router.replace(`/admins/boutique?onglet=categories&categorie=${r.id}`); }} composer={(fd) => ({ version, slug: valeur(fd, "slug"), nom: valeur(fd, "nom"), couleur: valeur(fd, "couleur"), ordre: nombre(fd, "ordre"), photo: photos[0] ?? null, traductions: traductionsSaisies(fd, "categories", photos) })} enfants={<>
    <div className="champs"><Texte uid={uid} cle="nom" valeur={c?.nom} max={80} requis /><Texte uid={uid} cle="slug" valeur={c?.slug} max={60} requis lecture={Boolean(c)} aide={B.slugAide} /><Nombre uid={uid} cle="ordre" initiale={c?.ordre ?? 0} aide={B.ordreAide} requis /><div className="champ"><label htmlFor={`${uid}-couleur`}>{B.champs.couleur}</label><select id={`${uid}-couleur`} name="couleur" defaultValue={c?.couleur ?? "ocean"}>{COULEURS.map((v) => <option key={v} value={v}>{B.couleurs[v]}</option>)}</select></div></div>
    <fieldset className="bt-groupe"><legend>{B.photoCategorie}</legend><Photos photos={photos} changer={setPhotos} occuper={setOccupe} maximum={1} /></fieldset>
    <Traductions uid={uid} type="categories" source={c} photos={photos} valeurs={c?.traductions} />
  </>} />;
}

export function FormMatiere({ matiere: m }: { matiere?: MatiereAdmin }) {
  const uid = useId(), router = useRouter();
  const [version, setVersion] = useState(m?.modifie_le ?? null);
  return <Formulaire action={enregistrerMatiere} suite={(r) => { setVersion(r.version); if (!m) router.replace(`/admins/boutique?onglet=matieres&matiere=${r.id}`); }} composer={(fd) => ({ version, slug: valeur(fd, "slug"), nom: valeur(fd, "nom"), traductions: traductionsSaisies(fd, "matieres") })} enfants={<><div className="champs"><Texte uid={uid} cle="nom" valeur={m?.nom} max={80} requis /><Texte uid={uid} cle="slug" valeur={m?.slug} max={60} requis lecture={Boolean(m)} aide={B.slugAide} /></div><Traductions uid={uid} type="matieres" source={m} valeurs={m?.traductions} /></>} />;
}

export function Publication({ produit: p }: { produit: Pick<ProduitAdmin, "id" | "modifie_le" | "publie" | "nom"> }) {
  const [occupe, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  return <div className="bt-publication"><button type="button" className="bouton-2 bouton-petit" disabled={occupe} aria-busy={occupe || undefined} aria-label={`${p.publie ? B.retirer : B.publier} : ${p.nom}`} onClick={() => {
    setErreur(null);
    demarrer(async () => {
      try { const r = await publierProduit(p.id, p.modifie_le, !p.publie); if ("erreur" in r) setErreur(B.erreurs[r.erreur]); }
      catch { setErreur(B.erreurs.panne); }
    });
  }}>{p.publie ? B.retirer : B.publier}</button>{erreur && <p className="fin-retour" data-ton="erreur" role="alert">{erreur}</p>}</div>;
}

/** Une zone de la grille de livraison : nom, pays (ou reste du monde), ville facultative, frais, délai, activation. */
export function FormZone({ zone: z }: { zone: ZoneAdmin }) {
  const uid = useId();
  const [version, setVersion] = useState(z.modifie_le);
  return <Formulaire action={enregistrerZone} suite={(r) => setVersion(r.version)} composer={(fd) => ({
    version, code: z.code, reste_du_monde: z.reste_du_monde, libelle: valeur(fd, "libelle"), ville: valeur(fd, "ville") || null,
    pays: z.reste_du_monde ? [] : valeur(fd, "pays").split(/[\s,;]+/).filter(Boolean), frais_xof: nombre(fd, "frais_xof"), delai_jours: nombre(fd, "delai_jours"), ordre: nombre(fd, "ordre"), actif: fd.has("actif"),
  })} enfants={<div className="champs">
    <Texte uid={uid} cle="libelle" valeur={z.libelle} max={80} requis />
    {z.reste_du_monde ? <p className="aide">{B.livraison.reste}</p> : <>
      <Texte uid={uid} cle="pays" valeur={z.pays.join(", ")} long aide={B.livraison.paysAide} />
      <Texte uid={uid} cle="ville" valeur={z.ville} max={80} aide={B.livraison.villeAide} />
    </>}
    <Nombre uid={uid} cle="frais_xof" initiale={z.frais_xof} aide={B.livraison.fraisAide} max={100000000} />
    <Nombre uid={uid} cle="delai_jours" initiale={z.delai_jours} aide={B.livraison.delaiAide} max={365} />
    <Nombre uid={uid} cle="ordre" initiale={z.ordre} aide={B.ordreAide} requis />
    <div className="champ"><label className="bt-case"><input type="checkbox" name="actif" defaultChecked={z.actif} />{B.champs.actif}</label></div>
  </div>} />;
}
