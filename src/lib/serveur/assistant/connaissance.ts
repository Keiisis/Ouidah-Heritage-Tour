import "server-only";
import { LIMITES } from "@/content/assistant";
import { adresseCircuit, conciergerie, destinations, emergency, evenements, FICHES_LIEU, places, preparer, reasons, SECTIONS, tenReasons, tours, welcome } from "@/content/fr";
import type { Media } from "@/content/types";
import { histoireChapitres } from "@/content/histoire";
import legal from "@/content/legal.json";
import releve from "@/content/lieux-ouidah.json";
import { lireContenu } from "@/lib/contenu";
import { iso, jourOuidah, prochaine } from "@/lib/jours";
import { base } from "../base";
import { type Catalogue, choisir, type Fiche, formater } from "./regles";

// Base de connaissances de l'assistant public : CONTENU PUBLIC SEULEMENT, en lecture. Sources : content/fr.ts (lieux,
// circuits, événements, conciergerie, préparer, raisons), histoire.ts, lieux-ouidah.json (relevé de la carte),
// legal.json (informations visibles de la société, CGV, confidentialité), articles PUBLIÉS de la boutique et fiches
// publiées par l'admin (assistant_fiches). Aucune table de clients, demandes, réservations, factures, documents, équipe
// ou journal n'est lue ici : la seule requête en base vise boutique_produits (publie = true, colonnes de la fiche
// publique) et assistant_fiches (publie = true). Une information de la société masquée ou privée (siège exact, IFU,
// capital) n'entre jamais. Les prix n'entrent que s'ils sont publiés (circuit priceVisible, prix d'offre non nul).

type Champ = { libelle: string; valeur: string | string[] | null; visible: boolean };
type ContenuConnaissance = { conciergerie: typeof conciergerie; destinations: typeof destinations; emergency: typeof emergency; evenements: typeof evenements; FICHES_LIEU: typeof FICHES_LIEU; places: typeof places; preparer: typeof preparer; reasons: typeof reasons; tenReasons: typeof tenReasons; tours: typeof tours; welcome: typeof welcome; histoireChapitres: typeof histoireChapitres; legal: typeof legal; releve: typeof releve };
// informations de la société que l'assistant peut citer (le siège exact, l'IFU et le capital n'y sont pas)
const PUBLIQUES = ["denomination", "forme", "activite", "ville", "quartier", "agence", "rccm", "carte", "licence", "presidente", "telephones", "email"];
const champ = (k: string, societe: Record<string, Champ> = legal.societe): string | null => {
  const c = societe[k];
  const v = PUBLIQUES.includes(k) && c?.visible ? c.valeur : null;
  return v == null || v === "" || (Array.isArray(v) && !v.length) ? null : Array.isArray(v) ? v.join(", ") : v;
};
/** Adresses e-mail publiques d'OHT : les seules qu'une réponse peut contenir. */
export const EMAILS_PUBLICS = [champ("email")].filter((x): x is string => Boolean(x)).map((x) => x.toLowerCase());

// texte de legal.json : liens [t](adresse) → « t (adresse) », {clé} → valeur publique ; null si une clé citée est masquée
function texteLegal(s: string, societe: Record<string, Champ>): string | null {
  let manque = false;
  const t = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)").replace(/\{(\w+)\}/g, (_, k: string) => champ(k, societe) ?? ((manque = true), ""));
  return manque ? null : t;
}
type BlocLegal = { p?: string; liste?: string[]; fiche?: (string | [string, string])[]; tableau?: { colonnes: string[]; lignes: string[][] } };
const blocs = (b: BlocLegal[], societe: Record<string, Champ>) =>
  b
    .flatMap((x) => [
      ...(x.p ? [x.p] : []),
      ...(x.liste ?? []),
      ...(x.fiche ?? []).map((r) => (typeof r === "string" ? (champ(r, societe) ? `${societe[r].libelle} : {${r}}` : "") : `${r[0]} : ${r[1]}`)),
      ...(x.tableau?.lignes ?? []).map((l) => l.map((v, i) => `${x.tableau!.colonnes[i]} : ${v}`).join(" ; ")),
    ])
    .map((s) => (s ? texteLegal(s, societe) : null))
    .filter((s): s is string => Boolean(s))
    .join(" ");

const fmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const jour = (n: number) => fmt.format(new Date(`${iso(n)}T00:00:00Z`));
const fcfa = (n: number) => `${new Intl.NumberFormat("fr-FR").format(n)} FCFA`;
// photo du contenu publié pour la vignette du widget : la première servie par le site lui-même (« /… »), jamais une adresse
// externe ; un lieu ou un événement sans photo propre prend celle de la raison de venir du même nom (même sujet)
const photo = (...m: (Media | null | undefined)[]) => m.find((x) => x?.src.startsWith("/") && !x.src.startsWith("//"))?.src ?? null;

/** Fiches tirées du contenu publié, avec les prochaines dates d'événements. */
function fichesContenu(aujourdhui: number, contenu: ContenuConnaissance): Fiche[] {
  const { conciergerie, destinations, evenements, FICHES_LIEU, places, preparer, reasons, tenReasons, tours, histoireChapitres, legal, releve } = contenu;
  const nomLieu = (slug: string) => destinations.find((d) => d.slug === slug)?.name ?? slug;
  const f: Fiche[] = [];
  for (const t of tours) {
    const prix = t.priceVisible && t.price !== null ? `à partir de ${fcfa(t.price)}` : "prix sur devis";
    f.push({ id: `circuit:${t.slug}`, titre: t.title, texte: [`circuit ${t.tag}, ${t.place}`, `étapes : ${t.stops.map(nomLieu).join(", ")}`, t.duration ? `durée : ${t.duration}` : "durée à préciser au devis", prix].join(" ; ") });
  }
  for (const d of destinations) {
    const fl = FICHES_LIEU[d.slug];
    const accueil = places.find((p) => p.slug === d.slug)?.text;
    f.push({ id: `lieu:${d.slug}`, titre: d.name, texte: [d.subtitle, d.theme, accueil ?? d.text, fl?.horaires && `horaires : ${fl.horaires}`, fl?.tarif && `tarif : ${fl.tarif}`, fl?.usages].filter(Boolean).join(" ; ") });
  }
  for (const e of evenements) {
    const [a, z] = prochaine(e.quand, aujourdhui);
    const o = e.offre;
    const offre =
      o.type === "sejour"
        ? `séjour proposé par OHT : ${o.nom} (${o.inclus})${o.prix !== null ? `, ${fcfa(o.prix)}` : ", prix sur devis"}`
        : `billets vendus par OHT : ${o.categories.map((c) => `${c.nom} (${c.detail})${c.prix !== null ? ` ${fcfa(c.prix)}` : " prix à venir"}`).join(", ")}`;
    f.push({ id: `evenement:${e.slug}`, titre: e.title, texte: [`${e.theme}, ${e.place}`, e.text, a === z ? `prochaine date : ${jour(a)}` : `prochaine édition : du ${jour(a)} au ${jour(z)}`, e.organisateur.type === "oht" ? "organisé par OHT" : `organisé par ${e.organisateur.nom}`, offre].join(" ; ") });
  }
  for (const q of conciergerie) {
    f.push({ id: `service:${q.id}`, titre: `Service ${q.nom.replace(/\.$/, "")}`, texte: [q.moment, q.question, q.lead, `choix : ${q.options.map((o) => (o.detail ? `${o.label} (${o.detail})` : o.label)).join(", ")}`, "à demander dans le devis"].filter(Boolean).join(" ; ") });
  }
  for (const p of preparer) f.push({ id: `preparer:${p.id}`, titre: p.titre, texte: [`${p.cle.valeur} ${p.cle.texte}`, ...p.points].join(" ") });
  for (const r of tenReasons) f.push({ id: `raison:${r.slug}`, titre: r.title, texte: `${r.category} : ${r.text}` });
  f.push({ id: "oht:engagements", titre: "Engagements d'OHT", texte: reasons.map((r) => `${r.title} : ${r.text}`).join(" ") });
  for (const c of histoireChapitres) f.push({ id: `histoire:${c.id}`, titre: `Histoire de Ouidah, ${c.repere} : ${c.titre}`, texte: [...(c.temps[0] ?? []), ...(c.etapes?.length ? [`stations : ${c.etapes.join(", ")}`] : [])].join(" ").slice(0, 900) });
  for (const l of releve.lieux) {
    const t = [l.sous_type, l.adresse, l.horaires && `horaires : ${l.horaires}`, l.cuisine && `cuisine : ${l.cuisine}`, l.description, l.hors_commune ? "hors de la commune de Ouidah" : null].filter(Boolean).join(" ; ");
    f.push({ id: `carte:${l.slug}`, titre: `${l.nom} (${l.categorie})`, texte: t || "sur la carte du site" });
  }
  for (const [chemin, page] of Object.entries(legal.pages)) {
    if (chemin === "/mentions-legales") continue;
    for (const s of page.sections) {
      const t = blocs(s.blocs as BlocLegal[], legal.societe);
      if (t) f.push({ id: `legal:${chemin.slice(1)}#${s.id}`, titre: `${page.titre} : ${s.titre}`, texte: t.slice(0, 1400) });
    }
  }
  return f;
}

/** Socle donné à chaque question : qui est OHT, ses coordonnées publiques, la liste de ce qui existe (identifiants). */
function socle(articles: Fiche[], contenu: ContenuConnaissance): string {
  const { welcome, tours, destinations, evenements, conciergerie, emergency, legal } = contenu;
  const publique = (k: string) => champ(k, legal.societe);
  const id = [
    ["Agence", [publique("denomination"), publique("forme"), publique("activite")].filter(Boolean).join(", ")],
    ["Siège", [publique("quartier"), publique("ville")].filter(Boolean).join(", ")],
    ["Agence à Ouidah", publique("agence")],
    ["Licence", publique("licence")],
    ["Téléphone", publique("telephones")],
    ["E-mail", publique("email")],
  ].filter(([, v]) => v);
  return [
    `OHT : ${welcome.paragraphs.join(" ")}`,
    ...id.map(([k, v]) => `${k} : ${v}`),
    `Circuits : ${tours.map((t) => `[circuit:${t.slug}] ${t.title}`).join(", ")}.`,
    `Lieux à voir : ${destinations.map((d) => `[lieu:${d.slug}] ${d.name}`).join(", ")}.`,
    `Événements : ${evenements.map((e) => `[evenement:${e.slug}] ${e.short}`).join(", ")}.`,
    `Services de conciergerie (sur devis) : ${conciergerie.map((q) => q.nom.replace(/\.$/, "")).join(", ")}.`,
    articles.length ? `Boutique : ${articles.map((a) => `[${a.id}] ${a.titre}`).join(", ")}.` : "Boutique : aucun article publié pour l'instant.",
    `Devis gratuit en ligne : page Créer mon voyage (/devis). Urgences au Bénin : ${emergency.map((e) => `${e.label} ${e.value}`).join(", ")}.`,
  ].join("\n");
}

// ---------- parts lues en base (articles publiés, fiches de l'admin), relues au plus toutes les 60 s ----------

type Ligne = { slug: string; nom: string; categorie: string; matiere: string; lieu: string | null; prix_xof: number | string | null; dimensions: string | null; description: string | null };
let memo: { t: number; articles: Fiche[]; fiches: Fiche[] } | null = null;

async function lire<T>(chemin: string): Promise<T[]> {
  try {
    const r = await base(chemin);
    return r.ok ? ((await r.json()) as T[]) : [];
  } catch {
    return [];
  }
}

async function partsBase() {
  if (memo && Date.now() - memo.t < 60_000) return memo;
  const [produits, fiches] = await Promise.all([
    lire<Ligne>("boutique_produits?select=slug,nom,categorie,matiere,lieu,prix_xof,dimensions,description&publie=is.true&order=ordre.asc&limit=200"),
    lire<{ id: string; titre: string; texte: string }>("assistant_fiches?select=id,titre,texte&publie=is.true&order=modifie_le.desc&limit=1000"),
  ]);
  memo = {
    t: Date.now(),
    articles: produits.map((p) => ({ id: `article:${p.slug}`, titre: p.nom, texte: [`${p.categorie}, ${p.matiere}`, p.lieu, p.prix_xof !== null ? fcfa(Number(p.prix_xof)) : "prix sur demande", p.dimensions, p.description].filter(Boolean).join(" ; ") })),
    fiches: fiches.map((x) => ({ id: `fiche:${x.id.slice(0, 8)}`, titre: x.titre, texte: x.texte })),
  };
  return memo;
}

/** Texte CONNAISSANCES pour une question (socle + fiches les plus proches) et catalogue des actions possibles. */
export async function connaissances(question: string): Promise<{ texte: string; catalogue: Catalogue; emailsPublics: string[] }> {
  const [{ articles, fiches }, conciergerie, destinations, emergency, evenements, FICHES_LIEU, places, preparer, reasons, tenReasons, tours, welcome, histoireChapitres, legal, releve] = await Promise.all([
    partsBase(), lireContenu("fr.conciergerie"), lireContenu("fr.destinations"), lireContenu("fr.emergency"), lireContenu("fr.evenements"),
    lireContenu("fr.FICHES_LIEU"), lireContenu("fr.places"), lireContenu("fr.preparer"), lireContenu("fr.reasons"), lireContenu("fr.tenReasons"),
    lireContenu("fr.tours"), lireContenu("fr.welcome"), lireContenu("histoire.histoireChapitres"), lireContenu("legal"), lireContenu("lieux-ouidah"),
  ]);
  const contenu = { conciergerie, destinations, emergency, evenements, FICHES_LIEU, places, preparer, reasons, tenReasons, tours, welcome, histoireChapitres, legal, releve };
  const raison = (slug: string) => tenReasons.find((r) => r.slug === slug)?.image;
  const toutes = [...fiches, ...fichesContenu(jourOuidah(Date.now()), contenu), ...articles];
  const choisies = choisir(toutes, question, LIMITES.connaissanceCaracteres);
  const catalogue: Catalogue = {
    circuit: new Map(tours.map((t) => [t.slug, { titre: t.title, url: adresseCircuit(t.slug, tours), image: photo(t.image) }])),
    lieu: new Map(destinations.flatMap((d) => (d.href ? [[d.slug, { titre: d.name, url: d.href, image: photo(d.image, raison(d.slug)) }] as const] : []))),
    evenement: new Map(evenements.map((e) => [e.slug, { titre: e.title, url: SECTIONS.agenda, image: photo(e.image, raison(e.slug)) }])),
    article: new Map(articles.map((a) => [a.id.slice("article:".length), { titre: a.titre, url: `/boutique/${a.id.slice("article:".length)}` }])),
  };
  return { texte: `${socle(articles, contenu)}\n\n${choisies.map(formater).join("\n")}`, catalogue, emailsPublics: [champ("email", legal.societe)].filter((x): x is string => Boolean(x)).map((x) => x.toLowerCase()) };
}
