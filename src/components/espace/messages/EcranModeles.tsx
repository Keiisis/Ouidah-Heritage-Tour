import { redirect } from "next/navigation";
import { msg } from "@/content/espace-messages";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { lireModeles, modelesDeDepart } from "@/lib/serveur/equipe/messages/lectures";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { Enveloppe } from "../Enveloppe";
import { Tete } from "../Tete";
import { Modeles } from "./Modeles";
import "./messages.css";

// Modèles d'e-mails (lot L6), admin seulement, rendu sous <Suspense> ; un agent est renvoyé à l'entrée /admins. Si la
// table des modèles ne répond pas, l'écran montre les textes de départ et le dit (l'enregistrement le redira au besoin).
export async function EcranModeles() {
  const s = await exigerRole("admins");
  if (!s) redirect("/admins");
  const lus = await lireModeles();
  const modeles = lus ?? modelesDeDepart();
  const minute = minuteServeur();
  return (
    <Enveloppe role="admins" session={s} actif="modeles" minute={minute}>
      <Tete titre={msg.modeles.titre} sous={msg.modeles.sous} />
      {!lus && <p className="mention-repli" role="status">{msg.modeles.repli}</p>}
      <Modeles modeles={modeles.equipe} auto={modeles.auto} moi={{ prenom: s.prenom, nom: s.nom }} />
    </Enveloppe>
  );
}
