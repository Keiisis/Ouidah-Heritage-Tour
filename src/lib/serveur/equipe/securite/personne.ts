import "server-only";
import { base } from "../../base";
import { effacer } from "../dossiers";
import { effacerDocumentsDuDossier } from "../pilotage/stockage";
import { exigerRole } from "../session";
import { exact, sansSensible } from "./regles";

// Droits d'une personne (accès, effacement ; APDP et RGPD), lot « securite ». Tout part de son adresse e-mail, comparée
// sans tenir compte de la casse : demandes (et leurs devis, moments, documents, liens, factures, paiements), fiche client,
// e-mails envoyés, abonnement à la lettre, réservations, commandes boutique. Admin seulement (relu ici).
// Conservé (obligation comptable) : factures et avoirs, paiements manuels, liens payés, réservations payées ou entrées,
// commandes remises ou payées, et les demandes et devis qui s'y rattachent (clés étrangères « restrict »). De ces
// demandes gardées, le message libre, la note de l'équipe et le WhatsApp sont vidés. Tout le reste est supprimé
// (DELETE), documents du stockage compris ; un effacement est réel, jamais un simple masquage.

type Id = { id: string };
type Demande = Id & { statut: string };
type Resa = Id & { statut: string; demande_id: string | null };
type Commande = Id & { statut: string };
export type Trouve = {
  demandes: (Demande & { garde: boolean })[];
  devis: (Id & { demande_id: string })[];
  moments: number;
  documents: number;
  factures: Id[];
  liens: (Id & { demande_id: string; paye_le: string | null })[];
  paiements: Id[];
  clients: Id[];
  courriels: Id[];
  abonnes: Id[];
  reservations: (Resa & { garde: boolean })[];
  commandes: (Commande & { garde: boolean })[];
  rendez_vous: Id[];
  candidatures: Id[];
  courriels_recus: Id[];
};
export type Apercu = Record<string, { n: number; gardes: number }>;

async function lire<T>(chemin: string): Promise<T[] | null> {
  try {
    const [table, recherche = ""] = chemin.split("?"), p = new URLSearchParams(recherche);
    p.set("limit", "500"); p.set("order", "id.asc");
    const lignes: T[] = [];
    for (;;) {
      p.set("offset", String(lignes.length));
      const r = await base(`${table}?${p}`, { prefer: "count=exact" });
      if (!r.ok) return null;
      const page: unknown = await r.json(), total = Number(r.headers.get("content-range")?.split("/")[1]);
      if (!Array.isArray(page) || !Number.isSafeInteger(total) || total < lignes.length + page.length) return null;
      lignes.push(...page as T[]);
      if (lignes.length === total) return lignes;
      if (!page.length) return null; // Jamais un résultat annoncé complet après une réponse tronquée.
    }
  } catch {
    return null;
  }
}
const liste = (ids: string[]) => `(${ids.join(",")})`;
function* lots(ids: string[]) { for (let i = 0; i < ids.length; i += 80) yield liste(ids.slice(i, i + 80)); }
// Les listes d'UUID restent courtes pour ne pas dépasser la taille d'URL de PostgREST.
async function liees<T>(ids: string[], chemin: (filtre: string) => string): Promise<T[] | null> {
  const lignes: T[] = [];
  for (const filtre of lots(ids)) {
    const page = await lire<T>(chemin(filtre));
    if (!page) return null;
    lignes.push(...page);
  }
  return lignes;
}

/** Tout ce que la base garde de cette adresse ; null si refusé ou si la base ne répond pas. */
export async function chercher(email: string): Promise<Trouve | null> {
  if (!(await exigerRole("admins"))) return null;
  const e = exact(email);
  const [demandes, clients, courriels, abonnes, reservations, commandes, rendez_vous, candidatures, courriels_recus] = await Promise.all([
    lire<Demande>(`demandes?select=id,statut&email=ilike.${e}&limit=500`),
    lire<Id>(`clients?select=id&email=eq.${encodeURIComponent(email)}&limit=10`),
    lire<Id>(`courriels_envoyes?select=id&destinataire=ilike.${e}&limit=2000`),
    lire<Id>(`abonnes_lettre?select=id&email=ilike.${e}&limit=10`),
    lire<Resa>(`reservations?select=id,statut,demande_id&email=ilike.${e}&limit=500`),
    lire<Commande>(`boutique_commandes?select=id,statut&contact->>email=ilike.${e}&limit=500`),
    lire<Id>(`rendez_vous?select=id&email=eq.${encodeURIComponent(email)}`),
    lire<Id>(`candidatures_partenaires?select=id&email=eq.${encodeURIComponent(email)}`),
    lire<Id>(`courriels_recus?select=id&expediteur=ilike.${e}`),
  ]);
  if (!demandes || !clients || !courriels || !abonnes || !reservations || !commandes || !rendez_vous || !candidatures || !courriels_recus) return null;
  const dIds = demandes.map((d) => d.id);
  const [devis, moments, documents, factures, liens, resasLiees] = await Promise.all([
    liees<Id & { demande_id: string }>(dIds, ids => `devis?select=id,demande_id&demande_id=in.${ids}`),
    liees<Id>(dIds, ids => `dossier_moments?select=id&demande_id=in.${ids}`),
    liees<Id>(dIds, ids => `equipe_documents?select=id&demande_id=in.${ids}`),
    liees<Id & { demande_id: string }>(dIds, ids => `factures?select=id,demande_id&demande_id=in.${ids}`),
    liees<Id & { demande_id: string; paye_le: string | null }>(dIds, ids => `liens_paiement?select=id,demande_id,paye_le&demande_id=in.${ids}`),
    // réservations rattachées à une de ses demandes mais à une autre adresse : elles bloquent la demande (restrict)
    liees<Resa>(dIds, ids => `reservations?select=id,statut,demande_id&demande_id=in.${ids}`),
  ]);
  if (!devis || !moments || !documents || !factures || !liens || !resasLiees) return null;
  const rIds = reservations.map((r) => r.id), cIds = commandes.map((c) => c.id), vIds = devis.map((d) => d.id);
  type Paiement = Id & { devis_id: string | null; reservation_id: string | null; commande_id: string | null };
  const [pv, pr, pc, entrees, lc] = await Promise.all([
    liees<Paiement>(vIds, ids => `paiements_manuels?select=id,devis_id,reservation_id,commande_id&devis_id=in.${ids}`),
    liees<Paiement>(rIds, ids => `paiements_manuels?select=id,devis_id,reservation_id,commande_id&reservation_id=in.${ids}`),
    liees<Paiement>(cIds, ids => `paiements_manuels?select=id,devis_id,reservation_id,commande_id&commande_id=in.${ids}`),
    liees<{ reservation_id: string }>(rIds, ids => `billets_entrees?select=reservation_id&reservation_id=in.${ids}`),
    // commande réglée en ligne : gardée pour les comptes, comme une commande réglée en agence
    liees<{ commande_id: string; paye_le: string | null }>(cIds, ids => `liens_paiement?select=commande_id,paye_le&commande_id=in.${ids}&paye_le=not.is.null`),
  ]);
  if (!pv || !pr || !pc || !entrees || !lc) return null;
  const paiements = [...new Map([...pv, ...pr, ...pc].map(p => [p.id, p])).values()];

  const payes = new Set([...paiements.flatMap((p) => [p.devis_id, p.reservation_id, p.commande_id].filter((x): x is string => Boolean(x))), ...lc.map((l) => l.commande_id)]);
  const entrees_ = new Set(entrees.map((x) => x.reservation_id));
  const resas = reservations.map((r) => ({ ...r, garde: r.statut !== "attente" || payes.has(r.id) || entrees_.has(r.id) }));
  const gardees = new Set([...resas.filter((r) => r.garde).map((r) => r.demande_id), ...resasLiees.filter((r) => !rIds.includes(r.id)).map((r) => r.demande_id)]);
  const avecFacture = new Set(factures.map((f) => f.demande_id));
  const avecLienPaye = new Set(liens.filter((l) => l.paye_le).map((l) => l.demande_id));
  const avecPaiement = new Set(devis.filter((d) => payes.has(d.id)).map((d) => d.demande_id));
  return {
    demandes: demandes.map((d) => ({ ...d, garde: avecFacture.has(d.id) || avecLienPaye.has(d.id) || avecPaiement.has(d.id) || gardees.has(d.id) })),
    devis,
    moments: moments.length,
    documents: documents.length,
    factures,
    liens,
    paiements,
    clients,
    courriels,
    abonnes,
    reservations: resas,
    commandes: commandes.map((c) => ({ ...c, garde: c.statut === "remise" || payes.has(c.id) })),
    rendez_vous, candidatures, courriels_recus,
  };
}

/** Nombres par catégorie (pour l'écran et l'historique), sans aucune donnée de la personne. */
export function apercu(t: Trouve): Apercu {
  const gardees = new Set(t.demandes.filter((d) => d.garde).map((d) => d.id));
  return {
    demandes: { n: t.demandes.length, gardes: gardees.size },
    devis: { n: t.devis.length, gardes: t.devis.filter((d) => gardees.has(d.demande_id)).length },
    moments: { n: t.moments, gardes: 0 },
    documents: { n: t.documents, gardes: 0 },
    clients: { n: t.clients.length, gardes: 0 },
    courriels: { n: t.courriels.length, gardes: 0 },
    abonnes: { n: t.abonnes.length, gardes: 0 },
    reservations: { n: t.reservations.length, gardes: t.reservations.filter((r) => r.garde).length },
    commandes: { n: t.commandes.length, gardes: t.commandes.filter((c) => c.garde).length },
    factures: { n: t.factures.length, gardes: t.factures.length },
    liens: { n: t.liens.length, gardes: t.liens.filter((l) => gardees.has(l.demande_id)).length },
    paiements: { n: t.paiements.length, gardes: t.paiements.length },
    rendez_vous: { n: t.rendez_vous.length, gardes: 0 },
    candidatures: { n: t.candidatures.length, gardes: 0 },
    courriels_recus: { n: t.courriels_recus.length, gardes: 0 },
  };
}

/** Export complet (accès) : chaque ligne entière, sans les colonnes d'empreinte, de jeton ni de contenu binaire. */
export async function exporter(email: string, t: Trouve): Promise<Record<string, unknown[]> | null> {
  if (!(await exigerRole("admins"))) return null;
  const extraire = (l: Id[], chemin: (ids: string) => string) => liees<Record<string, unknown>>(l.map(x => x.id), chemin);
  const parts: [string, Promise<Record<string, unknown>[] | null>][] = [
    ["demandes", extraire(t.demandes, ids => `demandes?select=*&id=in.${ids}`)],
    ["devis", extraire(t.devis, ids => `devis?select=*&id=in.${ids}`)],
    ["moments", extraire(t.demandes, ids => `dossier_moments?select=*&demande_id=in.${ids}`)],
    ["documents", extraire(t.demandes, ids => `equipe_documents?select=id,cree_le,demande_id,type,nom,type_mime,taille,conserver_jusqu_au&demande_id=in.${ids}`)],
    ["factures", extraire(t.factures, ids => `factures?select=*&id=in.${ids}`)],
    ["avoirs", extraire(t.factures, ids => `avoirs?select=*&facture_id=in.${ids}`)],
    ["liens", extraire(t.liens, ids => `liens_paiement?select=*&id=in.${ids}`)],
    ["paiements", extraire(t.paiements, ids => `paiements_manuels?select=*&id=in.${ids}`)],
    ["clients", extraire(t.clients, ids => `clients?select=*&id=in.${ids}`)],
    ["courriels", lire(`courriels_envoyes?select=*&destinataire=ilike.${exact(email)}`)],
    ["abonnes", extraire(t.abonnes, ids => `abonnes_lettre?select=*&id=in.${ids}`)],
    ["reservations", extraire(t.reservations, ids => `reservations?select=*&id=in.${ids}`)],
    ["commandes", extraire(t.commandes, ids => `boutique_commandes?select=*&id=in.${ids}`)],
    ["rendez_vous", extraire(t.rendez_vous, ids => `rendez_vous?select=id,cree_le,creneau_id,nom,email,telephone,message,langue,consentement_le,statut&id=in.${ids}`)],
    ["candidatures", extraire(t.candidatures, ids => `candidatures_partenaires?select=id,cree_le,nom,email,telephone,organisation,activite,ville,site,message,langue,statut&id=in.${ids}`)],
    ["courriels_recus", extraire(t.courriels_recus, ids => `courriels_recus?select=recu_le,expediteur,nom,objet,texte,pieces&id=in.${ids}`)],
  ];
  const r = await Promise.all(parts.map(([, promesse]) => promesse));
  if (r.some((x) => !x)) return null;
  return Object.fromEntries(parts.map(([k], i) => [k, (r[i] ?? []).map(sansSensible)]));
}

/**
 * Effacement réel. Ordre imposé par les clés étrangères : documents (stockage puis fiches), moments, liens non payés et
 * devis des demandes effaçables, réservations non payées, demandes, puis fiche client, e-mails, abonnement, commandes.
 * Chaque étape compte ce qu'elle a vraiment supprimé ; une étape qui échoue arrête la suite (« incomplet »).
 */
export async function effacerTout(t: Trouve): Promise<{ efface: number; garde: number; complet: boolean } | null> {
  if (!(await exigerRole("admins"))) return null;
  const a = apercu(t);
  const garde = Object.values(a).reduce((n, x) => n + x.gardes, 0);
  let efface = 0;
  const pas = async <T>(chemin: string | null) => {
    if (!chemin) return true;
    const l = await effacer<T>(chemin);
    if (!l) return false;
    efface += l.length;
    return true;
  };
  const tous = t.demandes.map((d) => d.id);
  const effacables = t.demandes.filter((d) => !d.garde).map((d) => d.id);
  const gardees = t.demandes.filter((d) => d.garde).map((d) => d.id);
  for (const id of tous) {
    const n = await effacerDocumentsDuDossier(id);
    if (n === null) return { efface, garde, complet: false };
    efface += n;
  }
  const etapes: (string | null)[] = [
    ...[...lots(tous)].map(ids => `dossier_moments?demande_id=in.${ids}&select=id`),
    ...[...lots(effacables)].map(ids => `liens_paiement?demande_id=in.${ids}&paye_le=is.null&select=id`),
    ...[...lots(effacables)].map(ids => `devis?demande_id=in.${ids}&select=id`),
    ...t.reservations.filter((r) => !r.garde).map((r) => `reservations?id=eq.${r.id}&statut=eq.attente&select=id`),
    ...[...lots(effacables)].map(ids => `demandes?id=in.${ids}&select=id`),
    ...[...lots(t.clients.map(c => c.id))].map(ids => `clients?id=in.${ids}&select=id`),
    ...[...lots(t.courriels.map(c => c.id))].map(ids => `courriels_envoyes?id=in.${ids}&select=id`),
    ...[...lots(t.abonnes.map(c => c.id))].map(ids => `abonnes_lettre?id=in.${ids}&select=id`),
    ...t.commandes.filter((c) => !c.garde).map((c) => `liens_paiement?commande_id=eq.${c.id}&paye_le=is.null&select=id`),
    ...t.commandes.filter((c) => !c.garde).map((c) => `boutique_commandes?id=eq.${c.id}&statut=neq.remise&select=id`),
  ];
  for (const e of etapes) if (!(await pas(e))) return { efface, garde, complet: false };
  // demandes gardées pour la comptabilité : le texte libre, la note de l'équipe et le WhatsApp ne servent pas à la loi
  for (const ids of lots(gardees)) {
    try {
      const r = await base(`demandes?id=in.${ids}`, { method: "PATCH", corps: { message: null, note_equipe: null, whatsapp: null, modifie_le: new Date().toISOString() }, prefer: "return=minimal" });
      if (!r.ok) return { efface, garde, complet: false };
    } catch {
      return { efface, garde, complet: false };
    }
  }
  return { efface, garde, complet: true };
}
