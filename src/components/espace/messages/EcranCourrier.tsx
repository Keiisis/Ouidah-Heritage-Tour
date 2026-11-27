import { redirect } from "next/navigation";
import type { Role } from "@/content/equipe";
import { espace as T } from "@/content/espace";
import { msg } from "@/content/espace-messages";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { courrielRecu } from "@/lib/serveur/equipe/messages/imap";
import { clientsCourrier, envoisRecents, lireModeles, modelesDeDepart } from "@/lib/serveur/equipe/messages/lectures";
import { objetReponse } from "@/lib/serveur/equipe/messages/rendu";
import { assistantDisponible } from "@/lib/serveur/equipe/reglages/public";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { Bloc, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { Tete } from "../Tete";
import { Courrier, type Reponse } from "./Courrier";
import "./messages.css";

// Rédiger un e-mail (lot L6), rendu sous <Suspense> : l'agent écrit à ses clients, l'admin à tous ou à un groupe.
// ?client=<fiche>&modele=<clé> : reprise depuis la boîte de réception (« Répondre ») ; ?a=<adresse> : écrire à une adresse
// sans fiche client (le serveur la revalide à l'envoi) ; ?reponse=<courriel reçu> : réponse dans le fil (« Répondre » de la
// boîte), relue avec les droits de l'écran boîte. Données réelles seulement ; si la table des modèles ne répond pas, le
// composeur garde les textes de départ.
export async function EcranCourrier({ role, recherche }: { role: Role; recherche: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await exigerRole(role);
  if (!s) redirect(`/${role}`);
  const [q, clients, modeles, envois, redaction] = await Promise.all([recherche, clientsCourrier(s), lireModeles(), envoisRecents(s), assistantDisponible()]);
  const un = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);
  const a = un(q.a), id = un(q.reponse);
  const c = id ? await courrielRecu(s, id) : null;
  const reponse: Reponse | null = c && c !== "non" && c.expediteur ? { id: c.id, a: c.expediteur, nom: c.nom, objet: objetReponse(c.objet), texte: c.volumineux ? "" : c.texte.slice(0, 20000), recu: c.recu_le, verifie: c.expediteur_verifie } : null;
  return (
    <Enveloppe role={role} session={s} actif="courrier" minute={minuteServeur()}>
      <Tete titre={msg.courrier.titre} sous={msg.courrier.sous[role]} />
      {id && !reponse && <p className="mention-repli">{msg.courrier.filAbsent}</p>}
      {clients && envois ? (
        <Courrier key={reponse?.id ?? "nouveau"} role={role} admin={s.role === "admin" && role === "admins"} clients={clients} modeles={(modeles ?? modelesDeDepart()).equipe} envois={envois} moi={{ prenom: s.prenom, nom: s.nom }} initial={{ client: un(q.client), modele: un(q.modele), adresse: a && a.length <= 254 ? a : null, reponse }} redaction={redaction} />
      ) : (
        <div className="esp-grille">
          <Bloc id="t-red" titre={msg.courrier.message} s={12} i={1}>
            <Vide texte={[T.vides.indisponible, ""]} />
          </Bloc>
        </div>
      )}
    </Enveloppe>
  );
}
