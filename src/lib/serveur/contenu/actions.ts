"use server";

import { randomUUID } from "node:crypto";
import { refresh, updateTag } from "next/cache";
import { draftMode } from "next/headers";
import sharp from "sharp";
import { estCleEdition as estCle, decomposerCle, prefixesMedias, REGISTRE, type CleEdition as CleContenu } from "@/lib/contenu-registre";
import { adressesPerdues, altValide, type Ecart, IMAGE_MAX, type Json, LARGEUR_IMAGE, MIMES_IMAGE, typeImage, valider } from "@/lib/contenu-regles";
import { tagContenu } from "@/lib/contenu";
import { base } from "../base";
import { journaliser } from "../equipe/journal";
import { exigerDroit } from "../equipe/securite/droits";
import type { Session } from "../equipe/session";
import { fusionEdition, lireLigne, lireVersion, preparerEdition } from "./lectures";
import { messagesValides } from "@/lib/traductions";
import { themeValide } from "@/lib/theme";
import { planifierTraductions } from "../traduction-auto/planifier";
import { effacerDepot, lireDepot, poserPublic, urlDepot } from "./stockage";

// Écritures du contenu du site. Actions serveur joignables par une requête forgée : CHAQUE appel relit la session et le
// droit « site » (agent qui l'a reçu, admin toujours), relit la valeur envoyée contre la forme du défaut et ne renvoie que
// ce que l'écran affiche (doc Next 16 « Data Security » › Mutating data). Brouillon puis publication : un agent propose
// (brouillon), un admin publie (libellé du droit : « Proposer des modifications du site (validées par vous) »). Chaque
// écriture crée une version (contenu_versions), va au journal (rubrique et version, jamais le texte) ; la publication
// expire l'étiquette de cache de la rubrique (updateTag, doc Next 16 « updateTag » : actions serveur seulement, la
// requête suivante attend la donnée fraîche). Un slug utilisé par une adresse publique ne disparaît pas sans confirmation.

export type RefusContenu = "refuse" | "admin" | "cle" | "verrouille" | "champs" | "conflit" | "adresses" | "panne" | "type" | "taille" | "alt" | "stockage" | "introuvable";
export type ImageTeleversee = { src: string; alt: string; largeur: number; hauteur: number };
export type RetourContenu = { ok: true; version?: number; url?: string; objet?: string; image?: ImageTeleversee } | { erreur: RefusContenu; ecarts?: Ecart[]; adresses?: string[] };

const TAILLE_VALEUR = 900_000; // octets du JSON envoyé (la base en accepte 1 Mo)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function acces(): Promise<Session | { erreur: RefusContenu }> {
  const s = await exigerDroit("site");
  return s ?? { erreur: "refuse" };
}

// photos : aussi pour les agents qui gèrent les articles de la boutique (droit « boutique »)
async function accesImage(): Promise<Session | { erreur: RefusContenu }> {
  const s = (await exigerDroit("site")) ?? (await exigerDroit("boutique"));
  return s ?? { erreur: "refuse" };
}

async function refus(s: Session, cle: string | undefined, motif: "champs" | "role" | "adresses" | "conflit" | "verrouille" | "type" | "taille" | "contenu", erreur: RefusContenu, extra: { ecarts?: Ecart[]; adresses?: string[] } = {}): Promise<RetourContenu> {
  await journaliser("contenu.refus", s.profilId, null, { ...(cle ? { cle } : {}), motif, ...(extra.ecarts ? { nombre: extra.ecarts.length } : {}) });
  return { erreur, ...extra };
}

async function ecrire(cle: CleContenu, valeur: Json | null, version: number, auteur: string, etat: "brouillon" | "publie" | "abandon", avant?: Json): Promise<number | "conflit" | null> {
  try {
    const r = await base(etat === "publie" ? "rpc/contenu_publier_traduction" : "rpc/contenu_ecrire", { method: "POST", corps: { p_cle: cle, p_valeur: valeur, p_version: version, p_auteur: auteur, ...(etat === "publie" ? { p_avant: avant } : { p_etat: etat }) } });
    if (!r.ok) return null;
    const v = (await r.json()) as number | null;
    return typeof v === "number" ? v : "conflit";
  } catch {
    return null;
  }
}

/** Valeur relue et prête à écrire, ou le refus (rubrique inconnue ou verrouillée, version, forme, adresses). */
async function relire(s: Session, cle: unknown, valeur: unknown, version: unknown, confirmer: unknown): Promise<{ cle: CleContenu; valeur: Json; version: number; avant: Json } | RetourContenu> {
  if (!estCle(cle)) return { erreur: "cle" };
  if (REGISTRE[decomposerCle(cle).cle].verrouille) return refus(s, cle, "verrouille", "verrouille");
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) return { erreur: "champs" };
  if (JSON.stringify(valeur ?? null).length > TAILLE_VALEUR) return refus(s, cle, "taille", "taille");
  const edition = await preparerEdition(cle);
  if (!edition) return { erreur: "panne" };
  const forme = edition.forme;
  const ecarts = valider(forme, valeur, cle, { medias: prefixesMedias() });
  if (edition.cle === "site.theme" && !themeValide(valeur)) ecarts.push({ chemin: cle, motif: "format" });
  if (edition.cle === "site.seo" && valeur && typeof valeur === "object" && "pages" in valeur && Array.isArray(valeur.pages)) {
    const adresses = valeur.pages.map((p: unknown) => p && typeof p === "object" && "chemin" in p ? p.chemin : null);
    if (adresses.some((p) => typeof p !== "string" || !/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/.test(p)) || new Set(adresses).size !== adresses.length) ecarts.push({ chemin: `${cle}.pages`, motif: "format" });
  }
  if (edition.cle === "site.messages" && valeur && typeof valeur === "object" && Object.keys(messagesValides(valeur)).length !== Object.keys(valeur).length) ecarts.push({ chemin: cle, motif: "jeton" });
  if (ecarts.length) return refus(s, cle, "champs", "champs", { ecarts: ecarts.slice(0, 60) });
  const ligne = await lireLigne(cle);
  if (!ligne) return { erreur: "panne" };
  if (ligne.version !== version) return refus(s, cle, "conflit", "conflit");
  // adresses publiques : slugs de la version publiée (ou du défaut) absents de la nouvelle valeur
  const avant = fusionEdition(cle, ligne.valeur, edition.source);
  const perdues = adressesPerdues(forme, avant, valeur);
  if (perdues.length && confirmer !== true) return refus(s, cle, "adresses", "adresses", { adresses: perdues });
  return { cle, valeur: valeur as Json, version, avant };
}

/** Enregistre le brouillon d'une rubrique (rien ne change sur le site). */
export async function enregistrerBrouillon(cle: unknown, valeur: unknown, version: unknown, confirmer?: unknown): Promise<RetourContenu> {
  const s = await acces();
  if ("erreur" in s) return s;
  const x = await relire(s, cle, valeur, version, confirmer);
  if ("erreur" in x || "ok" in x) return x;
  const v = await ecrire(x.cle, x.valeur, x.version, s.profilId, "brouillon");
  if (v === "conflit") return refus(s, x.cle, "conflit", "conflit");
  if (v === null) return { erreur: "panne" };
  await journaliser("contenu.brouillon", s.profilId, null, { cle: x.cle, version: v });
  refresh();
  return { ok: true, version: v };
}

/** Publie une rubrique (admin seulement) : la valeur devient celle du site, le brouillon est vidé. */
export async function publierContenu(cle: unknown, valeur: unknown, version: unknown, confirmer?: unknown): Promise<RetourContenu> {
  const s = await acces();
  if ("erreur" in s) return s;
  if (s.role !== "admin") return refus(s, estCle(cle) ? cle : undefined, "role", "admin");
  const x = await relire(s, cle, valeur, version, confirmer);
  if ("erreur" in x || "ok" in x) return x;
  const v = await ecrire(x.cle, x.valeur, x.version, s.profilId, "publie", x.avant);
  if (v === "conflit") return refus(s, x.cle, "conflit", "conflit");
  if (v === null) return { erreur: "panne" };
  updateTag(tagContenu(x.cle));
  updateTag("contenu"); // surchargesPubliques (lib/contenu.ts) : aussi pour une rubrique publiée la première fois
  await journaliser("contenu.publication", s.profilId, null, { cle: x.cle, version: v });
  planifierTraductions();
  refresh();
  return { ok: true, version: v };
}

/** Abandonne le brouillon : l'éditeur revient à la version publiée (aucune version d'historique). */
export async function abandonnerBrouillon(cle: unknown, version: unknown): Promise<RetourContenu> {
  const s = await acces();
  if ("erreur" in s) return s;
  if (!estCle(cle)) return { erreur: "cle" };
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) return { erreur: "champs" };
  const v = await ecrire(cle, null, version, s.profilId, "abandon");
  if (v === "conflit") return refus(s, cle, "conflit", "conflit");
  if (v === null) return { erreur: "panne" };
  await journaliser("contenu.abandon", s.profilId, null, { cle, version: v });
  refresh();
  return { ok: true, version: v };
}

/** Remet une version de l'historique dans le brouillon (relue contre la forme actuelle) ; publier l'applique au site. */
export async function restaurerVersion(cle: unknown, id: unknown, version: unknown): Promise<RetourContenu> {
  const s = await acces();
  if ("erreur" in s) return s;
  if (!estCle(cle)) return { erreur: "cle" };
  if (typeof id !== "number" || !Number.isInteger(id) || id < 1) return { erreur: "champs" };
  const ancienne = await lireVersion(cle, id);
  if (ancienne === null) return { erreur: "introuvable" };
  // même relecture qu'un enregistrement ; la version va au brouillon : les adresses perdues seront signalées à la publication
  const x = await relire(s, cle, ancienne, version, true);
  if ("erreur" in x || "ok" in x) return x;
  const v = await ecrire(x.cle, x.valeur, x.version, s.profilId, "brouillon");
  if (v === "conflit") return refus(s, x.cle, "conflit", "conflit");
  if (v === null) return { erreur: "panne" };
  await journaliser("contenu.restauration", s.profilId, null, { cle: x.cle, version: v, cible: String(id) });
  refresh();
  return { ok: true, version: v };
}

// ---------- images ----------

/** Étape 1 : type et taille annoncés relus, puis une URL de dépôt signée vers le dépôt privé, pour un objet neuf. */
export async function preparerImage(mime: unknown, taille: unknown): Promise<RetourContenu> {
  const s = await accesImage();
  if ("erreur" in s) return s;
  if (typeof mime !== "string" || !(MIMES_IMAGE as readonly string[]).includes(mime)) return refus(s, undefined, "type", "type");
  if (typeof taille !== "number" || !Number.isInteger(taille) || taille < 1 || taille > IMAGE_MAX) return refus(s, undefined, "taille", "taille");
  const objet = randomUUID();
  const url = await urlDepot(objet);
  return url ? { ok: true, url, objet } : { erreur: "stockage" };
}

/** Étape 2 : l'original relu (taille, signature JPEG, PNG ou WebP), redressé, réduit à `largeur` px au plus, converti en
 * WebP vers le compartiment public, puis effacé du dépôt. Le texte alternatif est obligatoire. */
export async function finaliserImage(objet: unknown, alt: unknown, largeur?: unknown): Promise<RetourContenu> {
  const s = await accesImage();
  if ("erreur" in s) return s;
  if (typeof objet !== "string" || !UUID.test(objet)) return { erreur: "champs" };
  if (!altValide(alt)) {
    await effacerDepot(objet);
    return refus(s, undefined, "champs", "alt");
  }
  const max = typeof largeur === "number" && Number.isInteger(largeur) && largeur >= 200 && largeur <= LARGEUR_IMAGE ? largeur : LARGEUR_IMAGE;
  try {
    const o = await lireDepot(objet, IMAGE_MAX);
    if (o === null) return { erreur: "stockage" };
    if (o === "absent") return { erreur: "introuvable" };
    if (o === "trop") return refus(s, undefined, "taille", "taille");
    if (!typeImage(o)) return refus(s, undefined, "contenu", "type");
    let sortie: { data: Buffer; info: { width: number; height: number } };
    try {
      sortie = await sharp(o, { limitInputPixels: 80_000_000 }).rotate().resize({ width: max, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    } catch {
      return refus(s, undefined, "contenu", "type");
    }
    const chemin = `${new Date().getUTCFullYear()}/${randomUUID()}.webp`;
    const src = await poserPublic(chemin, new Uint8Array(sortie.data));
    if (!src) return { erreur: "stockage" };
    await journaliser("contenu.image", s.profilId, null, { cible: chemin });
    return { ok: true, image: { src, alt: alt.trim(), largeur: sortie.info.width, hauteur: sortie.info.height } };
  } finally {
    await effacerDepot(objet);
  }
}

// ---------- aperçu ----------

/** Mode aperçu (draftMode) pour ce navigateur : le site affiche les brouillons à la place des versions publiées. */
export async function ouvrirApercu(): Promise<RetourContenu> {
  const s = await acces();
  if ("erreur" in s) return s;
  (await draftMode()).enable();
  return { ok: true };
}

/** Quitte le mode aperçu. */
export async function fermerApercu(): Promise<RetourContenu> {
  (await draftMode()).disable();
  return { ok: true };
}
