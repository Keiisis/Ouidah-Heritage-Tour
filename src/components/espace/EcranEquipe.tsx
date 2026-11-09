import { redirect } from "next/navigation";
import { espace as T } from "@/content/espace";
import { lireEquipe } from "@/lib/serveur/equipe/agents";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { exigerRole } from "@/lib/serveur/equipe/session";
import { Bloc, Vide } from "./Bloc";
import { Enveloppe } from "./Enveloppe";
import { Equipe } from "./Equipe";
import { Tete } from "./Tete";

// Écran Équipe (lot L3, maquette E ?role=admins&ecran=equipe), rendu sous <Suspense> : admin connecté seulement, sinon
// retour à l'entrée /admins. Données réelles lues par le serveur (agents.ts) ; si la base ne répond pas, on le dit.
export async function EcranEquipe() {
  const s = await exigerRole("admins");
  if (!s) redirect("/admins");
  const membres = await lireEquipe();
  const E = T.equipe;
  return (
    <Enveloppe role="admins" session={s} actif="equipe" minute={minuteServeur()}>
      <Tete titre={E.titre} sous={E.sous} />
      {membres ? (
        <Equipe membres={membres} />
      ) : (
        <div className="esp-grille">
          <Bloc id="t-equ" titre={E.titre} s={12} i={1}>
            <Vide texte={[T.vides.indisponible, ""]} />
          </Bloc>
        </div>
      )}
    </Enveloppe>
  );
}
