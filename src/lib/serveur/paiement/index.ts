import { base } from "../base";
import { fedapay } from "./fedapay";
import { flutterwave } from "./flutterwave";
import { kkiapay } from "./kkiapay";
import { paystack } from "./paystack";
import { stripe } from "./stripe";
import type { NomPasserelle, Passerelle } from "./types";

// Passerelles de paiement. Une passerelle n'est proposée que si l'admin l'a activée (table passerelles_paiement) ET que ses
// clés sont présentes dans l'environnement du serveur ; l'ordre est celui choisi dans l'admin.
const TOUTES: Record<NomPasserelle, Passerelle> = { kkiapay, fedapay, stripe, flutterwave, paystack };

export const passerelle = (nom: NomPasserelle) => TOUTES[nom];

export async function passerellesActives(): Promise<NomPasserelle[]> {
  const r = await base("passerelles_paiement?select=nom&active=is.true&order=ordre.asc").catch(() => null);
  if (!r?.ok) return [];
  const actives = (await r.json()) as { nom: string }[];
  return actives.map((a) => a.nom).filter((n): n is NomPasserelle => n in TOUTES && TOUTES[n as NomPasserelle].disponible());
}
