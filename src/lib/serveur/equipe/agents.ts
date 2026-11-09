import "server-only";
import { jourOuidah, minuitOuidah } from "@/lib/jours";
import { base } from "../base";
import type { RoleCompte } from "./outils";
import { exigerRole } from "./session";

// Lecture de l'écran Équipe (lot L3) : les comptes de l'équipe, lus par le serveur avec la clé secrète, pour un admin
// connecté seulement (la session et le rôle sont relus ici, couche d'accès). Aucun « use cache » : tout est lu à la
// requête. Ne sort que ce que l'écran affiche (ni téléphone, ni droits, ni empreinte) ; null si la base ne répond pas.

export type EtatCompte = "invite" | "actif" | "suspendu";
export type Membre = {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  role: RoleCompte;
  etat: EtatCompte;
  langues: string[];
  derniere: string | null; // dernière connexion (ISO)
  invitation: string | null; // dernier code de première connexion émis, pour un compte invité (ISO)
  moi: boolean;
  moments: number[]; // débuts (ms) de ses moments du jour à Ouidah (dossiers voyage, lot L4)
};

type Ligne = Omit<Membre, "derniere" | "invitation" | "moi" | "moments"> & { derniere_connexion: string | null };

export async function lireEquipe(): Promise<Membre[] | null> {
  const s = await exigerRole("admins");
  if (!s) return null;
  try {
    const r = await base("equipe_profils?select=id,prenom,nom,email,role,etat,langues,derniere_connexion&order=cree_le.desc&limit=500");
    if (!r.ok) return null;
    const lignes = (await r.json()) as Ligne[];
    const invites = lignes.filter((l) => l.etat === "invite").map((l) => l.id);
    const codes = new Map<string, string>();
    if (invites.length) {
      const c = await base(`equipe_codes?select=profil_id,cree_le&profil_id=in.(${invites.join(",")})&order=cree_le.desc&limit=2000`);
      if (!c.ok) return null;
      for (const x of (await c.json()) as { profil_id: string; cree_le: string }[]) if (!codes.has(x.profil_id)) codes.set(x.profil_id, x.cree_le);
    }
    // moments du jour de chaque membre (petite course du soleil de la ligne)
    const jour = jourOuidah(Date.now());
    const de = new Date(minuitOuidah(jour)).toISOString(), a = new Date(minuitOuidah(jour + 1)).toISOString();
    const m = await base(`dossier_moments?select=agent_id,debut&agent_id=not.is.null&debut=gte.${encodeURIComponent(de)}&debut=lt.${encodeURIComponent(a)}&order=debut.asc&limit=2000`);
    if (!m.ok) return null;
    const parMembre = new Map<string, number[]>();
    for (const x of (await m.json()) as { agent_id: string; debut: string }[]) parMembre.set(x.agent_id, [...(parMembre.get(x.agent_id) ?? []), Date.parse(x.debut)]);
    return lignes.map(({ derniere_connexion, ...l }) => ({ ...l, derniere: derniere_connexion, invitation: codes.get(l.id) ?? null, moi: l.id === s.profilId, moments: parMembre.get(l.id) ?? [] }));
  } catch {
    return null;
  }
}
