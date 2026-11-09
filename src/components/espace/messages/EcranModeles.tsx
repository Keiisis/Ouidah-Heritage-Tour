import { redirect } from "next/navigation";
import { espace as T } from "@/content/espace";
import { msg } from "@/content/espace-messages";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { lireModeles } from "@/lib/serveur/equipe/messages/lectures";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { Bloc, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { Tete } from "../Tete";
import { Modeles } from "./Modeles";
import "./messages.css";

// Modèles d'e-mails (lot L6), admin seulement, rendu sous <Suspense> ; un agent est renvoyé à l'entrée /admins.
export async function EcranModeles() {
  const s = await exigerRole("admins");
  if (!s) redirect("/admins");
  const modeles = await lireModeles();
  const minute = minuteServeur();
  return (
    <Enveloppe role="admins" session={s} actif="modeles" minute={minute}>
      <Tete titre={msg.modeles.titre} sous={msg.modeles.sous} />
      {modeles ? (
        <Modeles modeles={modeles.equipe} auto={modeles.auto} moi={{ prenom: s.prenom, nom: s.nom }} />
      ) : (
        <div className="esp-grille">
          <Bloc id="t-mod" titre={msg.modeles.liste} s={12} i={1}>
            <Vide texte={[T.vides.indisponible, ""]} />
          </Bloc>
        </div>
      )}
    </Enveloppe>
  );
}
