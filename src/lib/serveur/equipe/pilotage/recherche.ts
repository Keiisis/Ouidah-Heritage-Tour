"use server";

import type { Role } from "@/content/equipe";
import { transversal as T } from "@/content/transversal";
import { lire } from "../finances/lectures";
import { droitsEffectifs } from "../securite/droits";
import { exigerRole } from "../session";

export type ResultatRecherche = { cle: string; nom: string; type: string; href: string };
export async function rechercherEquipe(brut: unknown, role: Role): Promise<{ resultats: ResultatRecherche[] } | { erreur: true }> {
  if (role !== "agents" && role !== "admins") return { erreur: true };
  const s = await exigerRole(role);
  if (!s) return { erreur: true };
  const q = typeof brut === "string" ? brut.trim().slice(0, 80).replace(/[^\p{L}\p{N}\s@.+-]/gu, " ").trim() : "";
  if (q.length < 2) return { resultats: [] };
  const terme = encodeURIComponent(`*${q}*`), admin = s.role === "admin", droits = droitsEffectifs(s.droits);
  const agent = admin ? "" : `&agent_id=eq.${s.profilId}`;
  const demandes = admin || droits.demandes;
  const [d, f, c, w] = await Promise.all([
    demandes ? lire<{ id: string; nom: string; email: string }>(`demandes?select=id,nom,email&statut=eq.envoyee${agent}&or=(nom.ilike.${terme},email.ilike.${terme})&order=cree_le.desc,id.asc&limit=8`) : [],
    demandes ? lire<{ id: string; numero: string; demande_id: string; client: { nom?: string } }>(`factures?select=id,numero,demande_id,client,demande:demandes!inner(agent_id)&or=(numero.ilike.${terme},client->>nom.ilike.${terme})${admin ? "" : `&demande.agent_id=eq.${s.profilId}`}&order=cree_le.desc,id.asc&limit=6`) : [],
    admin || droits.boutique ? lire<{ id: string; reference: string; contact: { prenom?: string; nom?: string } }>(`boutique_commandes?select=id,reference,contact&or=(reference.ilike.${terme},contact->>nom.ilike.${terme},contact->>prenom.ilike.${terme})&order=cree_le.desc,id.asc&limit=6`) : [],
    lire<{ id: string; titre: string }>(`wiki_pages?select=id,titre&${admin ? "" : `or=(etat.eq.publie,auteur_id.eq.${s.profilId})&`}titre=ilike.${terme}&order=titre.asc,id.asc&limit=6`),
  ]);
  if (!d || !f || !c || !w) return { erreur: true };
  return { resultats: [
    ...d.map((x) => ({ cle: `d-${x.id}`, nom: `${x.nom || x.email} · DEM-${x.id.slice(0, 6).toUpperCase()}`, type: T.recherche.dossier, href: `/${role}/demandes/${x.id}` })),
    ...f.map((x) => ({ cle: `f-${x.id}`, nom: `${x.numero} · ${x.client.nom ?? ""}`, type: T.recherche.facture, href: `/${role}/${role === "admins" ? "finances" : "factures"}?facture=${x.id}#facture-${x.id}` })),
    ...c.map((x) => ({ cle: `c-${x.id}`, nom: `${x.reference} · ${[x.contact.prenom, x.contact.nom].filter(Boolean).join(" ")}`, type: T.recherche.commande, href: `/agents/commandes?commande=${x.id}#commande-${x.id}` })),
    ...w.map((x) => ({ cle: `w-${x.id}`, nom: x.titre, type: T.recherche.wiki, href: `/${role}/wiki#article-${x.id}` })),
  ] };
}
