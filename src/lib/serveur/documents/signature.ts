import { createHash } from "node:crypto";
import { iso, jourOuidah } from "@/lib/jours";
import { LANGUES_DOC, langueDoc, type LangueDoc } from "@/lib/suivi";
import { base } from "../base";
import { emettre } from "./emettre";
import { lireJeton } from "./jeton";
import { taxeDocument, type VentilationTva } from "../equipe/finances/fiscalite-regles";

// Signature en ligne d'un devis par le client (maquette E « signer », 03/11/2026) : /suivi/<jeton>/signer.
// Seul un lien de suivi de demande (« d ») authentique signe, et seulement le dernier devis publié, encore « prêt » et
// valable (date de Ouidah). Une signature par devis (contrainte unique de la table). L'empreinte SHA-256 porte sur le
// contenu du devis émis, pas sur sa mise en page : JSON canonique (clés triées) du numéro D-, des lignes, du montant, de
// la devise, de la validité, du client et de la date de publication (ISO en millisecondes, même rendu pour tout lecteur).
export const TRACE_MAX = 200 * 1024; // octets de l'image PNG décodée (contrainte de devis_signatures)
export const NOM_MAX = 120;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DATA_PNG = "data:image/png;base64,";

type LigneBrute = { libelle: string; quantite: number; prix_unitaire: number };
type DevisBrut = { fiscalite?: VentilationTva | null; id: string; statut: "pret" | "paye"; lignes: LigneBrute[]; montant: number; devise: string; valable_jusqu_au: string | null; publie_le: string };
type DemandeBrute = { id: string; nom: string | null; email: string | null; langue: string; agent_id: string | null; circuit: string | null; dossier: { lieux?: unknown } | null };
export type DevisEmpreinte = { fiscalite?: VentilationTva | null; numero: string; lignes: LigneBrute[]; montant: number; devise: string; valable_jusqu_au: string | null; publie_le: string };
export type SignatureLue = { nom: string; mode: "trace" | "tape"; texte: string | null; trace: string | null; signe_le: string; empreinte: string };

const canonique = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(canonique).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonique(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
};

export function empreinteDevis(devis: DevisEmpreinte, demande: { nom: string; email: string }): string {
  const contenu = {
    numero: devis.numero,
    lignes: devis.lignes.map((l) => ({ libelle: l.libelle, quantite: l.quantite, prix_unitaire: l.prix_unitaire })),
    montant: devis.montant,
    ...(devis.fiscalite ? { fiscalite: taxeDocument(devis.fiscalite, devis.montant) } : {}),
    devise: devis.devise,
    valable_jusqu_au: devis.valable_jusqu_au,
    client: { nom: demande.nom, email: demande.email },
    publie_le: new Date(devis.publie_le).toISOString(),
  };
  return createHash("sha256").update(canonique(contenu), "utf8").digest("hex");
}

/** Lignes d'une lecture PostgREST ; null si la base ne répond pas (distinct d'une réponse vide). */
async function lire<T>(chemin: string): Promise<T[] | null> {
  const r = await base(chemin).catch(() => null);
  if (!r?.ok) return null;
  return ((await r.json().catch(() => null)) as T[] | null) ?? null;
}

// la demande envoyée et son dernier devis publié (prêt ou réglé)
async function lireContexte(id: string): Promise<{ demande: DemandeBrute | null; devis: DevisBrut | null } | null> {
  const [dem, dv] = await Promise.all([
    lire<DemandeBrute>(`demandes?select=id,nom,email,langue,agent_id,circuit,dossier&id=eq.${id}&statut=eq.envoyee&limit=1`),
    lire<DevisBrut>(`devis?select=id,statut,lignes,montant,devise,valable_jusqu_au,publie_le,fiscalite&demande_id=eq.${id}&statut=in.(pret,paye)&order=publie_le.desc&limit=1`),
  ]);
  if (!dem || !dv) return null;
  return { demande: dem[0]?.nom && dem[0].email ? dem[0] : null, devis: dv[0] ?? null };
}

const expire = (d: DevisBrut) => !!d.valable_jusqu_au && d.valable_jusqu_au < iso(jourOuidah(Date.now()));

/** Signature d'un devis (image en data URL PNG si `image`), null si aucune ou si la base ne répond pas. */
export async function lireSignature(devisId: string, image = false): Promise<SignatureLue | null> {
  const l = await lire<{ nom: string; mode: "trace" | "tape"; texte: string | null; trace_png?: string | null; cree_le: string; empreinte: string }>(
    `devis_signatures?select=nom,mode,texte,cree_le,empreinte${image ? ",trace_png" : ""}&devis_id=eq.${devisId}&limit=1`,
  );
  const s = l?.[0];
  if (!s) return null;
  // bytea lu par PostgREST : texte hexadécimal « \x89504e47… »
  const trace = image && s.trace_png ? `${DATA_PNG}${Buffer.from(s.trace_png.slice(2), "hex").toString("base64")}` : null;
  return { nom: s.nom, mode: s.mode, texte: s.texte, trace, signe_le: s.cree_le, empreinte: s.empreinte };
}

/** Ce que la page de signature lit en plus du dossier : lieux du séjour, état de validité, signature avec son image. */
export async function contexteSignature(jeton: string): Promise<{ circuit: string | null; lieux: string[]; expire: boolean; signature: SignatureLue | null } | null> {
  const j = lireJeton(jeton);
  if (!j || j.s !== "d") return null;
  const c = await lireContexte(j.id);
  if (!c?.demande || !c.devis) return null;
  const lieux = Array.isArray(c.demande.dossier?.lieux) ? c.demande.dossier.lieux.filter((l): l is string => typeof l === "string") : [];
  return { circuit: c.demande.circuit, lieux, expire: expire(c.devis), signature: await lireSignature(c.devis.id, true) };
}

const texte = (v: unknown, max: number) => {
  const t = typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").trim() : "";
  return t.length <= max ? t : "";
};

function png(v: unknown): Buffer | null {
  if (typeof v !== "string" || !v.startsWith(DATA_PNG)) return null;
  const b64 = v.slice(DATA_PNG.length);
  if (b64.length > Math.ceil(TRACE_MAX / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  const b = Buffer.from(b64, "base64");
  return b.length <= TRACE_MAX && b.subarray(0, 8).equals(PNG) ? b : null;
}

export type ErreurSignature = "incomplet" | "lien" | "deja" | "expire" | "base";
export type ResultatSignature = { ok: true; signe_le: string; empreinte: string } | { ok: false; erreur: ErreurSignature };
const refus = (erreur: ErreurSignature): ResultatSignature => ({ ok: false, erreur });

export async function signerDevis(e: { jeton: string; nom: unknown; mode: unknown; trace: unknown; texte: unknown; accepte: unknown; ip: string; langue: unknown }): Promise<ResultatSignature> {
  const j = lireJeton(e.jeton);
  if (!j || j.s !== "d") return refus("lien");
  // le corps d'abord : un envoi incomplet ne lit pas la base
  const nom = texte(e.nom, NOM_MAX);
  const mode = e.mode === "trace" || e.mode === "tape" ? e.mode : null;
  const image = mode === "trace" ? png(e.trace) : null;
  const tape = mode === "tape" ? texte(e.texte, NOM_MAX) : "";
  if (!nom || !mode || e.accepte !== true || (mode === "trace" ? !image : !tape)) return refus("incomplet");

  const c = await lireContexte(j.id);
  if (!c) return refus("base");
  const { demande, devis } = c;
  if (!demande?.nom || !demande.email || !devis || devis.statut !== "pret") return refus("lien");
  if (expire(devis)) return refus("expire");
  const deja = await lire<{ id: string }>(`devis_signatures?select=id&devis_id=eq.${devis.id}&limit=1`);
  if (!deja) return refus("base");
  if (deja.length) return refus("deja");
  const numero = await emettre("D", "devis", devis.id);
  if (!numero) return refus("base");

  const empreinte = empreinteDevis({ numero: numero.numero, lignes: devis.lignes, montant: devis.montant, devise: devis.devise, valable_jusqu_au: devis.valable_jusqu_au, publie_le: devis.publie_le, fiscalite: devis.fiscalite }, { nom: demande.nom, email: demande.email });
  const langue: LangueDoc = LANGUES_DOC.includes(e.langue as LangueDoc) ? (e.langue as LangueDoc) : langueDoc(demande.langue);
  const r = await base("devis_signatures?select=cree_le", {
    method: "POST",
    corps: { devis_id: devis.id, nom, mode, trace_png: image ? `\\x${image.toString("hex")}` : null, texte: mode === "tape" ? tape : null, empreinte, ip_hash: e.ip, langue },
    prefer: "return=representation",
  }).catch(() => null);
  if (r?.status === 409) return refus("deja"); // deux envois simultanés : la contrainte unique tranche
  if (!r?.ok) return refus("base");
  const signe_le = ((await r.json().catch(() => null)) as { cree_le?: string }[] | null)?.[0]?.cree_le ?? new Date().toISOString();

  // l'agent du dossier est prévenu ; un refus (type pas encore accepté par la table, doublon) ne touche pas la signature
  if (demande.agent_id) {
    await base("notifications?on_conflict=profil_id,type,objet_id", {
      method: "POST",
      corps: { profil_id: demande.agent_id, type: "devis_signe", objet_id: demande.id, quand: signe_le },
      prefer: "resolution=ignore-duplicates,return=minimal",
    }).catch(() => null);
  }
  return { ok: true, signe_le, empreinte };
}
