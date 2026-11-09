import type { Role } from "@/content/equipe";
import { AccueilAdmin } from "@/components/espace/AccueilAdmin";
import { AccueilAgent } from "@/components/espace/AccueilAgent";
import { Enveloppe } from "@/components/espace/Enveloppe";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import type { Session } from "@/lib/serveur/equipe/session";

// Accueil une fois connecté (lot L2) : tableau de bord E « La course du soleil », dans son enveloppe. Composant serveur,
// rendu par l'entrée sous <Suspense> une fois la session lue (l'heure de la requête n'est lue qu'après elle).
export function Accueil({ role, session }: { role: Role; session: Session }) {
  return (
    <Enveloppe role={role} session={session} actif="accueil" minute={minuteServeur()}>
      {role === "admins" ? <AccueilAdmin prenom={session.prenom} /> : <AccueilAgent prenom={session.prenom} />}
    </Enveloppe>
  );
}
