"use server";

import { redirect } from "next/navigation";
import { lireJeton } from "@/lib/serveur/documents/jeton";
import { ouvrirLienCommande } from "@/lib/serveur/paiement/lien";

// « Payer en ligne » depuis le suivi d'une commande de la boutique. Joignable par une requête forgée : seul le jeton de
// suivi signé (BILLET_SECRET) désigne la commande, jamais un identifiant ou un montant envoyé par le navigateur. Le lien
// (montant = total_xof relu en base, commande confirmée et non réglée) s'ouvre sur /payer/<jeton du lien>.
export async function payerCommande(form: FormData) {
  const brut = form.get("jeton");
  const jeton = typeof brut === "string" ? brut : "";
  const j = lireJeton(jeton);
  if (!j || j.s !== "b") redirect("/");
  const lien = await ouvrirLienCommande(j.id);
  redirect(lien.ok ? `/payer/${lien.jeton}` : `/suivi/${jeton}?paiement=indisponible`);
}
