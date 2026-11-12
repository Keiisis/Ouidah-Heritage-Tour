import { randomInt } from "node:crypto";
import { revalidateTag } from "next/cache";
import { after } from "next/server";
import PAYS from "@/content/pays.json";
import type { ChoixOptions, DemandeCommande, Produit, ReponseCommande } from "@/lib/boutique-types";
import { lireProduitsFrais } from "@/lib/boutique";
import { EMAIL } from "@/lib/demande";
import { base, baseConfiguree, compter } from "@/lib/serveur/base";
import { empreinteIp, lireCorps, reponse } from "@/lib/serveur/garde";
import { emettre } from "@/lib/serveur/documents/emettre";
import { jetonSuivi } from "@/lib/serveur/documents/jeton";
import { envoyerCommande } from "@/lib/serveur/courriels/boutique";
import { noterException } from "@/lib/serveur/courriel";
import { passerellesActives } from "@/lib/serveur/paiement";
import { expirerCommandes, ouvrirLienCommande } from "@/lib/serveur/paiement/lien";
import { origineSite } from "@/lib/serveur/paiement/outils";
import { figerTaux } from "@/lib/serveur/taux";
import { langueDoc } from "@/lib/suivi";

// Envoi d'une commande de la boutique. Tout est revérifié ici : chaque ligne contre la base (article visible, quantité,
// pièce unique, taille ou mesures, broderie, coloris), coordonnées, adresse de livraison, piège à robots, temps passé sur
// la page, 5 commandes par heure et par connexion. Noms et prix enregistrés = ceux de la base, jamais ceux du navigateur.
// E-mail au client après la réponse (courriels/boutique.ts) : sans SMTP configuré rien ne part, la commande reste enregistrée.
// Paiement immédiat (décision de Kevin du 09/11) : si une passerelle est active et que tous les prix sont connus, la base
// (rpc boutique_commander) relit prix, stock et frais de livraison, réserve le stock et crée la commande « à préparer »
// dans une seule transaction ; le client part aussitôt vers /payer/<jeton du lien>. Sans passerelle active (ou prix à
// confirmer), ancien parcours : commande « à confirmer », sans réservation, confirmée puis réglée avec l'équipe.
// Livraison : frais de la zone du pays de livraison (boutique_livraison_zones) ; zone sans prix : refus, jamais deviné.
const MAX_PAR_HEURE = 5;
const DUREE_MIN = 2500; // ms entre l'ouverture du formulaire et l'envoi
const LIGNES_MAX = 30;
const QUANTITE_MAX = 10;
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sans 0/O, 1/I/L
const CODES_PAYS = new Set<string>(PAYS);

const MESSAGES = {
  illisible: "Votre commande n'a pas pu être lue. Merci de réessayer.",
  refus: "Votre commande n'a pas pu être envoyée. Merci de réessayer dans un instant.",
  champs: "Certaines informations sont à compléter ou à corriger.",
  limite: "Plusieurs commandes viennent déjà d'être envoyées depuis cette connexion. Merci de réessayer dans une heure.",
  indisponible: "La boutique ne répond pas pour le moment. Merci de réessayer un peu plus tard.",
  zone: "La livraison vers ce pays n'est pas encore payable en ligne. Choisissez le retrait à Ouidah ou écrivez-nous.",
};
const erreur = (cle: keyof typeof MESSAGES, status: number, champs?: string[]) => reponse({ ok: false, erreur: MESSAGES[cle], ...(champs ? { champs } : {}) } satisfies ReponseCommande, status);

const objet = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const texte = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max + 1) : "");
const TAUX_EUR = 655.957; // parité fixe BCEAO, la même que reglages_site.taux_eur
const MINUTES_PAIEMENT = 30; // réservation provisoire du stock = durée de vie du lien de paiement

type Zone = { code: string; frais_xof: number | null; actif: boolean };
/** Zone de livraison d'une adresse, relue en base ; null : aucune zone ; undefined : base muette. */
async function zoneLivraison(pays: string, ville: string): Promise<Zone | null | undefined> {
  const r = await base("rpc/boutique_zone_livraison", { method: "POST", corps: { p_pays: pays, p_ville: ville } }).catch(() => null);
  return r?.ok ? ((await r.json().catch(() => undefined)) as Zone | null | undefined) : undefined;
}

export async function POST(req: Request) {
  if (!baseConfiguree()) return erreur("indisponible", 503);
  const c = await lireCorps(req);
  if (c === null) return erreur("illisible", 400);
  const d = objet(c);
  // `debut` vient de l'horloge du visiteur : un écart négatif (horloge en avance) ne prouve rien, il n'est pas refusé
  const ecoule = typeof d.debut === "number" && Number.isFinite(d.debut) ? Date.now() - d.debut : Number.NaN;
  if ((d.site !== undefined && d.site !== "") || Number.isNaN(ecoule) || (ecoule >= 0 && ecoule < DUREE_MIN)) return erreur("refus", 400);

  const ip = empreinteIp(req);
  const depuis = new Date(Date.now() - 3_600_000).toISOString();
  const n = await compter("boutique_commandes", `empreinte_ip=eq.${ip}&cree_le=gte.${encodeURIComponent(depuis)}`);
  if (n === null) return erreur("indisponible", 503);
  if (n >= MAX_PAR_HEURE) return erreur("limite", 429);

  const champs: string[] = [];
  const faux = (nom: string) => champs.push(nom);

  // ——— lignes : revérifiées contre la base ———
  // paiement en ligne possible : le stock des paniers abandonnés est rendu avant d'être relu
  const immediat = (await passerellesActives()).length > 0;
  if (immediat) await expirerCommandes();
  const recues = Array.isArray(d.lignes) ? d.lignes.map(objet) : [];
  if (recues.length < 1 || recues.length > LIGNES_MAX) faux("lignes");
  const produits = await lireProduitsFrais(recues.slice(0, LIGNES_MAX).map((l) => (typeof l.slug === "string" ? l.slug : "")));
  if (!produits) return erreur("indisponible", 503);
  const parSlug = new Map(produits.map((p) => [p.slug, p]));
  const lignes: { slug: string; nom: string; prix_xof: number | null; quantite: number; options: ChoixOptions }[] = [];
  recues.slice(0, LIGNES_MAX).forEach((l, i) => {
    const p = typeof l.slug === "string" ? parSlug.get(l.slug) : undefined;
    if (!p) return faux(`lignes.${i}.slug`);
    const q = l.quantite;
    if (!Number.isInteger(q) || (q as number) < 1 || (q as number) > (p.unique ? 1 : QUANTITE_MAX)) faux(`lignes.${i}.quantite`);
    if (p.unique && recues.findIndex((x) => x.slug === p.slug) !== i) faux(`lignes.${i}.slug`);
    const options = verifierOptions(p, objet(l.options), (nom) => faux(`lignes.${i}.options.${nom}`));
    lignes.push({ slug: p.slug, nom: p.nom, prix_xof: p.prixXof, quantite: q as number, options });
  });
  for (const p of produits) {
    const quantite = lignes.filter((l) => l.slug === p.slug).reduce((n, l) => n + l.quantite, 0);
    if (quantite > (p.unique ? 1 : QUANTITE_MAX) || (p.stockDisponible != null && quantite > p.stockDisponible)) faux("lignes");
  }

  // ——— coordonnées, remise, message, devise ———
  const ct = objet(d.contact);
  const contact = { prenom: texte(ct.prenom, 80), nom: texte(ct.nom, 80), email: texte(ct.email, 254).toLowerCase(), telephone: texte(ct.telephone, 30), pays: texte(ct.pays, 2).toUpperCase() };
  if (!contact.prenom || contact.prenom.length > 80) faux("contact.prenom");
  if (!contact.nom || contact.nom.length > 80) faux("contact.nom");
  if (contact.email.length > 254 || !EMAIL.test(contact.email)) faux("contact.email");
  if (!/^[\d+ ().-]{6,30}$/.test(contact.telephone)) faux("contact.telephone");
  if (!CODES_PAYS.has(contact.pays)) faux("contact.pays");

  const rm = objet(d.remise);
  const livraison = rm.mode === "livraison";
  if (!livraison && rm.mode !== "retrait") faux("remise.mode");
  const adresse = { adresse: texte(rm.adresse, 300), ville: texte(rm.ville, 80), pays: texte(rm.pays, 2).toUpperCase() };
  if (livraison) {
    if (!adresse.adresse || adresse.adresse.length > 300) faux("remise.adresse");
    if (!adresse.ville || adresse.ville.length > 80) faux("remise.ville");
    if (!CODES_PAYS.has(adresse.pays)) faux("remise.pays");
  }
  const remise = livraison ? { mode: "livraison", ...adresse } : { mode: "retrait" };

  const message = texte(d.message, 1000);
  if (d.message !== undefined && typeof d.message !== "string") faux("message");
  if (message.length > 1000) faux("message");
  if (d.devise !== "EUR" && d.devise !== "FCFA" && d.devise !== "USD") faux("devise");
  // dollar : affichage seulement, au taux du jour figé avec la commande ; sans taux saisi, la commande repasse en euros
  const taux = await figerTaux();
  if (!taux) return erreur("indisponible", 503);
  const devise = d.devise === "USD" && !taux.taux_usd ? "EUR" : (d.devise as DemandeCommande["devise"]);
  if (champs.length) return erreur("champs", 400, [...new Set(champs)]);

  // frais de la zone du pays de livraison ; retrait à Ouidah gratuit ; zone inconnue, inactive ou sans prix : refus
  let frais = 0, zone: string | null = null;
  if (livraison) {
    const z = await zoneLivraison(adresse.pays, adresse.ville);
    if (z === undefined) return erreur("indisponible", 503);
    if (!z || !z.actif || z.frais_xof === null) return erreur("zone", 400, ["remise.zone"]);
    frais = z.frais_xof;
    zone = z.code;
  }
  const langue = langueDoc(typeof d.langue === "string" ? d.langue : null);
  const origine = origineSite(req);
  const finir = (id: string, reference: string, total: number | null, ticket: { numero: string } | null, paiement: boolean) => {
    const jeton = jetonSuivi("b", id);
    // e-mail « commande reçue » après la réponse : un échec d'envoi ne touche pas la commande enregistrée
    // e-mail au client et avis à l'équipe ; une exception est tracée au journal des envois
    if (origine) after(() => envoyerCommande({ id, reference, ticket: ticket?.numero ?? null, jeton, langue, contact, message: message || null, lignes, remise, total_xof: total, frais_xof: frais, immediat: paiement, devise, taux_usd: devise === "USD" ? taux.taux_usd : null }, origine).catch(() => noterException("auto-boutique", contact.email)));
    return jeton;
  };
  const tirer = () => `OHT-B-${Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}`;

  if (immediat && lignes.every((l) => l.prix_xof !== null)) {
    for (let essai = 0; essai < 3; essai++) {
      const reference = tirer();
      const p = { reference, lignes: lignes.map((l) => ({ slug: l.slug, quantite: l.quantite, options: l.options })), contact, remise, message, devise, ...taux, empreinte_ip: ip, langue };
      const r = await base("rpc/boutique_commander", { method: "POST", corps: { p, p_minutes: MINUTES_PAIEMENT } }).catch(() => null);
      if (r?.status === 409) continue; // référence déjà prise, on en tire une autre
      const res = r?.ok ? ((await r.json().catch(() => null)) as { ok?: boolean; id?: string; total_xof?: number; erreur?: string; slug?: string } | null) : null;
      if (res?.erreur === "zone") return erreur("zone", 400, ["remise.zone"]);
      if (res?.erreur === "stock" || res?.erreur === "prix") {
        const ko = lignes.flatMap((l, i) => (l.slug === res.slug ? [`lignes.${i}`] : []));
        return erreur("champs", 400, ko.length ? ko : ["lignes"]);
      }
      if (res?.erreur) return erreur("champs", 400, ["lignes"]);
      if (!res?.ok || !res.id) break;
      revalidateTag("boutique", "max"); // stock disponible changé : le catalogue se relit
      const ticket = await emettre("T", "commande", res.id).catch(() => null);
      const jeton = finir(res.id, reference, res.total_xof ?? null, ticket, true);
      const lien = await ouvrirLienCommande(res.id);
      return reponse({ ok: true, reference, suivi: jeton, payer: lien.ok ? `/payer/${lien.jeton}` : null } satisfies ReponseCommande, 201);
    }
    return erreur("indisponible", 502);
  }

  // ancien parcours : total en FCFA (somme d'entiers, seule à faire foi) + frais ; total_eur n'en est qu'un dérivé
  const articles = lignes.every((l) => l.prix_xof !== null) ? lignes.reduce((s, l) => s + (l.prix_xof as number) * l.quantite, 0) : null;
  const total = articles === null ? null : articles + frais;
  const totalEur = total === null ? null : Math.round((total / TAUX_EUR) * 100) / 100;
  const ligne = { statut: "a_confirmer", lignes, contact, remise, message: message || null, devise, total_xof: total, total_eur: totalEur, frais_livraison_xof: frais, livraison_zone: zone, ...taux, empreinte_ip: ip, langue };
  for (let essai = 0; essai < 3; essai++) {
    const reference = tirer();
    const r = await base("boutique_commandes?select=id", { method: "POST", corps: { ...ligne, reference }, prefer: "return=representation" }).catch(() => null);
    if (r?.ok) {
      // ticket de commande numéroté et lien secret de suivi (commande « à confirmer » par l'équipe)
      const id = ((await r.json().catch(() => [])) as { id?: string }[])[0]?.id;
      const ticket = id ? await emettre("T", "commande", id).catch(() => null) : null;
      return reponse({ ok: true, reference, suivi: id ? finir(id, reference, total, ticket, false) : null } satisfies ReponseCommande, 201);
    }
    if (r?.status !== 409) break; // 409 : référence déjà prise, on en tire une autre
  }
  return erreur("indisponible", 502);
}

/** Options d'une ligne : taille de la liste ou mesures si sur mesure, broderie dans la longueur permise, coloris de l'article. */
function verifierOptions(p: Produit, o: Record<string, unknown>, faux: (nom: string) => void): ChoixOptions {
  const choix: ChoixOptions = {};
  const taille = texte(o.taille, 40), mesures = texte(o.mesures, 500), broderie = texte(o.broderie, 200), coloris = texte(o.coloris, 40);
  for (const k of ["taille", "mesures", "broderie", "coloris"] as const) if (o[k] !== undefined && typeof o[k] !== "string") faux(k);

  // taille de la liste, ou mesures en texte si l'article se fait sur mesure (l'un ou l'autre, requis s'il y a des tailles)
  const tailles = p.options?.tailles ?? null, surMesure = p.options?.surMesure === true;
  if (taille && mesures) faux("taille");
  else if (taille && tailles?.includes(taille)) choix.taille = taille;
  else if (taille) faux("taille");
  else if (mesures && surMesure && mesures.length <= 500) choix.mesures = mesures;
  else if (mesures) faux("mesures");
  else if (tailles || surMesure) faux("taille");

  // broderie facultative, seulement sur un article brodable, au plus `max` caractères
  const max = p.options?.broderie?.max;
  if (broderie && max && [...broderie].length <= max) choix.broderie = broderie;
  else if (broderie) faux("broderie");

  // coloris (nom ou code hex) parmi ceux de l'article ; requis s'il y en a plusieurs
  const c = coloris ? p.coloris.find((x) => x.nom === coloris || x.hex.toLowerCase() === coloris.toLowerCase()) : undefined;
  if (c) choix.coloris = c.nom;
  else if (coloris || p.coloris.length > 1) faux("coloris");
  else if (p.coloris.length === 1) choix.coloris = p.coloris[0].nom;
  return choix;
}
