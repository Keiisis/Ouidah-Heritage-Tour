import { base } from "../base";
import { emettre } from "../documents/emettre";
import type { Constat, Reservation, Statut } from "./types";

// Seule porte vers l'état « payé », appelée par la vérification au retour du client ET par les webhooks : elle est
// idempotente (mise à jour conditionnelle sur « attente »), ne croit que la transaction relue auprès de la passerelle,
// et renvoie toujours l'état réel de la réservation, jamais un succès par défaut.
const CHAMPS = "id,evenement,occurrence,formule_nom,quantite,montant,devise,passerelle,transaction_id,statut,nom,email,telephone,langue,paye_le,courriel_envoye,demande_id,reglement_manuel,mode_manuel";

export async function lireReservation(filtre: string, signalerPanne = false): Promise<Reservation | null> {
  const r = await base(`reservations?select=${CHAMPS}&${filtre}&limit=1`).catch(() => null);
  const lignes: unknown = r?.ok ? await r.json().catch(() => null) : null;
  if (!Array.isArray(lignes)) {
    if (signalerPanne) throw new Error("base");
    return null;
  }
  return (lignes as Reservation[])[0] ?? null;
}

export type Issue = { statut: Statut; reservation: Reservation; refus?: "reference" | "montant" | "devise" | "non_reussi" | "transaction_deja_utilisee" | "base" };

/** La transaction appartient-elle à cette réservation ? (référence gardée par la passerelle, ou transaction notée à la création) */
const rattachee = (r: Reservation, c: Constat) => c.reservation === r.id || (c.reservation === null && r.transaction_id !== null && r.transaction_id === c.transaction);

export async function finaliser(r: Reservation, c: Constat): Promise<Issue> {
  if (r.reglement_manuel) return { statut: r.statut, reservation: r, refus: "reference" };
  if (!rattachee(r, c)) return { statut: r.statut, reservation: r, refus: "reference" };

  // remboursement constaté par l'API : une réservation payée passe en « remboursée » (ses billets ne valent plus)
  if (c.etat === "rembourse") {
    if (r.statut !== "paye") return { statut: r.statut, reservation: r };
    return basculer(r, "paye", { statut: "rembourse" });
  }
  if (r.statut !== "attente") return { statut: r.statut, reservation: r };
  if (c.etat !== "reussi") return { statut: r.statut, reservation: r, refus: "non_reussi" }; // reste en attente : le client peut réessayer
  if (c.devise !== r.devise) return { statut: r.statut, reservation: r, refus: "devise" };
  if (c.montant === null || c.montant < r.montant) return { statut: r.statut, reservation: r, refus: "montant" };

  return basculer(r, "attente", { statut: "paye", transaction_id: c.transaction, paye_le: new Date().toISOString(), montant_recu: c.montant });
}

async function basculer(r: Reservation, depuis: Statut, champs: Record<string, unknown>): Promise<Issue> {
  // Une confirmation manuelle peut intervenir depuis la lecture de r : la base revérifie aussi ce mode.
  const reponse = await base(`reservations?id=eq.${r.id}&statut=eq.${depuis}&reglement_manuel=is.false`, { method: "PATCH", corps: { ...champs, modifie_le: new Date().toISOString() }, prefer: "return=representation" }).catch(() => null);
  if (!reponse) return { statut: r.statut, reservation: r, refus: "base" };
  // 409 : l'index unique (passerelle, transaction_id) refuse une transaction qui a déjà payé une autre réservation
  if (reponse.status === 409) return { statut: r.statut, reservation: r, refus: "transaction_deja_utilisee" };
  if (!reponse.ok) return { statut: r.statut, reservation: r, refus: "base" };
  const ligne = ((await reponse.json()) as Reservation[])[0];
  if (ligne) {
    // payée : ticket et reçu numérotés tout de suite, dans l'ordre des paiements (un échec sera rattrapé à la lecture du suivi)
    if (ligne.statut === "paye") await Promise.all([emettre("T", "reservation", r.id), emettre("R", "reservation", r.id)]).catch(() => null);
    return { statut: ligne.statut, reservation: { ...r, ...ligne } };
  }
  // aucune ligne modifiée : un autre appel (webhook ou retour) est passé avant ; on relit l'état réel
  const actuelle = await lireReservation(`id=eq.${r.id}`);
  return actuelle ? { statut: actuelle.statut, reservation: actuelle } : { statut: r.statut, reservation: r, refus: "base" };
}

/** Réserve l'envoi de l'e-mail des billets : un seul appel gagne, même si le retour et le webhook arrivent ensemble. */
export async function prendreEnvoi(id: string): Promise<boolean> {
  const r = await base(`reservations?id=eq.${id}&statut=eq.paye&courriel_envoye=is.false`, { method: "PATCH", corps: { courriel_envoye: true, modifie_le: new Date().toISOString() }, prefer: "return=representation" }).catch(() => null);
  return Boolean(r?.ok && ((await r.json()) as unknown[]).length);
}

/** Rend la main si l'envoi a échoué, pour qu'un prochain appel réessaie. */
export async function rendreEnvoi(id: string) {
  await base(`reservations?id=eq.${id}`, { method: "PATCH", corps: { courriel_envoye: false, modifie_le: new Date().toISOString() } }).catch(() => null);
}
