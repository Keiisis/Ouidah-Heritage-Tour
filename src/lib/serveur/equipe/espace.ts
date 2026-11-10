import "server-only";
import { lireContenu } from "@/lib/contenu";
import { espace as T, type Mode } from "@/content/espace";
import { iso, jourOuidah, prochaine } from "@/lib/jours";
import { base } from "../base";
import { passerelle } from "../paiement";
import { chargerCles } from "../paiement/cles";
import { PASSERELLES, type NomPasserelle } from "../paiement/types";
import { momentsDuJour, type MomentJour } from "./dossiers";
import { exigerDroit } from "./securite/droits";
import { exigerRole } from "./session";
import { comptesDuJour } from "./terrain/billets";
import { calculerMois } from "./finances/lectures";
import { moisCourant } from "./finances/regles";
import { lireNotifications, type Notification } from "./messages/lectures";

// Données des accueils de l'espace (lot L2), lues par le serveur seulement avec la clé secrète. Chaque lecture relit la
// session et le rôle (couche d'accès) : un agent n'obtient jamais les données de l'admin. Aucune donnée de session dans un
// « use cache » : tout est lu à la requête. Une lecture qui échoue rend null (« données indisponibles »), jamais un
// chiffre inventé. L'heure n'est lue qu'ici, après la session (rendu à la requête, jamais prérendu).

const FUSEAU = T.ouidah.fuseau;
const MIN = 60_000;
const lePaye = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: FUSEAU });
const leJour = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: FUSEAU });
const leMois = new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: FUSEAU });

/** Minute de la requête (millisecondes / 60 000) : l'arc du soleil est rendu par le serveur à cette heure, puis suit
 * l'horloge du navigateur. Appelée après la lecture de la session seulement. */
export const minuteServeur = () => Math.floor(Date.now() / MIN);
/** Minutes écoulées depuis minuit à Ouidah (UTC+1 toute l'année). */
const minutesOuidah = (ms: number) => Math.floor(((ms + T.ouidah.decalage * MIN) % 86_400_000) / MIN);

async function lire<T>(chemin: string, compte = false): Promise<{ lignes: T[]; total: number } | null> {
  try {
    const r = await base(chemin, compte ? { prefer: "count=exact" } : {});
    if (!r.ok) return null;
    const lignes = (await r.json()) as T[];
    const t = r.headers.get("content-range")?.split("/")[1];
    return { lignes, total: t && t !== "*" ? Number(t) : lignes.length };
  } catch {
    return null;
  }
}

/** En-tête de l'accueil : « Bonjour » ou « Bonsoir », date et heure de Ouidah. */
function enTete(ms: number) {
  const m = minutesOuidah(ms);
  return { salut: T.salut(m), date: leJour.format(ms), heure: `${String(Math.floor(m / 60)).padStart(2, "0")} h ${String(m % 60).padStart(2, "0")}` };
}
/** « Aujourd'hui, 09 h 05 », « Hier, 18 h 40 » ou « 28 oct., 10 h 12 ». */
function quand(isoDate: string, ms: number) {
  const t = Date.parse(isoDate), m = minutesOuidah(t);
  const ecart = jourOuidah(ms) - jourOuidah(t);
  const jour = ecart === 0 ? T.aujourdhui : ecart === 1 ? T.hier : lePaye.format(t);
  return `${jour}, ${String(Math.floor(m / 60)).padStart(2, "0")} h ${String(m % 60).padStart(2, "0")}`;
}
const nomClient = (c: { prenom?: unknown; nom?: unknown } | null) => [c?.prenom, c?.nom].filter((x): x is string => typeof x === "string" && x.length > 0).join(" ");
const articles = (lignes: unknown) => (Array.isArray(lignes) ? lignes.reduce((t: number, l: { quantite?: unknown }) => t + (typeof l?.quantite === "number" ? l.quantite : 1), 0) : 0);

// ---------- agent ----------

export type Retrait = { reference: string; client: string; articles: number; recu: string; avant: boolean }; // avant : reçu avant aujourd'hui
export type EvenementJour = { slug: string; titre: string; vendus: number };
export type DemandeAgent = { id: string; nom: string; type: string; langue: string; recue: string };
export type ClientJour = { dossier: string; nom: string; moments: number };
export type DonneesAgent = {
  tete: ReturnType<typeof enTete>;
  evenements: EvenementJour[] | null;
  retraits: { total: number; liste: Retrait[] } | null;
  demandes: { total: number; liste: DemandeAgent[] } | null; // attribuées à l'agent, encore « nouvelles »
  moments: MomentJour[] | null; // ses moments du jour, sur l'arc du soleil
  clients: ClientJour[] | null; // les clients de ses moments du jour
  alertes: { total: number; liste: (Notification & { recue: string })[] } | null;
};

/** Tâches du jour de l'agent : événements OHT à billets qui ont lieu aujourd'hui (billets vendus), retraits boutique à
 * confirmer, ses demandes attribuées encore nouvelles, ses moments du jour (lot L4) et les clients de ces moments. */
export async function donneesAgent(): Promise<DonneesAgent | null> {
  const s = await exigerRole("agents");
  if (!s) return null;
  const evenements = await lireContenu("fr.evenements");
  const ms = Date.now();
  const jour = jourOuidah(ms);
  const duJour = evenements
    .filter((e) => e.organisateur.type === "oht" && e.offre.type === "billet")
    .map((e) => ({ e, edition: prochaine(e.quand, jour) }))
    .filter(({ edition: [a, b] }) => a <= jour && jour <= b);
  // retraits boutique et demandes : seulement avec le droit de l'agent (lot « securite ») ; sans lui, rien ne lui revient
  const [boutique, dossiers, billets] = await Promise.all([exigerDroit("boutique"), exigerDroit("demandes"), exigerDroit("billets")]);
  const [ventes, retraits, demandes, moments, notes] = await Promise.all([
    billets && duJour.length
      ? lire<{ evenement: string; occurrence: string; quantite: number }>(`reservations?select=evenement,occurrence,quantite&statut=eq.paye&evenement=in.(${duJour.map(({ e }) => e.slug).join(",")})&occurrence=in.(${duJour.map(({ edition }) => iso(edition[0])).join(",")})&limit=5000`)
      : Promise.resolve({ lignes: [], total: 0 }),
    boutique ? lire<{ reference: string; lignes: unknown; contact: { prenom?: string; nom?: string } | null; cree_le: string }>("boutique_commandes?select=reference,lignes,contact,cree_le&statut=eq.a_confirmer&remise->>mode=eq.retrait&order=cree_le.asc&limit=8", true) : { lignes: [], total: 0 },
    dossiers ? lire<{ id: string; cree_le: string; intention: string; nom: string | null; langue: string }>(`demandes?select=id,cree_le,intention,nom,langue&statut=eq.envoyee&etape=eq.nouvelle&agent_id=eq.${s.profilId}&order=cree_le.asc&limit=6`, true) : { lignes: [], total: 0 },
    dossiers ? momentsDuJour(s, ms, false) : [],
    dossiers ? lireNotifications(s) : [],
  ]);
  const nonLues = notes?.filter((n) => !n.lue) ?? null;
  const clients = moments
    ? [...moments.reduce((m, x) => m.set(x.dossier, { dossier: x.dossier, nom: x.client, moments: (m.get(x.dossier)?.moments ?? 0) + 1 }), new Map<string, ClientJour>()).values()]
    : null;
  return {
    tete: enTete(ms),
    evenements: ventes
      ? (billets ? duJour : []).map(({ e, edition }) => ({ slug: e.slug, titre: e.title, vendus: ventes.lignes.filter((v) => v.evenement === e.slug && v.occurrence === iso(edition[0])).reduce((t, v) => t + v.quantite, 0) }))
      : null,
    retraits: retraits ? { total: retraits.total, liste: retraits.lignes.map((c) => ({ reference: c.reference, client: nomClient(c.contact), articles: articles(c.lignes), recu: quand(c.cree_le, ms), avant: jourOuidah(Date.parse(c.cree_le)) < jour })) } : null,
    demandes: demandes ? { total: demandes.total, liste: demandes.lignes.map((x) => ({ id: x.id, nom: x.nom ?? "", type: T.admin.demandes.types[x.intention] ?? x.intention, langue: x.langue, recue: quand(x.cree_le, ms) })) } : null,
    moments,
    clients,
    alertes: nonLues ? { total: nonLues.length, liste: nonLues.slice(0, 6).map((n) => ({ ...n, recue: quand(n.quand, ms) })) } : null,
  };
}

// ---------- admin ----------

export type PaiementJour = { minute: number | null; heure: string; mode: Mode; montant: number; quoi: string };
export type Caisse = {
  mois: string;
  totalMois: number;
  parMode: { mode: Mode; n: number; montant: number }[];
  aConfirmer: { n: number; montant: number };
  totalJour: number;
  jour: PaiementJour[];
};
export type DemandeAttente = { id: string; nom: string; type: string; langue: string; recue: string; agent: string | null };
export type ReservationAVenir = { id: string; quand: string; titre: string; places: string; client: string; montant: number };
export type CommandeBoutique = { reference: string; client: string; articles: number; remise: string; totalXof: number | null; quand: string };
export type EtatPasserelle = { nom: NomPasserelle; etat: "active" | "coupee" | "nonconf" };
export type Activite = { quand: string; texte: string; t: number };
export type DonneesAdmin = {
  tete: ReturnType<typeof enTete>;
  caisse: Caisse | null;
  attente: { n: number; montant: number } | null; // devis prêts, envoyés au client, pas encore payés
  demandes: { total: number; liste: DemandeAttente[]; plusAncienne: string | null } | null;
  reservations: { total: number; liste: ReservationAVenir[] } | null;
  commandes: { total: number; liste: CommandeBoutique[] } | null;
  passerelles: EtatPasserelle[] | null;
  activite: Activite[] | null;
  moments: MomentJour[] | null; // moments du jour de toute l'équipe (lot L4), sur l'arc du soleil
};

type LigneDemande = { id: string; cree_le: string; intention: string; nom: string | null; langue: string; devis: { statut: string }[]; agent: { prenom: string; nom: string } | null };
type LignePaiement = { evenement: string; quantite: number; passerelle: NomPasserelle; montant: number; montant_recu: number | null; paye_le: string };
type LigneCommande = { reference: string; lignes: unknown; contact: { prenom?: string; nom?: string } | null; remise: { mode?: string } | null; total_eur: number | null; total_xof: number | null; cree_le: string };

/** Accueil de l'admin : encaissé complet de la comptabilité, en attente (devis envoyés), demandes sans devis,
 * réservations à venir, commandes boutique à confirmer, état des passerelles, activité récente. */
export async function donneesAdmin(): Promise<DonneesAdmin | null> {
  const s = await exigerRole("admins");
  if (!s) return null;
  const ms = Date.now();
  const jour = jourOuidah(ms);
  const [demandes, recentes, paiements, devis, reservations, commandes, passerelles, moments, evenements, finances] = await Promise.all([
    lire<LigneDemande>("demandes?select=id,cree_le,intention,nom,langue,devis(statut),agent:equipe_profils(prenom,nom)&statut=eq.envoyee&order=cree_le.asc&limit=500"),
    lire<LigneDemande>("demandes?select=id,cree_le,intention,nom,langue,devis(statut),agent:equipe_profils(prenom,nom)&statut=eq.envoyee&order=cree_le.desc&limit=5"),
    lire<LignePaiement>("reservations?select=evenement,quantite,passerelle,montant,montant_recu,paye_le&statut=eq.paye&order=paye_le.desc&limit=5"),
    lire<{ montant: number | null }>("devis?select=montant&statut=eq.pret&limit=5000"),
    lire<{ id: string; evenement: string; occurrence: string; formule_nom: string; quantite: number; montant: number; nom: string }>(`reservations?select=id,evenement,occurrence,formule_nom,quantite,montant,nom&statut=eq.paye&occurrence=gte.${iso(jour)}&order=occurrence.asc,cree_le.asc&limit=6`, true),
    lire<LigneCommande>("boutique_commandes?select=reference,lignes,contact,remise,total_eur,total_xof,cree_le&statut=eq.a_confirmer&order=cree_le.desc&limit=5", true),
    lire<{ nom: string; active: boolean }>("passerelles_paiement?select=nom,active&order=ordre.asc"),
    momentsDuJour(s, ms, true),
    lireContenu("fr.evenements"),
    calculerMois(moisCourant(ms)),
    chargerCles(),
  ]);

  const type = (intention: string) => T.admin.demandes.types[intention] ?? intention;
  const titreEvenement = (slug: string) => evenements.find((e) => e.slug === slug)?.title ?? slug;
  const enAttente = demandes?.lignes.filter((x) => !x.devis.some((v) => v.statut === "pret" || v.statut === "paye")) ?? null;
  const remise = (r: LigneCommande["remise"]) => (r?.mode === "livraison" ? T.admin.commandes.livraison : T.admin.commandes.retrait);
  const recu = (p: LignePaiement) => p.montant_recu ?? p.montant;
  const quoiPaye = (p: LignePaiement) => `${titreEvenement(p.evenement)}, ${T.admin.billets(p.quantite)}`;

  const duJour = finances?.encaissements.filter((p) => p.jour === iso(jour)) ?? [];
  const caisse: Caisse | null = finances
    ? {
        mois: leMois.format(ms),
        totalMois: finances.encaisse,
        parMode: finances.parMode,
        aConfirmer: finances.aConfirmer,
        totalJour: duJour.reduce((t, p) => t + p.montant, 0),
        jour: duJour
          .sort((a, b) => (b.instant ?? "").localeCompare(a.instant ?? ""))
          .map((p) => {
            const m = p.instant ? minutesOuidah(Date.parse(p.instant)) : null;
            return { minute: m, heure: m === null ? "–" : `${String(Math.floor(m / 60)).padStart(2, "0")} h ${String(m % 60).padStart(2, "0")}`, mode: p.mode, montant: p.montant, quoi: T.journee.paiements[p.source] };
          }),
      }
    : null;

  const activite: Activite[] | null =
    recentes && paiements && commandes
      ? [
          ...recentes.lignes.map((x) => ({ t: Date.parse(x.cree_le), quand: quand(x.cree_le, ms), texte: T.admin.activite.demande(x.nom ?? "", type(x.intention)) })),
          ...paiements.lignes.slice(0, 5).map((p) => ({ t: Date.parse(p.paye_le), quand: quand(p.paye_le, ms), texte: T.admin.activite.paiement(T.modes[p.passerelle], `${new Intl.NumberFormat("fr-FR").format(recu(p))} ${T.monnaie.fcfa}`, quoiPaye(p)) })),
          ...commandes.lignes.map((c) => ({ t: Date.parse(c.cree_le), quand: quand(c.cree_le, ms), texte: T.admin.activite.commande(c.reference, remise(c.remise)) })),
        ]
          .sort((a, b) => b.t - a.t)
          .slice(0, 5)
      : null;

  return {
    tete: enTete(ms),
    caisse,
    attente: devis ? { n: devis.lignes.length, montant: devis.lignes.reduce((t, x) => t + (x.montant ?? 0), 0) } : null,
    demandes: enAttente
      ? {
          total: enAttente.length,
          liste: enAttente.slice(0, 5).map((x) => ({ id: x.id, nom: x.nom ?? "", type: type(x.intention), langue: x.langue, recue: quand(x.cree_le, ms), agent: x.agent ? `${x.agent.prenom} ${x.agent.nom}` : null })),
          plusAncienne: enAttente.length ? T.duree((ms - Date.parse(enAttente[0].cree_le)) / MIN) : null,
        }
      : null,
    reservations: reservations
      ? {
          total: reservations.total,
          liste: reservations.lignes.map((r) => ({
            id: r.id,
            quand: r.occurrence === iso(jour) ? T.aujourdhui : r.occurrence === iso(jour + 1) ? T.demain : leJour.format(Date.parse(`${r.occurrence}T12:00:00Z`)),
            titre: titreEvenement(r.evenement),
            places: T.admin.reservations.places(r.formule_nom, r.quantite),
            client: r.nom,
            montant: r.montant,
          })),
        }
      : null,
    commandes: commandes ? { total: commandes.total, liste: commandes.lignes.map((c) => ({ reference: c.reference, client: nomClient(c.contact), articles: articles(c.lignes), remise: remise(c.remise), totalXof: c.total_xof ?? (c.total_eur === null ? null : Math.round(c.total_eur * 655.957)), quand: quand(c.cree_le, ms) })) } : null,
    passerelles: passerelles
      ? PASSERELLES.map((nom) => {
          const ligne = passerelles.lignes.find((p) => p.nom === nom);
          return { nom, etat: !passerelle(nom).disponible() ? "nonconf" : ligne?.active ? "active" : "coupee" } as EtatPasserelle;
        }).sort((a, b) => passerelles.lignes.findIndex((p) => p.nom === a.nom) - passerelles.lignes.findIndex((p) => p.nom === b.nom))
      : null,
    activite,
    moments,
  };
}

// ---------- lot terrain (L5) : billets contrôlés et commandes à préparer de l'accueil de l'agent ----------

export type BilletsAccueil = { evenement: string; occurrence: string; titre: string; vendus: number; entrees: number }[];
/** Bandeau des billets de l'accueil : éditions OHT du jour, billets vendus et entrées déjà contrôlées. */
export async function billetsAccueil(): Promise<BilletsAccueil | null> {
  const s = await exigerRole("agents");
  if (!s) return null;
  if (!(await exigerDroit("billets"))) return []; // sans le droit « billets » (lot « securite »), aucun bandeau
  const l = await comptesDuJour(jourOuidah(Date.now()));
  return l ? l.map((e) => ({ evenement: e.evenement, occurrence: e.occurrence, titre: e.titre, vendus: e.vendus, entrees: e.entrees })) : null;
}

export type CommandeAPreparer = { reference: string; client: string; articles: number; mode: "retrait" | "livraison"; etat: "a_preparer" | "prete"; recue: string };
/** Commandes boutique en préparation ou prêtes à remettre (les reçues à confirmer restent dans « Retraits boutique »). */
export async function commandesAccueil(): Promise<{ total: number; liste: CommandeAPreparer[] } | null> {
  const s = await exigerRole("agents");
  if (!s) return null;
  if (!(await exigerDroit("boutique"))) return { total: 0, liste: [] }; // sans le droit « boutique », rien ne lui revient
  const ms = Date.now();
  const r = await lire<{ reference: string; statut: "a_preparer" | "prete"; lignes: unknown; contact: { prenom?: string; nom?: string } | null; remise: { mode?: string } | null; cree_le: string }>("boutique_commandes?select=reference,statut,lignes,contact,remise,cree_le&statut=in.(a_preparer,prete)&order=cree_le.asc&limit=6", true);
  return r ? { total: r.total, liste: r.lignes.map((c) => ({ reference: c.reference, client: nomClient(c.contact), articles: articles(c.lignes), mode: c.remise?.mode === "livraison" ? "livraison" : "retrait", etat: c.statut, recue: quand(c.cree_le, ms) })) } : null;
}

