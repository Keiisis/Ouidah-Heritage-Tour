import { after } from "next/server";
import { lireContenu } from "@/lib/contenu";
import { EMAIL } from "@/lib/demande";
import { base, baseConfiguree } from "@/lib/serveur/base";
import { empreinteIp, limiteAtteinte, lireCorps, refusLimite, reponse } from "@/lib/serveur/garde";
import { noterException } from "@/lib/serveur/courriel";
import { envoyerLettre } from "@/lib/serveur/courriels/lettre";
import { jetonLettre } from "@/lib/serveur/equipe/messages/envoi";
import { origineSite } from "@/lib/serveur/paiement/outils";

// Inscription à la lettre de Ouidah (section 12) : adresse, langue, thèmes choisis, accord daté. Seule une adresse
// nouvelle est enregistrée ; une adresse déjà connue (active ou désinscrite) n'est jamais modifiée depuis ce formulaire
// anonyme et ne reçoit rien, avec la même réponse 201 (son existence n'est pas révélée ; audit du 24/11/2026). 5
// inscriptions par heure et par connexion, recomptées par la base à l'écriture (429). Après une inscription nouvelle,
// e-mail de confirmation (courriels/lettre.ts) avec le lien personnel de désinscription quand EQUIPE_SEL le permet.
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
  const r = await base("abonnes_lettre?on_conflict=email&select=id", {
    method: "POST",
    corps: { email, langue, sujets, consentement_le: new Date().toISOString(), ip_hash: ip },
    prefer: "resolution=ignore-duplicates,return=representation", // adresse déjà connue : rien d'écrit, aucune ligne rendue
  }).catch(() => null);
  if (!r?.ok) return (await refusLimite(r)) ? reponse({ erreur: "limite" }, 429) : reponse({ erreur: "base" }, 502);
  const id = ((await r.json().catch(() => [])) as { id?: string }[])[0]?.id;
  if (!id) return reponse({ ok: true }, 201);
  const origine = origineSite(req), jeton = jetonLettre(id);
  if (origine) after(() => envoyerLettre(email, { langue, sujets, desinscription: jeton ? `${origine}/lettre/desinscription/${jeton}` : null }, origine).catch(() => noterException("auto-lettre", email)));
  return reponse({ ok: true }, 201);
}
