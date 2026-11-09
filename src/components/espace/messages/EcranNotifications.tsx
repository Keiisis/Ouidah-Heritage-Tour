import { redirect } from "next/navigation";
import { espace as T } from "@/content/espace";
import { msg } from "@/content/espace-messages";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { lireNotifications } from "@/lib/serveur/equipe/messages/lectures";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { Bloc, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { Tete } from "../Tete";
import { Notifications } from "./Notifications";
import "./messages.css";

// Notifications de l'agent (lot L6), rendues sous <Suspense> : celles du membre connecté seulement (dossier attribué,
// message reçu ; paiement reçu et devis ouvert quand ces faits seront suivis), lues ou non.
export async function EcranNotifications() {
  const s = await exigerRole("agents");
  if (!s) redirect("/agents");
  const notes = await lireNotifications(s);
  return (
    <Enveloppe role="agents" session={s} actif="notifications" minute={minuteServeur()}>
      <Tete titre={msg.notifications.titre} sous={msg.notifications.sous} />
      {notes ? (
        <Notifications notes={notes} />
      ) : (
        <div className="esp-grille">
          <Bloc id="t-not" titre={msg.notifications.liste} s={12} i={1}>
            <Vide texte={[T.vides.indisponible, ""]} />
          </Bloc>
        </div>
      )}
    </Enveloppe>
  );
}
