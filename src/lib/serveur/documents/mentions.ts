import { lireContenu } from "@/lib/contenu";
import type { LangueDoc } from "@/lib/suivi";
import { base } from "../base";

// Mentions imprimées sur les devis et les reçus : table reglages_documents (écran « Mentions des documents » de l'admin,
// migration 20261103_reglages.sql), champ par champ ; un champ vide reprend la mention publique de legal.json (pages
// légales, en respectant « visible »). Jamais le siège privé (`siege`), ni un téléphone de legal.json, ni le capital.
// Signature et cachet de la Direction générale : octets bytea lus en hexadécimal (« \x… ») ; seuls PNG et JPEG
// s'intègrent dans un PDF (pdf-lib), le type est lu dans les octets. Absents : la zone reste vide sur le document.
export type ImageDoc = { octets: Uint8Array; png: boolean };
export type MentionsDoc = {
  raisonSociale: string | null;
  forme: string | null;
  adresse: string | null;
  ifu: string | null;
  rccm: string | null;
  telephone: string | null;
  email: string | null;
  pied: string | null; // une ou deux lignes en bas de page, dans la langue du document
  mentions: string | null; // conditions, mentions imposées
  signataire: string | null;
  fonction: string | null; // saisie de l'admin seulement ; null = rôle traduit par l'appelant (copies, `direction.role`)
  signature: ImageDoc | null;
  cachet: ImageDoc | null;
};

type Textes = Partial<Record<LangueDoc, string>>;
type Ligne = {
  raison_sociale: string | null; forme: string | null; adresse: string | null; ifu: string | null; rccm: string | null; telephone: string | null; email: string | null;
  pied: Textes | null; mentions: Textes | null; signataire: string | null; fonction: string | null; signature: string | null; cachet: string | null;
};
type Info = { valeur: string | string[] | null; visible: boolean };
const nomPropre = (t: string) => t.toLocaleLowerCase("fr-FR").replace(/(^|[\s-])(\p{L})/gu, (_, a: string, l: string) => a + l.toLocaleUpperCase("fr-FR"));
const texte = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Image PNG ou JPEG d'un bytea PostgREST (« \x89504e47… ») ; tout autre format est ignoré. */
export function imageBytea(v: unknown): ImageDoc | null {
  if (typeof v !== "string" || !/^\\x(?:[0-9a-f]{2})+$/i.test(v)) return null;
  const o = Buffer.from(v.slice(2), "hex");
  if (o.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { octets: o, png: true };
  if (o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return { octets: o, png: false };
  return null;
}

// Repli legal.json : dénomination en nom propre (« Ouidah Heritage Tour »), sigle de la forme (« SAS »), RCCM sans sa
// date d'immatriculation, signataire tiré de « Mme Nathalie Rosine RIFFERT, Présidente ». La fonction n'est jamais
// déduite de legal.json (elle y est en français) : null, et l'appelant pose le rôle traduit dans la langue du client.
function secours(societe: Record<string, Info>): Omit<MentionsDoc, "pied" | "mentions" | "signature" | "cachet"> {
  const publique = (cle: string) => {
    const i = societe[cle];
    return i?.visible && typeof i.valeur === "string" ? i.valeur.trim() || null : null;
  };
  const forme = publique("forme");
  const direction = publique("presidente")?.match(/^(?:(?:Mme|Mlle|M\.|Mr)\s+)?([^,]+?)\s*(?:,|$)/);
  const denomination = publique("denomination");
  return {
    raisonSociale: denomination ? nomPropre(denomination) : null,
    forme: forme?.match(/\(([^)]+)\)\s*$/)?.[1] ?? forme,
    adresse: [publique("quartier"), publique("ville")].filter(Boolean).join(", ") || null,
    ifu: publique("ifu")?.replace(/\s/g, "") ?? null,
    rccm: publique("rccm")?.split(/\s+du\s+/)[0] ?? null,
    telephone: null,
    email: publique("email"),
    signataire: direction?.[1] ?? null,
    fonction: null,
  };
}

/** Mentions du document dans sa langue ; la base muette ou vide donne les mentions publiques de legal.json. */
export async function lireMentions(langue: LangueDoc): Promise<MentionsDoc> {
  const r = await base("reglages_documents?select=raison_sociale,forme,adresse,ifu,rccm,telephone,email,pied,mentions,signataire,fonction,signature,cachet&limit=1").catch(() => null);
  const l = r?.ok ? (((await r.json().catch(() => null)) as Ligne[] | null)?.[0] ?? null) : null;
  const d = secours((await lireContenu("legal")).societe);
  const parLangue = (t: Textes | null | undefined) => texte(t?.[langue]) ?? texte(t?.FR); // langue absente : le français
  return {
    raisonSociale: texte(l?.raison_sociale) ?? d.raisonSociale,
    forme: texte(l?.forme) ?? d.forme,
    adresse: texte(l?.adresse) ?? d.adresse,
    // IFU de la société (personne morale : 13 chiffres commençant par 3, comme celui de legal.json) ; tout autre numéro
    // saisi, par exemple un IFU personnel, est ignoré au profit de celui des pages légales
    ifu: (/^3\d{12}$/.test(texte(l?.ifu) ?? "") ? texte(l?.ifu) : null) ?? d.ifu,
    rccm: texte(l?.rccm) ?? d.rccm,
    telephone: texte(l?.telephone),
    email: texte(l?.email) ?? d.email,
    pied: parLangue(l?.pied),
    mentions: parLangue(l?.mentions),
    signataire: texte(l?.signataire) ?? d.signataire,
    fonction: texte(l?.fonction) ?? d.fonction,
    signature: imageBytea(l?.signature),
    cachet: imageBytea(l?.cachet),
  };
}
