import "server-only";
import { base } from "../base";

// Journal de l'équipe (equipe_journal). Les détails sont limités à ces champs : jamais de code, de mot de passe, de jeton
// ni d'adresse e-mail en clair. Écran Équipe (lot L3) : profil_id = l'admin qui agit, details.cible = l'identifiant du
// compte visé. Dossiers (lot L4) : details.dossier = la demande, details.moment / details.devis = l'objet touché,
// details.cible = l'agent attribué ou la fiche client ; jamais le texte d'une note, un nom ni un montant.
type Action =
  | "connexion" | "connexion.refus" | "deconnexion" | "code.envoye" | "code.echec" | "mot_de_passe.change"
  | "equipe.ajout" | "equipe.suspension" | "equipe.reactivation" | "equipe.reinvitation" | "equipe.refus" | "equipe.suppression" | "equipe.role"
  | "dossier.attribution" | "dossier.etape" | "dossier.note"
  | "moment.ajout" | "moment.deplacement" | "moment.suppression" | "moment.clos" | "moment.proposes"
  | "devis.brouillon" | "devis.pret" | "devis.refus" | "client.note" | "clients.remplis"
  // messages (lot L6) : details.cible = la fiche client, details.modele / details.langue, details.nombre = envois
  | "courriel.brouillon" | "courriel.test" | "courriel.envoi" | "courriel.refus"
  | "modele.enregistre" | "modele.retire" | "modele.test"
  | "lettre.brouillon" | "lettre.test" | "lettre.envoi"
  // terrain (lot L5) : details.reservation = la réservation du billet, details.nombre = son rang, details.motif = le refus ;
  // details.commande = la commande boutique, details.etape = son nouvel état
  | "billet.entree" | "billet.refus" | "commande.statut" | "commande.chiffrage"
  | "boutique.produit" | "boutique.categorie" | "boutique.matiere" | "boutique.publication" | "boutique.livraison"
  // finances (lot L7) : details.facture / paiement / lien = l'objet touché, details.mois, details.mode ; jamais un montant,
  // une référence de virement, un payeur ni une coordonnée bancaire
  | "facture.emission" | "facture.envoi" | "avoir.emission" | "lien.creation" | "lien.envoi" | "lien.annulation"
  | "paiement.saisie" | "paiement.confirmation" | "paiement.rejet" | "paiement.inverse" | "finances.refus"
  | "depense.ajout" | "mois.cloture" | "mois.reouverture" | "grille.ajout" | "grille.modification" | "reglages.paiement"
  // pilotage (vague 2) : details.page = la page du wiki, details.dossier = la demande, details.document = le document client,
  // details.type = son type, details.semaine = le lundi du rapport, details.nombre = destinataires ; jamais un nom de
  // fichier, un texte de page ni une adresse
  | "wiki.enregistre" | "wiki.propose" | "wiki.publie" | "wiki.retire" | "wiki.refuse" | "piste.suivi" | "rapport.test" | "rapport.envoi"
  | "document.depot" | "document.lecture" | "document.suppression" | "document.refus"
  // réglages (vague 2) : details.passerelle = la passerelle touchée, details.actif = le nouvel état ; jamais une clé, un
  // mot de passe ni le texte saisi. Mode économie : details.mode = auto / marche / arret, details.nombre = le plafond
  | "reglages.passerelle" | "reglages.ordre" | "reglages.documents" | "reglages.emcf" | "reglages.assistant" | "reglages.maintenance" | "reglages.devises" | "reglages.eco"
  | "reglages.refus" | "reglages.avis" | "envoi.test" | "profil.modification" | "profil.session" | "profil.refus"
  // sécurité (vague 2) : details.cible = le compte, la session, le blocage, la fiche du registre ou l'incident visé,
  // details.type = la table exportée, details.mode = le format, details.nombre = lignes ou sessions ; jamais une adresse
  // IP, une adresse e-mail ni un texte saisi
  | "ip.blocage" | "ip.deblocage" | "session.revocation" | "sessions.revocation" | "droits.modification"
  | "sauvegarde.export" | "journal.export" | "registre.ajout" | "registre.modification" | "registre.retrait"
  | "donnees.acces" | "donnees.effacement" | "incident.declaration" | "incident.suivi" | "securite.refus"
  // contenu du site (04/11) : details.cle = la rubrique, details.version = la version écrite, details.cible = la version
  // restaurée ou l'image déposée, details.nombre = écarts relevés ; jamais le texte saisi
  | "contenu.brouillon" | "contenu.publication" | "contenu.abandon" | "contenu.restauration" | "contenu.image" | "contenu.refus" | "contenu.ecart"
  // blog (05/11) : details.article = l'article, details.version = la version écrite, details.langue, details.etape = le
  // nouvel état, details.cible = l'article d'origine (traduction) ou la version restaurée ; jamais le texte saisi
  | "blog.creation" | "blog.enregistrement" | "blog.etat" | "blog.suppression" | "blog.restauration" | "blog.traduction" | "blog.aide" | "blog.refus";
type Details = {
  role?: "agent" | "admin";
  etat?: "invite" | "actif" | "suspendu" | "supprime";
  motif?: "etat" | "role" | "envoi" | "session" | "soi" | "dernier_admin" | "bannissement" | "pages" | "champs" | "publie"
    | "falsifie" | "inconnu" | "autre" | "autreDate" | "non_paye" | "deja" | "edition" | "secret" // refus d'un billet (L5)
    | "doublon" | "mois_clos" | "justificatif" | "devis" | "passerelles" // refus des finances (L7)
    | "cles" | "ancien" | "verrou" // refus des réglages (vague 2)
    | "contenu" | "taille" | "fichier" // refus d'un document client (pilotage)
    | "confirmation" // refus de la sécurité (vague 2)
    | "adresses" | "conflit" | "verrouille" | "type"; // refus du contenu du site
  passerelle?: string; // réglages
  actif?: boolean; // réglages
  facture?: string; // L7
  paiement?: string; // L7
  lien?: string; // L7
  mois?: string; // L7
  mode?: string; // L7
  reservation?: string; // L5
  commande?: string; // L5
  cible?: string;
  dossier?: string;
  moment?: string;
  devis?: string;
  courriel?: boolean; // e-mail « devis prêt » parti
  etape?: string;
  type?: string;
  nombre?: number;
  modele?: string;
  langue?: string;
  numero?: string;
  page?: string; // pilotage
  document?: string; // pilotage
  semaine?: string; // pilotage
  cle?: string; // contenu du site
  version?: number; // contenu du site
  article?: string; // blog
};

export async function journaliser(action: Action, profilId: string | null, ipH: string | null, details: Details = {}) {
  try {
    await base("equipe_journal", { method: "POST", corps: { action, profil_id: profilId, ip_hash: ipH, details }, prefer: "return=minimal" });
  } catch {
    // le journal ne bloque jamais le parcours
  }
}
