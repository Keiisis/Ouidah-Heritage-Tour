import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { espace as T } from "@/content/espace";
import { boutiqueAdmin as B } from "@/content/espace-boutique";
import { terrain } from "@/content/espace-terrain";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { lireCatalogueAdmin, lireZonesAdmin } from "@/lib/serveur/equipe/boutique/lectures";
import type { CatalogueAdmin } from "@/lib/serveur/equipe/boutique/regles";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { lireCommandes } from "@/lib/serveur/equipe/terrain/commandes";
import { Bloc, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { Tete } from "../Tete";
import { Commandes, type CarteCommande } from "../terrain/Commandes";
import { FormCategorie, FormMatiere, FormProduit, FormZone, Publication } from "./Formulaires";
import "../finances/finances.css";
import "../terrain/terrain.css";
import "./boutique.css";

export type RechercheBoutique = { onglet?: string; produit?: string; categorie?: string; matiere?: string; q?: string };
type Onglet = keyof typeof B.onglets;
const xof = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: T.ouidah.fuseau });
const adresse = (onglet: Onglet) => `/admins/boutique?onglet=${onglet}`;

function ListeProduits({ catalogue: c, q }: { catalogue: CatalogueAdmin; q: string }) {
  const normalise = (v: string) => v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr");
  const liste = c.produits.filter((p) => normalise([p.nom, c.categories.find((a) => a.slug === p.categorie)?.nom, c.matieres.find((a) => a.slug === p.matiere)?.nom].join(" ")).includes(normalise(q)));
  return <>
    <div className="bt-outils">
      <form className="bt-recherche" action="/admins/boutique"><div className="champ"><label htmlFor="bt-recherche">{B.rechercher}</label><input id="bt-recherche" name="q" type="search" defaultValue={q} placeholder={B.recherche} /></div><button className="bouton-2" type="submit">{B.chercher}</button></form>
      <Link className="bouton-2" href="/admins/boutique?produit=nouveau">{B.ajouter.produits}</Link>
    </div>
    {!liste.length ? <Vide texte={c.produits.length ? B.aucunResultat : B.vide.produits} /> : <div className="tableau-defile"><table className="tableau bt-table"><thead><tr>
      <th scope="col">{B.champs.produit}</th><th scope="col">{B.champs.prix_xof}</th><th scope="col">{B.champs.disponible}</th><th scope="col">{B.etat}</th><th scope="col"><span className="invisible">{B.actions}</span></th>
    </tr></thead><tbody>{liste.map((p) => <tr key={p.id}>
      <td data-col={B.champs.produit}><div className="bt-identite">{p.photos[0] && <Image src={p.photos[0].src} alt="" width={56} height={70} unoptimized />}<div><Link href={`/admins/boutique?produit=${p.id}`}><b>{p.nom}</b></Link><span>{c.categories.find((a) => a.slug === p.categorie)?.nom} · {c.matieres.find((a) => a.slug === p.matiere)?.nom}</span></div></div></td>
      <td data-col={B.champs.prix_xof} className="num">{p.prix_xof === null ? B.prixAttente : `${xof.format(p.prix_xof)} ${T.monnaie.fcfa}`}</td>
      <td data-col={B.champs.disponible} className="num">{p.stock === null ? B.nonSuivi : p.stock - p.stock_reserve === 0 ? B.rupture : xof.format(p.stock - p.stock_reserve)}{p.stock_reserve > 0 && <small className="bt-sous">{B.champs.stock_reserve} : {p.stock_reserve}</small>}</td>
      <td data-col={B.etat}><span className="etat" data-e={p.publie ? "publie" : "retiree"}>{p.publie ? B.publie : B.brouillon}</span></td>
      <td><div className="actions"><Link className="bouton-2 bouton-petit" href={`/admins/boutique?produit=${p.id}`} aria-label={`${B.modifier} : ${p.nom}`}>{B.modifier}</Link><Publication key={p.modifie_le} produit={p} /></div></td>
    </tr>)}</tbody></table></div>}
  </>;
}

function Catalogue({ onglet, recherche: r, catalogue: c }: { onglet: Exclude<Onglet, "commandes" | "livraison">; recherche: RechercheBoutique; catalogue: CatalogueAdmin }) {
  const selection = onglet === "produits" ? r.produit : onglet === "categories" ? r.categorie : r.matiere;
  const nouveau = selection === "nouveau";
  const p = !nouveau && onglet === "produits" ? c.produits.find((a) => a.id === selection) : undefined;
  const cat = !nouveau && onglet === "categories" ? c.categories.find((a) => a.slug === selection) : undefined;
  const mat = !nouveau && onglet === "matieres" ? c.matieres.find((a) => a.slug === selection) : undefined;
  if (selection) return <Bloc id="bt-edition" titre={nouveau ? B.ajouter[onglet] : p?.nom ?? cat?.nom ?? mat?.nom ?? B.modifier} s={12} i={1} lien={<Link href={adresse(onglet)}>{B.retour}</Link>}>
    {!nouveau && !p && !cat && !mat ? <Vide texte={B.introuvable} /> : onglet === "produits" ? <>
      {p?.publie && <p className="bt-public"><Link href={`/boutique/${p.slug}`} target="_blank" rel="noopener noreferrer">{B.voir}</Link></p>}
      {!c.categories.length || !c.matieres.length ? <Vide texte={[B.prealables, ""]} /> : <FormProduit key={p?.id ?? "nouveau"} produit={p} categories={c.categories} matieres={c.matieres} />}
    </> : onglet === "categories" ? <FormCategorie key={cat?.slug ?? "nouveau"} categorie={cat} /> : <FormMatiere key={mat?.slug ?? "nouveau"} matiere={mat} />}
  </Bloc>;
  if (onglet === "produits") return <Bloc id="bt-produits" titre={B.catalogue} compte={c.produits.length} s={12} i={1}><ListeProduits catalogue={c} q={typeof r.q === "string" ? r.q.slice(0, 160) : ""} /></Bloc>;
  const liste = onglet === "categories" ? c.categories : c.matieres;
  const parametre = onglet === "categories" ? "categorie" : "matiere";
  return <Bloc id={`bt-${onglet}`} titre={B.onglets[onglet]} compte={liste.length} s={12} i={1} lien={<Link href={`${adresse(onglet)}&${parametre}=nouveau`}>{B.ajouter[onglet]}</Link>}>
    {!liste.length ? <Vide texte={B.vide[onglet]} /> : <div className="tableau-defile"><table className="tableau"><thead><tr><th scope="col">{B.champs.nom}</th><th scope="col">{B.onglets.produits}</th>{onglet === "categories" && <th scope="col">{B.champs.ordre}</th>}<th scope="col"><span className="invisible">{B.actions}</span></th></tr></thead><tbody>
      {liste.map((l) => <tr key={l.slug}><td data-col={B.champs.nom}><b>{l.nom}</b></td><td data-col={B.onglets.produits}>{c.produits.filter((a) => a[parametre] === l.slug).length}</td>{onglet === "categories" && <td data-col={B.champs.ordre}>{"ordre" in l && typeof l.ordre === "number" ? l.ordre : ""}</td>}<td className="actions"><Link className="bouton-2 bouton-petit" href={`${adresse(onglet)}&${parametre}=${l.slug}`} aria-label={`${B.modifier} : ${l.nom}`}>{B.modifier}</Link></td></tr>)}
    </tbody></table></div>}
  </Bloc>;
}

async function OngletCommandes() {
  const lignes = await lireCommandes();
  const cartes: CarteCommande[] | null = lignes?.map((c) => ({ ...c, total: c.totalXof === null ? null : `${xof.format(c.totalXof)} ${T.monnaie.fcfa}`, quand: c.remise ? terrain.commandes.remiseLe(date.format(c.remise)) : terrain.commandes.recue(date.format(c.recue)) })) ?? null;
  return <Bloc id="bt-commandes" titre={B.onglets.commandes} compte={cartes?.filter((c) => c.etat !== "remise" && c.etat !== "annulee").length ?? null} s={12} i={1}>{cartes ? <Commandes commandes={cartes} admin /> : <Vide texte={[T.vides.indisponible, ""]} />}</Bloc>;
}

// Grille de livraison : une fiche par zone, frais vides tant que l'admin ne les a pas saisis (rien d'inventé).
async function OngletLivraison() {
  const zones = await lireZonesAdmin();
  return <Bloc id="bt-livraison" titre={B.livraison.titre} compte={zones?.length ?? null} s={12} i={1}>
    <p className="aide">{B.livraison.aide}</p>
    {!zones ? <Vide texte={[T.vides.indisponible, ""]} /> : !zones.length ? <Vide texte={B.livraison.vide} /> : zones.map((z) => <section key={z.code} className="bt-groupe" aria-label={z.libelle}>
      <h3>{z.libelle} · {z.frais_xof === null || !z.actif ? B.livraison.nonPayable : `${xof.format(z.frais_xof)} ${T.monnaie.fcfa}`}</h3>
      <FormZone key={z.modifie_le} zone={z} />
    </section>)}
  </Bloc>;
}

export async function EcranBoutique({ recherche }: { recherche: Promise<RechercheBoutique> }) {
  const session = await exigerRole("admins");
  if (!session) redirect("/admins");
  const r = await recherche;
  const onglet: Onglet = r.onglet && Object.hasOwn(B.onglets, r.onglet) ? r.onglet as Onglet : "produits";
  const catalogue = onglet === "commandes" || onglet === "livraison" ? null : await lireCatalogueAdmin();
  return <Enveloppe role="admins" session={session} actif="boutique" minute={minuteServeur()}>
    <Tete titre={B.titre} sous={B.sous} />
    <div className="esp-finances esp-boutique">
      <nav className="bt-onglets" aria-label={B.navigation}>{(Object.keys(B.onglets) as Onglet[]).map((o) => <Link key={o} href={adresse(o)} aria-current={onglet === o ? "page" : undefined}>{B.onglets[o]}</Link>)}</nav>
      <div className="esp-grille">{onglet === "commandes" ? <OngletCommandes /> : onglet === "livraison" ? <OngletLivraison /> : catalogue ? <Catalogue onglet={onglet} recherche={r} catalogue={catalogue} /> : <Bloc id="bt-indisponible" titre={B.onglets[onglet]} s={12} i={1}><Vide texte={[T.vides.indisponible, ""]} /></Bloc>}</div>
    </div>
  </Enveloppe>;
}
