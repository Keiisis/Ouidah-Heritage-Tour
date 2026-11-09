import { createHash, randomBytes } from "node:crypto";
import { lireContenu } from "@/lib/contenu";
import { jourOuidah } from "@/lib/jours";
import { nettoyer } from "@/lib/demande";
import { base, baseConfiguree } from "@/lib/serveur/base";
import { empreinteIp, limiteAtteinte, lireCorps, reponse } from "@/lib/serveur/garde";

// Lien pour reprendre sa demande sur un autre appareil (/devis/reprendre/<jeton>), valable 30 jours. Seuls le dossier et
// les réponses sont gardés, jamais les coordonnées (nom, e-mail, WhatsApp, message) : elles restent sur l'appareil.
// Le jeton (32 octets aléatoires) n'est pas gardé, seulement son empreinte SHA-256.
const MAX_PAR_HEURE = 20;
const JOURS = 30;

export async function POST(req: Request) {
  if (!baseConfiguree()) return reponse({ erreur: "indisponible" }, 503);
  const corps = await lireCorps(req);
  if (corps === null) return reponse({ erreur: "illisible" }, 400);
  const [releve, conciergerie, destinations, devisPage, nav, tenReasons, tours] = await Promise.all([
    lireContenu("lieux-ouidah"), lireContenu("fr.conciergerie"), lireContenu("fr.destinations"), lireContenu("fr.devisPage"),
    lireContenu("fr.nav"), lireContenu("fr.tenReasons"), lireContenu("fr.tours"),
  ]);
  const d = nettoyer(corps, new Set(releve.lieux.map((l) => `r:${l.slug}`)), jourOuidah(Date.now()), { conciergerie, destinations, devisPage, nav, tenReasons, tours });
  if (d.piege) return reponse({ erreur: "refus" }, 400);
  const ip = empreinteIp(req);
  if (await limiteAtteinte("demandes", ip, MAX_PAR_HEURE, 60, "&statut=eq.brouillon")) return reponse({ erreur: "limite" }, 429);

  const jeton = randomBytes(32).toString("base64url");
  const r = await base("demandes", {
    method: "POST",
    corps: {
      statut: "brouillon",
      jeton_hash: createHash("sha256").update(jeton).digest("hex"),
      jeton_expire_le: new Date(Date.now() + JOURS * 864e5).toISOString(),
      intention: d.intention,
      circuit: d.circuit,
      langue: d.reponses.langue,
      dossier: d.dossier,
      reponses: d.reponses,
      ip_hash: ip,
    },
    prefer: "return=minimal",
  }).catch(() => null);
  if (!r?.ok) return reponse({ erreur: "base" }, 502);
  return reponse({ ok: true, lien: `${new URL(req.url).origin}/devis/reprendre/${jeton}` }, 201);
}
