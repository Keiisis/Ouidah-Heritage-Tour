import "server-only";
import { redirect } from "next/navigation";
import { etatMaintenanceEnCache } from "./equipe/reglages/maintenance-cache";
import type { Langue } from "@/lib/langue";

/** Le contrôle est mis en cache avec le HTML public, sans invocation de proxy par visite. */
export async function verifierMaintenance(langue: Langue) {
  if ((await etatMaintenanceEnCache())?.actif) redirect(`/maintenance?langue=${langue}`);
}
