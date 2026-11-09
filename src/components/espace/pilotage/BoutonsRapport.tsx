"use client";

import { pilotage as P } from "@/content/espace-pilotage";
import { envoyerRapport } from "@/lib/serveur/equipe/pilotage/actions";
import { BoutonAction } from "./Envoi";

// Envoi du rapport hebdomadaire : test à soi-même, puis envoi aux admins actifs (confirmé, nombre d'envois réussis dit par
// le serveur). Composant client : le message de réussite dépend de la réponse.
const R = P.rapport;

export function BoutonsRapport() {
  return (
    <div className="pil-actions">
      <BoutonAction action={envoyerRapport} args={["test"]} libelle={R.test} reussite={R.okTest} />
      <BoutonAction action={envoyerRapport} args={[false]} libelle={R.admins} reussite={(x) => R.okAdmins(x.n ?? 0)} confirmer={R.confirmer} secondaire={false} />
    </div>
  );
}
