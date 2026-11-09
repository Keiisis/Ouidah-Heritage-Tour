"use server";

import { jourOuidah } from "@/lib/jours";
import { base } from "../../base";
import { billetAuthentique, billetsPossibles } from "../../paiement/billet";
import { journaliser } from "../journal";
import { exigerDroit } from "../securite/droits";
import { editionsDuJour, entreesDe, titreEvenement, trouverReservation } from "./billets";
import { lireEntree, numeroBillet, type RefusEntree, type RetourEntree } from "./regles";

// Contrôle d'un billet à l'entrée (lot terrain L5). Action serveur joignable par une requête forgée : CHAQUE appel relit la
// session ; tout le reste vient de la base et du code signé, jamais du navigateur. Ordre : édition contrôlée du jour,
// signature HMAC (paiement/billet.ts) pour un code scanné, réservation (payée, même événement, même date, rang dans ses
// places), puis écriture. Un billet n'entre qu'une fois : contrainte unique (reservation_id, rang) en base. La même entrée
// renvoyée par la file hors ligne du téléphone (même clé) est reconnue, jamais comptée deux fois. Chaque entrée et chaque
// refus vont au journal (réservation, rang, motif ; jamais le code ni un nom).

type Ligne = { cle: string; entre_le: string };

export async function validerEntree(brut: unknown): Promise<RetourEntree> {
  const s = await exigerDroit("billets"); // droit de l'agent (lot « securite ») ; un admin les a tous
  if (!s) return { erreur: "refuse" };
  const refus = async (motif: RefusEntree | "autre" | "deja", reservation?: string): Promise<void> => {
    await journaliser("billet.refus", s.profilId, null, { motif, ...(reservation ? { reservation } : {}) });
  };
  const lu = lireEntree(brut, Date.now());
  if (!lu.ok) {
    await refus("champs");
    return { erreur: "champs" };
  }
  if (!billetsPossibles()) return { erreur: "secret" }; // sans BILLET_SECRET, aucune signature ne peut être vérifiée
  const { v, billet } = lu;

  const editions = await editionsDuJour(jourOuidah(v.entre_le));
  if (!editions) return { erreur: "panne" };
  const ed = editions.find((e) => e.evenement === v.evenement && e.occurrence === v.occurrence);
  if (!ed) {
    await refus("edition");
    return { erreur: "edition" };
  }
  if (billet.type === "code" && !billetAuthentique(billet.code)) {
    await refus("falsifie");
    return { erreur: "falsifie" };
  }
  const r = await trouverReservation(billet, ed);
  if (r === null) return { erreur: "panne" };
  if (!r || billet.rang > r.quantite) {
    await refus("inconnu", r?.id);
    return { erreur: "inconnu" };
  }
  if (r.statut !== "paye") {
    await refus("non_paye", r.id);
    return { erreur: "non_paye" };
  }
  if (r.evenement !== ed.evenement) {
    await refus("autre", r.id);
    return { erreur: "autre", evenement: await titreEvenement(r.evenement) };
  }
  if (r.occurrence !== ed.occurrence) {
    await refus("autreDate", r.id);
    return { erreur: "autreDate" };
  }

  const numero = numeroBillet(r.id, billet.rang);
  const ligne = { reservation_id: r.id, rang: billet.rang, numero, evenement: r.evenement, occurrence: r.occurrence, cle: v.cle, entre_le: new Date(v.entre_le).toISOString(), agent_id: s.profilId, appareil: v.appareil, mode: v.mode, hors_ligne: v.hors_ligne };
  const rep = await base("billets_entrees?on_conflict=reservation_id,rang&select=id", { method: "POST", corps: ligne, prefer: "resolution=ignore-duplicates,return=representation" }).catch(() => null);
  if (rep?.status === 409) return { erreur: "champs" }; // clé déjà prise par une autre entrée (requête forgée)
  if (!rep?.ok) return { erreur: "panne" };
  const cree = (await rep.json().catch(() => null)) as { id: string }[] | null;
  if (!cree) return { erreur: "panne" };
  const entrees = await entreesDe(ed);
  if (cree.length) {
    await journaliser("billet.entree", s.profilId, null, { reservation: r.id, nombre: billet.rang });
    return { ok: true, numero, nom: r.nom, formule: r.formule_nom, entre_le: v.entre_le, entrees, rejoue: false };
  }
  // déjà en base : la même entrée revenue de la file (même clé), ou un second passage du billet
  const deja = await base(`billets_entrees?select=cle,entre_le&reservation_id=eq.${r.id}&rang=eq.${billet.rang}&limit=1`).then((x) => (x.ok ? (x.json() as Promise<Ligne[]>) : null)).catch(() => null);
  if (!deja?.[0]) return { erreur: "panne" };
  if (deja[0].cle === v.cle) return { ok: true, numero, nom: r.nom, formule: r.formule_nom, entre_le: Date.parse(deja[0].entre_le), entrees, rejoue: true };
  await refus("deja", r.id);
  return { erreur: "deja", numero, nom: r.nom, entre_le: Date.parse(deja[0].entre_le), entrees };
}
