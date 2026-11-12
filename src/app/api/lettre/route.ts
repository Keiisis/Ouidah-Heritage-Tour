import { after } from "next/server";
import { lireContenu } from "@/lib/contenu";
import { EMAIL } from "@/lib/demande";
import { base, baseConfiguree } from "@/lib/serveur/base";
import { empreinteIp, limiteAtteinte, lireCorps, reponse } from "@/lib/serveur/garde";
import { noterException } from "@/lib/serveur/courriel";
import { envoyerLettre } from "@/lib/serveur/courriels/lettre";
import { jetonLettre } from "@/lib/serveur/equipe/messages/envoi";
import { origineSite } from "@/lib/serveur/paiement/outils";

// Inscription à la lettre de Ouidah (section 12) : adresse, langue, thèmes choisis, accord daté. Une adresse déjà
// inscrite met seulement à jour sa langue et ses thèmes. 5 inscriptions par heure et par connexion. Après 201, e-mail de
// confirmation (courriels/lettre.ts) avec le lien personnel de désinscription quand EQUIPE_SEL le permet.
const MAX_PAR_HEURE = 5;

export async function POST(req: Request) {
  if (!baseConfiguree()) return reponse({ erreur: "indisponible" }, 503);
  const c = (await lireCorps(req, 4_000)) as Record<string, unknown> | null;
  if (!c) return reponse({ erreur: "illisible" }, 400);
  const [nav, newsletter] = await Promise.all([lireContenu("fr.nav"), lireContenu("fr.newsletter")]);
  const email = typeof c.email === "string" ? c.email.trim().toLowerCase().slice(0, 254) : "";
  const sujets = Array.isArray(c.sujets) ? [...new Set(c.sujets.filter((s): s is string => newsletter.sujets.some((x) => x.id === s)))] : [];
  const langue = nav.languages.some((l) => l.code === c.langue) ? (c.langue as string) : nav.languages[0].code;
  if (c.piege || !(Number(c.duree) >= 1500)) return reponse({ erreur: "refus" }, 400);
  if (!EMAIL.test(email) || c.consentement !== true || !sujets.length) return reponse({ erreur: "incomplet" }, 400);

  const ip = empreinteIp(req);
  if (await limiteAtteinte("abonnes_lettre", ip, MAX_PAR_HEURE, 60)) return reponse({ erreur: "limite" }, 429);
  const maintenant = new Date().toISOString();
  const r = await base("abonnes_lettre?on_conflict=email&select=id", {
    method: "POST",
    corps: { email, langue, sujets, consentement_le: maintenant, modifie_le: maintenant, ip_hash: ip, desinscrit_le: null }, // réinscription : l'adresse redevient active
    prefer: "resolution=merge-duplicates,return=representation",
  }).catch(() => null);
  if (!r?.ok) return reponse({ erreur: "base" }, 502);
  const id = ((await r.json().catch(() => [])) as { id?: string }[])[0]?.id;
  const origine = origineSite(req), jeton = id ? jetonLettre(id) : null;
  if (origine) after(() => envoyerLettre(email, { langue, sujets, desinscription: jeton ? `${origine}/lettre/desinscription/${jeton}` : null }, origine).catch(() => noterException("auto-lettre", email)));
  return reponse({ ok: true }, 201);
}
