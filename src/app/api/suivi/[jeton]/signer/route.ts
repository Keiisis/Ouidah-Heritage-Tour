import { after, connection } from "next/server";
import { baseConfiguree } from "@/lib/serveur/base";
import { envoyerSignature } from "@/lib/serveur/courriels/signature";
import { lireJeton } from "@/lib/serveur/documents/jeton";
import { signerDevis, type ErreurSignature } from "@/lib/serveur/documents/signature";
import { empreinteIp, limiteAtteinte, lireCorps, reponse } from "@/lib/serveur/garde";
import { origineSite } from "@/lib/serveur/paiement/outils";

// Signature en ligne d'un devis (/suivi/<jeton>/signer). Le jeton de l'adresse désigne la demande ; tout le reste est
// revérifié par signerDevis contre la base. 5 signatures par heure et par connexion. Réponses sans détail interne.
const MAX_PAR_HEURE = 5;
const CORPS_MAX = 300_000; // image PNG de 200 Ko en base64, nom et texte
const STATUT: Record<ErreurSignature, number> = { incomplet: 400, lien: 404, deja: 409, expire: 409, base: 502 };

export async function POST(req: Request, { params }: { params: Promise<{ jeton: string }> }) {
  await connection();
  const { jeton } = await params;
  if (!baseConfiguree()) return reponse({ erreur: "base" }, 502);
  if (!lireJeton(jeton)) return reponse({ erreur: "lien" }, 404);
  const corps = await lireCorps(req, CORPS_MAX);
  if (!corps || typeof corps !== "object" || Array.isArray(corps)) return reponse({ erreur: "incomplet" }, 400);
  const ip = empreinteIp(req);
  if (await limiteAtteinte("devis_signatures", ip, MAX_PAR_HEURE, 60)) return reponse({ erreur: "limite" }, 429);
  const c = corps as Record<string, unknown>;
  const r = await signerDevis({ jeton, nom: c.nom, mode: c.mode, trace: c.trace, texte: c.texte, accepte: c.accepte, ip, langue: c.langue });
  if (!r.ok) return reponse({ erreur: r.erreur }, STATUT[r.erreur]);
  // confirmation au signataire et avis à l'équipe après la réponse ; un échec d'envoi ne touche pas la signature
  const origine = origineSite(req);
  if (origine) after(() => envoyerSignature(jeton, origine).catch(() => null));
  return reponse({ signe_le: r.signe_le, empreinte: r.empreinte }, 201);
}
