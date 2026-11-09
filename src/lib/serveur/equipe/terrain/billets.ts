import "server-only";
import { lireContenu } from "@/lib/contenu";
import type { Evenement } from "@/content/types";
import { dateDuJour, iso, occurrence as occurrenceDe, prochaine } from "@/lib/jours";
import { base, compter } from "../../base";
import type { BilletLu } from "./regles";

// Lectures du contrôle des billets et des réservations (lot terrain L5), par le serveur seulement avec la clé secrète.
// Chaque fonction est appelée APRÈS la lecture de la session par l'écran ou l'action (couche d'accès) ; aucun « use cache ».
// Une lecture qui échoue rend null (« données indisponibles »), jamais un chiffre inventé.
//
// Édition contrôlée : un événement OHT à billets (contenu, fr.ts) et le premier jour d'une de ses éditions. Elle est « du
// jour » si aujourd'hui tombe entre ce premier jour et le dernier. Les éditions viennent du contenu (prochaine édition) ET
// des réservations payées (premier jour noté par le serveur à la réservation) : une édition dont des billets sont vendus
// reste contrôlable même si la règle du contenu a changé depuis.

const JOUR_MS = 86_400_000;
const jourIso = (s: string) => Math.floor(Date.parse(`${s}T00:00:00Z`) / JOUR_MS);
/** Durée de cette édition précise ; une date retirée du catalogue ne reçoit pas celle d'une autre édition. */
const dureeDe = (e: Evenement, debut: number) => {
  if (e.quand.type === "editions") {
    const fin = e.quand.dates.find(([a]) => a === iso(debut))?.[1];
    return fin ? Math.max(0, jourIso(fin) - debut) : 0;
  }
  const [a, b] = occurrenceDe(e.quand, dateDuJour(debut).getUTCFullYear());
  return Math.max(0, b - a);
};
const capaciteDe = (e: Evenement) => (e.offre.type === "billet" ? (e.offre.jauge ?? e.offre.places) : null);
export const titreEvenement = async (slug: string) => (await lireContenu("fr.evenements")).find((e) => e.slug === slug)?.title ?? slug;

async function lire<T>(chemin: string): Promise<T[] | null> {
  try {
    const r = await base(chemin);
    return r.ok ? ((await r.json()) as T[]) : null;
  } catch {
    return null;
  }
}

export type Edition = { evenement: string; titre: string; occurrence: string; fin: string; capacite: number | null };
const edition = (e: Evenement, debut: number): Edition => ({ evenement: e.slug, titre: e.title, occurrence: iso(debut), fin: iso(debut + dureeDe(e, debut)), capacite: capaciteDe(e) });
const cle = (x: { evenement: string; occurrence: string }) => `${x.evenement}|${x.occurrence}`;

/** Éditions d'événements OHT à billets qui se tiennent le jour `jour` (numéro de jour à Ouidah). */
export async function editionsDuJour(jour: number): Promise<Edition[] | null> {
  const OHT = (await lireContenu("fr.evenements")).filter((e) => e.organisateur.type === "oht" && e.offre.type === "billet");
  const vues = new Map<string, Edition>();
  for (const e of OHT) {
    const [a, b] = prochaine(e.quand, jour);
    if (a <= jour && jour <= b) vues.set(cle({ evenement: e.slug, occurrence: iso(a) }), edition(e, a));
  }
  if (OHT.length) {
    const l = await lire<{ evenement: string; occurrence: string }>(`reservations?select=evenement,occurrence&statut=eq.paye&evenement=in.(${OHT.map((e) => e.slug).join(",")})&occurrence=gte.${iso(jour - 31)}&occurrence=lte.${iso(jour)}&limit=5000`);
    if (!l) return null;
    for (const r of l) {
      const e = OHT.find((x) => x.slug === r.evenement);
      if (!e || vues.has(cle(r))) continue;
      const ed = edition(e, jourIso(r.occurrence));
      if (jourIso(ed.fin) >= jour) vues.set(cle(r), ed);
    }
  }
  return [...vues.values()].sort((a, b) => a.occurrence.localeCompare(b.occurrence) || a.titre.localeCompare(b.titre));
}

const filtreEdition = (e: { evenement: string; occurrence: string }) => `evenement=eq.${e.evenement}&occurrence=eq.${e.occurrence}`;

/** Billets payés d'une édition (somme des places des réservations payées). */
async function vendusDe(e: Edition): Promise<number | null> {
  const l = await lire<{ quantite: number }>(`reservations?select=quantite&${filtreEdition(e)}&statut=eq.paye&limit=5000`);
  return l ? l.reduce((t, r) => t + r.quantite, 0) : null;
}
/** Entrées contrôlées d'une édition. */
export const entreesDe = (e: { evenement: string; occurrence: string }) => compter("billets_entrees", filtreEdition(e));

export type CompteEdition = Edition & { vendus: number; entrees: number };
/** Éditions du jour avec billets vendus et entrées (accueil de l'agent, écran de contrôle). */
export async function comptesDuJour(jour: number): Promise<CompteEdition[] | null> {
  const eds = await editionsDuJour(jour);
  if (!eds) return null;
  const l = await Promise.all(eds.map(async (e) => ({ e, v: await vendusDe(e), n: await entreesDe(e) })));
  return l.some((x) => x.v === null || x.n === null) ? null : l.map(({ e, v, n }) => ({ ...e, vendus: v as number, entrees: n as number }));
}

export type EntreeVue = { numero: string; nom: string; formule: string; entre_le: number; par: string | null; hors_ligne: boolean };
type BrutEntree = { numero: string; entre_le: string; hors_ligne: boolean; reservation: { nom: string; formule_nom: string } | null; agent: { prenom: string; nom: string } | null };

export type ControleEdition = CompteEdition & { dernieres: EntreeVue[] };
/** Écran de contrôle : éditions du jour, comptes et 30 dernières entrées de chacune. */
export async function lireControle(jour: number): Promise<ControleEdition[] | null> {
  const eds = await comptesDuJour(jour);
  if (!eds) return null;
  const listes = await Promise.all(eds.map((e) => lire<BrutEntree>(`billets_entrees?select=numero,entre_le,hors_ligne,reservation:reservations(nom,formule_nom),agent:equipe_profils(prenom,nom)&${filtreEdition(e)}&order=entre_le.desc&limit=30`)));
  if (listes.some((l) => !l)) return null;
  return eds.map((e, i) => ({
    ...e,
    dernieres: (listes[i] ?? []).map((x) => ({ numero: x.numero, nom: x.reservation?.nom ?? "", formule: x.reservation?.formule_nom ?? "", entre_le: Date.parse(x.entre_le), par: x.agent ? `${x.agent.prenom} ${x.agent.nom}` : null, hors_ligne: x.hors_ligne })),
  }));
}

export type ReservationBillet = { id: string; evenement: string; occurrence: string; statut: string; quantite: number; nom: string; formule_nom: string };
const CHAMPS_RESA = "id,evenement,occurrence,statut,quantite,nom,formule_nom";

/**
 * Réservation d'un billet lu. Code signé : par son identifiant (la signature a déjà été vérifiée). Numéro saisi : par les
 * 8 premiers caractères de l'identifiant (bornes d'un intervalle d'uuid), celle de l'édition contrôlée d'abord.
 * undefined : aucune ; null : la base ne répond pas.
 */
export async function trouverReservation(b: BilletLu, ed: Edition): Promise<ReservationBillet | undefined | null> {
  const l =
    b.type === "code"
      ? await lire<ReservationBillet>(`reservations?select=${CHAMPS_RESA}&id=eq.${b.reservation}&limit=1`)
      : await lire<ReservationBillet>(`reservations?select=${CHAMPS_RESA}&id=gte.${b.prefixe}-0000-0000-0000-000000000000&id=lte.${b.prefixe}-ffff-ffff-ffff-ffffffffffff&order=cree_le.asc&limit=20`);
  if (!l) return null;
  return l.find((r) => r.evenement === ed.evenement && r.occurrence === ed.occurrence) ?? l[0];
}

// ---------- admin : réservations et billets ----------

export type Participant = { id: string; nom: string; email: string; telephone: string | null; pays: string | null; langue: string; formule: string; quantite: number; paye_le: number | null; entrees: number };
export type EditionAdmin = Edition & { moment: "encours" | "avenir" | "passee"; vendues: number; restantes: number | null; entrees: number; attente: number; participants: Participant[] };
export type EvenementAdmin = { slug: string; titre: string; capacite: number | null; editions: EditionAdmin[] };
type BrutResa = { id: string; evenement: string; occurrence: string; statut: string; quantite: number; nom: string; email: string; telephone: string | null; pays: string | null; langue: string; formule_nom: string; paye_le: string | null };

/** Événements OHT à billets, leurs éditions (en cours, à venir, puis passées depuis 60 jours), places et participants. */
export async function lireReservations(jour: number): Promise<EvenementAdmin[] | null> {
  const OHT = (await lireContenu("fr.evenements")).filter((e) => e.organisateur.type === "oht" && e.offre.type === "billet");
  if (!OHT.length) return [];
  const slugs = OHT.map((e) => e.slug).join(",");
  const depuis = iso(jour - 60);
  const [resas, entrees] = await Promise.all([
    lire<BrutResa>(`reservations?select=id,evenement,occurrence,statut,quantite,nom,email,telephone,pays,langue,formule_nom,paye_le&evenement=in.(${slugs})&occurrence=gte.${depuis}&order=occurrence.asc,paye_le.asc&limit=5000`),
    lire<{ reservation_id: string }>(`billets_entrees?select=reservation_id&evenement=in.(${slugs})&occurrence=gte.${depuis}&limit=20000`),
  ]);
  if (!resas || !entrees) return null;
  const parResa = entrees.reduce((m, x) => m.set(x.reservation_id, (m.get(x.reservation_id) ?? 0) + 1), new Map<string, number>());
  return OHT.map((e) => {
    const eds = new Map<string, Edition>();
    const [a] = prochaine(e.quand, jour);
    eds.set(iso(a), edition(e, a));
    for (const r of resas) if (r.evenement === e.slug && !eds.has(r.occurrence)) eds.set(r.occurrence, edition(e, jourIso(r.occurrence)));
    const editions = [...eds.values()].map((ed): EditionAdmin => {
      const l = resas.filter((r) => r.evenement === e.slug && r.occurrence === ed.occurrence);
      const payees = l.filter((r) => r.statut === "paye");
      const vendues = payees.reduce((t, r) => t + r.quantite, 0);
      const moment = jourIso(ed.occurrence) > jour ? "avenir" : jourIso(ed.fin) < jour ? "passee" : "encours";
      return {
        ...ed,
        moment,
        vendues,
        restantes: ed.capacite === null ? null : Math.max(0, ed.capacite - vendues),
        entrees: payees.reduce((t, r) => t + (parResa.get(r.id) ?? 0), 0),
        attente: l.filter((r) => r.statut === "attente").length,
        participants: payees.map((r) => ({ id: r.id, nom: r.nom, email: r.email, telephone: r.telephone, pays: r.pays, langue: r.langue, formule: r.formule_nom, quantite: r.quantite, paye_le: r.paye_le ? Date.parse(r.paye_le) : null, entrees: parResa.get(r.id) ?? 0 })),
      };
    });
    const rang = { encours: 0, avenir: 1, passee: 2 } as const;
    editions.sort((x, y) => rang[x.moment] - rang[y.moment] || (x.moment === "passee" ? y.occurrence.localeCompare(x.occurrence) : x.occurrence.localeCompare(y.occurrence)));
    return { slug: e.slug, titre: e.title, capacite: capaciteDe(e), editions };
  });
}

/** Lignes du CSV d'une édition : une par billet payé (entré ou non). null : édition inconnue ou base muette. */
export async function lignesCsv(evenement: string, occurrence: string): Promise<string[][] | null> {
  const e = (await lireContenu("fr.evenements")).find((e) => e.slug === evenement && e.organisateur.type === "oht" && e.offre.type === "billet");
  if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(occurrence)) return null;
  const f = filtreEdition({ evenement, occurrence });
  const [resas, entrees] = await Promise.all([
    lire<BrutResa>(`reservations?select=id,evenement,occurrence,statut,quantite,nom,email,telephone,pays,langue,formule_nom,paye_le&${f}&statut=eq.paye&order=paye_le.asc&limit=5000`),
    lire<{ reservation_id: string; rang: number; entre_le: string; appareil: string; agent: { prenom: string; nom: string } | null }>(`billets_entrees?select=reservation_id,rang,entre_le,appareil,agent:equipe_profils(prenom,nom)&${f}&limit=20000`),
  ]);
  if (!resas || !entrees) return null;
  const titre = e.title;
  return resas.flatMap((r) =>
    Array.from({ length: r.quantite }, (_, i) => {
      const x = entrees.find((y) => y.reservation_id === r.id && y.rang === i + 1);
      return [`OHT-${r.id.slice(0, 8).toUpperCase()}-${i + 1}`, titre, r.occurrence, r.formule_nom, r.nom, r.email, r.telephone ?? "", r.pays ?? "", r.langue, r.paye_le ?? "", x?.entre_le ?? "", x?.agent ? `${x.agent.prenom} ${x.agent.nom}` : "", x?.appareil ?? ""];
    }),
  );
}
