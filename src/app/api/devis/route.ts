import { lireContenu } from "@/lib/contenu";
import { servicesDemandes } from "@/lib/conciergerie";
import { jourOuidah } from "@/lib/jours";
import { EMAIL, manques, nettoyer } from "@/lib/demande";
import { lireBilletsEnvoyes, tarif } from "@/lib/reservation";
import { base, baseConfiguree } from "@/lib/serveur/base";
import { empreinteIp, limiteAtteinte, lireCorps, reponse } from "@/lib/serveur/garde";
import { envoyerCourriel } from "@/lib/serveur/courriel";
import { langueDe, lireModele } from "@/lib/serveur/courriels/commun";
import { avisOht, copieVoyageur } from "@/lib/serveur/messages";
import { billetsPossibles } from "@/lib/serveur/paiement/billet";
import { creerReservation, verifierPayable, type Creee } from "@/lib/serveur/paiement/reservation";
import { origineSite } from "@/lib/serveur/paiement/outils";
import { PASSERELLES } from "@/lib/serveur/paiement/types";
import { emettre } from "@/lib/serveur/documents/emettre";
import { jetonSuivi } from "@/lib/serveur/documents/jeton";

// Envoi du voyage : une demande (/devis) et, dossier unique, les billets d'événement qui l'accompagnent (talon de l'Agenda
// ou billet de /devis). Tout est revérifié ici : lieux, services, circuit, pays, langue et billets contre le contenu réel,
// champs obligatoires, piège à robots, temps passé, 5 envois par heure et par connexion. Un billet au prix publié se paie
// en ligne (une seule réservation payable par envoi) ; un billet « sur demande » rejoint le devis. Rien n'est envoyé à
// moitié : tout ce qui peut refuser est vérifié avant d'écrire, la demande reste en brouillon tant que le paiement n'est
// pas prêt, et les e-mails ne partent qu'après. Une seule référence pour tout.
const MAX_PAR_HEURE = 5;
const DUREE_MIN = 2500; // ms : un humain ne remplit pas la page plus vite
const fcfa = (n: number) => `${new Intl.NumberFormat("fr-FR").format(n)} FCFA`;

export async function POST(req: Request) {
  if (!baseConfiguree()) return reponse({ erreur: "indisponible" }, 503);
  const corps = await lireCorps(req);
  if (corps === null) return reponse({ erreur: "illisible" }, 400);
  const c = corps as Record<string, unknown>;
  const aujourdhui = jourOuidah(Date.now());
  const [evenements, releve, conciergerie, destinations, devisPage, nav, tenReasons, tours] = await Promise.all([
    lireContenu("fr.evenements"), lireContenu("lieux-ouidah"), lireContenu("fr.conciergerie"), lireContenu("fr.destinations"),
    lireContenu("fr.devisPage"), lireContenu("fr.nav"), lireContenu("fr.tenReasons"), lireContenu("fr.tours"),
  ]);
  const contenu = { conciergerie, destinations, devisPage, nav, tenReasons, tours };
  const d = nettoyer(corps, new Set(releve.lieux.map((l) => `r:${l.slug}`)), aujourdhui, contenu);
  if (d.piege || d.duree < DUREE_MIN) return reponse({ erreur: "refus" }, 400);

  // talon de l'Agenda : réservation rapide, seuls le nom, l'e-mail et l'accord sont exigés ; le conseiller complète
  const talon = c.origine === "talon";
  const manque = talon ? (["nom", "email", "consentement"] as const).filter((k) => (k === "nom" ? !d.champs.nom : k === "email" ? !EMAIL.test(d.champs.email) : !d.consentement)) : manques(d);
  if (manque.length) return reponse({ erreur: "incomplet", manques: manque }, 400);

  const billets = lireBilletsEnvoyes(c.billets, evenements);
  const nom = PASSERELLES.find((p) => p === c.passerelle) ?? null;
  const payables = billets.filter((b) => tarif(evenements, b.evenement, b.formule, aujourdhui));
  if (nom && payables.length > 1) return reponse({ erreur: "un_evenement" }, 400);
  // sans passerelle (aucune active, ou plusieurs événements payants sur /devis) : tout part en devis, rien n'est encaissé
  const payable = nom ? (payables[0] ?? null) : null;
  const surDemande = billets.filter((b) => b !== payable);

  const ip = empreinteIp(req);
  if (await limiteAtteinte("demandes", ip, MAX_PAR_HEURE, 60, "&statut=eq.envoyee")) return reponse({ erreur: "limite" }, 429);
  if (payable && (await limiteAtteinte("reservations", ip, MAX_PAR_HEURE, 60))) return reponse({ erreur: "limite" }, 429);

  // tout ce qui peut refuser le paiement, avant d'écrire
  let pret = null;
  if (payable) {
    if (!nom || !billetsPossibles() || !origineSite(req)) return reponse({ erreur: "passerelle" }, 400);
    const v = await verifierPayable(payable, nom, evenements);
    if (!v.ok) return reponse({ erreur: v.erreur, ...(v.restantes !== undefined ? { restantes: v.restantes } : {}) }, v.status);
    pret = v.tarif;
  }

  const titre = (slug: string) => evenements.find((e) => e.slug === slug)?.short ?? slug;
  const formuleNom = (b: { evenement: string; formule: number }) => {
    const o = evenements.find((e) => e.slug === b.evenement)?.offre;
    return o?.type === "billet" ? o.categories[b.formule]?.nom : o?.nom;
  };
  const lignesBillets = [
    ...(payable && pret ? [`${titre(payable.evenement)} · ${pret.formuleNom} × ${payable.quantite} · ${fcfa(pret.prix * payable.quantite)}, paiement en ligne`] : []),
    ...surDemande.map((b) => `${titre(b.evenement)} · ${formuleNom(b)} × ${b.quantite} · tarif sur demande`),
  ];

  // demande de devis : toujours sur /devis ; depuis le talon, seulement s'il y a un accompagnement ou un billet sur demande
  const avecDemande = !talon || servicesDemandes(d.dossier.services, conciergerie).length > 0 || surDemande.length > 0;
  if (!avecDemande && !payable) return reponse({ erreur: "vide" }, 400); // talon sans billet ni accompagnement
  let demandeId: string | null = null;
  if (avecDemande) {
    const ligne = {
      statut: payable ? "brouillon" : "envoyee", // envoyée seulement quand le paiement est prêt
      intention: d.intention,
      circuit: d.circuit,
      langue: d.reponses.langue,
      dossier: { ...d.dossier, billets },
      reponses: d.reponses,
      nom: d.champs.nom,
      email: d.champs.email,
      whatsapp: d.champs.whatsapp || null,
      pays: d.reponses.pays,
      message: d.champs.message || null,
      consentement_le: new Date().toISOString(),
      ip_hash: ip,
    };
    const r = await base("demandes?select=id", { method: "POST", corps: ligne, prefer: "return=representation" }).catch(() => null);
    demandeId = r?.ok ? (((await r.json()) as { id: string }[])[0]?.id ?? null) : null;
    if (!demandeId) return reponse({ erreur: "base" }, 502);
  }

  let resa: Creee | null = null;
  if (payable && pret && nom) {
    const cree = await creerReservation({ b: payable, t: pret, nom, client: { nom: d.champs.nom, email: d.champs.email, telephone: d.champs.whatsapp || null, pays: d.reponses.pays, langue: d.reponses.langue }, ip, demandeId, origine: origineSite(req)! });
    if (!cree.ok) return reponse({ erreur: cree.erreur }, cree.status); // la demande reste en brouillon : rien n'est envoyé
    resa = cree;
    if (demandeId) {
      const envoyee = await base(`demandes?id=eq.${demandeId}&statut=eq.brouillon`, { method: "PATCH", corps: { statut: "envoyee", modifie_le: new Date().toISOString() } }).catch(() => null);
      if (!envoyee?.ok) return reponse({ erreur: "base" }, 502);
    }
  }

  const reference = demandeId ? `DEM-${demandeId.slice(0, 6).toUpperCase()}` : `RES-${resa!.id.slice(0, 6).toUpperCase()}`;
  let copieEnvoyee = false;
  if (demandeId) {
    const paysNom = d.reponses.pays ? (new Intl.DisplayNames(["fr"], { type: "region" }).of(d.reponses.pays) ?? null) : null;
    // ticket numéroté et lien secret de suivi (ticket, puis devis dès qu'un agent l'a validé)
    const [ticket, modele, textesSuivi] = await Promise.all([emettre("T", "demande", demandeId).catch(() => null), lireModele("auto-demande", langueDe(d.reponses.langue)), lireContenu("suivi.suivi")]);
    const jeton = jetonSuivi("d", demandeId), origine = origineSite(req);
    const lienSuivi = jeton && origine ? `${origine}/suivi/${jeton}` : null;
    // texte de l'admin (modèle « auto-demande » dans la langue du client), ticket T- et images du site
    const copie = copieVoyageur(d, reference, lignesBillets, lienSuivi, { ticket: ticket?.numero ?? null, modele, origine: origine ?? undefined, contenu: { ...contenu, releve }, suivi: textesSuivi });
    const avis = avisOht(d, reference, paysNom, lignesBillets, { contenu: { ...contenu, releve }, suivi: textesSuivi });
    const [copieOk, ohtPrevenu] = await Promise.all([
      envoyerCourriel({ a: d.champs.email, sujet: copie.sujet, html: copie.html, texte: copie.texte, repondreA: process.env.EMAIL_OHT || null, cle: `${demandeId}-copie` }),
      process.env.EMAIL_OHT ? envoyerCourriel({ a: process.env.EMAIL_OHT, sujet: avis.sujet, html: avis.html, texte: avis.texte, repondreA: d.champs.email, cle: `${demandeId}-avis` }) : Promise.resolve(false),
    ]);
    copieEnvoyee = copieOk;
    if (copieOk || ohtPrevenu) await base(`demandes?id=eq.${demandeId}`, { method: "PATCH", corps: { copie_envoyee: copieOk, oht_prevenu: ohtPrevenu, modifie_le: new Date().toISOString() } }).catch(() => null);
  }

  const suivi = demandeId ? jetonSuivi("d", demandeId) : null;
  return reponse({ ok: true, reference, copie: copieEnvoyee, suivi, ...(resa ? { reservation: { id: resa.id, cle: resa.cle, montant: resa.montant, devise: resa.devise, lancement: resa.lancement } } : {}) }, 201);
}
