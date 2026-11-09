import { createHash } from "node:crypto";
import { base, baseConfiguree } from "@/lib/serveur/base";
import { lireCorps, reponse } from "@/lib/serveur/garde";

// Reprise d'une demande : le jeton arrive dans le corps (pas dans une adresse d'API, souvent journalisée). Brouillon
// encore valable seulement ; rien d'autre que le dossier et les réponses n'est renvoyé.
export async function POST(req: Request) {
  if (!baseConfiguree()) return reponse({ erreur: "indisponible" }, 503);
  const corps = (await lireCorps(req, 1_000)) as { jeton?: unknown } | null;
  const jeton = typeof corps?.jeton === "string" && /^[\w-]{43}$/.test(corps.jeton) ? corps.jeton : null;
  if (!jeton) return reponse({ erreur: "introuvable" }, 404);
  const empreinte = createHash("sha256").update(jeton).digest("hex");
  const r = await base(`demandes?select=intention,circuit,langue,dossier,reponses&statut=eq.brouillon&jeton_hash=eq.${empreinte}&jeton_expire_le=gt.${encodeURIComponent(new Date().toISOString())}`).catch(() => null);
  if (!r?.ok) return reponse({ erreur: "base" }, 502);
  const [ligne] = (await r.json()) as unknown[];
  return ligne ? reponse(ligne, 200) : reponse({ erreur: "introuvable" }, 404);
}
