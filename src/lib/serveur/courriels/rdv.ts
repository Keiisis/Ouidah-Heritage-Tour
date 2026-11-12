import { communs, copies } from "@/content/courriels";
import { copiesAuto } from "@/content/courriels-auto";
import { copiesServices } from "@/content/services";
import { suivi } from "@/content/suivi";
import { lireContenu } from "@/lib/contenu";
import { base } from "../base";
import { envoyerAvis, envoyerCourriel } from "../courriel";
import { avis, ligne, nomLangue } from "./avis";
import { cloture, dateLongue, debut, heure, langueDe, lireModele, type Modele, prenomDe, textes } from "./commun";
import { boutons, courriel, mot, notes, paragraphes, titre } from "./gabarit";

// Rendez-vous pris sur /rendez-vous : confirmation au client dans sa langue (date et heure de Ouidah, objet, mode, lieu,
// son message), avis à l'équipe ; rendez-vous annulé par l'équipe : e-mail au client. Aucun lien d'annulation : le site
// n'en propose pas. Toutes les valeurs viennent du rendez-vous et de son créneau en base.
export type DonneesRdv = { id: string; nom: string; email: string; telephone: string | null; message: string | null; langue: string; debut: string; fin: string; mode: "telephone" | "sur_place"; lieu: string };
type Services = typeof copiesServices;

const quand = (d: DonneesRdv, L: ReturnType<typeof langueDe>, textesSuivi = suivi) => `${dateLongue(d.debut, L, true, textesSuivi)}, ${heure(d.debut, L, textesSuivi)} – ${heure(d.fin, L, textesSuivi)}`;
const page = (origine: string, L: string) => `${origine}${L === "FR" ? "" : `/${L.toLowerCase()}`}/rendez-vous`;

export function messageRdv(d: DonneesRdv, origine: string, modele: Modele = null, services: Services = copiesServices, textesSuivi = suivi) {
  const L = langueDe(d.langue), c = copies[L], a = copiesAuto[L].rdv, S = services[L];
  const prenom = prenomDe(d.nom), date = quand(d, L, textesSuivi);
  const t = textes(modele, { prenom: prenom || undefined, dates: dateLongue(d.debut, L, false, textesSuivi) }, { sujet: a.sujet, corps: [a.corps] });
  return courriel({ langue: L, sujet: t.sujet, apercu: a.apercu(date) }, [
    ...debut(origine, "rue-basilique", L),
    titre({ phrase: { prenom, avant: a.phrase[0], trait: a.phrase[1], apres: "." }, donnee: date }, L, origine),
    paragraphes(t.corps, L),
    notes(
      [
        { libelle: a.objet, valeur: S.rendezVous },
        { libelle: a.mode, valeur: d.mode === "telephone" ? S.telephoneMode : S.surPlace },
        { libelle: a.lieu, valeur: d.lieu },
        ...(d.mode === "telephone" && d.telephone ? [{ libelle: a.telephone, valeur: d.telephone }] : []),
      ],
      [a.heure],
      L,
      c.sep,
      "0px 24px 0px",
    ),
    mot(d.message ?? "", d.message ? d.nom : null, L, "28px 24px 0px"),
    ...cloture(L, communs[L].question, a.raison, {}, "28px 24px 48px"),
  ]);
}

export function messageRdvAnnule(d: DonneesRdv, origine: string, modele: Modele = null, textesSuivi = suivi) {
  const L = langueDe(d.langue), c = copies[L], a = copiesAuto[L].rdvAnnule;
  const prenom = prenomDe(d.nom), date = quand(d, L, textesSuivi);
  const t = textes(modele, { prenom: prenom || undefined, dates: dateLongue(d.debut, L, false, textesSuivi) }, { sujet: a.sujet, corps: [a.corps] });
  return courriel({ langue: L, sujet: t.sujet, apercu: a.apercu(date) }, [
    ...debut(origine, null, L),
    titre({ phrase: { prenom, avant: a.phrase[0], trait: a.phrase[1], apres: "." }, donnee: date }, L, origine),
    paragraphes(t.corps, L),
    boutons({ principal: { libelle: a.bouton, href: page(origine, L) } }, c.sep, "0px 24px 8px"),
    ...cloture(L, null, a.raison),
  ]);
}

/** Avis à l'équipe : un nouveau rendez-vous, en français. */
export function avisRdv(d: DonneesRdv, origine: string, services: Services = copiesServices, textesSuivi = suivi) {
  const date = quand(d, "FR", textesSuivi);
  return avis(
    {
      sujet: `Nouveau rendez-vous · ${d.nom} · ${dateLongue(d.debut, "FR", false, textesSuivi)}`,
      apercu: `${d.nom} · ${date}`,
      titre: `Nouveau rendez-vous de ${d.nom}`,
      donnee: `${date} (heure de Ouidah)`,
      bouton: { libelle: `Écrire à ${prenomDe(d.nom)}`, href: `mailto:${d.email}` },
      lignes: [
        ligne("Mode", d.mode === "telephone" ? services.FR.telephoneMode : services.FR.surPlace),
        ligne("Lieu", d.lieu),
        ligne("Nom", d.nom),
        ligne("E-mail", d.email),
        ligne("Téléphone", d.telephone),
        ligne("Langue", nomLangue(langueDe(d.langue))),
      ],
      mot: d.message ? { texte: d.message, auteur: d.nom } : null,
      raison: "Avis interne envoyé à l’équipe pour chaque rendez-vous pris sur ouidahheritagetour.bj.",
    },
    origine,
  );
}

type LigneRdv = { id: string; nom: string; email: string; telephone: string | null; message: string | null; langue: string; creneau: { debut: string; fin: string; mode: "telephone" | "sur_place"; lieu: string } | null };

async function lireRdv(id: string, statut: "confirme" | "annule"): Promise<DonneesRdv | null> {
  try {
    const r = await base(`rendez_vous?select=id,nom,email,telephone,message,langue,creneau:rdv_creneaux(debut,fin,mode,lieu)&id=eq.${id}&statut=eq.${statut}&limit=1`);
    const x = r.ok ? ((await r.json()) as LigneRdv[])[0] : null;
    return x?.creneau ? { id: x.id, nom: x.nom, email: x.email, telephone: x.telephone, message: x.message, langue: x.langue, ...x.creneau } : null;
  } catch {
    return null;
  }
}

/** Après la réservation : confirmation au client et avis à l'équipe (rendez-vous relu en base). */
export async function envoyerRdv(id: string, origine: string) {
  const d = await lireRdv(id, "confirme");
  if (!d) return { client: false, equipe: false };
  const L = langueDe(d.langue);
  const [modele, services, textesSuivi] = await Promise.all([lireModele("auto-rdv", L), lireContenu("services.copiesServices"), lireContenu("suivi.suivi")]);
  const m = messageRdv(d, origine, modele, services, textesSuivi), a = avisRdv(d, origine, services, textesSuivi);
  const [client, equipe] = await Promise.all([
    envoyerCourriel({ a: d.email, sujet: m.sujet, html: m.html, texte: m.texte, repondreA: process.env.EMAIL_OHT || null, cle: `rdv-${d.id}-confirme`, modele: "auto-rdv" }),
    envoyerAvis({ sujet: a.sujet, html: a.html, texte: a.texte, repondreA: d.email, cle: `rdv-${d.id}-avis`, modele: "avis-rdv" }),
  ]);
  return { client, equipe };
}

/** Après l'annulation par l'équipe : e-mail au client (rendez-vous relu en base, statut « annulé »). */
export async function envoyerRdvAnnule(id: string, origine: string) {
  const d = await lireRdv(id, "annule");
  if (!d) return false;
  const L = langueDe(d.langue);
  const [modele, textesSuivi] = await Promise.all([lireModele("auto-rdv-annule", L), lireContenu("suivi.suivi")]);
  const m = messageRdvAnnule(d, origine, modele, textesSuivi);
  return envoyerCourriel({ a: d.email, sujet: m.sujet, html: m.html, texte: m.texte, repondreA: process.env.EMAIL_OHT || null, cle: `rdv-${d.id}-annule`, modele: "auto-rdv-annule" });
}
