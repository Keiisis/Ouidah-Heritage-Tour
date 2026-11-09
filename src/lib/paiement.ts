"use client";

// Lancement d'un paiement préparé par le serveur (/api/devis) : page hébergée de la passerelle (redirection) ou widget
// officiel (Kkiapay, k.js). Le retour se fait toujours sur l'accueil (?reservation=…&cle=…), où le talon de l'Agenda
// demande l'état réel au serveur : le navigateur ne décide jamais qu'un paiement a réussi.
export type NomPasserelle = "kkiapay" | "fedapay" | "stripe" | "flutterwave" | "paystack";
export type Lancement = { mode: "widget"; options: Record<string, unknown> } | { mode: "redirection"; url: string };
export type Preparee = { id: string; cle: string; lancement: Lancement };
export const MEMOIRE_PAIEMENT = "oht-paiement"; // réservation en cours (session de l'onglet), reprise au retour

type Kkiapay = { openKkiapayWidget: (o: Record<string, unknown>) => void; addSuccessListener: (cb: (r: { transactionId?: string }) => void) => void };

function chargerScript(src: string) {
  return new Promise<void>((ok, ko) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const el = Object.assign(document.createElement("script"), { src, async: true, onload: () => ok(), onerror: () => ko(new Error(src)) });
    document.body.append(el);
  });
}

/** Ouvre le paiement. `retourWidget` reçoit l'identifiant rendu par un widget (à faire vérifier par le serveur). */
export async function lancerPaiement(r: Preparee, reference: string | undefined, retourWidget: (transaction: string | null) => void) {
  try {
    sessionStorage.setItem(MEMOIRE_PAIEMENT, JSON.stringify({ reservation: r.id, cle: r.cle, reference }));
  } catch {
    /* navigation privée */
  }
  if (r.lancement.mode === "redirection") return window.location.assign(r.lancement.url);
  if (r.lancement.options.passerelle !== "kkiapay") throw new Error("widget inconnu");
  await chargerScript("https://cdn.kkiapay.me/k.js");
  const k = window as unknown as Kkiapay;
  k.addSuccessListener(({ transactionId }) => retourWidget(transactionId ?? null));
  const options = { ...r.lancement.options };
  delete options.passerelle; // repère interne, pas une option du widget
  k.openKkiapayWidget(options);
}

/** Adresse de retour sur l'accueil (talon de l'Agenda), pour un paiement fait ailleurs (page devis). */
export const adresseRetour = (r: Pick<Preparee, "id" | "cle">, transaction: string | null) => `/?reservation=${r.id}&cle=${r.cle}${transaction ? `&transaction_id=${encodeURIComponent(transaction)}` : ""}`;
