import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { base } from "../../base";
import type { EtatMaintenance } from "./public";

// Maintenance du site public lue dans un cache partagé (doc Next 16 « use cache », « cacheTag », « updateTag ») : le layout
// la lit sans faire passer chaque page par le proxy ni par une fonction (économie Vercel). L'action admin
// enregistrerMaintenance expire l'étiquette « maintenance » par updateTag ; le profil « hours » sert de filet si une
// écriture passe hors de l'action. null si la base ne répond pas : le site reste ouvert.
export const TAG_MAINTENANCE = "maintenance";

export async function etatMaintenanceEnCache(): Promise<EtatMaintenance | null> {
  "use cache";
  cacheTag(TAG_MAINTENANCE);
  cacheLife("hours");
  try {
    const r = await base("reglages_maintenance?select=actif,message&limit=1");
    if (!r.ok) return null;
    const x = ((await r.json()) as { actif: boolean; message: EtatMaintenance["message"] | null }[])[0];
    return x ? { actif: x.actif, message: x.message ?? {} } : null;
  } catch {
    return null;
  }
}
