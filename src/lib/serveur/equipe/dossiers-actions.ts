"use server";

import { refresh } from "next/cache";
import { notFound } from "next/navigation";
import { espace as T } from "@/content/espace";
import { soleil } from "@/components/espace/outils";
import { iso, jourOuidah, minuitOuidah } from "@/lib/jours";
import { langueDoc, type Dossier } from "@/lib/suivi";
import { lireContenu } from "@/lib/contenu";
import { base } from "../base";
import { pagesDevis } from "../documents/controle";
import { envoyerDevisPret } from "../documents/courriel-devis";
import { emettre } from "../documents/emettre";
import { jetonSuivi } from "../documents/jeton";
import { clientAccessible, demandeAccessible, effacer, lieuxDuDossier, type BrutDossier } from "./dossiers";
import { ETAPES_MANUELLES, type Etape, LIMITES_NOTE, lireDevis, lireMoment, plusieursLignes, proposerCreneaux, uneLigne, UUID } from "./dossiers-regles";
import { journaliser } from "./journal";
import { origine, partir, voie } from "./messages/envoi";
import { exigerDroit } from "./securite/droits";
import { exigerRole } from "./session";
import { reglesFinancieres } from "./finances/fiscalite";
import { ventilationTva, type VentilationTva } from "./finances/fiscalite-regles";

// Écritures des demandes et dossiers voyage (lot L4). Actions serveur (contrôle d'origine de Next) joignables par une
// requête forgée : CHAQUE appel relit la session et le rôle, puis le dossier AVEC le filtre de l'agent (dossiers.ts) ; un
// dossier qui n'est pas le sien donne notFound(), donc une réponse 404, et rien n'est écrit. Les entrées sont relues avec
// les règles partagées (dossiers-regles.ts) ; le montant d'un devis est toujours recalculé ici, jamais lu du navigateur,
// et aucun acompte n'existe. Chaque écriture va au journal (dossier, objet touché, jamais le texte d'une note ni un
// montant). refresh() renvoie l'écran à jour dans la même réponse (doc Next 16 « Server Actions » › Choosing a cache update).

export type RefusDossier = "refuse" | "champs" | "panne" | "pages" | "publie" | "dates" | "lieux" | "court" | "hors" | "pdf" | "etat";
export type RetourDossier = { ok: true; montant?: number; numero?: string; lien?: string | null; courriel?: boolean; nombre?: number } | { erreur: RefusDossier; champs?: string[] };

const MIN = 60_000;
const JOUR_MS = 86_400_000;
const maintenantIso = () => new Date().toISOString();

async function ecrire<R = unknown>(chemin: string, method: "POST" | "PATCH", corps: unknown, retour = false): Promise<R[] | null> {
  try {
    const r = await base(chemin, { method, corps, prefer: retour ? "return=representation" : "return=minimal" });
    if (!r.ok) return null;
    return retour ? ((await r.json()) as R[]) : [];
  } catch {
    return null;
  }
}
async function lire<R>(chemin: string): Promise<R[] | null> {
  try {
    const r = await base(chemin);
    return r.ok ? ((await r.json()) as R[]) : null;
  } catch {
    return null;
  }
}

/** Session de l'espace (agent ou admin) et dossier accessible ; un dossier hors de portée lève notFound() (404). */
async function acces(id: unknown): Promise<{ s: NonNullable<Awaited<ReturnType<typeof exigerRole>>>; d: BrutDossier } | { erreur: RefusDossier }> {
  const s = await exigerDroit("demandes"); // droit « Demandes et devis » (lot « securite ») ; un admin les a tous
  if (!s) return { erreur: "refuse" };
  const d = await demandeAccessible(s, id);
  return d ? { s, d } : { erreur: "panne" };
}

/** Fiche client de la demande, créée si l'adresse n'en a pas encore (une par adresse : la base refuse le doublon). */
async function remplirClient(d: { nom: string | null; email: string | null; pays: string | null; langue: string; whatsapp: string | null }) {
  if (!d.email || !d.nom?.trim()) return;
  const corps = { nom: d.nom.trim().slice(0, 120), email: d.email.toLowerCase(), pays: d.pays, langue: d.langue, telephone: d.whatsapp || null };
  await base("clients?on_conflict=email", { method: "POST", corps, prefer: "resolution=ignore-duplicates,return=minimal" }).catch(() => null);
}

// ---------- attribution (admin) ----------

export async function attribuer(id: unknown, agentId: unknown): Promise<RetourDossier> {
  const s = await exigerRole("admins");
  if (!s) return { erreur: "refuse" };
  const d = await demandeAccessible(s, id);
  if (!d) return { erreur: "panne" };
  if (agentId !== null && (typeof agentId !== "string" || !UUID.test(agentId))) return { erreur: "champs" };
  if (agentId) {
    const m = await lire<{ id: string }>(`equipe_profils?select=id&id=eq.${agentId}&etat=eq.actif&limit=1`);
    if (!m) return { erreur: "panne" };
    if (!m.length) return { erreur: "champs" }; // inconnu, invité ou suspendu
  }
  if (d.agent_id === agentId) return { ok: true };
  const t = maintenantIso();
  if (!(await ecrire(`demandes?id=eq.${d.id}`, "PATCH", { agent_id: agentId, attribuee_le: agentId ? t : null, modifie_le: t }))) return { erreur: "panne" };
  // les moments à venir suivent le dossier ; ceux qui sont passés restent à l'agent qui les a vécus
  await ecrire(`dossier_moments?demande_id=eq.${d.id}&fait_le=is.null&debut=gte.${encodeURIComponent(t)}`, "PATCH", { agent_id: agentId, modifie_le: t });
  await remplirClient(d);
  await journaliser("dossier.attribution", s.profilId, null, { dossier: d.id, ...(agentId ? { cible: agentId } : {}) });
  refresh();
  return { ok: true };
}

// ---------- étape, note ----------

export async function changerEtape(id: unknown, etape: unknown): Promise<RetourDossier> {
  const a = await acces(id);
  if ("erreur" in a) return a;
  if (!ETAPES_MANUELLES.includes(etape as Etape)) return { erreur: "champs" };
  if (a.d.etape === etape) return { ok: true };
  if (!(await ecrire(`demandes?id=eq.${a.d.id}`, "PATCH", { etape, modifie_le: maintenantIso() }))) return { erreur: "panne" };
  await journaliser("dossier.etape", a.s.profilId, null, { dossier: a.d.id, etape: etape as Etape });
  refresh();
  return { ok: true };
}

export async function noterDossier(id: unknown, note: unknown): Promise<RetourDossier> {
  const a = await acces(id);
  if ("erreur" in a) return a;
  const n = plusieursLignes(note);
  if (typeof note !== "string" || n.length > LIMITES_NOTE) return { erreur: "champs", champs: ["note"] };
  if (!(await ecrire(`demandes?id=eq.${a.d.id}`, "PATCH", { note_equipe: n || null, modifie_le: maintenantIso() }))) return { erreur: "panne" };
  await journaliser("dossier.note", a.s.profilId, null, { dossier: a.d.id });
  refresh();
  return { ok: true };
}

// ---------- moments ----------

/** Un moment se pose entre un an en arrière et trois ans en avant. */
const horsBornes = (debut: number, t: number) => debut < t - 366 * JOUR_MS || debut > t + 3 * 366 * JOUR_MS;

export async function ajouterMoment(id: unknown, brut: unknown): Promise<RetourDossier> {
  const a = await acces(id);
  if ("erreur" in a) return a;
  const lu = lireMoment(brut, (await lieuxDuDossier(a.d)).possibles);
  if (!lu.ok) return { erreur: "champs", champs: lu.champs };
  if (horsBornes(lu.v.debut, Date.now())) return { erreur: "hors" };
  const deja = await lire<{ id: string }>(`dossier_moments?select=id&demande_id=eq.${a.d.id}&limit=999`);
  if (!deja) return { erreur: "panne" };
  const cree = await ecrire<{ id: string }>("dossier_moments", "POST", {
    demande_id: a.d.id,
    agent_id: a.d.agent_id ?? (a.s.role === "agent" ? a.s.profilId : null),
    debut: new Date(lu.v.debut).toISOString(),
    fin: new Date(lu.v.fin).toISOString(),
    type: lu.v.type,
    lieu_id: lu.v.lieu,
    ordre: Math.min(999, deja.length),
    note: lu.v.note,
  }, true);
  if (!cree?.[0]) return { erreur: "panne" };
  await journaliser("moment.ajout", a.s.profilId, null, { dossier: a.d.id, moment: cree[0].id, type: lu.v.type });
  refresh();
  return { ok: true };
}

type LigneMoment = { id: string; debut: string; fin: string; type: string; lieu_id: string | null };
/** Moment de CE dossier, sinon notFound() : un identifiant pris dans un autre dossier ne touche rien. */
async function momentDe(d: BrutDossier, momentId: unknown): Promise<LigneMoment | null> {
  if (typeof momentId !== "string" || !UUID.test(momentId)) notFound();
  const m = await lire<LigneMoment>(`dossier_moments?select=id,debut,fin,type,lieu_id&id=eq.${momentId}&demande_id=eq.${d.id}&limit=1`);
  if (!m) return null;
  if (!m[0]) notFound();
  return m[0];
}

/** Déplace un moment à une autre date et heure (Ouidah) ; sa durée reste la même. */
export async function deplacerMoment(id: unknown, momentId: unknown, brut: unknown): Promise<RetourDossier> {
  const a = await acces(id);
  if ("erreur" in a) return a;
  const m = await momentDe(a.d, momentId);
  if (!m) return { erreur: "panne" };
  const duree = Math.round((Date.parse(m.fin) - Date.parse(m.debut)) / MIN);
  const o = brut && typeof brut === "object" ? (brut as Record<string, unknown>) : {};
  const lu = lireMoment({ date: o.date, heure: o.heure, duree, type: m.type, lieu: m.lieu_id }, new Set(m.lieu_id ? [m.lieu_id] : []));
  if (!lu.ok) return { erreur: "champs", champs: lu.champs };
  if (horsBornes(lu.v.debut, Date.now())) return { erreur: "hors" };
  if (!(await ecrire(`dossier_moments?id=eq.${m.id}&demande_id=eq.${a.d.id}`, "PATCH", { debut: new Date(lu.v.debut).toISOString(), fin: new Date(lu.v.fin).toISOString(), modifie_le: maintenantIso() }))) return { erreur: "panne" };
  await journaliser("moment.deplacement", a.s.profilId, null, { dossier: a.d.id, moment: m.id });
  refresh();
  return { ok: true };
}

export async function supprimerMoment(id: unknown, momentId: unknown): Promise<RetourDossier> {
  const a = await acces(id);
  if ("erreur" in a) return a;
  const m = await momentDe(a.d, momentId);
  if (!m) return { erreur: "panne" };
  const parti = await effacer<{ id: string }>(`dossier_moments?id=eq.${m.id}&demande_id=eq.${a.d.id}`);
  if (!parti) return { erreur: "panne" };
  await journaliser("moment.suppression", a.s.profilId, null, { dossier: a.d.id, moment: m.id, type: m.type });
  refresh();
  return { ok: true };
}

/** Clôt un moment commencé (appel passé, rendez-vous tenu…) : il quitte « À clore » et passe sous l'horizon. */
export async function cloreMoment(id: unknown, momentId: unknown): Promise<RetourDossier> {
  const a = await acces(id);
  if ("erreur" in a) return a;
  const m = await momentDe(a.d, momentId);
  if (!m) return { erreur: "panne" };
  const t = maintenantIso();
  const fait = await ecrire<{ id: string }>(`dossier_moments?id=eq.${m.id}&demande_id=eq.${a.d.id}&fait_le=is.null&debut=lte.${encodeURIComponent(t)}`, "PATCH", { fait_le: t, modifie_le: t }, true);
  if (!fait) return { erreur: "panne" };
  if (!fait.length) return { erreur: "etat" }; // déjà clos, ou pas encore commencé
  await journaliser("moment.clos", a.s.profilId, null, { dossier: a.d.id, moment: m.id });
  refresh();
  return { ok: true };
}

/** Une visite par lieu choisi (circuit puis dossier) qui n'en a pas encore, calée sur le soleil des jours du séjour. */
export async function proposerMoments(id: unknown): Promise<RetourDossier> {
  const a = await acces(id);
  if ("erreur" in a) return a;
  const sejour = a.d.dossier?.sejour;
  if (!sejour || !Number.isInteger(sejour.arrivee) || !Number.isInteger(sejour.depart) || sejour.depart < sejour.arrivee) return { erreur: "dates" };
  const deja = await lire<{ lieu_id: string | null }>(`dossier_moments?select=lieu_id&demande_id=eq.${a.d.id}&type=eq.visite&limit=999`);
  if (!deja) return { erreur: "panne" };
  const poses = new Set(deja.map((m) => m.lieu_id));
  const lieux = (await lieuxDuDossier(a.d)).choisis.filter((l): l is typeof l & { coords: [number, number] } => l.coords !== null && !poses.has(l.id));
  if (!lieux.length) return { erreur: "lieux" };
  const soleilDu = (j: number) => soleil((minuitOuidah(sejour.arrivee + j) + 12 * 3_600_000) / MIN);
  const cren = proposerCreneaux(lieux, soleilDu, sejour.depart - sejour.arrivee + 1, T.moments.dureeVisite);
  if (!cren) return { erreur: "court" };
  const deb = await lire<{ id: string }>(`dossier_moments?select=id&demande_id=eq.${a.d.id}&limit=999`);
  if (!deb) return { erreur: "panne" };
  const lignes = cren.map((c, i) => {
    const debut = minuitOuidah(sejour.arrivee + c.jour) + c.de * MIN;
    return { demande_id: a.d.id, agent_id: a.d.agent_id ?? (a.s.role === "agent" ? a.s.profilId : null), debut: new Date(debut).toISOString(), fin: new Date(debut + (c.a - c.de) * MIN).toISOString(), type: "visite", lieu_id: lieux[i].id, ordre: Math.min(999, deb.length + i), note: null };
  });
  if (!(await ecrire("dossier_moments", "POST", lignes))) return { erreur: "panne" };
  await journaliser("moment.proposes", a.s.profilId, null, { dossier: a.d.id, nombre: lignes.length });
  refresh();
  return { ok: true, nombre: lignes.length };
}

// ---------- devis ----------

type LigneDevisBase = { id: string; statut: "brouillon" | "pret" | "paye" | "annule" };

/** Enregistre le brouillon (créé au premier enregistrement) ; refuse si le devis du dossier est déjà prêt ou payé. */
async function sauverBrouillon(a: { s: { profilId: string }; d: BrutDossier }, brut: unknown, pourEnvoi: boolean): Promise<{ id: string; lu: Extract<ReturnType<typeof lireDevis>, { ok: true }> } | { erreur: RefusDossier; champs?: string[] }> {
  const lu = lireDevis(brut, iso(jourOuidah(Date.now())), !pourEnvoi);
  if (!lu.ok) {
    await journaliser("devis.refus", a.s.profilId, null, { dossier: a.d.id, motif: "champs" });
    return { erreur: "champs", champs: lu.champs };
  }
  const actuel = await lire<LigneDevisBase>(`devis?select=id,statut&demande_id=eq.${a.d.id}&statut=neq.annule&order=cree_le.desc&limit=1`);
  if (!actuel) return { erreur: "panne" };
  if (actuel[0] && actuel[0].statut !== "brouillon") return { erreur: "publie" };
  // seuls libellé, quantité et prix unitaire partent en base ; le montant est la somme calculée ci-dessus
  const corps = { lignes: lu.v.lignes, montant: lu.montant, note: lu.v.note, valable_jusqu_au: lu.v.valable, modifie_le: maintenantIso() };
  const r = actuel[0]
    ? await ecrire<{ id: string }>(`devis?id=eq.${actuel[0].id}&statut=eq.brouillon`, "PATCH", corps, true)
    : await ecrire<{ id: string }>("devis", "POST", { demande_id: a.d.id, statut: "brouillon", ...corps }, true);
  if (!r) return { erreur: "panne" };
  if (!r[0]) return { erreur: "publie" }; // publié entre-temps
  return { id: r[0].id, lu };
}

export async function enregistrerDevis(id: unknown, brut: unknown): Promise<RetourDossier> {
  const a = await acces(id);
  if ("erreur" in a) return a;
  const b = await sauverBrouillon(a, brut, false);
  if ("erreur" in b) return b;
  await journaliser("devis.brouillon", a.s.profilId, null, { dossier: a.d.id, devis: b.id });
  refresh();
  return { ok: true, montant: b.lu.montant };
}

/** Le devis tel que le PDF le montrera, pour le contrôle de la page unique (numéro D- de même largeur que le vrai). */
async function dossierPdf(d: BrutDossier, b: Extract<ReturnType<typeof lireDevis>, { ok: true }>, ticket: { numero: string; cree_le: string } | null, fiscalite: VentilationTva): Promise<Dossier> {
  const tours = await lireContenu("fr.tours");
  const t = maintenantIso(), annee = t.slice(0, 4);
  const sejour = d.dossier?.sejour ?? null;
  return {
    jeton: jetonSuivi("d", d.id) ?? `d-${d.id}-${"0".repeat(22)}`,
    cas: "pret",
    langue: langueDoc(d.langue),
    reference: `DEM-${d.id.slice(0, 6).toUpperCase()}`,
    ticket: ticket ? { numero: ticket.numero, date: ticket.cree_le } : { numero: `T-${annee}-888888`, date: t },
    client: { nom: d.nom ?? "", email: d.email ?? "" },
    objet: { type: "voyage", intention: d.intention, circuit: d.circuit ? (tours.find((x) => x.slug === d.circuit)?.title ?? null) : null, arrivee: sejour ? iso(sejour.arrivee) : null, depart: sejour ? iso(sejour.depart) : null, adultes: d.reponses?.adultes ?? 0, enfants: d.reponses?.enfants ?? 0 },
    statut: "pret",
    montant: { valeur: b.montant, devise: "XOF" },
    fiscalite,
    paiement: null,
    document: { type: "devis", numero: `D-${annee}-888888`, date: t, url: "" },
    devis: { lignes: b.v.lignes.map((l) => ({ libelle: l.libelle, quantite: l.quantite, prixUnitaire: l.prix_unitaire })), montant: b.montant, valableJusquAu: b.v.valable, note: b.v.note },
    billets: [],
    lie: null,
  };
}

/**
 * « Envoyer le devis » : enregistre la saisie, vérifie qu'il tient sur UNE page (pagesDevis), émet le numéro D-…, pose
 * « prêt » et publie_le, et passe le dossier à « Devis envoyé ». Le client le voit alors sur sa page de suivi
 * (/suivi/<jeton>) et reçoit l'e-mail « votre devis est prêt » (documents/courriel-devis, une fois par publication) ;
 * sans envoi configuré ou en cas d'échec, l'écran le dit et donne le lien à transmettre. Le lien de paiement (Finances)
 * n'est pas créé ici.
 */
export async function envoyerDevis(id: unknown, brut: unknown): Promise<RetourDossier> {
  const a = await acces(id);
  if ("erreur" in a) return a;
  const b = await sauverBrouillon(a, brut, true);
  if ("erreur" in b) return b;
  const regles = await reglesFinancieres();
  if (!regles) return { erreur: "panne" };
  const fiscalite = ventilationTva(b.lu.montant, regles.tva_active, regles.tva_taux);
  const ticket = await emettre("T", "demande", a.d.id);
  let pages: number;
  try {
    pages = await pagesDevis(await dossierPdf(a.d, b.lu, ticket, fiscalite));
  } catch {
    refresh();
    return { erreur: "pdf" };
  }
  if (pages > 1) {
    await journaliser("devis.refus", a.s.profilId, null, { dossier: a.d.id, devis: b.id, motif: "pages" });
    refresh();
    return { erreur: "pages" };
  }
  const numero = await emettre("D", "devis", b.id);
  if (!numero) return { erreur: "panne" };
  const t = maintenantIso();
  const pret = await ecrire<{ id: string }>(`devis?id=eq.${b.id}&statut=eq.brouillon`, "PATCH", { statut: "pret", publie_le: t, montant: b.lu.montant, fiscalite: { ...fiscalite, regles_le: regles.modifie_le }, modifie_le: t }, true);
  if (!pret) return { erreur: "panne" };
  if (!pret.length) return { erreur: "publie" };
  // un dossier déjà payé, en voyage ou terminé ne recule pas
  await ecrire(`demandes?id=eq.${a.d.id}&etape=in.(nouvelle,devis_envoye,perdue)`, "PATCH", { etape: "devis_envoye", modifie_le: t });
  await remplirClient(a.d);
  const [v, o] = await Promise.all([voie(), origine()]);
  // test local (EQUIPE_BOITE, mode.ts) : la boîte note l'envoi, aucun e-mail réel vers les adresses de test ; la marque
  // « envoyé pour cette publication » est posée comme le ferait documents/courriel-devis
  const courriel = v?.boite
    ? Boolean(a.d.email) &&
      (await partir({ a: a.d.email ?? "", sujet: "devis-pret", html: "", texte: b.id, cle: `devis-${b.id}-pret` }, v.boite)) &&
      Boolean(await ecrire(`devis?id=eq.${b.id}`, "PATCH", { courriel_pret_pour: t }))
    : v && o
      ? await envoyerDevisPret(b.id, o)
      : false;
  await journaliser("devis.pret", a.s.profilId, null, { dossier: a.d.id, devis: b.id, courriel });
  refresh();
  const jeton = jetonSuivi("d", a.d.id);
  return { ok: true, numero: numero.numero, montant: b.lu.montant, lien: jeton ? `/suivi/${jeton}` : null, courriel };
}

// ---------- clients ----------

const TELEPHONE = /^\+?[0-9][0-9 ().-]{5,31}$/;

export async function noterClient(id: unknown, brut: unknown): Promise<RetourDossier> {
  const s = await exigerDroit("demandes");
  if (!s) return { erreur: "refuse" };
  const c = await clientAccessible(s, id);
  if (!c) return { erreur: "panne" };
  const o = brut && typeof brut === "object" ? (brut as Record<string, unknown>) : {};
  const notes = plusieursLignes(o.notes);
  const telephone = uneLigne(o.telephone);
  const champs = [...(typeof o.notes !== "string" || notes.length > LIMITES_NOTE ? ["notes"] : []), ...(telephone && !TELEPHONE.test(telephone) ? ["telephone"] : [])];
  if (champs.length) return { erreur: "champs", champs };
  if (!(await ecrire(`clients?id=eq.${c.id}`, "PATCH", { notes: notes || null, telephone: telephone || null, modifie_le: maintenantIso() }))) return { erreur: "panne" };
  await journaliser("client.note", s.profilId, null, { cible: c.id });
  refresh();
  return { ok: true };
}

/** Une fiche par adresse pour chaque demande envoyée qui n'en a pas (la plus récente donne le nom) ; admin seulement. */
export async function remplirClients(): Promise<RetourDossier> {
  const s = await exigerRole("admins");
  if (!s) return { erreur: "refuse" };
  const d = await lire<{ nom: string | null; email: string | null; pays: string | null; langue: string; whatsapp: string | null }>("demandes?select=nom,email,pays,langue,whatsapp&statut=eq.envoyee&order=cree_le.desc&limit=5000");
  if (!d) return { erreur: "panne" };
  const vues = new Set<string>();
  const lignes = d.flatMap((x) => {
    const email = x.email?.toLowerCase();
    if (!email || !x.nom?.trim() || vues.has(email)) return [];
    vues.add(email);
    return [{ nom: x.nom.trim().slice(0, 120), email, pays: x.pays, langue: x.langue, telephone: x.whatsapp || null }];
  });
  let nombre = 0;
  if (lignes.length) {
    try {
      const r = await base("clients?on_conflict=email&select=id", { method: "POST", corps: lignes, prefer: "resolution=ignore-duplicates,return=representation" });
      if (!r.ok) return { erreur: "panne" };
      nombre = ((await r.json()) as unknown[]).length;
    } catch {
      return { erreur: "panne" };
    }
  }
  await journaliser("clients.remplis", s.profilId, null, { nombre });
  refresh();
  return { ok: true, nombre };
}
