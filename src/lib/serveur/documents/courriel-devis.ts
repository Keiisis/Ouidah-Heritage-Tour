import { iso } from "@/lib/jours";
import { lireContenu } from "@/lib/contenu";
import { base } from "../base";
import { courrielConfigure, envoyerCourriel } from "../courriel";
import { langueDe, lireModele } from "../courriels/commun";
import { messageDevisPret } from "../courriels/devis";
import { UUID } from "../equipe/messages/rendu";
import { emettre } from "./emettre";
import { jetonSuivi } from "./jeton";

// E-mail « votre devis est prêt », appelé par l'espace équipe à la publication d'un devis. Une seule fois par publication :
// le devis est d'abord marqué en base (`courriel_pret_pour` = sa date de publication, PATCH conditionnel), si bien que deux
// appels simultanés sur deux instances n'en envoient qu'un ; un devis republié repart une fois. En cas d'échec SMTP, la
// marque est retirée pour un nouvel essai. false : envoi non configuré, devis pas « prêt », déjà envoyé pour cette
// publication, demande introuvable, lien de suivi impossible (BILLET_SECRET absent) ou échec SMTP.
type LigneDevis = { id: string; demande_id: string; publie_le: string; lignes: { libelle: string; quantite: number; prix_unitaire: number }[]; montant: number; valable_jusqu_au: string | null; note: string | null };
type LigneDemande = { id: string; nom: string | null; email: string | null; langue: string; dossier: { sejour?: { arrivee: number; depart: number } | null } | null; agent: { prenom: string } | null };

const premiere = async <T>(chemin: string): Promise<T | null> => {
  const r = await base(chemin).catch(() => null);
  return r?.ok ? ((((await r.json().catch(() => [])) as T[])[0]) ?? null) : null;
};

export async function envoyerDevisPret(devisId: string, origine: string): Promise<boolean> {
  if (!UUID.test(devisId) || !courrielConfigure()) return false;
  const v = await premiere<LigneDevis>(`devis?select=id,demande_id,publie_le,lignes,montant,valable_jusqu_au,note&id=eq.${devisId}&statut=eq.pret&limit=1`);
  if (!v?.publie_le) return false;
  // prise de l'envoi : seule la première requête pour cette publication obtient la ligne
  const pris = await base(`devis?id=eq.${v.id}&statut=eq.pret&or=(courriel_pret_pour.is.null,courriel_pret_pour.neq.${encodeURIComponent(v.publie_le)})&select=id`, { method: "PATCH", corps: { courriel_pret_pour: v.publie_le }, prefer: "return=representation" }).catch(() => null);
  if (!pris?.ok || !((await pris.json().catch(() => [])) as unknown[]).length) return false;
  const ok = await envoyer(v, origine).catch(() => false);
  if (!ok) await base(`devis?id=eq.${v.id}&courriel_pret_pour=eq.${encodeURIComponent(v.publie_le)}`, { method: "PATCH", corps: { courriel_pret_pour: null } }).catch(() => null);
  return ok;
}

async function envoyer(v: LigneDevis, origine: string) {
  const d = await premiere<LigneDemande>(`demandes?select=id,nom,email,langue,dossier,agent:equipe_profils(prenom)&id=eq.${v.demande_id}&statut=eq.envoyee&limit=1`);
  const jeton = jetonSuivi("d", v.demande_id);
  if (!d?.email || !d.nom || !jeton) return false;
  const L = langueDe(d.langue), s = d.dossier?.sejour;
  const [numero, ticket, modele, textesSuivi] = await Promise.all([emettre("D", "devis", v.id), emettre("T", "demande", d.id), lireModele("auto-devis-pret", L), lireContenu("suivi.suivi")]);
  const m = messageDevisPret(
    {
      nom: d.nom,
      langue: L,
      jeton,
      numero: numero?.numero ?? null,
      ticket: ticket?.numero ?? null,
      reference: `DEM-${d.id.slice(0, 6).toUpperCase()}`,
      lignes: v.lignes.map((l) => ({ libelle: l.libelle, quantite: l.quantite, prixUnitaire: l.prix_unitaire })),
      montant: v.montant,
      valableJusquAu: v.valable_jusqu_au,
      note: v.note,
      agent: d.agent?.prenom ?? null,
      sejour: s ? { arrivee: iso(s.arrivee), depart: iso(s.depart) } : null,
    },
    origine,
    modele,
    textesSuivi,
  );
  return envoyerCourriel({ a: d.email, sujet: m.sujet, html: m.html, texte: m.texte, repondreA: process.env.EMAIL_OHT || null, cle: `devis-${v.id}-${Date.parse(v.publie_le)}-pret` });
}
