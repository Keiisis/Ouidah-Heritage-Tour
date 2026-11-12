import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { base } from "../../base";
import { jetonSuivi } from "../../documents/jeton";
import { etatLien, etatLienClient, type EtatLien, sourceLien } from "./regles";

// Accès au lien de paiement depuis la page publique du client (/payer/<jeton>). Le jeton est vérifié ici (HMAC,
// BILLET_SECRET, même signature que jetonLien de lectures.ts) ; la page ne reçoit que ce qu'elle affiche. L'ouverture est
// notée une seule fois.
const FORME = /^l-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([A-Za-z0-9_-]{22})$/;

export function idDuJeton(jeton: string): string | null {
  const m = FORME.exec(jeton);
  const cle = process.env.BILLET_SECRET;
  if (!m || !cle || cle.length < 32) return null;
  const attendu = Buffer.from(createHmac("sha256", cle).update(`lien-paiement:${m[1]}`).digest("base64url").slice(0, 22));
  const lu = Buffer.from(m[2]);
  return attendu.length === lu.length && timingSafeEqual(attendu, lu) ? m[1] : null;
}

// suivi : jeton du suivi de la commande (lien d'une commande de la boutique), pour y revenir après le paiement
export type LienPublic = { id: string; devis: string | null; montant: number; devise: "XOF"; langue: string; expire: string; passerelles: string[]; etat: EtatLien; client: string; numero: string | null; reference: string; suivi: string | null };
type Brut = { id: string; devis_id: string | null; demande_id: string | null; commande_id: string | null; montant: number; devise: "XOF"; langue: string; expire_le: string; passerelles: string[]; envoye_le: string | null; ouvert_le: string | null; paye_le: string | null; annule_le: string | null; demande: { nom: string | null } | null; devis: { statut: string } | null; commande: { reference: string; statut: string; paiement_etat: string; montant_recu: number; contact: { prenom?: string; nom?: string } | null } | null };

/** Le lien d'un jeton authentique (montant = total du devis ou de la commande, fixé à la création), ou null. Son état tient
 * compte de la source : un devis ou une commande réglé par ailleurs, ou fermé, n'affiche jamais « à payer ». */
export async function lienDuJeton(jeton: string): Promise<LienPublic | null> {
  const id = idDuJeton(jeton);
  if (!id) return null;
  const r = await base(`liens_paiement?select=id,devis_id,demande_id,commande_id,montant,devise,langue,expire_le,passerelles,envoye_le,ouvert_le,paye_le,annule_le,demande:demandes(nom),devis:devis(statut),commande:boutique_commandes(reference,statut,paiement_etat,montant_recu,contact)&id=eq.${id}&limit=1`).catch(() => null);
  const l = r?.ok ? ((await r.json()) as Brut[])[0] : undefined;
  if (!l) return null;
  const commun = { id: l.id, montant: l.montant, devise: l.devise, langue: l.langue, expire: l.expire_le, passerelles: l.passerelles, etat: etatLienClient(etatLien(l, Date.now()), sourceLien(l)) };
  if (l.commande_id) {
    const k = l.commande;
    return { ...commun, devis: null, client: `${k?.contact?.prenom ?? ""} ${k?.contact?.nom ?? ""}`.trim(), numero: null, reference: k?.reference ?? "", suivi: jetonSuivi("b", l.commande_id) };
  }
  const d = await base(`documents?select=numero&type=eq.D&source=eq.devis&source_id=eq.${l.devis_id}&limit=1`).catch(() => null);
  const numero = d?.ok ? (((await d.json()) as { numero: string }[])[0]?.numero ?? null) : null;
  return { ...commun, devis: l.devis_id, client: l.demande?.nom ?? "", numero, reference: `DEM-${(l.demande_id ?? "").slice(0, 6).toUpperCase()}`, suivi: null };
}

/** Note la première ouverture du lien par le client (suivi « ouvert ») ; sans effet ensuite. */
export async function marquerOuvert(id: string) {
  const t = new Date().toISOString();
  await base(`liens_paiement?id=eq.${id}&ouvert_le=is.null&paye_le=is.null&annule_le=is.null`, { method: "PATCH", corps: { ouvert_le: t, modifie_le: t }, prefer: "return=minimal" }).catch(() => null);
}
