import { redirect } from "next/navigation";
import type { Role } from "@/content/equipe";
import { espace as T } from "@/content/espace";
import { msg } from "@/content/espace-messages";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { clientsCourrier, envoisRecents, lireModeles } from "@/lib/serveur/equipe/messages/lectures";
import { assistantDisponible } from "@/lib/serveur/equipe/reglages/public";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { Bloc, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { Tete } from "../Tete";
import { Courrier } from "./Courrier";
import "./messages.css";

// Rédiger un e-mail (lot L6), rendu sous <Suspense> : l'agent écrit à ses clients, l'admin à tous ou à un groupe.
// ?client=<fiche>&modele=<clé> : reprise depuis la boîte de réception (« Répondre »). Données réelles seulement.
export async function EcranCourrier({ role, recherche }: { role: Role; recherche: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await exigerRole(role);
  if (!s) redirect(`/${role}`);
  const [q, clients, modeles, envois, redaction] = await Promise.all([recherche, clientsCourrier(s), lireModeles(), envoisRecents(s), assistantDisponible()]);
  const un = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);
  return (
    <Enveloppe role={role} session={s} actif="courrier" minute={minuteServeur()}>
      <Tete titre={msg.courrier.titre} sous={msg.courrier.sous[role]} />
      {clients && modeles && envois ? (
        <Courrier role={role} admin={s.role === "admin" && role === "admins"} clients={clients} modeles={modeles.equipe} envois={envois} moi={{ prenom: s.prenom, nom: s.nom }} initial={{ client: un(q.client), modele: un(q.modele) }} redaction={redaction} />
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
