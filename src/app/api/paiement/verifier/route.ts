import { baseConfiguree } from "@/lib/serveur/base";
import { lireCorps, reponse } from "@/lib/serveur/garde";
import { billets, billetsPossibles, cleValide } from "@/lib/serveur/paiement/billet";
import { finaliser, lireReservation } from "@/lib/serveur/paiement/finaliser";
import { envoyerBillets } from "@/lib/serveur/paiement/courriel";
import { jetonSuivi } from "@/lib/serveur/documents/jeton";
import { passerelle } from "@/lib/serveur/paiement";
import { origineSite } from "@/lib/serveur/paiement/outils";
import type { Reservation } from "@/lib/serveur/paiement/types";

// Retour du client (widget refermé ou page de paiement quittée) : avec sa clé d'accès, il demande l'état réel de sa
// réservation. S'il est encore « en attente » et qu'une transaction est connue, le serveur la relit auprès de la
// passerelle et tranche par `finaliser`. Une vérification qui échoue ne change jamais l'état : on renvoie « attente ».
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const vue = (r: Reservation) => ({
  statut: r.statut,
  evenement: r.evenement,
  occurrence: r.occurrence,
  formule: r.formule_nom,
  quantite: r.quantite,
  montant: r.montant,
  devise: r.devise,
  billets: r.statut === "paye" ? billets(r) : [],
  passerelle: r.passerelle,
  // même référence que l'envoi : celle de la demande quand billets et accompagnement sont partis ensemble
  reference: r.demande_id ? `DEM-${r.demande_id.slice(0, 6).toUpperCase()}` : `RES-${r.id.slice(0, 6).toUpperCase()}`,
  // lien secret de la page de suivi (ticket, reçu, billets), seulement une fois payée
  suivi: r.statut === "paye" ? jetonSuivi("r", r.id) : null,
});

export async function POST(req: Request) {
  if (!baseConfiguree() || !billetsPossibles()) return reponse({ erreur: "indisponible" }, 503);
  const corps = (await lireCorps(req, 2_000)) as { reservation?: unknown; cle?: unknown; transaction?: unknown } | null;
  const id = typeof corps?.reservation === "string" && ID.test(corps.reservation) ? corps.reservation : null;
  if (!id || !cleValide(id, corps?.cle)) return reponse({ erreur: "introuvable" }, 404); // même réponse sans révéler laquelle manque
  let r = await lireReservation(`id=eq.${id}`);
  if (!r) return reponse({ erreur: "introuvable" }, 404);

  // transaction : notée à la création, ou rendue par le widget (Kkiapay, FedaPay) ; jamais crue sans relecture
  const proposee = typeof corps?.transaction === "string" && /^[A-Za-z0-9_.:-]{1,120}$/.test(corps.transaction) ? corps.transaction : null;
  const transaction = r.transaction_id ?? proposee;
  if (r.statut === "attente") {
    const c = await passerelle(r.passerelle).constater(transaction, r).catch(() => null);
    if (c) r = (await finaliser(r, c)).reservation;
  }
  const origine = origineSite(req);
  if (r.statut === "paye" && origine) await envoyerBillets(r, origine);
  return reponse(vue(r), 200);
}
