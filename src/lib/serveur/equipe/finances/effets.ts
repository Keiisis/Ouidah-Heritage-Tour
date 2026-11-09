import "server-only";
import { base } from "../../base";
import { emettre } from "../../documents/emettre";

// Effets d'un nouvel état de facture, communs aux actions de l'équipe (paiement manuel, avoir) et au paiement d'un lien
// (lib/serveur/paiement/lien.ts). Payée : devis « payé », dossier « Payée », reçu R- numéroté (emettre, appel seulement).
// Sinon le devis redevient « prêt » s'il était payé (écriture inverse, nouvel écart).
export async function apresEtat(devis: string, demande: string, statut: string | null) {
  const t = new Date().toISOString();
  if (statut === "payee") {
    await Promise.all([
      base(`devis?id=eq.${devis}&statut=eq.pret`, { method: "PATCH", corps: { statut: "paye", modifie_le: t }, prefer: "return=minimal" }).catch(() => null),
      base(`demandes?id=eq.${demande}&etape=in.(nouvelle,devis_envoye,perdue)`, { method: "PATCH", corps: { etape: "payee", modifie_le: t }, prefer: "return=minimal" }).catch(() => null),
      emettre("R", "devis", devis),
    ]);
  } else {
    await base(`devis?id=eq.${devis}&statut=eq.paye`, { method: "PATCH", corps: { statut: "pret", modifie_le: t }, prefer: "return=minimal" }).catch(() => null);
  }
}
