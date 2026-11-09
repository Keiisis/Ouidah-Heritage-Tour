import "server-only";

// Contrat DGI : https://developper.impots.bj/sygmef-emcf/swagger/v1/swagger.json
// Aucun SDK tiers ni nouvelle tentative implicite sur les écritures fiscales.
export type EnvironnementEmcf = "test" | "production";
export type GroupeTaxeEmcf = "A" | "B" | "C" | "D" | "E" | "F";
export type TypeFactureEmcf = "FV" | "FA" | "EV" | "EA";
export type TypePaiementEmcf = "ESPECES" | "VIREMENT" | "CARTEBANCAIRE" | "MOBILEMONEY" | "CHEQUES" | "CREDIT" | "AUTRE";
export type ArticleEmcf = {
  code?: string | null; name: string; price: number; quantity: number; taxGroup: GroupeTaxeEmcf;
  taxSpecific?: number | null; originalPrice?: number | null; priceModification?: string | null;
};
export type DemandeFactureEmcf = {
  ifu: string; type: TypeFactureEmcf; aib?: "A" | "B";
  items: ArticleEmcf[];
  client?: { ifu?: string | null; name?: string | null; contact?: string | null; address?: string | null };
  operator: { id?: string | null; name: string };
  payment?: { name: TypePaiementEmcf; amount: number }[] | null;
  reference?: string | null;
};
export type StatutEmcf = {
  status: boolean; version?: string | null; ifu?: string | null; nim?: string | null;
  tokenValid: string; serverDateTime: string;
  emcfList?: { nim?: string | null; status?: string | null; shopName?: string | null;
    address1?: string | null; address2?: string | null; address3?: string | null;
    contact1?: string | null; contact2?: string | null; contact3?: string | null }[] | null;
};
export type AttentesEmcf = Omit<StatutEmcf, "emcfList"> & {
  pendingRequestsCount: number; pendingRequestsList: { date: string; uid: string }[] | null;
  pendingAibPaymentUid?: string | null; pendingAibPaymentUrl?: string | null;
  pendingAibPaymentList?: { date: string; uid: string }[] | null;
};
export type GroupesTaxesEmcf = Record<"a" | "b" | "c" | "d" | "e" | "f" | "aibA" | "aibB", number>;
export type TypeDgiEmcf = { type: string; description: string | null };
export type CalculFactureEmcf = {
  uid: string; total: number;
  ta?: number; tb?: number; tc?: number; td?: number;
  taa?: number; tab?: number; tac?: number; tad?: number; tae?: number; taf?: number;
  hab?: number; had?: number; vab?: number; vad?: number; aib?: number; ts?: number;
};
export type SecuriteEmcf = { dateTime: string; qrCode: string; codeMECeFDGI: string; counters: string; nim: string };
export type AnnulationEmcf = Partial<Record<keyof SecuriteEmcf, string | null>>;
export type DetailsFactureEmcf = DemandeFactureEmcf & { paymentUrl?: string | null };

type CodeErreur = "configuration" | "saisie" | "transport" | "http" | "reponse" | "dgi";
export class ErreurEmcf extends Error {
  readonly code: CodeErreur;
  readonly incertain: boolean;
  readonly statutHttp?: number;
  readonly codeDgi?: string;
  constructor(code: CodeErreur, incertain = false, statutHttp?: number, codeDgi?: string) {
    const messages: Record<CodeErreur, string> = {
      configuration: "La configuration e-MECeF est absente ou verrouillée.",
      saisie: "Les données de la demande e-MECeF sont invalides.",
      transport: "La réponse e-MECeF n'a pas été reçue. Vérifier la demande avant de la renouveler.",
      http: "Le service e-MECeF a refusé la requête ou est indisponible.",
      reponse: "La réponse e-MECeF est incomplète ou invalide.",
      dgi: "La DGI a refusé cette opération e-MECeF.",
    };
    super(messages[code]);
    this.name = "ErreurEmcf";
    this.code = code; this.incertain = incertain; this.statutHttp = statutHttp; this.codeDgi = codeDgi;
  }
}

export function lireConfigurationEmcf() {
  const valeur = process.env.EMCF_ENVIRONNEMENT?.trim() || "test";
  const environnement: EnvironnementEmcf = valeur === "production" ? "production" : "test";
  const valide = valeur === "test" || valeur === "production";
  const jeton = process.env.EMCF_JETON?.trim();
  const productionAutorisee = process.env.EMCF_PRODUCTION_AUTORISEE === "1";
  return {
    environnement,
    origine: environnement === "test" ? "https://developper.impots.bj/sygmef-emcf" : "https://sygmef.impots.bj/emcf",
    configure: Boolean(valide && jeton && !/[\r\n]/.test(jeton) && (environnement === "test" || productionAutorisee)),
    productionAutorisee,
  };
}

function objet(v: unknown): v is Record<string, unknown> { return Boolean(v && typeof v === "object" && !Array.isArray(v)); }
function texte(v: unknown): v is string { return typeof v === "string" && Boolean(v.trim()); }
function nullableTexte(v: unknown) { return v === undefined || v === null || typeof v === "string"; }
function entier(v: unknown): v is number { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }
function date(v: unknown): v is string { return texte(v) && Number.isFinite(Date.parse(v)); }
const typesFacture = ["FV", "FA", "EV", "EA"];
const typesPaiement = ["ESPECES", "VIREMENT", "CARTEBANCAIRE", "MOBILEMONEY", "CHEQUES", "CREDIT", "AUTRE"];

export function validerDemandeEmcf(v: unknown): v is DemandeFactureEmcf {
  if (!objet(v) || !texte(v.ifu) || !typesFacture.includes(String(v.type)) ||
    !(v.aib === undefined || v.aib === "A" || v.aib === "B") || !nullableTexte(v.reference) ||
    !objet(v.operator) || !texte(v.operator.name) || !nullableTexte(v.operator.id) ||
    !Array.isArray(v.items) || v.items.length === 0) return false;
  if (!v.items.every((i) => objet(i) && texte(i.name) && entier(i.price) &&
    typeof i.quantity === "number" && Number.isFinite(i.quantity) && i.quantity > 0 &&
    ["A", "B", "C", "D", "E", "F"].includes(String(i.taxGroup)) && nullableTexte(i.code) &&
    (i.taxSpecific == null || entier(i.taxSpecific)) && (i.originalPrice == null ||
      typeof i.originalPrice === "number" && Number.isFinite(i.originalPrice) && i.originalPrice >= 0) &&
    nullableTexte(i.priceModification))) return false;
  const client = v.client;
  if (client !== undefined && (!objet(client) || !["ifu", "name", "contact", "address"].every((c) => nullableTexte(client[c])))) return false;
  if (v.payment != null && (!Array.isArray(v.payment) || !v.payment.every((p) => objet(p) &&
    typesPaiement.includes(String(p.name)) && entier(p.amount)))) return false;
  return true;
}

function statut(v: unknown): v is StatutEmcf {
  return objet(v) && typeof v.status === "boolean" && date(v.tokenValid) && date(v.serverDateTime) &&
    ["version", "ifu", "nim"].every((c) => nullableTexte(v[c])) &&
    (v.emcfList == null || Array.isArray(v.emcfList) && v.emcfList.every((e) => objet(e) &&
      ["nim", "status", "shopName", "address1", "address2", "address3", "contact1", "contact2", "contact3"].every((c) => nullableTexte(e[c]))));
}

function listeAttente(v: unknown) {
  return v === null || Array.isArray(v) && v.every((e) => objet(e) && texte(e.uid) && date(e.date));
}

async function requete<T>(chemin: string, methode: "GET" | "POST" | "PUT", valide: (v: unknown) => boolean, corps?: DemandeFactureEmcf): Promise<T> {
  const configuration = lireConfigurationEmcf();
  if (!configuration.configure) throw new ErreurEmcf("configuration");
  const mutation = methode !== "GET";
  let reponse: Response;
  let valeur: unknown;
  try {
    reponse = await fetch(`${configuration.origine}/api/${chemin}`, {
      method: methode, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${process.env.EMCF_JETON!.trim()}`, Accept: "application/json", ...(corps ? { "Content-Type": "application/json" } : {}) },
      ...(corps ? { body: JSON.stringify(corps) } : {}),
    });
    if (!reponse.ok) throw new ErreurEmcf("http", mutation && reponse.status >= 500, reponse.status);
    const contenu = await reponse.text();
    if (contenu.length > 1_000_000) throw new ErreurEmcf("reponse", mutation);
    try { valeur = JSON.parse(contenu); } catch { throw new ErreurEmcf("reponse", mutation); }
  } catch (erreur) {
    // Ni corps DGI, ni erreur fetch brute : ils peuvent contenir des données ou le jeton.
    if (erreur instanceof ErreurEmcf) throw erreur;
    throw new ErreurEmcf("transport", mutation);
  }
  if (objet(valeur) && (valeur.errorCode != null && valeur.errorCode !== "" || valeur.errorDesc != null && valeur.errorDesc !== "")) {
    const codeDgi = typeof valeur.errorCode === "string" && /^[A-Z]?\d{1,5}$/.test(valeur.errorCode) ? valeur.errorCode : undefined;
    throw new ErreurEmcf("dgi", false, reponse.status, codeDgi);
  }
  if (!valide(valeur)) throw new ErreurEmcf("reponse", mutation, reponse.status);
  return valeur as T;
}

function uidEncode(uid: string) {
  if (!texte(uid) || uid.length > 256 || /[\r\n]/.test(uid)) throw new ErreurEmcf("saisie");
  return encodeURIComponent(uid);
}

export function lireStatutEmcf(): Promise<StatutEmcf> {
  return requete("info/status", "GET", statut);
}
export function lireGroupesTaxesEmcf(): Promise<GroupesTaxesEmcf> {
  return requete("info/taxGroups", "GET", (v) => objet(v) && ["a", "b", "c", "d", "e", "f", "aibA", "aibB"].every((c) => entier(v[c])));
}
function types(v: unknown) { return Array.isArray(v) && v.length > 0 && v.every((e) => objet(e) && texte(e.type) && (e.description === null || typeof e.description === "string")); }
export function lireTypesFacturesEmcf(): Promise<TypeDgiEmcf[]> { return requete("info/invoiceTypes", "GET", types); }
export function lireTypesPaiementEmcf(): Promise<TypeDgiEmcf[]> { return requete("info/paymentTypes", "GET", types); }
export function lireAttentesEmcf(): Promise<AttentesEmcf> {
  return requete("invoice", "GET", (v) => objet(v) && entier(v.pendingRequestsCount) &&
    listeAttente(v.pendingRequestsList) && (v.pendingAibPaymentList === undefined || listeAttente(v.pendingAibPaymentList)) &&
    nullableTexte(v.pendingAibPaymentUid) && nullableTexte(v.pendingAibPaymentUrl) && statut(v));
}
export function soumettreFactureEmcf(facture: DemandeFactureEmcf): Promise<CalculFactureEmcf> {
  if (!validerDemandeEmcf(facture)) throw new ErreurEmcf("saisie");
  return requete("invoice", "POST", (v) => objet(v) && texte(v.uid) && entier(v.total) &&
    ["ta", "tb", "tc", "td", "taa", "tab", "tac", "tad", "tae", "taf", "hab", "had", "vab", "vad", "aib", "ts"].every((c) => v[c] === undefined || entier(v[c])), facture);
}
export function lireFactureEmcf(uid: string): Promise<DetailsFactureEmcf> {
  return requete(`invoice/${uidEncode(uid)}`, "GET", (v) => validerDemandeEmcf(v) && nullableTexte((v as DetailsFactureEmcf).paymentUrl));
}
export function validerSecuriteEmcf(v: unknown): v is SecuriteEmcf {
  return objet(v) && ["dateTime", "qrCode", "codeMECeFDGI", "counters", "nim"].every((c) => texte(v[c]));
}
export function confirmerFactureEmcf(uid: string): Promise<SecuriteEmcf> {
  return requete(`invoice/${uidEncode(uid)}/confirm`, "PUT", validerSecuriteEmcf);
}
export function annulerFactureEmcf(uid: string): Promise<AnnulationEmcf> {
  // Cancel n'impose aucun élément de certification dans le contrat officiel.
  return requete(`invoice/${uidEncode(uid)}/cancel`, "PUT", (v) => objet(v) && ["dateTime", "qrCode", "codeMECeFDGI", "counters", "nim"].every((c) => nullableTexte(v[c])));
}
