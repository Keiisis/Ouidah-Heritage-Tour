import { securite as S } from "@/content/espace-securite";
import { journaliser } from "@/lib/serveur/equipe/journal";
import { csv } from "@/lib/serveur/equipe/finances/regles";
import { lireJournal, lireMembres } from "@/lib/serveur/equipe/securite/lectures";
import { lireFiltres, UUID } from "@/lib/serveur/equipe/securite/regles";
import { exigerRole } from "@/lib/serveur/equipe/session";

// Export CSV du journal d'activité (lot « securite »), admin connecté seulement : la session est relue ici ; sans elle
// (agent, personne), 404 sans rien dire. Mêmes filtres que l'écran (auteur, action, dates), 10 000 lignes au plus.
// Séparateur « ; » et BOM UTF-8 (Excel en français) ; une cellule qui commence par = + - @ est neutralisée (csv()).
// L'export lui-même va au journal. Jamais d'adresse IP : seulement son empreinte réduite.
const ENTETES = { "cache-control": "private, no-store", "x-robots-tag": "noindex", "x-content-type-options": "nosniff" };

export async function GET(req: Request) {
  const s = await exigerRole("admins");
  if (!s) return new Response(null, { status: 404, headers: ENTETES });
  const f = lireFiltres(new URL(req.url).searchParams);
  const [journal, membres] = await Promise.all([lireJournal(f, 10_000), lireMembres()]);
  if (!journal || !membres) return new Response(null, { status: 503, headers: ENTETES });
  const nomDe = new Map(membres.map((m) => [m.id, `${m.prenom} ${m.nom}`]));
  const detail = (d: Record<string, unknown>) =>
    Object.entries(d)
      .map(([k, v]) => `${k}=${typeof v === "string" && UUID.test(v) && k !== "dossier" ? (nomDe.get(v) ?? v) : String(v)}`)
      .join(" ");
  const lignes = [
    ["date", "auteur", "action", "libelle", "details", "empreinte_ip"],
    ...journal.lignes.map((l) => [l.quand, l.profil ? (nomDe.get(l.profil) ?? l.profil) : "", l.action, S.journal.actions[l.action] ?? "", detail(l.details), l.ip ? l.ip.slice(0, 8) : ""]),
  ];
  await journaliser("journal.export", s.profilId, null, { nombre: journal.lignes.length });
  return new Response(csv(lignes), { headers: { ...ENTETES, "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="oht-journal-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
