import type { LangueDoc } from "@/lib/suivi";

// Libellés des documents PDF (devis, reçu de paiement), modèle E « La carte du séjour » validé par Kevin (03/11/2026),
// dans la langue enregistrée avec la commande (7 langues du site). Les données (agence, client, objet, montants, dates,
// lieux) viennent de la commande, de reglages_documents et de legal.json, jamais d'ici.
// HT et GCF : traductions et montants en lettres à faire valider par un locuteur. PT : écrit pour le Portugal (pt-PT) ;
// montant en lettres PT à faire relire aussi.
export type CopieDocument = {
  langue: string; // langue déclarée dans le PDF (BCP 47)
  intl: string; // locale Intl des nombres, et des dates quand `mois` est null
  mois: string[] | null; // mois écrits à la main : Intl ne connaît pas le créole haïtien ni le créole guadeloupéen
  titre: { recu: string; devis: string };
  finance: { titre: { facture: string; avoir: string }; nonNormalise: string; total: string; arrete: (somme: string) => string; empreinte: string; original: string };
  emcf: { titre: { facture: string; avoir: string }; normalise: string; certification: string; code: string; nim: string; date: string; compteurs: string; emetteur: string; client: string; groupe: string };
  taxe: { ht: string; tva: string; ttc: string };
  etat: { emis: (d: string) => string; signe: (d: string) => string; regleLe: (d: string) => string; regle: string; paye: string };
  pour: { devis: string; recu: string }; // au-dessus du nom du client
  meta: { sejour: string; voyageurs: string; valable: string; reference: string; evenement: string; lieu: string; billets: string; commande: string; remise: string; articles: string };
  periode: (debut: string, fin: string) => string; // en minuscule : la majuscule est posée au rendu
  nuits: (n: number) => string;
  adultes: (n: number) => string;
  enfants: (n: number) => string;
  placesFormule: (n: number, formule: string) => string;
  ligneBillet: (evenement: string, formule: string) => string; // désignation d'un billet
  remise: { retrait: string; livraison: string };
  articlesPieces: (articles: number, pieces: number) => string;
  expire: (d: string) => string;
  dernierJour: string;
  // aussi lus par l'e-mail de facture (lib/serveur/equipe/finances/documents.ts)
  sep: string; // deux-points selon la typographie de la langue
  designation: string;
  quantite: string;
  prixUnitaire: string;
  montant: { recu: string; devis: string }; // colonne : montant de la ligne (reçu), sous-total (devis)
  colonnes: { etape: string; billet: string; numero: string; article: string };
  a: string; // « 01 à 06 » : renvoi à une suite d'étapes
  total: { recu: string; devis: string; commande: string };
  arrete: { recu: (somme: string) => string; devis: (somme: string) => string };
  refs: { demande: string; reference: string; ticket: string; reservation: string; commande: string; contreValeur: string; entree: string; entreeTexte: string };
  note: string;
  client: { accord: string; signe: string; aSigner: string; confirmationCommande: string; signeLe: (date: string, heure: string) => string; empreinteDevis: string; reglement: string; regle: string; transaction: string; retrait: string; livraison: string; empreinteRecu: string };
  direction: { titre: string; pied: string; role: string }; // role : fonction du signataire si l'admin n'en a saisi aucune
  pied: { verifier: { recu: string; devis: string }; merci: string; empreinte: { recu: string; devis: string } };
  carte: { ocean: string; lagune: string; centre: string; parcoursPied: (km: string) => string; aComposer: string; boutique: (nom: string) => string; photos: string; articles: string };
  heure: (h: number, m: number) => string; // heure du Bénin (UTC+1)
  guillemets: (s: string) => string;
  enLettres: (n: number, devise: "XOF" | "EUR") => string; // montant arrêté en toutes lettres
};

/**
 * Limites de saisie d'un devis, appliquées en base et dans le formulaire de l'admin (dossiers-regles.ts, EditeurDevis).
 * La page unique n'est pas garantie par ces seules limites mais par le contrôle avant publication : `pagesDevis`
 * (lib/serveur/documents/controle.ts) rend le PDF tel qu'il sortira et le formulaire refuse de publier tant qu'il
 * dépasse une page (« raccourcir les libellés ou la note »).
 * Mesures du 04/11/2026 (modèle E, texte ≥ 9 pt partout, tests-oht/pdf-e-test.mjs) : 20 lignes de 90 caractères (texte
 * réel en casse normale) et une note de 1 000 caractères sans retour à la ligne tiennent sur une page dans les 7 langues ;
 * la carte descend alors sous 32 % de la page (pdf.ts, « bandes extrêmes »). Hors garantie, comme avec le rendu
 * précédent : une note de 1 000 caractères coupée par ses 8 retours, ou des libellés en capitales ou en lettres très
 * larges (« WWW… ») ; le contrôle les refuse.
 */
export const LIMITES_DEVIS = {
  lignes: 20, // lignes du devis
  libelle: 90, // caractères par libellé (espaces et retours ramenés à une espace dans le PDF) ; page vérifiée à la publication
  note: 1000, // caractères de la note
  retours: 8, // retours à la ligne dans la note (chacun peut ajouter une ligne)
  quantite: 999, // quantité maximale d'une ligne
  prixUnitaire: 9_999_999, // FCFA, par ligne
} as const;

/** Parité fixe du franc CFA (BCEAO), la même que reglages_site.taux_eur et la boutique. */
export const TAUX_EUR = 655.957;

const s = (n: number, mot: string, pluriel = `${mot}s`) => `${n} ${n > 1 ? pluriel : mot}`;
const deux = (m: number) => String(m).padStart(2, "0");
// euros et centimes : montant arrondi au centime
const centimes = (v: number) => {
  const c = Math.round(v * 100);
  return [Math.floor(c / 100), c % 100] as const;
};
const MAX = 1e12; // au-delà (jamais atteint : 20 lignes × 999 × 9 999 999 FCFA < 2,1 × 10¹¹), le montant reste en chiffres

// ---------- français (orthographe traditionnelle : « trois cent quarante-cinq mille ») ----------
const FR_U = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"];
const FR_D = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];
function fr100(n: number): string {
  if (n < 17) return FR_U[n];
  if (n < 20) return `dix-${FR_U[n - 10]}`;
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d === 7) return `soixante${u === 1 ? " et " : "-"}${fr100(10 + u)}`;
  if (d === 9) return `quatre-vingt-${fr100(10 + u)}`;
  if (d === 8) return u ? `quatre-vingt-${FR_U[u]}` : "quatre-vingts";
  return FR_D[d] + (u === 0 ? "" : u === 1 ? " et un" : `-${FR_U[u]}`);
}
function fr1000(n: number): string {
  const c = Math.floor(n / 100);
  const r = n % 100;
  const t = c === 0 ? "" : c === 1 ? "cent" : `${FR_U[c]} cent${r ? "" : "s"}`;
  return r ? `${t}${t ? " " : ""}${fr100(r)}` : t;
}
const frInvariable = (s1000: string) => s1000.replace(/(cent|vingt)s$/, "$1"); // « deux cent mille », « quatre-vingt mille »
function fr(n: number): string {
  if (!n) return "zéro";
  const g = [Math.floor(n / 1e9), Math.floor(n / 1e6) % 1000, Math.floor(n / 1e3) % 1000, n % 1000];
  return [
    g[0] ? `${g[0] === 1 ? "un" : frInvariable(fr1000(g[0]))} milliard${g[0] > 1 ? "s" : ""}` : "",
    g[1] ? `${g[1] === 1 ? "un" : frInvariable(fr1000(g[1]))} million${g[1] > 1 ? "s" : ""}` : "",
    g[2] ? (g[2] === 1 ? "mille" : `${frInvariable(fr1000(g[2]))} mille`) : "",
    g[3] ? fr1000(g[3]) : "",
  ]
    .filter(Boolean)
    .join(" ");
}
const rondMillions = (n: number) => n >= 1e6 && n % 1e6 === 0; // « un million de francs », « deux milliards d'euros »
function frSomme(v: number, devise: "XOF" | "EUR"): string {
  if (devise === "XOF") return `${fr(v)}${rondMillions(v) ? " de" : ""} ${v === 1 ? "franc CFA" : "francs CFA"}`;
  const [e, c] = centimes(v);
  const euros = e || !c ? `${fr(e)}${rondMillions(e) ? " d’" : " "}${e > 1 ? "euros" : "euro"}` : "";
  return euros + (c ? `${euros ? " et " : ""}${fr(c)} centime${c > 1 ? "s" : ""}` : "");
}

// ---------- anglais (britannique : « three hundred and forty-five thousand ») ----------
const EN_U = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_D = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const en100 = (n: number) => (n < 20 ? EN_U[n] : EN_D[Math.floor(n / 10)] + (n % 10 ? `-${EN_U[n % 10]}` : ""));
const en1000 = (n: number) => {
  const c = Math.floor(n / 100);
  const r = n % 100;
  return c ? `${EN_U[c]} hundred${r ? ` and ${en100(r)}` : ""}` : en100(r);
};
function en(n: number): string {
  if (!n) return "zero";
  const parts = ([[1e9, "billion"], [1e6, "million"], [1e3, "thousand"]] as const).flatMap(([v, mot]) => {
    const g = Math.floor(n / v) % 1000;
    return g ? [`${en1000(g)} ${mot}`] : [];
  });
  const r = n % 1000;
  if (r) parts.push(`${parts.length && r < 100 ? "and " : ""}${en1000(r)}`);
  return parts.join(" ");
}
function enSomme(v: number, devise: "XOF" | "EUR"): string {
  if (devise === "XOF") return `${en(v)} ${v === 1 ? "CFA franc" : "CFA francs"}`;
  const [e, c] = centimes(v);
  const euros = e || !c ? `${en(e)} ${e === 1 ? "euro" : "euros"}` : "";
  return euros + (c ? `${euros ? " and " : ""}${en(c)} ${c === 1 ? "cent" : "cents"}` : "");
}

// ---------- espagnol (« trescientos cuarenta y cinco mil », apocope « veintiún mil », « un franco ») ----------
const ES_U = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
const ES_D = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const ES_C = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];
const es100 = (n: number) => (n < 30 ? ES_U[n] : ES_D[Math.floor(n / 10)] + (n % 10 ? ` y ${ES_U[n % 10]}` : ""));
const es1000 = (n: number) => (n === 100 ? "cien" : [ES_C[Math.floor(n / 100)], n % 100 ? es100(n % 100) : ""].filter(Boolean).join(" "));
const apocope = (t: string) => t.replace(/veintiuno$/, "veintiún").replace(/uno$/, "un"); // devant « mil », « millones » et le nom
const es6 = (n: number) => {
  const k = Math.floor(n / 1000);
  const r = n % 1000;
  return [k ? (k === 1 ? "mil" : `${apocope(es1000(k))} mil`) : "", r ? es1000(r) : ""].filter(Boolean).join(" ");
};
function es(n: number): string {
  if (!n) return "cero";
  const mi = Math.floor(n / 1e6); // « mil millones » pour 10⁹
  return apocope([mi ? (mi === 1 ? "un millón" : `${apocope(es6(mi))} millones`) : "", n % 1e6 ? es6(n % 1e6) : ""].filter(Boolean).join(" "));
}
function esSomme(v: number, devise: "XOF" | "EUR"): string {
  if (devise === "XOF") return `${es(v)}${rondMillions(v) ? " de" : ""} ${v === 1 ? "franco CFA" : "francos CFA"}`;
  const [e, c] = centimes(v);
  const euros = e || !c ? `${es(e)}${rondMillions(e) ? " de" : ""} ${e === 1 ? "euro" : "euros"}` : "";
  return euros + (c ? `${euros ? " con " : ""}${es(c)} ${c === 1 ? "céntimo" : "céntimos"}` : "");
}

// ---------- allemand (« dreihundertfünfundvierzigtausend », en un mot sous le million) ----------
const DE_U = ["null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf", "zwölf", "dreizehn", "vierzehn", "fünfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn"];
const DE_D = ["", "", "zwanzig", "dreißig", "vierzig", "fünfzig", "sechzig", "siebzig", "achtzig", "neunzig"];
const de100 = (n: number) => (n < 20 ? DE_U[n] : (n % 10 ? `${n % 10 === 1 ? "ein" : DE_U[n % 10]}und` : "") + DE_D[Math.floor(n / 10)]);
const de1000 = (n: number) => {
  const c = Math.floor(n / 100);
  return (c ? `${c === 1 ? "ein" : DE_U[c]}hundert` : "") + (n % 100 ? de100(n % 100) : "");
};
function de(n: number): string {
  if (!n) return "null";
  const g = [Math.floor(n / 1e9), Math.floor(n / 1e6) % 1000, Math.floor(n / 1e3) % 1000, n % 1000];
  const reste = (g[2] ? (g[2] === 1 ? "eintausend" : `${de1000(g[2]).replace(/eins$/, "ein")}tausend`) : "") + (g[3] ? de1000(g[3]) : "");
  const mot = [g[0] ? (g[0] === 1 ? "eine Milliarde" : `${de1000(g[0])} Milliarden`) : "", g[1] ? (g[1] === 1 ? "eine Million" : `${de1000(g[1])} Millionen`) : "", reste].filter(Boolean).join(" ");
  return mot === "eins" ? "ein" : mot; // « ein Euro », « ein CFA-Franc »
}
function deSomme(v: number, devise: "XOF" | "EUR"): string {
  if (devise === "XOF") return `${de(v)} CFA-Franc`;
  const [e, c] = centimes(v);
  const euros = e || !c ? `${de(e)} Euro` : "";
  return euros + (c ? `${euros ? " und " : ""}${de(c)} Cent` : "");
}

// ---------- portugais du Portugal (« trezentos e quarenta e cinco mil », « mil milhões ») : à faire relire ----------
const PT_U = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze", "dezasseis", "dezassete", "dezoito", "dezanove"];
const PT_D = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const PT_C = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
const pt100 = (n: number) => (n < 20 ? PT_U[n] : PT_D[Math.floor(n / 10)] + (n % 10 ? ` e ${PT_U[n % 10]}` : ""));
const pt1000 = (n: number) => (n === 100 ? "cem" : [PT_C[Math.floor(n / 100)], n % 100 ? pt100(n % 100) : ""].filter(Boolean).join(" e "));
// « e » entre deux groupes quand le second n'a qu'un seul élément (« mil e quinhentos », « mil e vinte »)
const simple = (n: number): boolean => n < 100 || (n < 1000 && n % 100 === 0) || (n % 1000 === 0 && simple(n / 1000));
const ptJoindre = (a: string, b: string, reste: number) => (a && b ? `${a}${simple(reste) ? " e " : " "}${b}` : a || b);
const pt6 = (n: number) => {
  const k = Math.floor(n / 1000);
  return ptJoindre(k ? (k === 1 ? "mil" : `${pt1000(k)} mil`) : "", n % 1000 ? pt1000(n % 1000) : "", n % 1000);
};
function pt(n: number): string {
  if (!n) return "zero";
  const mi = Math.floor(n / 1e6);
  return ptJoindre(mi ? (mi === 1 ? "um milhão" : `${pt6(mi)} milhões`) : "", n % 1e6 ? pt6(n % 1e6) : "", n % 1e6);
}
function ptSomme(v: number, devise: "XOF" | "EUR"): string {
  if (devise === "XOF") return `${pt(v)}${rondMillions(v) ? " de" : ""} ${v === 1 ? "franco CFA" : "francos CFA"}`;
  const [e, c] = centimes(v);
  const euros = e || !c ? `${pt(e)}${rondMillions(e) ? " de" : ""} ${e === 1 ? "euro" : "euros"}` : "";
  return euros + (c ? `${euros ? " e " : ""}${pt(c)} ${c === 1 ? "cêntimo" : "cêntimos"}` : "");
}

// ---------- créoles haïtien (HT) et guadeloupéen (GCF) : à faire relire par un locuteur ----------
// Même construction que le français, dizaines nasalisées devant l'unité (HT « karannsenk », « vennde », « venteyen »).
type Creole = { u: string[]; un: string; t: Record<number, string>; eyen: string; soixanteDix: string; quatreVingt: string; cent: string; mil: string; million: string; milliard: string; fran: string; euro: string; centime: string; et: string };
const HT_N: Creole = {
  u: ["zewo", "en", "de", "twa", "kat", "senk", "sis", "sèt", "uit", "nèf", "dis", "onz", "douz", "trèz", "katòz", "kenz", "sèz", "disèt", "dizuit", "diznèf"],
  un: "en", t: { 2: "vent", 3: "trant", 4: "karant", 5: "senkant", 6: "swasant" }, eyen: "eyen", soixanteDix: "swasann", quatreVingt: "katreven",
  cent: "san", mil: "mil", million: "milyon", milliard: "milya", fran: "fran CFA", euro: "ewo", centime: "santim", et: "ak",
};
const GCF_N: Creole = {
  u: ["zéwo", "yonn", "dé", "twa", "kat", "senk", "sis", "sèt", "uit", "nèf", "dis", "onz", "douz", "trèz", "katòz", "kenz", "sèz", "disèt", "dizuit", "diznèf"],
  un: "on", t: { 2: "vent", 3: "trant", 4: "karant", 5: "senkant", 6: "swasant" }, eyen: "éyen", soixanteDix: "swasann", quatreVingt: "katrevin",
  cent: "san", mil: "mil", million: "milyon", milliard: "milya", fran: "fran CFA", euro: "éwo", centime: "santim", et: "é",
};
function creole100(k: Creole, n: number): string {
  if (n < 20) return k.u[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d === 7) return k.soixanteDix + k.u[10 + u];
  if (d === 8) return u ? `${k.quatreVingt}-${k.u[u]}` : k.quatreVingt;
  if (d === 9) return k.quatreVingt + k.u[10 + u];
  const t = k.t[d];
  if (u === 0) return d === 2 ? t.slice(0, -1) : t;
  if (u === 1) return t + k.eyen;
  return u <= 7 ? `${t.slice(0, -1)}n${k.u[u]}` : t + k.u[u];
}
const creole1000 = (k: Creole, n: number) => {
  const c = Math.floor(n / 100);
  const r = n % 100;
  return [c ? (c === 1 ? k.cent : `${k.u[c]} ${k.cent}`) : "", r ? creole100(k, r) : ""].filter(Boolean).join(" ");
};
function creole(k: Creole, n: number): string {
  if (!n) return k.u[0];
  const g = [Math.floor(n / 1e9), Math.floor(n / 1e6) % 1000, Math.floor(n / 1e3) % 1000, n % 1000];
  const mot = [
    g[0] ? `${g[0] === 1 ? k.un : creole1000(k, g[0])} ${k.milliard}` : "",
    g[1] ? `${g[1] === 1 ? k.un : creole1000(k, g[1])} ${k.million}` : "",
    g[2] ? (g[2] === 1 ? k.mil : `${creole1000(k, g[2])} ${k.mil}`) : "",
    g[3] ? creole1000(k, g[3]) : "",
  ]
    .filter(Boolean)
    .join(" ");
  return mot === k.u[1] ? k.un : mot;
}
const creoleSomme = (k: Creole) => (v: number, devise: "XOF" | "EUR") => {
  if (devise === "XOF") return `${creole(k, v)} ${k.fran}`;
  const [e, c] = centimes(v);
  const euros = e || !c ? `${creole(k, e)} ${k.euro}` : "";
  return euros + (c ? `${euros ? ` ${k.et} ` : ""}${creole(k, c)} ${k.centime}` : "");
};
const borne = (f: (v: number, devise: "XOF" | "EUR") => string) => (v: number, devise: "XOF" | "EUR") => (v >= 0 && v < MAX ? f(v, devise) : String(v));

export const copiesDocuments: Record<LangueDoc, CopieDocument> = {
  FR: {
    emcf: { titre: { facture: "Facture normalisée", avoir: "Facture d’avoir normalisée" }, normalise: "Document certifié e-MECeF", certification: "Éléments de certification e-MECeF", code: "Code MECeF/DGI", nim: "NIM", date: "Date e-MECeF", compteurs: "Compteurs e-MECeF", emetteur: "Émetteur", client: "Client", groupe: "Groupe de taxation" },
    finance: { titre: { facture: "Reçu de paiement", avoir: "Avoir sur reçu" }, nonNormalise: "Document non normalisé e-MECeF", total: "Montant du document", arrete: (x) => `Le présent document est arrêté à la somme de ${x}.`, empreinte: "Empreinte SHA-256 du document", original: "Document d’origine" },
    taxe: { ht: "Montant HT", tva: "TVA incluse", ttc: "Total TTC" },
    langue: "fr-FR",
    intl: "fr-FR",
    mois: null,
    titre: { recu: "Reçu de paiement", devis: "Devis" },
    etat: { emis: (d) => `Émis le ${d}`, signe: (d) => `signé le ${d}`, regleLe: (d) => `Réglé le ${d}`, regle: "Réglé", paye: "Payé" },
    pour: { devis: "Préparé pour", recu: "Réglé par" },
    meta: { sejour: "Séjour", voyageurs: "Voyageurs", valable: "Valable jusqu’au", reference: "Référence", evenement: "Événement", lieu: "Lieu", billets: "Billets", commande: "Commande", remise: "Remise", articles: "Articles" },
    periode: (a, b) => `du ${a} au ${b}`,
    nuits: (n) => s(n, "nuit"),
    adultes: (n) => s(n, "adulte"),
    enfants: (n) => s(n, "enfant"),
    placesFormule: (n, f) => `${s(n, "place")}, formule « ${f} »`,
    ligneBillet: (e, f) => `${e}, formule « ${f} »`,
    remise: { retrait: "Retrait à Ouidah", livraison: "Livraison" },
    articlesPieces: (a, p) => `${s(a, "article")}, ${s(p, "pièce")}`,
    expire: (d) => `expiré depuis le ${d}`,
    dernierJour: "dernier jour",
    sep: " : ",
    designation: "Désignation",
    quantite: "Qté",
    prixUnitaire: "Prix unitaire",
    montant: { recu: "Montant", devis: "Montant" },
    colonnes: { etape: "Étape", billet: "Billet", numero: "N°", article: "Article" },
    a: "à",
    total: { recu: "Total réglé", devis: "Total du séjour", commande: "Total de la commande" },
    arrete: { recu: (x) => `Arrêté le présent reçu à la somme de ${x}.`, devis: (x) => `Arrêté le présent devis à la somme de ${x}.` },
    refs: { demande: "Demande", reference: "Référence", ticket: "Ticket", reservation: "Réservation", commande: "Commande", contreValeur: "Contre-valeur", entree: "Entrée", entreeTexte: "présentez le QR code de chaque billet, sur votre page de suivi" },
    note: "Note",
    client: { accord: "Bon pour accord", signe: "Signé", aSigner: "À signer en ligne", confirmationCommande: "Confirmation par l’équipe", signeLe: (d, h) => `Signé électroniquement le ${d} à ${h} (UTC+1)`, empreinteDevis: "Empreinte du devis émis", reglement: "Règlement", regle: "Réglé", transaction: "Transaction", retrait: "au retrait à Ouidah", livraison: "à la livraison", empreinteRecu: "Empreinte du reçu" },
    direction: { titre: "La Direction générale", pied: "Signature et cachet de l’entreprise", role: "Présidente" },
    pied: { verifier: { recu: "Vérifier ce reçu", devis: "Vérifier ce devis" }, merci: "Merci de votre confiance.", empreinte: { recu: "Empreinte SHA-256 du reçu", devis: "Empreinte SHA-256 du devis émis" } },
    carte: { ocean: "Océan Atlantique", lagune: "Lagune", centre: "Centre de Ouidah", parcoursPied: (km) => `Parcours à pied, ${km} km`, aComposer: "Parcours à composer avec votre conseiller", boutique: (nom) => `Boutique ${nom}`, photos: "Photos des articles commandés", articles: "Articles commandés" },
    heure: (h, m) => `${h} h ${deux(m)}`,
    guillemets: (t) => `« ${t} »`,
    enLettres: borne(frSomme),
  },
  EN: {
    emcf: { titre: { facture: "Certified invoice", avoir: "Certified credit note" }, normalise: "Document certified by e-MECeF", certification: "e-MECeF certification details", code: "MECeF/DGI code", nim: "NIM", date: "e-MECeF date", compteurs: "e-MECeF counters", emetteur: "Issuer", client: "Customer", groupe: "Tax group" },
    finance: { titre: { facture: "Payment receipt", avoir: "Credit note on receipt" }, nonNormalise: "Document not certified by e-MECeF", total: "Document amount", arrete: (x) => `This document amounts to ${x}.`, empreinte: "SHA-256 fingerprint of the document", original: "Original document" },
    taxe: { ht: "Amount excluding VAT", tva: "VAT included", ttc: "Total including VAT" },
    langue: "en-GB",
    intl: "en-GB",
    mois: null,
    titre: { recu: "Payment receipt", devis: "Quote" },
    etat: { emis: (d) => `Issued on ${d}`, signe: (d) => `signed on ${d}`, regleLe: (d) => `Paid on ${d}`, regle: "Paid", paye: "Paid" },
    pour: { devis: "Prepared for", recu: "Paid by" },
    meta: { sejour: "Stay", voyageurs: "Travellers", valable: "Valid until", reference: "Reference", evenement: "Event", lieu: "Venue", billets: "Tickets", commande: "Order", remise: "Handover", articles: "Items" },
    periode: (a, b) => `from ${a} to ${b}`,
    nuits: (n) => s(n, "night"),
    adultes: (n) => s(n, "adult"),
    enfants: (n) => s(n, "child", "children"),
    placesFormule: (n, f) => `${s(n, "ticket")}, “${f}” type`,
    ligneBillet: (e, f) => `${e}, “${f}” ticket`,
    remise: { retrait: "Collection in Ouidah", livraison: "Delivery" },
    articlesPieces: (a, p) => `${s(a, "item")}, ${s(p, "piece")}`,
    expire: (d) => `expired on ${d}`,
    dernierJour: "last day",
    sep: ": ",
    designation: "Description",
    quantite: "Qty",
    prixUnitaire: "Unit price",
    montant: { recu: "Amount", devis: "Amount" },
    colonnes: { etape: "Stop", billet: "Ticket", numero: "No.", article: "Item" },
    a: "to",
    total: { recu: "Total paid", devis: "Trip total", commande: "Order total" },
    arrete: { recu: (x) => `This receipt amounts to ${x}.`, devis: (x) => `This quote amounts to ${x}.` },
    refs: { demande: "Request", reference: "Reference", ticket: "Ticket", reservation: "Booking", commande: "Order", contreValeur: "Equivalent", entree: "Entry", entreeTexte: "show each ticket’s QR code from your tracking page" },
    note: "Note",
    client: { accord: "Approved and accepted", signe: "Signed", aSigner: "To be signed online", confirmationCommande: "Confirmation by the team", signeLe: (d, h) => `Signed electronically on ${d} at ${h} (UTC+1)`, empreinteDevis: "Fingerprint of the issued quote", reglement: "Payment", regle: "Paid", transaction: "Transaction", retrait: "on collection in Ouidah", livraison: "on delivery", empreinteRecu: "Receipt fingerprint" },
    direction: { titre: "Management", pied: "Company signature and stamp", role: "President" },
    pied: { verifier: { recu: "Verify this receipt", devis: "Verify this quote" }, merci: "Thank you for your trust.", empreinte: { recu: "SHA-256 fingerprint of the receipt", devis: "SHA-256 fingerprint of the issued quote" } },
    carte: { ocean: "Atlantic Ocean", lagune: "Lagoon", centre: "Ouidah town centre", parcoursPied: (km) => `Walking route, ${km} km`, aComposer: "Route to plan with your advisor", boutique: (nom) => `${nom} shop`, photos: "Photos of the items ordered", articles: "Items ordered" },
    heure: (h, m) => `${deux(h)}:${deux(m)}`,
    guillemets: (t) => `“${t}”`,
    enLettres: borne(enSomme),
  },
  ES: {
    emcf: { titre: { facture: "Factura certificada", avoir: "Nota de crédito certificada" }, normalise: "Documento certificado por e-MECeF", certification: "Datos de certificación e-MECeF", code: "Código MECeF/DGI", nim: "NIM", date: "Fecha e-MECeF", compteurs: "Contadores e-MECeF", emetteur: "Emisor", client: "Cliente", groupe: "Grupo fiscal" },
    finance: { titre: { facture: "Recibo de pago", avoir: "Abono sobre recibo" }, nonNormalise: "Documento no certificado por e-MECeF", total: "Importe del documento", arrete: (x) => `El presente documento asciende a ${x}.`, empreinte: "Huella SHA-256 del documento", original: "Documento original" },
    taxe: { ht: "Importe sin IVA", tva: "IVA incluido", ttc: "Total con IVA" },
    langue: "es-ES",
    intl: "es-ES",
    mois: null,
    titre: { recu: "Recibo de pago", devis: "Presupuesto" },
    etat: { emis: (d) => `Emitido el ${d}`, signe: (d) => `firmado el ${d}`, regleLe: (d) => `Pagado el ${d}`, regle: "Pagado", paye: "Pagado" },
    pour: { devis: "Preparado para", recu: "Pagado por" },
    meta: { sejour: "Estancia", voyageurs: "Viajeros", valable: "Válido hasta el", reference: "Referencia", evenement: "Evento", lieu: "Lugar", billets: "Entradas", commande: "Pedido", remise: "Entrega", articles: "Artículos" },
    periode: (a, b) => `del ${a} al ${b}`,
    nuits: (n) => s(n, "noche"),
    adultes: (n) => s(n, "adulto"),
    enfants: (n) => s(n, "niño"),
    placesFormule: (n, f) => `${s(n, "entrada")}, modalidad «${f}»`,
    ligneBillet: (e, f) => `${e}, modalidad «${f}»`,
    remise: { retrait: "Recogida en Ouidah", livraison: "Envío a domicilio" },
    articlesPieces: (a, p) => `${s(a, "artículo")}, ${s(p, "pieza")}`,
    expire: (d) => `vencido el ${d}`,
    dernierJour: "último día",
    sep: ": ",
    designation: "Concepto",
    quantite: "Cant.",
    prixUnitaire: "Precio unitario",
    montant: { recu: "Importe", devis: "Importe" },
    colonnes: { etape: "Etapa", billet: "Entrada", numero: "N.º", article: "Artículo" },
    a: "a",
    total: { recu: "Total pagado", devis: "Total del viaje", commande: "Total del pedido" },
    arrete: { recu: (x) => `El presente recibo asciende a ${x}.`, devis: (x) => `El presente presupuesto asciende a ${x}.` },
    refs: { demande: "Solicitud", reference: "Referencia", ticket: "Ticket", reservation: "Reserva", commande: "Pedido", contreValeur: "Contravalor", entree: "Acceso", entreeTexte: "presente el código QR de cada entrada desde su página de seguimiento" },
    note: "Nota",
    client: { accord: "Conforme", signe: "Firmado", aSigner: "Pendiente de firma en línea", confirmationCommande: "Confirmación por el equipo", signeLe: (d, h) => `Firmado electrónicamente el ${d} a las ${h} (UTC+1)`, empreinteDevis: "Huella del presupuesto emitido", reglement: "Pago", regle: "Pagado", transaction: "Transacción", retrait: "en la recogida en Ouidah", livraison: "en la entrega", empreinteRecu: "Huella del recibo" },
    direction: { titre: "La Dirección General", pied: "Firma y sello de la empresa", role: "Presidenta" },
    pied: { verifier: { recu: "Verificar este recibo", devis: "Verificar este presupuesto" }, merci: "Gracias por su confianza.", empreinte: { recu: "Huella SHA-256 del recibo", devis: "Huella SHA-256 del presupuesto emitido" } },
    carte: { ocean: "Océano Atlántico", lagune: "Laguna", centre: "Centro de Ouidah", parcoursPied: (km) => `Recorrido a pie, ${km} km`, aComposer: "Recorrido por definir con su asesor", boutique: (nom) => `Tienda ${nom}`, photos: "Fotos de los artículos pedidos", articles: "Artículos pedidos" },
    heure: (h, m) => `${h}:${deux(m)}`,
    guillemets: (t) => `«${t}»`,
    enLettres: borne(esSomme),
  },
  DE: {
    emcf: { titre: { facture: "Zertifizierte Rechnung", avoir: "Zertifizierte Gutschrift" }, normalise: "Durch e-MECeF zertifiziertes Dokument", certification: "e-MECeF-Zertifizierungsdaten", code: "MECeF/DGI-Code", nim: "NIM", date: "e-MECeF-Datum", compteurs: "e-MECeF-Zähler", emetteur: "Aussteller", client: "Kunde", groupe: "Steuergruppe" },
    finance: { titre: { facture: "Zahlungsbeleg", avoir: "Gutschrift zum Beleg" }, nonNormalise: "Dokument nicht durch e-MECeF zertifiziert", total: "Dokumentbetrag", arrete: (x) => `Dieses Dokument beläuft sich auf ${x}.`, empreinte: "SHA-256-Fingerabdruck des Dokuments", original: "Originalbeleg" },
    taxe: { ht: "Nettobetrag", tva: "MwSt. enthalten", ttc: "Bruttobetrag" },
    langue: "de-DE",
    intl: "de-DE",
    mois: null,
    titre: { recu: "Zahlungsbeleg", devis: "Angebot" },
    etat: { emis: (d) => `Ausgestellt am ${d}`, signe: (d) => `unterzeichnet am ${d}`, regleLe: (d) => `Bezahlt am ${d}`, regle: "Bezahlt", paye: "Bezahlt" },
    pour: { devis: "Erstellt für", recu: "Bezahlt von" },
    meta: { sejour: "Aufenthalt", voyageurs: "Reisende", valable: "Gültig bis", reference: "Referenz", evenement: "Veranstaltung", lieu: "Ort", billets: "Tickets", commande: "Bestellung", remise: "Übergabe", articles: "Artikel" },
    periode: (a, b) => `vom ${a} bis ${b}`,
    nuits: (n) => s(n, "Nacht", "Nächte"),
    adultes: (n) => s(n, "Erwachsener", "Erwachsene"),
    enfants: (n) => s(n, "Kind", "Kinder"),
    placesFormule: (n, f) => `${s(n, "Ticket")}, Ticketart „${f}“`,
    ligneBillet: (e, f) => `${e}, Ticketart „${f}“`,
    remise: { retrait: "Abholung in Ouidah", livraison: "Lieferung" },
    articlesPieces: (a, p) => `${a} Artikel, ${p} Stück`,
    expire: (d) => `abgelaufen am ${d}`,
    dernierJour: "letzter Tag",
    sep: ": ",
    designation: "Beschreibung",
    quantite: "Menge",
    prixUnitaire: "Einzelpreis",
    montant: { recu: "Betrag", devis: "Betrag" },
    colonnes: { etape: "Etappe", billet: "Ticket", numero: "Nr.", article: "Artikel" },
    a: "bis",
    total: { recu: "Gesamt bezahlt", devis: "Reisepreis gesamt", commande: "Bestellsumme" },
    arrete: { recu: (x) => `Dieser Beleg beläuft sich auf ${x}.`, devis: (x) => `Dieses Angebot beläuft sich auf ${x}.` },
    refs: { demande: "Anfrage", reference: "Referenz", ticket: "Ticket", reservation: "Buchung", commande: "Bestellung", contreValeur: "Gegenwert", entree: "Einlass", entreeTexte: "zeigen Sie den QR-Code jedes Tickets auf Ihrer Bestellseite vor" },
    note: "Hinweis",
    client: { accord: "Einverstanden", signe: "Unterzeichnet", aSigner: "Online zu unterzeichnen", confirmationCommande: "Bestätigung durch das Team", signeLe: (d, h) => `Elektronisch unterzeichnet am ${d} um ${h} (UTC+1)`, empreinteDevis: "Fingerabdruck des ausgestellten Angebots", reglement: "Zahlung", regle: "Bezahlt", transaction: "Transaktion", retrait: "bei Abholung in Ouidah", livraison: "bei Lieferung", empreinteRecu: "Fingerabdruck des Belegs" },
    direction: { titre: "Die Geschäftsführung", pied: "Unterschrift und Stempel des Unternehmens", role: "Präsidentin" },
    pied: { verifier: { recu: "Diesen Beleg prüfen", devis: "Dieses Angebot prüfen" }, merci: "Vielen Dank für Ihr Vertrauen.", empreinte: { recu: "SHA-256-Fingerabdruck des Belegs", devis: "SHA-256-Fingerabdruck des ausgestellten Angebots" } },
    carte: { ocean: "Atlantischer Ozean", lagune: "Lagune", centre: "Zentrum von Ouidah", parcoursPied: (km) => `Fußweg, ${km} km`, aComposer: "Route mit Ihrer Beratung zu planen", boutique: (nom) => `Boutique ${nom}`, photos: "Fotos der bestellten Artikel", articles: "Bestellte Artikel" },
    heure: (h, m) => `${h}:${deux(m)} Uhr`,
    guillemets: (t) => `„${t}“`,
    enLettres: borne(deSomme),
  },
  PT: {
    emcf: { titre: { facture: "Fatura certificada", avoir: "Nota de crédito certificada" }, normalise: "Documento certificado pelo e-MECeF", certification: "Dados de certificação e-MECeF", code: "Código MECeF/DGI", nim: "NIM", date: "Data e-MECeF", compteurs: "Contadores e-MECeF", emetteur: "Emitente", client: "Cliente", groupe: "Grupo fiscal" },
    finance: { titre: { facture: "Recibo de pagamento", avoir: "Nota de crédito sobre recibo" }, nonNormalise: "Documento não certificado pelo e-MECeF", total: "Montante do documento", arrete: (x) => `O presente documento perfaz ${x}.`, empreinte: "Impressão SHA-256 do documento", original: "Documento original" },
    taxe: { ht: "Montante sem IVA", tva: "IVA incluído", ttc: "Total com IVA" },
    langue: "pt-PT",
    intl: "pt-PT",
    mois: null,
    titre: { recu: "Recibo de pagamento", devis: "Orçamento" },
    etat: { emis: (d) => `Emitido em ${d}`, signe: (d) => `assinado em ${d}`, regleLe: (d) => `Pago em ${d}`, regle: "Pago", paye: "Pago" },
    pour: { devis: "Preparado para", recu: "Pago por" },
    meta: { sejour: "Estadia", voyageurs: "Viajantes", valable: "Válido até", reference: "Referência", evenement: "Evento", lieu: "Local", billets: "Bilhetes", commande: "Encomenda", remise: "Entrega", articles: "Artigos" },
    periode: (a, b) => `de ${a} a ${b}`,
    nuits: (n) => s(n, "noite"),
    adultes: (n) => s(n, "adulto"),
    enfants: (n) => s(n, "criança"),
    placesFormule: (n, f) => `${s(n, "bilhete")}, modalidade «${f}»`,
    ligneBillet: (e, f) => `${e}, modalidade «${f}»`,
    remise: { retrait: "Levantamento em Ouidah", livraison: "Entrega ao domicílio" },
    articlesPieces: (a, p) => `${s(a, "artigo")}, ${s(p, "peça")}`,
    expire: (d) => `expirado em ${d}`,
    dernierJour: "último dia",
    sep: ": ",
    designation: "Descrição",
    quantite: "Qtd.",
    prixUnitaire: "Preço unitário",
    montant: { recu: "Valor", devis: "Valor" },
    colonnes: { etape: "Etapa", billet: "Bilhete", numero: "N.º", article: "Artigo" },
    a: "a",
    total: { recu: "Total pago", devis: "Total da viagem", commande: "Total da encomenda" },
    arrete: { recu: (x) => `O presente recibo ascende a ${x}.`, devis: (x) => `O presente orçamento ascende a ${x}.` },
    refs: { demande: "Pedido", reference: "Referência", ticket: "Ticket", reservation: "Reserva", commande: "Encomenda", contreValeur: "Contravalor", entree: "Entrada", entreeTexte: "apresente o código QR de cada bilhete na sua página de acompanhamento" },
    note: "Nota",
    client: { accord: "Aceito", signe: "Assinado", aSigner: "A assinar online", confirmationCommande: "Confirmação pela equipa", signeLe: (d, h) => `Assinado eletronicamente em ${d} às ${h} (UTC+1)`, empreinteDevis: "Impressão digital do orçamento emitido", reglement: "Pagamento", regle: "Pago", transaction: "Transação", retrait: "no levantamento em Ouidah", livraison: "na entrega", empreinteRecu: "Impressão digital do recibo" },
    direction: { titre: "A Direção-Geral", pied: "Assinatura e carimbo da empresa", role: "Presidente" },
    pied: { verifier: { recu: "Verificar este recibo", devis: "Verificar este orçamento" }, merci: "Obrigado pela sua confiança.", empreinte: { recu: "Impressão digital SHA-256 do recibo", devis: "Impressão digital SHA-256 do orçamento emitido" } },
    carte: { ocean: "Oceano Atlântico", lagune: "Lagoa", centre: "Centro de Ouidah", parcoursPied: (km) => `Percurso a pé, ${km} km`, aComposer: "Percurso a definir com o seu consultor", boutique: (nom) => `Loja ${nom}`, photos: "Fotografias dos artigos encomendados", articles: "Artigos encomendados" },
    heure: (h, m) => `${h}h${deux(m)}`,
    guillemets: (t) => `«${t}»`,
    enLettres: borne(ptSomme),
  },
  // à faire valider par un locuteur (libellés et montant en lettres)
  HT: {
    emcf: { titre: { facture: "Fakti sètifye", avoir: "Nòt kredi sètifye" }, normalise: "Dokiman sètifye pa e-MECeF", certification: "Enfòmasyon sètifikasyon e-MECeF", code: "Kòd MECeF/DGI", nim: "NIM", date: "Dat e-MECeF", compteurs: "Kontè e-MECeF", emetteur: "Moun ki emèt li", client: "Kliyan", groupe: "Gwoup taks" },
    finance: { titre: { facture: "Resi peman", avoir: "Nòt kredi sou resi" }, nonNormalise: "Dokiman ki pa sètifye pa e-MECeF", total: "Montan dokiman an", arrete: (x) => `Montan dokiman sa a se ${x}.`, empreinte: "Anprent SHA-256 dokiman an", original: "Dokiman orijinal" },
    taxe: { ht: "Montan san TVA", tva: "TVA ladan", ttc: "Total avèk TVA" },
    langue: "ht",
    intl: "fr-FR",
    mois: ["janvye", "fevriye", "mas", "avril", "me", "jen", "jiyè", "out", "septanm", "oktòb", "novanm", "desanm"],
    titre: { recu: "Resi peman", devis: "Devi" },
    etat: { emis: (d) => `Emèt ${d}`, signe: (d) => `siyen ${d}`, regleLe: (d) => `Peye ${d}`, regle: "Peye", paye: "Peye" },
    pour: { devis: "Prepare pou", recu: "Peye pa" },
    meta: { sejour: "Sejou", voyageurs: "Vwayajè", valable: "Valab jiska", reference: "Referans", evenement: "Evènman", lieu: "Kote", billets: "Tikè", commande: "Kòmand", remise: "Remiz", articles: "Atik" },
    periode: (a, b) => `soti ${a} rive ${b}`,
    nuits: (n) => `${n} nwit`,
    adultes: (n) => `${n} granmoun`,
    enfants: (n) => `${n} timoun`,
    placesFormule: (n, f) => `${n} plas, fòmil «${f}»`,
    ligneBillet: (e, f) => `${e}, fòmil «${f}»`,
    remise: { retrait: "Pran l nan Ouidah", livraison: "Livrezon" },
    articlesPieces: (a, p) => `${a} atik, ${p} pyès`,
    expire: (d) => `ekspire depi ${d}`,
    dernierJour: "dènye jou",
    sep: ": ",
    designation: "Deskripsyon",
    quantite: "Kantite",
    prixUnitaire: "Pri inite",
    montant: { recu: "Montan", devis: "Montan" },
    colonnes: { etape: "Etap", billet: "Tikè", numero: "Nº", article: "Atik" },
    a: "rive",
    total: { recu: "Total peye", devis: "Total vwayaj la", commande: "Total kòmann nan" },
    arrete: { recu: (x) => `Resi sa a fè ${x}.`, devis: (x) => `Devi sa a fè ${x}.` },
    refs: { demande: "Demann", reference: "Referans", ticket: "Tikè", reservation: "Rezèvasyon", commande: "Kòmand", contreValeur: "Valè an fran CFA", entree: "Antre", entreeTexte: "montre kòd QR chak tikè sou paj swivi ou" },
    note: "Nòt",
    client: { accord: "Bon pou dakò", signe: "Siyen", aSigner: "Pou siyen sou entènèt", confirmationCommande: "Konfimasyon ekip la", signeLe: (d, h) => `Siyen elektwonikman ${d} a ${h} (UTC+1)`, empreinteDevis: "Anprent devi ki emèt la", reglement: "Peman", regle: "Peye", transaction: "Tranzaksyon", retrait: "lè w pran l nan Ouidah", livraison: "nan livrezon", empreinteRecu: "Anprent resi a" },
    direction: { titre: "Direksyon jeneral la", pied: "Siyati ak so antrepriz la", role: "Prezidan" },
    pied: { verifier: { recu: "Verifye resi sa a", devis: "Verifye devi sa a" }, merci: "Mèsi pou konfyans ou.", empreinte: { recu: "Anprent SHA-256 resi a", devis: "Anprent SHA-256 devi ki emèt la" } },
    carte: { ocean: "Oseyan Atlantik", lagune: "Lagin", centre: "Sant Ouidah", parcoursPied: (km) => `Pakou a pye, ${km} km`, aComposer: "Pakou pou fè ak konseye w", boutique: (nom) => `Boutik ${nom}`, photos: "Foto atik yo kòmande", articles: "Atik yo kòmande" },
    heure: (h, m) => `${h}:${deux(m)}`,
    guillemets: (t) => `«${t}»`,
    enLettres: borne(creoleSomme(HT_N)),
  },
  // à faire valider par un locuteur (libellés et montant en lettres)
  GCF: {
    emcf: { titre: { facture: "Fakti sètifyé", avoir: "Nòt krédi sètifyé" }, normalise: "Dokiman sètifyé pa e-MECeF", certification: "Enfòwmasyon sètifikasyon e-MECeF", code: "Kòd MECeF/DGI", nim: "NIM", date: "Dat e-MECeF", compteurs: "Kontè e-MECeF", emetteur: "Émètè", client: "Kliyan", groupe: "Gwoup taks" },
    finance: { titre: { facture: "Rési pèyman", avoir: "Nòt krédi asi rési" }, nonNormalise: "Dokiman ki pa sètifyé pa e-MECeF", total: "Montan dokiman-la", arrete: (x) => `Montan dokiman-lasa sé ${x}.`, empreinte: "Anprent SHA-256 a dokiman-la", original: "Dokiman orijinal" },
    taxe: { ht: "Montan san TVA", tva: "TVA adan", ttc: "Total épi TVA" },
    langue: "gcf",
    intl: "fr-FR",
    mois: ["janvyé", "févryé", "mas", "avril", "mé", "jen", "jiyé", "out", "sèptanm", "oktòb", "novanm", "désanm"],
    titre: { recu: "Résu pèman", devis: "Dévi" },
    etat: { emis: (d) => `Émèt lè ${d}`, signe: (d) => `siyné lè ${d}`, regleLe: (d) => `Péyé lè ${d}`, regle: "Péyé", paye: "Péyé" },
    pour: { devis: "Préparé pou", recu: "Péyé pa" },
    meta: { sejour: "Séjou", voyageurs: "Vwayajè", valable: "Valab jis", reference: "Référans", evenement: "Évènman", lieu: "Koté", billets: "Tikè", commande: "Kòmand", remise: "Rimiz", articles: "Atik" },
    periode: (a, b) => `dèpi ${a} jis ${b}`,
    nuits: (n) => `${n} lannuit`,
    adultes: (n) => `${n} granmoun`,
    enfants: (n) => `${n} timoun`,
    placesFormule: (n, f) => `${n} plas, fòmil « ${f} »`,
    ligneBillet: (e, f) => `${e}, fòmil « ${f} »`,
    remise: { retrait: "Pran-y Ouidah", livraison: "Livrézon" },
    articlesPieces: (a, p) => `${a} atik, ${p} pyès`,
    expire: (d) => `èkspiré dépi ${d}`,
    dernierJour: "dènyé jou",
    sep: " : ",
    designation: "Dèskripsyon",
    quantite: "Kantité",
    prixUnitaire: "Pri inité",
    montant: { recu: "Montan", devis: "Montan" },
    colonnes: { etape: "Étap", billet: "Tikè", numero: "Nº", article: "Atik" },
    a: "jis",
    total: { recu: "Total péyé", devis: "Total vwayaj-la", commande: "Total a komand-la" },
    arrete: { recu: (x) => `Résu-lasa ka monté a ${x}.`, devis: (x) => `Dévi-lasa ka monté a ${x}.` },
    refs: { demande: "Dimann", reference: "Référans", ticket: "Tikè", reservation: "Rézèvasyon", commande: "Kòmand", contreValeur: "Valè an fran CFA", entree: "Antré", entreeTexte: "montré kòd QR a chak tikè asi paj swivi a-w" },
    note: "Nòt",
    client: { accord: "Bon pou dakò", signe: "Siyné", aSigner: "Pou siyné asi entènèt", confirmationCommande: "Konfimasyon pa lékip-la", signeLe: (d, h) => `Siyné élèktwonikman lè ${d} a ${h} (UTC+1)`, empreinteDevis: "Lanprent a dévi-la", reglement: "Pèman", regle: "Péyé", transaction: "Tranzaksyon", retrait: "lè ou pran-y Ouidah", livraison: "a livrézon-la", empreinteRecu: "Lanprent a résu-la" },
    direction: { titre: "Direksyon jénéral-la", pied: "Siyati é tanpon a antrepriz-la", role: "Prézidant" },
    pied: { verifier: { recu: "Vérifyé résu-lasa", devis: "Vérifyé dévi-lasa" }, merci: "Mèsi pou konfyans a-w.", empreinte: { recu: "Lanprent SHA-256 a résu-la", devis: "Lanprent SHA-256 a dévi-la" } },
    carte: { ocean: "Lanmè Atlantik", lagune: "Lagin", centre: "Mitan Ouidah", parcoursPied: (km) => `Chimen a pyé, ${km} km`, aComposer: "Chimen pou fè épi konséyé a-w", boutique: (nom) => `Boutik ${nom}`, photos: "Foto a atik ou kòmandé", articles: "Atik ou kòmandé" },
    heure: (h, m) => `${h} h ${deux(m)}`,
    guillemets: (t) => `« ${t} »`,
    enLettres: borne(creoleSomme(GCF_N)),
  },
};
