import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import sharp from "sharp";
import QRCode from "qrcode";
import { clip, endPath, PDFDocument, popGraphicsState, pushGraphicsState, rectangle, setCharacterSpacing, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { TAUX_EUR } from "@/content/documents";
import { lireContenu } from "@/lib/contenu";
import type { DocumentPdf, Dossier } from "@/lib/suivi";
import { base, baseConfiguree } from "../base";
import { imageBytea, lireMentions, type ImageDoc, type MentionsDoc } from "./mentions";
import { validerDemandeEmcf, type CalculFactureEmcf, type DemandeFactureEmcf, type SecuriteEmcf } from "../emcf/client";
import { ABYSSE, BLANC, dessinerCarte, FILET, GRIS, OCEAN, planVoyage, reperesOuidah, rgbHex, SABLE, SOLEIL, type Boite, type PlanCarte, type Pinceau } from "./pdf-carte";
import { empreinteDevis } from "./signature";

// Devis (D-…) et reçu de paiement (R-…) en PDF, modèle E « La carte du séjour » validé par Kevin (03/11/2026,
// Assets OHT/Devis-Factures/maquettes/e). Rendus à la demande depuis le dossier réel (lireDossier), dans la langue de
// la commande. Au Bénin, une facture n'a de valeur fiscale que normalisée par la DGI (e-MECeF) : après paiement, le site
// émet un « Reçu de paiement », jamais une « Facture ».
// En-tête = carte de Ouidah en vecteurs (pdf-carte.ts) ; boutique : vitrine des articles ; billets : photo de
// l'événement si le site en a une. Mentions, signataire, signature et cachet : reglages_documents, sinon legal.json
// (mentions.ts) ; une image absente laisse sa zone vide, sans gabarit. Polices de la marque embarquées (polices/OFL.txt).
// Une seule page A4 : la carte, puis la densité du corps (5 paliers) sont réduites jusqu'à ce que tout tienne ; l'air
// restant est réparti entre les blocs. Plancher : 9 pt pour tout texte. Au-delà, le tableau continue sur une page
// suivante plutôt que de perdre du texte (pagesDevis refuse alors la publication du devis).

const L = 595.28; // A4 portrait, en points
const H = 841.89;
const ZONE = "Africa/Porto-Novo"; // heure du Bénin (UTC+1)
const MIN = 9; // plancher de tout texte

const ARDOISE = rgbHex("#3f4863");
const FILET_F = rgbHex("#c9cfdc");
const LATERITE = rgbHex("#ac3215");

type Densite = { g: number; rp: number; mt: number; sh: number; corps: number; marge: number; lh: number; enLigne: boolean; libGras: boolean; cachet: number };
// paliers des maquettes (--g, --rp, --mt, --sh en px × 0,75), plus un palier extrême au plancher de 9 pt
const DENSITES: Densite[] = [
  { g: 16.5, rp: 6, mt: 40.5, sh: 37.5, corps: 9.75, marge: 42, lh: 1.35, enLigne: false, libGras: true, cachet: 50 },
  { g: 13.5, rp: 4.5, mt: 40.5, sh: 37.5, corps: 9.75, marge: 42, lh: 1.3, enLigne: false, libGras: true, cachet: 50 },
  { g: 10.5, rp: 3.75, mt: 36, sh: 34.5, corps: 9.75, marge: 42, lh: 1.25, enLigne: false, libGras: true, cachet: 46 },
  { g: 8.25, rp: 3, mt: 33, sh: 31.5, corps: 9.5, marge: 38, lh: 1.2, enLigne: true, libGras: false, cachet: 42 },
  { g: 5, rp: 1.25, mt: 28, sh: 20, corps: MIN, marge: 24, lh: 1.12, enLigne: true, libGras: false, cachet: 34 },
];
// Carte (bande d'en-tête) : 43 % de la page (maquette), 32 % dès 8 lignes, puis par paliers de 12 pt si le corps ne
// tient pas au palier extrême (« bandes extrêmes » : 20 lignes longues et une note pleine).
type Bande = { h: number; mer: number; grille: boolean };
const bandes = (lignes: number): Bande[] => {
  const l: Bande[] = [];
  for (let h = lignes >= 8 ? Math.round(H * 0.32) : 363; h >= 150; h -= 12) l.push({ h, mer: h >= 330 ? 42 : h >= 250 ? 34 : h >= 230 ? 28 : 24, grille: h >= 330 });
  return l;
};

// Polices et emblème lus une fois par processus ; chemins statiques pour que le traçage de Next les embarque.
let ressources: Promise<Buffer[]> | null = null;
const charger = () =>
  (ressources ??= Promise.all([
    readFile(path.join(process.cwd(), "src/lib/serveur/documents/polices/Manrope-Regular.ttf")),
    readFile(path.join(process.cwd(), "src/lib/serveur/documents/polices/Manrope-Bold.ttf")),
    readFile(path.join(process.cwd(), "src/lib/serveur/documents/polices/Fraunces-SemiBold.ttf")),
    readFile(path.join(process.cwd(), "src/lib/serveur/documents/embleme.png")),
  ]).catch((e: unknown) => {
    ressources = null;
    throw e;
  }));

// ---------- images de la bande : PNG/JPEG natifs ; WebP du catalogue converti en PNG ----------
const PUBLIC = path.join(process.cwd(), "public");
const typeImage = (o: Uint8Array): ImageDoc | null =>
  o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47 ? { octets: o, png: true } : o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff ? { octets: o, png: false } : null;
async function octetsImage(src: string): Promise<ImageDoc | null> {
  try {
    let o: Uint8Array;
    if (src.startsWith("/")) {
      const f = path.join(PUBLIC, path.normalize(src));
      if (!f.startsWith(PUBLIC + path.sep)) return null;
      o = await readFile(f);
    } else {
      const stockage = process.env.SUPABASE_URL; // photos du catalogue : le stockage de la base configurée
      if (!src.startsWith("https://") && !(stockage && src.startsWith(`${stockage}/`))) return null;
      const r = await fetch(src, { signal: AbortSignal.timeout(4000), cache: "no-store" });
      if (!r.ok || Number(r.headers.get("content-length") ?? 0) > 4e6) return null;
      o = new Uint8Array(await r.arrayBuffer());
    }
    if (o.length > 4e6) return null;
    const image = typeImage(o);
    if (image) return image;
    const b = Buffer.from(o);
    if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") return null;
    return { octets: await sharp(b, { limitInputPixels: 40_000_000 }).resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).png().toBuffer(), png: true };
  } catch {
    return null;
  }
}
// première photo de chaque article commandé, lue dans le catalogue (boutique_produits, par nom) ; jamais de photo d'exemple
async function photosArticles(noms: string[]): Promise<(ImageDoc | null)[]> {
  if (!noms.length || !baseConfiguree()) return noms.map(() => null);
  const liste = [...new Set(noms)].map((n) => `"${n.replace(/["\\]/g, (x) => `\\${x}`)}"`).join(",");
  const r = await base(`boutique_produits?select=nom,photos&nom=in.(${encodeURIComponent(liste)})&limit=50`).catch(() => null);
  const lignes = r?.ok ? (((await r.json().catch(() => null)) as { nom: string; photos: unknown }[] | null) ?? []) : [];
  return Promise.all(
    noms.map(async (nom) => {
      const p = lignes.find((l) => l.nom === nom)?.photos;
      const chemin = Array.isArray(p) && p[0] && typeof p[0] === "object" ? (p[0] as { chemin?: unknown }).chemin : null;
      return typeof chemin === "string" && chemin ? octetsImage(`${process.env.SUPABASE_URL}/storage/v1/object/public/boutique/${chemin.split("/").map(encodeURIComponent).join("/")}`) : null;
    }),
  );
}
// signature tracée par le client : URL data: PNG (lireSignature) ou bytea hexadécimal
function imageSignature(v: string): ImageDoc | null {
  const DATA = "data:image/png;base64,";
  return v.startsWith(DATA) ? typeImage(Buffer.from(v.slice(DATA.length), "base64")) : imageBytea(v);
}

// ---------- dates : AAAA-MM-JJ = jour calendaire, sinon instant lu à l'heure du Bénin ----------
type Jour = { a: number; m: number; j: number };
const instant = (v: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00Z` : v);
function jourBenin(d: Date): Jour | null {
  if (Number.isNaN(d.getTime())) return null;
  const p = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, day: "numeric", month: "numeric", year: "numeric" }).formatToParts(d);
  const n = (t: Intl.DateTimeFormatPartTypes) => Number(p.find((x) => x.type === t)?.value);
  return { a: n("year"), m: n("month"), j: n("day") };
}
const ecart = (x: Jour, y: Jour) => Math.round((Date.UTC(y.a, y.m - 1, y.j) - Date.UTC(x.a, x.m - 1, x.j)) / 86_400_000);
type Forme = "complet" | "jourMois" | "jour";
function dateLongue(v: string, intl: string, mois: string[] | null, forme: Forme = "complet"): string {
  const d = instant(v);
  const j = jourBenin(d);
  if (!j) return v;
  if (mois) return forme === "jour" ? `${j.j}` : forme === "jourMois" ? `${j.j} ${mois[j.m - 1]}` : `${j.j} ${mois[j.m - 1]} ${j.a}`;
  if (forme === "jour") {
    // jour seul pris dans « jour mois » pour garder son point ordinal (allemand « 8. »)
    const p = new Intl.DateTimeFormat(intl, { timeZone: ZONE, day: "numeric", month: "long" }).formatToParts(d);
    const i = p.findIndex((x) => x.type === "day");
    return p[i].value + (p[i + 1]?.value.startsWith(".") ? "." : "");
  }
  const o: Intl.DateTimeFormatOptions = forme === "jourMois" ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" };
  return new Intl.DateTimeFormat(intl, { timeZone: ZONE, ...o }).format(d);
}
function heureBenin(v: string): [number, number] | null {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(d);
  return [Number(p.find((x) => x.type === "hour")?.value), Number(p.find((x) => x.type === "minute")?.value)];
}

type LigneDoc = { etape: [number, number] | null; billet: string | null; libelle: string; sous: string | null; quantite: number; prix: number | null; montant: number | null };
type Run = { t: string; f: PDFFont; c: RGB };

// Les F-/A- restent dans l’espace équipe ; ils ne changent pas le contrat public du suivi (devis et reçu R-).
export type CertificationPdf = {
  environnement: "production"; etat: "confirmee"; requete: DemandeFactureEmcf;
  calcul: CalculFactureEmcf; securite: SecuriteEmcf; identite: MentionsDoc;
};
export type DossierPdf = Omit<Dossier, "document"> & {
  document: (Omit<DocumentPdf, "type"> & { type: DocumentPdf["type"] | "facture" | "avoir" }) | null;
  emcf?: CertificationPdf;
};

export async function rendrePdf(dossier: DossierPdf, origine: string | null, maintenant = new Date()): Promise<Uint8Array<ArrayBuffer>> {
  const doc = dossier.document;
  if (!doc) throw new Error("Dossier sans document");
  const financier = doc.type === "facture" || doc.type === "avoir" ? doc.type : null;
  const certification = dossier.emcf;
  if (certification && (!financier || certification.environnement !== "production" || certification.etat !== "confirmee"
    || !validerDemandeEmcf(certification.requete) || !certification.securite
    || ![certification.securite.codeMECeFDGI, certification.securite.dateTime, certification.securite.nim, certification.securite.counters, certification.securite.qrCode].every((v) => typeof v === "string" && v.trim())
    || certification.identite.ifu !== certification.requete.ifu
    || !Number.isSafeInteger(certification.calcul.total) || certification.calcul.total !== dossier.montant.valeur)) throw new Error("emcf_document_incoherent");
  const type = doc.type === "recu" ? "recu" : "devis";
  const c = (await lireContenu("documents.copiesDocuments"))[dossier.langue];
  const titreDocument = financier ? (certification ? c.emcf.titre[financier] : c.finance.titre[financier]) : c.titre[type];
  const empreinteTitre = financier ? c.finance.empreinte : c.pied.empreinte[type];
  const totalTitre = financier ? c.finance.total : dossier.objet.type === "boutique" ? c.total.commande : c.total[type];
  const o = dossier.objet;
  const devise = dossier.montant.devise;
  const [evenements, destinations, tours, releve] = await Promise.all([lireContenu("fr.evenements"), lireContenu("fr.destinations"), lireContenu("fr.tours"), lireContenu("lieux-ouidah")]);
  const contenuCarte = { destinations, tours, releve };
  const ev = o.type === "evenement" ? evenements.find((e) => e.title === o.titre) : undefined;
  const articles = o.type === "boutique" ? o.articles : [];

  const [[regular, bold, semibold, embleme], m, photoEv, photos] = await Promise.all([
    charger(),
    certification ? Promise.resolve(certification.identite) : lireMentions(dossier.langue),
    ev?.image ? octetsImage(ev.image.src) : Promise.resolve(null),
    photosArticles(articles.map((a) => a.nom)),
  ]);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  // Sous-ensembles : pdf-lib ne déclare que les glyphes employés, variantes contextuelles comprises, avec leur vraie
  // largeur. Chiffres des montants et numéros en Manrope tabulaire (tnum), comme les maquettes.
  const [manrope, gras, fraunces, chiffres, chiffresGras] = await Promise.all([
    pdf.embedFont(regular, { subset: true }),
    pdf.embedFont(bold, { subset: true }),
    pdf.embedFont(semibold, { subset: true }),
    pdf.embedFont(regular, { subset: true, features: { tnum: true } }),
    pdf.embedFont(bold, { subset: true, features: { tnum: true } }),
  ]);
  const integrer = async (i: ImageDoc | null): Promise<PDFImage | null> => (i ? (i.png ? pdf.embedPng(i.octets) : pdf.embedJpg(i.octets)).catch(() => null) : null);
  const sig = dossier.signature ?? null;
  const traceClient = sig && "image" in sig && typeof sig.image === "string" ? imageSignature(sig.image) : null;
  const [emblemeImg, imgEv, imgSignature, imgCachet, imgClient, ...imgArticles] = await Promise.all([
    pdf.embedPng(embleme),
    integrer(photoEv),
    integrer(m.signature),
    integrer(m.cachet),
    integrer(traceClient),
    ...photos.map(integrer),
  ]);
  pdf.setTitle(`${titreDocument} ${doc.numero}`);
  pdf.setAuthor(m.raisonSociale ?? "");
  pdf.setSubject(dossier.reference);
  pdf.setLanguage(c.langue);

  // Texte réduit aux glyphes de la police : espace absente (U+202F de Intl…) → espace normale, lettre accentuée absente
  // → lettre de base, sinon « ? ». Le rendu ne plante jamais sur un nom ou une note.
  const jeux = new Map<PDFFont, Set<number>>();
  const propre = (s: string, police: PDFFont) => {
    let jeu = jeux.get(police);
    if (!jeu) jeux.set(police, (jeu = new Set(police.getCharacterSet())));
    let sortie = "";
    for (const car of s.replace(/\r\n?/g, "\n")) {
      if (car === "\n" || jeu.has(car.codePointAt(0) ?? 0)) sortie += car;
      else if (/\s/.test(car)) sortie += " ";
      else {
        const b = car.normalize("NFD").replace(/\p{M}/gu, "");
        sortie += b && [...b].every((x) => jeu.has(x.codePointAt(0) ?? 0)) ? b : car === "′" ? "’" : "?";
      }
    }
    return sortie;
  };
  // largeurs mémorisées à 1 pt (proportionnelles au corps) : chaque palier essayé remesure le même texte
  const memo = new Map<PDFFont, Map<string, number>>();
  const largeur1 = (t: string, police: PDFFont) => {
    let mm = memo.get(police);
    if (!mm) memo.set(police, (mm = new Map()));
    let w = mm.get(t);
    if (w === undefined) mm.set(t, (w = police.widthOfTextAtSize(t, 1)));
    return w;
  };
  const larg = (t: string, f: PDFFont, s: number) => largeur1(propre(t, f), f) * s;
  // Retour à la ligne mot à mot ; un mot plus large que la colonne est coupé sans perte.
  const couper = (s: string, police: PDFFont, taille: number, largeur: number) => {
    const max = largeur / taille;
    const espace = largeur1(" ", police);
    const lignes: string[] = [];
    for (const paragraphe of propre(s, police).split("\n")) {
      let ligne = "";
      let w = 0;
      for (const mot of paragraphe.split(/ +/).filter(Boolean)) {
        const wm = largeur1(mot, police);
        if (ligne && w + espace + wm <= max) {
          ligne += ` ${mot}`;
          w += espace + wm;
          continue;
        }
        if (ligne) lignes.push(ligne);
        ligne = mot;
        w = wm;
        while (w > max && ligne.length > 1) {
          let bas = 1;
          let haut = ligne.length - 1;
          while (bas < haut) {
            const milieu = Math.ceil((bas + haut) / 2);
            if (largeur1(ligne.slice(0, milieu), police) <= max) bas = milieu;
            else haut = milieu - 1;
          }
          lignes.push(ligne.slice(0, bas));
          ligne = ligne.slice(bas);
          w = largeur1(ligne, police);
        }
      }
      lignes.push(ligne);
    }
    return lignes;
  };
  // Texte à plusieurs styles (même corps) coupé mot à mot : lignes de morceaux
  const couperRiche = (runs: Run[], taille: number, largeur: number): Run[][] => {
    // mots faits de morceaux : un morceau qui ne commence pas par une espace se colle au mot précédent (« CFA. »)
    const mots: Run[][] = [];
    let finEspace = true;
    for (const r of runs) {
      const t = propre(r.t, r.f);
      t.split(" ").forEach((m, j) => {
        if (!m) return;
        if (j === 0 && !finEspace && mots.length) mots[mots.length - 1].push({ ...r, t: m });
        else mots.push([{ ...r, t: m }]);
      });
      if (t) finEspace = t.endsWith(" ");
    }
    const lignes: Run[][] = [];
    let ligne: Run[] = [];
    let w = 0;
    for (const mot of mots) {
      const wm = mot.reduce((s, k) => s + largeur1(k.t, k.f) * taille, 0);
      const esp = ligne.length ? largeur1(" ", mot[0].f) * taille : 0;
      if (ligne.length && w + esp + wm > largeur) {
        lignes.push(ligne);
        ligne = [];
        w = 0;
      }
      ligne.push(...mot.map((k, i) => (i === 0 && ligne.length ? { ...k, t: ` ${k.t}` } : k)));
      w += (w ? esp : 0) + wm;
    }
    if (ligne.length) lignes.push(ligne);
    return lignes;
  };

  // Éléments séparés par un blanc fixe (mentions légales), passés à la ligne entiers ; un élément trop long est coupé.
  const flux = (items: string[], f: PDFFont, s: number, largeur: number, ecartItems: number): { t: string; dx: number }[][] => {
    const lignes: { t: string; dx: number }[][] = [];
    let x = 0;
    for (const item of items) {
      for (const [i, morceau] of couper(item, f, s, largeur).entries()) {
        const w = larg(morceau, f, s);
        if (!lignes.length || i > 0 || x + ecartItems + w > largeur) {
          lignes.push([{ t: morceau, dx: 0 }]);
          x = w;
        } else {
          lignes[lignes.length - 1].push({ t: morceau, dx: x + ecartItems });
          x += ecartItems + w;
        }
      }
    }
    return lignes;
  };

  // ---------- contenu, calculé une fois ----------
  const date = (v: string, forme?: Forme) => dateLongue(v, c.intl, c.mois, forme);
  const majuscule = (s: string) => s.charAt(0).toLocaleUpperCase(c.intl) + s.slice(1);
  const fNombre = new Intl.NumberFormat(c.intl, { maximumFractionDigits: 0 });
  const fEur = new Intl.NumberFormat(c.intl, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const chiffre = (n: number) => (devise === "EUR" ? fEur.format(n) : fNombre.format(n));
  const nomDevise = devise === "EUR" ? "€" : "FCFA";
  const periode = (debut: string, fin: string) => {
    const a = jourBenin(instant(debut));
    const z = jourBenin(instant(fin));
    if (!a || !z || ecart(a, z) === 0) return date(debut);
    const forme: Forme = a.a !== z.a ? "complet" : a.m !== z.m ? "jourMois" : "jour";
    return c.periode(date(debut, forme), date(fin));
  };
  const nuits = (debut: string, fin: string) => {
    const a = jourBenin(instant(debut));
    const z = jourBenin(instant(fin));
    return a && z ? ecart(a, z) : 0;
  };

  // lignes du document et plan de la carte
  let lignes: LigneDoc[] = [];
  let plan: PlanCarte | null = null; // null : vitrine (boutique) ; plan vide : carte sans tracé
  let mention: string | null = null;
  if (o.type === "voyage") {
    const brutes = dossier.devis?.lignes.map((l) => ({ libelle: l.libelle.replace(/\s+/g, " ").trim(), quantite: l.quantite, prix: l.prixUnitaire })) ?? [
      { libelle: [o.circuit, o.arrivee && o.depart ? periode(o.arrivee, o.depart) : null].filter(Boolean).join(" · ") || dossier.reference, quantite: 1, prix: dossier.montant.valeur ?? 0 },
    ];
    const v = planVoyage(o.circuit, brutes.map((l) => l.libelle), contenuCarte);
    plan = v.plan;
    if (!plan.etapes.length) {
      plan = { ...plan, reperes: reperesOuidah(c.carte.centre, destinations) };
      mention = financier ? null : c.carte.aComposer;
    }
    lignes = brutes.map((l, i) => ({ etape: v.refs[i], billet: null, libelle: l.libelle, sous: `${fNombre.format(l.quantite)} × ${chiffre(l.prix)}`, quantite: l.quantite, prix: l.prix, montant: l.quantite * l.prix }));
  } else if (o.type === "evenement") {
    plan = { etapes: [], trace: null, relie: false, reperes: [] }; // aucun événement n'a de coordonnée relevée : pas de point
    const detail = ev?.offre.type === "billet" ? ev.offre.categories.find((x) => x.nom === o.formule)?.detail : undefined;
    const libelle = c.ligneBillet(o.titre, o.formule);
    // détail de la formule : texte du site, en français seulement
    const sous1 = (q: number) => [detail && dossier.langue === "FR" ? majuscule(detail) : null, `${fNombre.format(q)} × ${chiffre(o.prixUnitaire)}`].filter(Boolean).join(" · ");
    lignes = dossier.billets.length
      ? dossier.billets.map((b) => ({ etape: null, billet: b.numero, libelle, sous: sous1(1), quantite: 1, prix: o.prixUnitaire, montant: o.prixUnitaire }))
      : [{ etape: null, billet: null, libelle, sous: sous1(o.places), quantite: o.places, prix: o.prixUnitaire, montant: dossier.montant.valeur ?? o.places * o.prixUnitaire }];
  } else {
    lignes = o.articles.map((a, i) => ({ etape: [i + 1, i + 1], billet: null, libelle: a.nom, sous: a.options.length ? a.options.join(" · ") : null, quantite: a.quantite, prix: a.prixXof, montant: a.prixXof === null ? null : a.prixXof * a.quantite }));
    // frais de livraison de la zone (compris dans le total de la commande) : une ligne de plus, sans numéro d'article
    if (o.livraison) lignes.push({ etape: null, billet: null, libelle: c.remise.livraison, sous: null, quantite: 1, prix: o.livraison, montant: o.livraison });
  }
  const somme = (l: LigneDoc[]) => l.reduce((s, x) => s + (x.montant ?? 0), 0);
  const total = type === "devis" ? (dossier.devis?.montant ?? somme(lignes)) : (dossier.montant.valeur ?? somme(lignes));
  const colonnes = o.type === "boutique" ? "boutique" : o.type === "evenement" ? "billets" : "voyage";
  const avecEtapes = lignes.some((l) => l.etape);

  // cartouche : état, client, méta
  const signeLe = sig?.signe_le ?? null;
  let etat: Run[];
  if (type === "recu") {
    const le = dossier.paiement?.le ?? doc.date;
    etat = [{ t: c.etat.regle, f: gras, c: ABYSSE }, { t: c.etat.regleLe(date(le)).slice(c.etat.regle.length), f: manrope, c: ARDOISE }];
  } else {
    const a = jourBenin(instant(doc.date));
    const z = signeLe ? jourBenin(instant(signeLe)) : null;
    const emis = c.etat.emis(date(doc.date, a && z && a.a === z.a ? "jourMois" : "complet"));
    etat = [{ t: emis, f: manrope, c: ARDOISE }];
    if (signeLe) etat.push({ t: ` · ${c.etat.signe(date(signeLe))}`, f: manrope, c: ARDOISE });
    else if (dossier.statut === "paye") etat.push({ t: ` · ${c.etat.paye}`, f: gras, c: ABYSSE });
  }
  const meta: [string, string, RGB][] = [];
  if (o.type === "voyage") {
    if (o.arrivee && o.depart) {
      const n = nuits(o.arrivee, o.depart);
      meta.push([c.meta.sejour, [majuscule(periode(o.arrivee, o.depart)), n > 0 ? c.nuits(n) : null].filter(Boolean).join(" · "), ABYSSE]);
    }
    const qui = [o.adultes > 0 ? c.adultes(o.adultes) : null, o.enfants > 0 ? c.enfants(o.enfants) : null].filter(Boolean).join(", ");
    if (qui) meta.push([c.meta.voyageurs, qui, ABYSSE]);
    if (!financier && type === "devis" && dossier.devis?.valableJusquAu) {
      const fin = dossier.devis.valableJusquAu;
      const a = jourBenin(maintenant);
      const z = jourBenin(instant(fin));
      const reste = a && z && dossier.statut !== "paye" ? ecart(a, z) : null;
      meta.push(reste !== null && reste < 0 ? [c.meta.valable, majuscule(c.expire(date(fin))), LATERITE] : [c.meta.valable, [date(fin), reste === 0 ? c.dernierJour : null].filter(Boolean).join(" · "), ABYSSE]);
    }
    if (type === "recu") meta.push([c.meta.reference, dossier.reference, ABYSSE]);
  } else if (o.type === "evenement") {
    meta.push([c.meta.evenement, majuscule(periode(o.debut, o.fin)), ABYSSE]);
    if (ev?.place) meta.push([c.meta.lieu, ev.place, ABYSSE]);
    meta.push([c.meta.billets, c.placesFormule(o.places, o.formule), ABYSSE]);
  } else {
    meta.push([c.meta.commande, `${dossier.reference} · ${date(dossier.ticket.date)}`, ABYSSE]);
    meta.push([c.meta.remise, c.remise[o.remise], ABYSSE]);
    meta.push([c.meta.articles, c.articlesPieces(o.articles.length, o.articles.reduce((s, a) => s + a.quantite, 0)), ABYSSE]);
  }

  // empreintes : devis = celle de la signature en ligne (signature.ts, même contenu canonique) ; reçu = contenu du reçu
  const empreinte =
    !financier && type === "devis" && dossier.devis
      ? (sig?.empreinte ??
        empreinteDevis(
          { numero: doc.numero, lignes: dossier.devis.lignes.map((l) => ({ libelle: l.libelle, quantite: l.quantite, prix_unitaire: l.prixUnitaire })), montant: dossier.devis.montant, devise, valable_jusqu_au: dossier.devis.valableJusquAu, publie_le: doc.date, fiscalite: dossier.fiscalite },
          dossier.client,
        ))
      : createHash("sha256")
          .update(JSON.stringify({ numero: doc.numero, date: doc.date, reference: dossier.reference, client: dossier.client, montant: total, devise, paiement: dossier.paiement, lignes: lignes.map((l) => [l.billet, l.libelle, l.quantite, l.prix]), ...(dossier.fiscalite ? { fiscalite: dossier.fiscalite } : {}), ...(certification ? { emcf: certification } : {}) }), "utf8")
          .digest("hex");
  const court = `SHA-256 ${empreinte.slice(0, 4)}…${empreinte.slice(-4)}`;
  const verif = dossier.jeton ? `${(origine ?? "").replace(/^https?:\/\//, "")}/suivi/${dossier.jeton}` : null;

  // contre-valeur en FCFA : seulement pour une ancienne commande tenue en euros (depuis le 04/11, la boutique compte en FCFA)
  const refs: [string, string][] =
    financier
      ? [[financier === "avoir" ? c.finance.original : c.meta.reference, dossier.reference]]
      : o.type === "boutique"
      ? [[c.refs.commande, dossier.reference], [c.refs.ticket, dossier.ticket.numero], ...(devise === "EUR" ? [[c.refs.contreValeur, `${fNombre.format(Math.round(total * TAUX_EUR))} FCFA (1 € = ${new Intl.NumberFormat(c.intl, { minimumFractionDigits: 3 }).format(TAUX_EUR)} FCFA)`] as [string, string]] : [])]
      : o.type === "evenement"
        ? [[c.refs.reservation, dossier.reference], [c.refs.ticket, dossier.ticket.numero], ...(dossier.billets.length ? [[c.refs.entree, c.refs.entreeTexte] as [string, string]] : [])]
        : [[type === "devis" ? c.refs.demande : c.refs.reference, dossier.reference], [c.refs.ticket, dossier.ticket.numero]];
  if (dossier.fiscalite?.tva_active) {
    const f = dossier.fiscalite;
    refs.unshift([c.taxe.ht, `${fNombre.format(f.ht)} FCFA`], [`${c.taxe.tva} ${new Intl.NumberFormat(c.intl, { maximumFractionDigits: 2 }).format(f.tva_taux)} %`, `${fNombre.format(f.tva)} FCFA`], [c.taxe.ttc, `${fNombre.format(f.ttc)} FCFA`]);
  }
  const note = type === "devis" ? (dossier.devis?.note?.trim() ?? "") : "";
  const legal1 = [[m.raisonSociale, m.forme].filter(Boolean).join(", "), m.rccm && `RCCM ${m.rccm}`, m.ifu && `IFU ${m.ifu}`].filter((x): x is string => !!x);
  const legal2 = [m.adresse, m.telephone, m.email].filter((x): x is string => !!x);
  const textesPied = [m.pied, m.mentions].filter((x): x is string => !!x);

  // ---------- mise en page à une bande et une densité : mesure (pages = null) ou dessin ----------
  const composer = (b: Bande, d: Densite, dessiner: boolean, extra = 0): { fin: number; limite: number } => {
    const X = d.marge;
    const W = L - 2 * X;
    const g = d.g + extra;
    let page: PDFPage | null = dessiner ? pdf.addPage([L, H]) : null;
    const ecrire = (t: string, x: number, haut: number, f: PDFFont, s: number, col: RGB, ancre: "g" | "d" | "c" = "g") => {
      const p = propre(t, f);
      const w = largeur1(p, f) * s;
      if (page && p.trim()) page.drawText(p, { x: ancre === "d" ? x - w : ancre === "c" ? x - w / 2 : x, y: H - haut, size: s, font: f, color: col });
      return w;
    };
    const runs = (r: Run[], x: number, haut: number, s: number) => r.reduce((xx, k) => xx + ecrire(k.t, xx, haut, k.f, s, k.c), x) - x;
    const rect = (x: number, haut: number, w: number, h: number, col: RGB) => page?.drawRectangle({ x, y: H - haut - h, width: w, height: h, color: col });
    const filet = (x0: number, x1: number, haut: number, col: RGB, ep: number) => page?.drawLine({ start: { x: x0, y: H - haut }, end: { x: x1, y: H - haut }, thickness: ep, color: col });
    const pastille = (cx: number, cy: number, r: number, t: string) => {
      page?.drawCircle({ x: cx, y: H - cy, size: r, color: OCEAN });
      ecrire(t, cx, cy + 3.2, chiffresGras, MIN, BLANC, "c");
    };
    const image = (img: PDFImage, x: number, haut: number, w: number, h: number, couvrir: boolean) => {
      if (!page) return;
      const k = couvrir ? Math.max(w / img.width, h / img.height) : Math.min(w / img.width, h / img.height);
      const [iw, ih] = [img.width * k, img.height * k];
      const [ix, iy] = [x + (couvrir ? (w - iw) / 2 : 0), haut + (h - ih) / (couvrir ? 2 : 1)];
      if (couvrir) page.pushOperators(pushGraphicsState(), rectangle(x, H - haut - h, w, h), clip(), endPath());
      page.drawImage(img, { x: ix, y: H - iy - ih, width: iw, height: ih });
      if (couvrir) page.pushOperators(popGraphicsState());
    };
    const n2 = (n: number) => String(n).padStart(2, "0");

    // ---- pied (dessiné sur chaque page à la fin) : vérification, merci, mentions, empreinte complète ----
    const wVerif = W - larg(c.pied.verifier[type], gras, MIN) - 7.5;
    const fVerif = verif && couper(verif, gras, MIN, wVerif).length > 1 && couper(verif, manrope, MIN, wVerif).length === 1 ? manrope : gras;
    const tVerif = verif ? couper(verif, fVerif, MIN, wVerif) : [];
    const wHash = Math.max(larg(empreinte.slice(0, 32), chiffresGras, MIN), larg(empreinte.slice(32), chiffresGras, MIN), larg(empreinteTitre, gras, MIN));
    const wGauche = W - wHash - 21;
    const lignesLegal = [...flux(legal1, manrope, MIN, wGauche, 9), ...flux(legal2, manrope, MIN, wGauche, 9), ...textesPied.flatMap((t) => couper(t, manrope, MIN, wGauche).map((l) => [{ t: l, dx: 0 }]))];
    const merci = d.marge > 24; // palier extrême : le remerciement cède sa ligne aux mentions
    const hGauche = (merci ? 11.25 * 1.2 + 3 : 0) + lignesLegal.length * MIN * 1.45;
    const hDroite = MIN * 1.45 * 3 + 1.5;
    const hPied = 7.5 + tVerif.length * MIN * 1.45 + 6 + Math.max(hGauche, hDroite);
    const basPage = d.marge >= 42 ? 18 : 14;
    const hautPied = H - basPage - hPied;
    const limite = hautPied - 9;
    const dessinerPied = () => {
      let y = hautPied;
      filet(X, X + W, y, FILET, 0.75);
      y += 7.5;
      tVerif.forEach((l, i) => {
        y += MIN * 1.45;
        if (!i) ecrire(c.pied.verifier[type], X, y - 2.6, gras, MIN, GRIS);
        ecrire(l, X + larg(c.pied.verifier[type], gras, MIN) + 7.5, y - 2.6, fVerif, MIN, ABYSSE);
      });
      y += 6;
      const h = Math.max(hGauche, hDroite);
      let yg = y + h - hGauche;
      if (merci) {
        ecrire(c.pied.merci, X, yg + 11.25 * 0.95, fraunces, 11.25, ABYSSE);
        yg += 11.25 * 1.2 + 3;
      }
      for (const l of lignesLegal) {
        yg += MIN * 1.45;
        for (const k of l) ecrire(k.t, X + k.dx, yg - 2.6, manrope, MIN, GRIS);
      }
      const xd = X + W - wHash;
      let yd = y + h - hDroite;
      for (const [t, f] of [[empreinteTitre, gras], [empreinte.slice(0, 32), chiffresGras], [empreinte.slice(32), chiffresGras]] as const) {
        yd += MIN * 1.45;
        ecrire(t, xd, yd - 2.6, f, MIN, t === empreinteTitre ? GRIS : ABYSSE);
        yd += t === empreinteTitre ? 1.5 : 0;
      }
    };
    const pages: PDFPage[] = page ? [page] : [];
    let y = 0;
    const suite = () => {
      // page suivante (seulement si le contenu dépasse au palier extrême) : titre et numéro en tête
      page = pdf.addPage([L, H]);
      pages.push(page);
      ecrire(titreDocument, X, 40, fraunces, 18, ABYSSE);
      ecrire(doc.numero, X + W, 40, chiffresGras, MIN, ABYSSE, "d");
      filet(X, X + W, 50, ABYSSE, 1.1);
      y = 50 + g;
    };
    const place = (h: number, apres?: () => void) => {
      if (page && y + h > limite + 0.01) {
        suite();
        apres?.();
      }
    };

    // ---- bande : carte (ou vitrine), cartouche ----
    const cx = 34.5;
    const mini = !b.grille && b.h < 230; // bandes extrêmes : titre, numéro et état sur une seule rangée
    const cw = b.grille ? 307.5 : mini ? 380 : 330;
    const boites: Boite[] = [];
    const cart = (t: string, x: number, haut: number, f: PDFFont, s: number, col: RGB) => {
      const w = ecrire(t, x, haut, f, s, col);
      boites.push([x - 4, haut - s * 0.8 - 3, x + w + 4, haut + s * 0.25 + 3]);
      return w;
    };
    const dessinsCartouche: (() => void)[] = [];
    let yc = b.grille ? 24 : b.h >= 250 ? 18 : mini ? 9 : 12;
    // maison : emblème, raison sociale, adresse et e-mail
    const em = b.grille ? 39 : b.h >= 250 ? 33 : mini ? 24 : 28;
    const xm = cx + em + 10.5;
    const coord = (mini ? [[m.adresse, m.email].filter(Boolean).join(" · ")] : [m.adresse, m.email]).filter((x): x is string => !!x).flatMap((t) => couper(t, manrope, MIN, cw - em - 10.5));
    const hMaison = Math.max(em, 12 * 1.2 + 1.5 + coord.length * MIN * 1.4);
    {
      const y0 = yc;
      const t0 = y0 + (hMaison - (12 * 1.2 + 1.5 + coord.length * MIN * 1.4)) / 2;
      dessinsCartouche.push(() => {
        page?.drawImage(emblemeImg, { x: cx, y: H - y0 - (hMaison + em) / 2, width: em, height: em });
        boites.push([cx - 3, y0 - 3, cx + em + 3, y0 + hMaison + 3]);
        if (m.raisonSociale) cart(m.raisonSociale, xm, t0 + 12 * 0.95, fraunces, 12, ABYSSE);
        coord.forEach((l, i) => cart(l, xm, t0 + 12 * 1.2 + 1.5 + (i + 1) * MIN * 1.4 - 2.8, manrope, MIN, GRIS));
      });
      yc += hMaison;
    }
    // titre en Fraunces, réduit à la largeur du cartouche
    const titre = titreDocument;
    // approche resserrée des grands titres (letter-spacing -0,025 em des maquettes)
    const nT = [...propre(titre, fraunces)].length;
    const wTitre1 = largeur1(propre(titre, fraunces), fraunces) - 0.025 * (nT - 1);
    const tT = Math.min(b.grille ? 72 : b.h >= 250 ? 51 : mini ? 30 : 40, (b.grille ? cw : 330) / wTitre1);
    const wNum = larg(doc.numero, chiffresGras, 12);
    const wEtat = etat.reduce((s, r) => s + larg(r.t, r.f, MIN), 0) + 10.5;
    const surLeTitre = mini && wTitre1 * tT + 12 + wNum + 12 + wEtat <= cw; // numéro et état à droite du titre
    yc += b.grille ? 16.5 : mini ? 7.5 : 10.5;
    const baseTitre = yc + tT * 0.74;
    {
      dessinsCartouche.push(() => {
        page?.pushOperators(pushGraphicsState(), setCharacterSpacing(-0.025 * tT));
        const w = ecrire(titre, cx - tT * 0.02, baseTitre, fraunces, tT, ABYSSE) - 0.025 * tT * (nT - 1);
        page?.pushOperators(popGraphicsState());
        boites.push([cx - 4, baseTitre - tT * 0.8 - 3, cx + w + 4, baseTitre + tT * 0.25 + 3]);
      });
      yc += tT * 0.84;
    }
    // numéro et état (dessous en grille, à la suite en rangée si la place le permet)
    const etatALaSuite = !b.grille && wNum + 12 + wEtat <= (surLeTitre ? cw - wTitre1 * tT - 12 : cw);
    {
      if (!surLeTitre) yc += b.grille ? 12 : 9;
      const yn = surLeTitre ? baseTitre : yc + 12 * 0.8;
      const xn = surLeTitre ? cx + wTitre1 * tT + 12 : cx;
      dessinsCartouche.push(() => cart(doc.numero, xn, yn, chiffresGras, 12, ABYSSE));
      if (!surLeTitre) yc += 12 * 1.1;
      const ye = etatALaSuite ? yn - 0.6 : yc + 4.5 + MIN * 0.8;
      const xe = etatALaSuite ? xn + wNum + 12 : cx;
      dessinsCartouche.push(() => {
        page?.drawCircle({ x: xe + 3, y: H - ye + 3, size: 3, color: SOLEIL, borderColor: ABYSSE, borderWidth: 1.1 });
        const w = runs(etat, xe + 10.5, ye, MIN);
        boites.push([xe - 3, ye - MIN - 2, xe + 10.5 + w + 4, ye + 4]);
      });
      if (!etatALaSuite) yc += 4.5 + MIN * 1.25;
    }
    // client : libellé, nom (Fraunces), e-mail
    const pour = certification ? c.emcf.client : type === "recu" ? c.pour.recu : c.pour.devis;
    const tNom = b.grille ? 19.5 : b.h >= 250 ? 16.5 : mini ? 13.5 : 14;
    const enRangee = !b.grille && larg(pour, gras, MIN) + larg(dossier.client.nom, fraunces, tNom) + larg(dossier.client.email, manrope, MIN) + 15 <= cw;
    yc += b.grille ? 15 : mini ? 7.5 : 10.5;
    if (enRangee) {
      const yb = yc + tNom * 0.85;
      dessinsCartouche.push(() => {
        let x = cx + cart(pour, cx, yb - 0.6, gras, MIN, GRIS) + 7.5;
        x += cart(dossier.client.nom, x, yb, fraunces, tNom, ABYSSE) + 7.5;
        cart(dossier.client.email, x, yb - 0.6, manrope, MIN, GRIS);
      });
      yc += tNom * 1.1;
    } else {
      const noms = couper(dossier.client.nom, fraunces, tNom, cw);
      const mails = couper(dossier.client.email, manrope, MIN, cw);
      const y0 = yc;
      dessinsCartouche.push(() => {
        cart(pour, cx, y0 + MIN * 0.8, gras, MIN, GRIS);
        noms.forEach((l, i) => cart(l, cx, y0 + MIN * 1.3 + 2.25 + tNom * 0.82 + i * tNom * 1.1, fraunces, tNom, ABYSSE));
        mails.forEach((l, i) => cart(l, cx, y0 + MIN * 1.3 + 2.25 + noms.length * tNom * 1.1 + 2.25 + MIN * 0.8 + i * MIN * 1.3, manrope, MIN, GRIS));
      });
      yc += MIN * 1.3 + 2.25 + noms.length * tNom * 1.1 + 2.25 + mails.length * MIN * 1.3;
    }
    // méta : grille (libellé | valeur) ou rangée de colonnes (libellé au-dessus de la valeur)
    const tM = 9.75;
    const colsMeta = meta.map(([dt, dd]) => Math.max(larg(dt, gras, MIN), larg(dd, gras, tM)));
    const metaEnRangee = !b.grille && colsMeta.reduce((s, w) => s + w, 0) + 15 * (meta.length - 1) <= cw;
    // bandes extrêmes : « libellé valeur » à la suite, en rangées qui passent à la ligne
    const wItems = meta.map(([dt, dd]) => larg(dt, gras, MIN) + 6 + larg(dd, gras, tM));
    const metaEnFlux = mini && !metaEnRangee && wItems.every((w) => w <= cw);
    if (meta.length) {
      yc += b.grille ? 9 : mini ? 4.5 : 6;
      const y0 = yc;
      if (metaEnFlux) {
        const pos: { x: number; r: number }[] = [];
        let x = 0;
        let r = 0;
        wItems.forEach((w) => {
          if (x && x + w > cw) [x, r] = [0, r + 1];
          pos.push({ x, r });
          x += w + 13.5;
        });
        dessinsCartouche.push(() =>
          meta.forEach(([dt, dd, col], i) => {
            const base = y0 + tM * 0.8 + pos[i].r * tM * 1.35;
            const w = cart(dt, cx + pos[i].x, base - 0.4, gras, MIN, GRIS);
            cart(dd, cx + pos[i].x + w + 6, base, gras, tM, col);
          }),
        );
        yc += (r + 1) * tM * 1.35 - tM * 0.35;
      } else if (metaEnRangee) {
        dessinsCartouche.push(() => {
          let x = cx;
          meta.forEach(([dt, dd, col], i) => {
            cart(dt, x, y0 + MIN * 0.8, gras, MIN, GRIS);
            cart(dd, x, y0 + MIN * 1.3 + 1.5 + tM * 0.8, gras, tM, col);
            x += colsMeta[i] + 15;
          });
        });
        yc += MIN * 1.3 + 1.5 + tM * 1.3;
      } else {
        const xdd = cx + Math.max(...meta.map(([dt]) => larg(dt, gras, MIN))) + 12;
        const valeurs = meta.map(([, dd]) => couper(dd, gras, tM, cx + cw - xdd));
        dessinsCartouche.push(() => {
          let yy = y0;
          meta.forEach(([dt, , col], i) => {
            cart(dt, cx, yy + tM * 0.8 - 0.4, gras, MIN, GRIS);
            valeurs[i].forEach((l, j) => cart(l, xdd, yy + tM * 0.8 + j * tM * 1.3, gras, tM, col));
            yy += valeurs[i].length * tM * 1.3 + 3;
          });
        });
        yc += valeurs.reduce((s, v) => s + v.length * tM * 1.3 + 3, -3);
      }
    }
    // la bande contient toujours le cartouche au-dessus du rivage (elle grandit plutôt que de le couper)
    const hb = Math.max(b.h, yc + (b.grille ? 12 : 8) + b.mer);
    const yR = hb - b.mer; // rivage

    if (page) {
      dessinsCartouche.forEach((f) => f()); // boîtes du cartouche mesurées (page 1)
      const pinceau: Pinceau = { page, hauteur: H, ecrire: (t, x, haut, f, s, col, ancre) => ecrire(t, x, haut, f, s, col, ancre), largeur: larg, serif: fraunces, gras };
      const droite = Math.max(...boites.map((x) => x[2]));
      if (plan) {
        // photo de l'événement, posée dans la terre à droite du cartouche (si le site en a une)
        if (imgEv && ev) {
          const legende = ev.text ? couper(ev.text, manrope, MIN, 160) : [];
          const hLeg = 12.75 * 1.2 + legende.slice(0, 2).length * MIN * 1.35 + 6;
          const ph = Math.min(204, yR - 22.5 - hLeg - 10);
          const pw = ph * 0.75;
          const px = Math.max(droite + 18, 375);
          image(imgEv, px, 22.5, pw, ph, true);
          ecrire(ev.title, px, 22.5 + ph + 6 + 12.75 * 0.9, fraunces, 12.75, ABYSSE);
          legende.slice(0, 2).forEach((l, i) => ecrire(l, px, 22.5 + ph + 6 + 12.75 * 1.2 + (i + 1) * MIN * 1.35 - 2.6, manrope, MIN, GRIS));
          boites.push([px - 6, 16, px + Math.max(pw, 160) + 6, 22.5 + ph + hLeg + 6]);
        }
        dessinerCarte(pinceau, {
          contenu: contenuCarte,
          largeur: L,
          rivage: yR,
          mer: b.mer,
          zone: { ouest: Math.min(Math.max(droite + 40, 360), L - 110), est: Math.min(Math.max(450, droite + 90), L - 66), nord: b.grille ? 31 : 24 },
          plan,
          points: o.type !== "evenement",
          obstacles: boites,
          marge: cx,
          textes: { ocean: c.carte.ocean, lagune: c.carte.lagune, mention, parcours: c.carte.parcoursPied },
          intl: c.intl,
        });
      } else {
        // vitrine de la boutique : les articles commandés, numérotés ; photo du catalogue ou vignette vide nommée
        rect(0, yR, L, b.mer, OCEAN);
        ecrire(c.carte.boutique(m.raisonSociale ?? ""), cx, yR + b.mer / 2 + 4, fraunces, 11.25, SABLE);
        ecrire(imgArticles.some(Boolean) ? c.carte.photos : c.carte.articles, L - cx, yR + b.mer / 2 + 3.4, gras, MIN, SABLE, "d");
        const n = Math.min(articles.length, 6);
        const cols = n <= 4 ? 2 : 3;
        const rangs = Math.ceil(n / cols);
        const x0 = Math.max(droite + 18, 352);
        const wCol = (L - 21 - x0 - (cols - 1) * 15) / cols;
        const hCase = (yR - 21 - (rangs - 1) * 9) / rangs;
        for (let i = 0; i < n; i++) {
          const a = articles[i];
          const [xc, yc0] = [x0 + (i % cols) * (wCol + 15), 21 + Math.floor(i / cols) * (hCase + 9)];
          const plus = i === 5 && articles.length > 6 ? articles.length - 5 : 0;
          const nomA = couper(plus ? `+ ${plus}` : a.nom, fraunces, 10.5, wCol).slice(0, 2);
          const sousA = plus ? "" : [a.options.join(" · "), `× ${a.quantite}`].filter(Boolean).join(" · ");
          const hTexte = nomA.length * 10.5 * 1.15 + (sousA ? MIN * 1.3 : 0) + 4.5;
          const hPhoto = Math.max(24, hCase - hTexte);
          const img = plus ? null : imgArticles[i];
          if (img) image(img, xc, yc0, wCol, hPhoto, false);
          else page.drawRectangle({ x: xc, y: H - yc0 - hPhoto, width: wCol, height: hPhoto, borderColor: FILET_F, borderWidth: 0.75 });
          if (!plus) pastille(xc + 8.25, yc0 + 8.25, 8.25, n2(i + 1));
          nomA.forEach((l, j) => ecrire(l, xc, yc0 + hPhoto + 4.5 + 10.5 * 0.85 + j * 10.5 * 1.15, fraunces, 10.5, ABYSSE));
          if (sousA) ecrire(couper(sousA, manrope, MIN, wCol)[0], xc, yc0 + hPhoto + 4.5 + nomA.length * 10.5 * 1.15 + MIN * 0.95, manrope, MIN, GRIS);
        }
      }
    }
    y = hb + g + 3;

    // ---- tableau ----
    const T = d.corps;
    const S = MIN;
    const rP = d.marge <= 24 ? 6.25 : d.enLigne || T <= 9.5 ? 7.5 : 8.25; // rayon des pastilles d'étape
    const wEtape = (e: [number, number]) => (e[0] === e[1] ? 2 * rP : 4 * rP + 9 + larg(c.a, gras, MIN));
    const montantTitre = `${c.montant[type]} (${nomDevise})`;
    const colEtape = colonnes === "billets" ? Math.max(larg(c.colonnes.billet, gras, MIN), ...lignes.map((l) => (l.billet ? larg(l.billet, chiffresGras, MIN) : 0))) : colonnes === "boutique" ? Math.max(larg(c.colonnes.numero, gras, MIN), 2 * rP) : avecEtapes ? Math.max(larg(c.colonnes.etape, gras, MIN), ...lignes.map((l) => (l.etape ? wEtape(l.etape) : 0))) : 0;
    const wMontantValeurs = Math.max(0, ...lignes.map((l) => (l.montant === null ? 0 : larg(chiffre(l.montant), chiffresGras, T))));
    const wQte = colonnes === "boutique" ? Math.max(larg(c.quantite, gras, MIN), ...lignes.map((l) => larg(fNombre.format(l.quantite), chiffres, T))) : 0;
    const wPu = colonnes === "boutique" ? Math.max(larg(`${c.prixUnitaire} (${nomDevise})`, gras, MIN), ...lignes.map((l) => (l.prix === null ? 0 : larg(chiffre(l.prix), chiffres, T)))) : 0;
    const ec = d.marge <= 24 ? 9 : 13.5;
    const colQpu = d.enLigne && colonnes === "voyage"; // paliers serrés : « 3 × 15 000 » dans sa colonne, sur la rangée
    const wQpu = colQpu ? Math.max(...lignes.map((l) => (l.sous ? larg(l.sous, chiffres, S) : 0))) : 0;
    // en colonne « quantité × prix », l'en-tête « Montant (FCFA) » couvre les deux colonnes chiffrées
    const wMontant = Math.max(wMontantValeurs, larg(montantTitre, gras, MIN) - (colQpu ? wQpu + ec : 0));
    const xLib = X + (colEtape ? colEtape + ec : 0);
    const xMontant = X + W;
    const xPu = xMontant - wMontant - ec;
    const xQte = xPu - (wPu ? wPu + ec : 0);
    const wLib = (colonnes === "boutique" ? xQte - wQte - ec : colQpu ? xPu - wQpu - ec : xMontant - wMontant - ec) - xLib;
    const fLib = d.libGras ? gras : manrope;
    const enTete = () => {
      const h = y + MIN * 0.8;
      if (colEtape) ecrire(colonnes === "billets" ? c.colonnes.billet : colonnes === "boutique" ? c.colonnes.numero : c.colonnes.etape, X, h, gras, MIN, GRIS);
      ecrire(colonnes === "boutique" ? c.colonnes.article : c.designation, xLib, h, gras, MIN, GRIS);
      if (colonnes === "boutique") {
        ecrire(c.quantite, xQte, h, gras, MIN, GRIS, "d");
        ecrire(`${c.prixUnitaire} (${nomDevise})`, xPu, h, gras, MIN, GRIS, "d");
      }
      ecrire(montantTitre, xMontant, h, gras, MIN, GRIS, "d");
      y = h + 5.25;
      filet(X, X + W, y, ABYSSE, 1.1);
    };
    place(MIN * 2 + 40);
    enTete();
    for (const l of lignes) {
      // désignation, puis sous-ligne (quantité × prix, formule, options) dessous ou à la suite
      const sousBoutique = colonnes === "boutique";
      const lib = couper(l.libelle, fLib, T, wLib);
      let sous = l.sous && !colQpu ? couper(l.sous, manrope, S, wLib) : [];
      let sousALaSuite = false;
      if (d.enLigne && l.sous && !sousBoutique && !colQpu) {
        const suiteTxt = ` · ${l.sous}`;
        if (larg(lib[lib.length - 1], fLib, T) + larg(suiteTxt, manrope, S) <= wLib) {
          sousALaSuite = true;
          sous = [];
        }
      }
      const hTexte = T * 0.78 + (lib.length - 1) * T * d.lh + sous.length * S * d.lh + T * 0.22;
      const hRang = Math.max(hTexte, l.etape && colonnes !== "billets" ? 2 * rP - d.rp : 0) + 2 * d.rp;
      place(hRang, enTete);
      const milieu = y + hRang / 2;
      let yl = y + (hRang - hTexte) / 2 + T * 0.78;
      lib.forEach((t, i) => {
        const w = ecrire(t, xLib, yl, fLib, T, ABYSSE);
        if (sousALaSuite && i === lib.length - 1) ecrire(` · ${l.sous}`, xLib + w, yl, manrope, S, GRIS);
        if (i < lib.length - 1) yl += T * d.lh;
      });
      for (const t of sous) {
        yl += S * d.lh;
        ecrire(t, xLib, yl, manrope, S, GRIS);
      }
      // cellules chiffrées et renvois, au milieu de la rangée
      if (colonnes === "billets" && l.billet) ecrire(l.billet, X, milieu + 3.2, chiffresGras, MIN, ABYSSE);
      if (l.etape && colonnes !== "billets") {
        pastille(X + rP, milieu, rP, n2(l.etape[0]));
        if (l.etape[1] !== l.etape[0]) {
          ecrire(c.a, X + 2 * rP + 4.5, milieu + 3.2, gras, MIN, GRIS);
          pastille(X + 2 * rP + 9 + larg(c.a, gras, MIN) + rP, milieu, rP, n2(l.etape[1]));
        }
      }
      if (colQpu && l.sous) ecrire(l.sous, xPu, milieu + T * 0.35, chiffres, S, GRIS, "d");
      if (colonnes === "boutique") {
        ecrire(fNombre.format(l.quantite), xQte, milieu + T * 0.35, chiffres, T, ARDOISE, "d");
        if (l.prix !== null) ecrire(chiffre(l.prix), xPu, milieu + T * 0.35, chiffres, T, ARDOISE, "d");
      }
      if (l.montant !== null) ecrire(chiffre(l.montant), xMontant, milieu + T * 0.35, chiffresGras, T, ABYSSE, "d");
      y += hRang;
      filet(X, X + W, y, FILET, 0.75);
    }

    // ---- somme : total géant (Manrope tabulaire), montant en lettres, références ----
    y += g + 1.5;
    const valeur = chiffre(total);
    const wDev = larg(nomDevise, gras, 10.5);
    const mt = Math.min(d.mt, (W * 0.52 - wDev - 7.5) / largeur1(propre(valeur, chiffres), chiffres));
    const wTotal = Math.max(larg(valeur, chiffres, mt) + 7.5 + wDev, larg(totalTitre, gras, MIN) + 22.5);
    const xD = X + wTotal + 24;
    const wD = X + W - xD;
    const tL = 10.5;
    const phrase = (financier ? c.finance.arrete : c.arrete[type])("\u0000").split("\u0000");
    const lettres = couperRiche([{ t: phrase[0], f: fraunces, c: ARDOISE }, { t: c.enLettres(total, devise), f: fraunces, c: ABYSSE }, { t: phrase[1] ?? "", f: fraunces, c: ARDOISE }], tL, wD);
    // références en rangée qui passe à la ligne (libellé en gras gris, valeur)
    const items = refs.map(([k, v]) => {
      const wk = larg(k, gras, MIN) + 4;
      return { k, v: couper(v, manrope, MIN, wD - wk), wk };
    });
    const rangsRefs: (typeof items)[] = [];
    let wr = 0;
    for (const it of items) {
      const w = it.wk + larg(it.v[0], manrope, MIN);
      if (!rangsRefs.length || it.v.length > 1 || wr + 13.5 + w > wD) {
        rangsRefs.push([it]);
        wr = w;
      } else {
        rangsRefs[rangsRefs.length - 1].push(it);
        wr += 13.5 + w;
      }
    }
    const hRefs = rangsRefs.reduce((s, r) => s + Math.max(...r.map((it) => it.v.length)) * MIN * 1.45, 0);
    const hDroiteS = lettres.length * tL * 1.45 + 6 + hRefs;
    const hGaucheS = MIN * 1.3 + 4.5 + mt * 0.9;
    const hSomme = Math.max(hDroiteS, hGaucheS);
    place(hSomme);
    {
      const yb = y + hSomme; // alignés en bas
      let yg = yb - hGaucheS;
      rect(X, yg + MIN * 0.45, 16.5, 3, SOLEIL);
      ecrire(totalTitre, X + 22.5, yg + MIN * 0.8, gras, MIN, GRIS);
      yg += MIN * 1.3 + 4.5 + mt * 0.73;
      const wv = ecrire(valeur, X - mt * 0.03, yg, chiffres, mt, ABYSSE);
      ecrire(nomDevise, X + wv + 7.5, yg, gras, 10.5, ABYSSE);
      let yd = yb - hDroiteS;
      for (const l of lettres) {
        yd += tL * 1.45;
        runs(l, xD, yd - 3.3, tL);
      }
      yd += 6;
      for (const r of rangsRefs) {
        let x = xD;
        const nl = Math.max(...r.map((it) => it.v.length));
        for (const it of r) {
          ecrire(it.k, x, yd + MIN * 1.1, gras, MIN, GRIS);
          it.v.forEach((v, j) => ecrire(v, x + it.wk, yd + MIN * 1.1 + j * MIN * 1.45, manrope, MIN, ARDOISE));
          x += it.wk + larg(it.v[0], manrope, MIN) + 13.5;
        }
        yd += nl * MIN * 1.45;
      }
    }
    y += hSomme;

    // ---- note du devis ----
    if (note) {
      y += g;
      place(MIN * 1.4 + T * d.lh);
      ecrire(c.note, X, y + MIN * 0.8, gras, MIN, GRIS);
      y += MIN * 1.4;
      for (const l of couper(note, manrope, T, W)) {
        place(T * d.lh);
        y += T * d.lh;
        ecrire(l, X, y - T * (d.lh - 0.78) + T * 0.06, manrope, T, ABYSSE);
      }
      y += T * 0.3;
    }

    // ---- deux cartes de signature jumelles ----
    y += g + 3;
    const wc = (W - 12) / 2;
    const serre = d.marge <= 24;
    const pad = serre ? [6, 12, 6] : [9, 13.5, 8];
    const wi = wc - 2 * pad[1];
    const tH2 = serre ? 11.25 : 12.75;
    const D = imgCachet ? d.cachet : 0;
    type Carte = { titre: string; etat: string | null; zone: (x: number, haut: number) => void; qui: Run[][]; preuve: string[]; cachet: PDFImage | null; pied: string[] };
    const quiClient = (t: string, w: number) => couperRiche([{ t, f: gras, c: ABYSSE }], 10, w);
    const cartes: Carte[] = [];
    if (financier) {
      cartes.push({
        titre: c.meta.reference,
        etat: null,
        zone: (x, haut) => { ecrire(doc.numero, x, haut + d.sh - 6, chiffresGras, 15, ABYSSE); },
        qui: [],
        preuve: couper(certification ? c.emcf.normalise : c.finance.nonNormalise, manrope, MIN, wi),
        cachet: null,
        pied: couper(court, manrope, MIN, wi),
      });
    } else if (type === "devis" && o.type === "boutique") {
      cartes.push({
        titre: c.refs.commande,
        etat: null,
        zone: (x, haut) => { ecrire(c.client.confirmationCommande, x + wi / 2, haut + d.sh / 2 + 3.2, gras, MIN, GRIS, "c"); },
        qui: quiClient(dossier.client.nom, wi),
        preuve: [],
        cachet: null,
        pied: couper(`${c.client.empreinteDevis}${c.sep}${court}`, manrope, MIN, wi),
      });
    } else if (type === "devis") {
      const hm = sig ? heureBenin(sig.signe_le) : null;
      cartes.push({
        titre: c.client.accord,
        etat: sig ? c.client.signe : null,
        zone: (x, haut) => {
          if (sig && imgClient) image(imgClient, x, haut + 2, wi, d.sh - 5, false);
          else if (sig) ecrire(couper(sig.nom, fraunces, 16.5, wi)[0], x, haut + d.sh - 6, fraunces, 16.5, OCEAN);
          else ecrire(c.client.aSigner, x + wi / 2, haut + d.sh / 2 + 3.2, gras, MIN, GRIS, "c");
        },
        qui: quiClient(sig?.nom ?? dossier.client.nom, wi),
        preuve: sig && hm ? couper(c.client.signeLe(date(sig.signe_le), c.heure(hm[0], hm[1])), manrope, MIN, wi) : [],
        cachet: null,
        pied: couper(`${c.client.empreinteDevis}${c.sep}${court}`, manrope, MIN, wi),
      });
    } else {
      const p = dossier.paiement;
      cartes.push({
        titre: c.client.reglement,
        etat: c.client.regle,
        zone: (x, haut) => {
          const w = ecrire(chiffre(total), x, haut + d.sh - 6, chiffresGras, 21, ABYSSE);
          ecrire(nomDevise, x + w + 6, haut + d.sh - 6, gras, MIN, ARDOISE);
        },
        qui:
          o.type === "boutique"
            ? couperRiche([...(p ? [{ t: `${p.passerelle} · `, f: gras, c: ABYSSE }] : []), { t: o.remise === "retrait" ? c.client.retrait : c.client.livraison, f: p ? manrope : gras, c: p ? GRIS : ABYSSE }], 10, wi)
            : quiClient(p?.passerelle ?? dossier.client.nom, wi),
        preuve: [c.etat.regleLe(date(p?.le ?? doc.date)), p?.transaction ? `${c.client.transaction} ${p.transaction}` : null].filter((x): x is string => !!x).flatMap((t) => couper(t, manrope, MIN, wi)),
        cachet: null,
        pied: couper(`${c.client.empreinteRecu}${c.sep}${court}`, manrope, MIN, wi),
      });
    }
    cartes.push({
      titre: c.direction.titre,
      etat: null,
      zone: (x, haut) => {
        if (imgSignature) image(imgSignature, x, haut + 2, wi, d.sh - 5, false);
      },
      qui: m.signataire ? quiClient(m.signataire, wi - (D ? D + 9 : 0)) : [],
      preuve: couper(m.fonction ?? c.direction.role, manrope, MIN, wi - (D ? D + 9 : 0)),
      cachet: imgCachet,
      pied: couper(c.direction.pied, manrope, MIN, wi),
    });
    const hNom = (k: Carte) => Math.max(k.qui.length * 10 * 1.3 + (k.preuve.length ? 3 : 0) + k.preuve.length * MIN * 1.45, k.cachet ? D : 0, serre ? 22 : 30);
    const hNomMax = Math.max(...cartes.map(hNom));
    const hPiedC = Math.max(...cartes.map((k) => k.pied.length)) * MIN * 1.45 + 4.5;
    const hCarte = pad[0] + tH2 * 1.2 + 3 + d.sh + 5.25 + hNomMax + 4.5 + hPiedC + pad[2];
    place(hCarte);
    cartes.forEach((k, i) => {
      const x = X + i * (wc + 12);
      if (page) {
        const r = 4.5;
        page.drawSvgPath(`M${r} 0H${wc - r}A${r} ${r} 0 0 1 ${wc} ${r}V${hCarte - r}A${r} ${r} 0 0 1 ${wc - r} ${hCarte}H${r}A${r} ${r} 0 0 1 0 ${hCarte - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`, { x, y: H - y, borderColor: FILET_F, borderWidth: 0.75 });
      }
      const xi = x + pad[1];
      let yy = y + pad[0];
      ecrire(k.titre, xi, yy + tH2 * 0.9, fraunces, tH2, ABYSSE);
      if (k.etat) {
        const w = larg(k.etat, gras, MIN);
        ecrire(k.etat, xi + wi, yy + tH2 * 0.9 - 0.6, gras, MIN, ABYSSE, "d");
        page?.drawCircle({ x: xi + wi - w - 8, y: H - (yy + tH2 * 0.9 - 3.6), size: 3, color: SOLEIL, borderColor: ABYSSE, borderWidth: 1.1 });
      }
      yy += tH2 * 1.2 + 3;
      k.zone(xi, yy);
      yy += d.sh;
      filet(xi, xi + wi, yy, ABYSSE, 0.75);
      yy += 5.25;
      const hTexte = k.qui.length * 10 * 1.3 + (k.preuve.length ? 3 : 0) + k.preuve.length * MIN * 1.45;
      let yq = yy + (hNomMax - hTexte) / 2;
      for (const l of k.qui) {
        yq += 10 * 1.3;
        runs(l, xi, yq - 3, 10);
      }
      if (k.preuve.length) yq += 3;
      for (const l of k.preuve) {
        yq += MIN * 1.45;
        ecrire(l, xi, yq - 3, manrope, MIN, GRIS);
      }
      if (k.cachet) image(k.cachet, xi + wi - D, yy + (hNomMax - D) / 2, D, D, false);
      const yp = y + hCarte - pad[2] - hPiedC;
      filet(xi, xi + wi, yp, FILET, 0.75);
      k.pied.forEach((l, j) => ecrire(l, xi, yp + 4.5 + (j + 1) * MIN * 1.45 - 3, manrope, MIN, GRIS));
    });
    y += hCarte;

    if (page) for (const p of pages) {
      page = p;
      dessinerPied();
    }
    return { fin: y, limite };
  };

  // Palier choisi : la plus grande bande, puis la densité la plus aérée, qui tiennent sur une page ; l'air restant est
  // réparti entre les blocs (au plus 9 pt de plus par espacement).
  const essais = bandes(lignes.length).flatMap((b) => DENSITES.map((d) => ({ b, d })));
  let choix = essais[essais.length - 1];
  let extra = 0;
  for (const e of essais) {
    const r = composer(e.b, e.d, false);
    if (r.fin <= r.limite) {
      choix = e;
      extra = Math.min(9, Math.max(0, r.limite - r.fin - 0.5) / (note ? 4 : 3));
      break;
    }
  }
  composer(choix.b, choix.d, true, extra);
  if (certification) {
    // Les éléments DGI ont leur propre page : le gabarit existant garde son plancher de 9 pt.
    // Le QR encode exactement le contenu renvoyé ; aucune URL n'est inventée ni visitée.
    const X = 42, W = L - 2 * X;
    let page: PDFPage;
    let y = 0;
    const nouvelle = () => {
      page = pdf.addPage([L, H]);
      y = 42;
      for (const ligne of couper(c.emcf.certification, fraunces, 18, W)) {
        page.drawText(ligne, { x: X, y: H - y - 18, size: 18, font: fraunces, color: ABYSSE });
        y += 25;
      }
      page.drawText(doc.numero, { x: X, y: H - y - 12, size: 12, font: chiffresGras, color: ABYSSE });
      y += 38;
    };
    const texte = (valeur: string, police = manrope, taille = MIN, largeur = W) => {
      for (const ligne of couper(valeur, police, taille, largeur)) {
        if (y + taille * 1.5 > H - 42) nouvelle();
        page.drawText(ligne, { x: X, y: H - y - taille, size: taille, font: police, color: ABYSSE });
        y += taille * 1.5;
      }
    };
    const champ = (nom: string, valeur: string | null | undefined) => {
      if (!valeur) return;
      if (y + 32 > H - 42) nouvelle();
      texte(nom, gras);
      texte(valeur);
      y += 9;
    };
    nouvelle();
    const s = certification.securite;
    const qr = QRCode.create(s.qrCode, { errorCorrectionLevel: "M" });
    const cote = 156, cellule = cote / (qr.modules.size + 8);
    page!.drawRectangle({ x: L - X - cote, y: H - y - cote, width: cote, height: cote, color: BLANC });
    for (let ligne = 0; ligne < qr.modules.size; ligne++) for (let colonne = 0; colonne < qr.modules.size; colonne++) {
      if (qr.modules.get(ligne, colonne)) page!.drawRectangle({ x: L - X - cote + (colonne + 4) * cellule,
        y: H - y - (ligne + 5) * cellule, width: cellule, height: cellule, color: rgbHex("#000000") });
    }
    const debutQr = y;
    for (const [nom, valeur] of [[c.emcf.code, s.codeMECeFDGI], [c.emcf.nim, s.nim], [c.emcf.date, s.dateTime], [c.emcf.compteurs, s.counters]]) {
      texte(nom, gras, MIN, W - cote - 24);
      texte(valeur, manrope, MIN, W - cote - 24);
      y += 9;
    }
    y = Math.max(y, debutQr + cote) + 24;
    champ(c.emcf.emetteur, [[m.raisonSociale, m.forme].filter(Boolean).join(", "), m.adresse, m.ifu && `IFU ${m.ifu}`, m.rccm && `RCCM ${m.rccm}`, m.email, m.telephone].filter(Boolean).join("\n"));
    const client = certification.requete.client;
    champ(c.emcf.client, [client?.name, client?.ifu && `IFU ${client.ifu}`, client?.address, client?.contact].filter(Boolean).join("\n"));
    champ(c.finance.original, certification.requete.reference);
    for (const article of certification.requete.items) champ(`${c.emcf.groupe}${c.sep}${article.taxGroup}`, article.name);
  }
  return new Uint8Array(await pdf.save());
}
