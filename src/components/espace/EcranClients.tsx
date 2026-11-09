import type { Role } from "@/content/equipe";
import { espace as T } from "@/content/espace";
import { lireClients } from "@/lib/serveur/equipe/dossiers";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { exigerDroit } from "@/lib/serveur/equipe/securite/droits";
import { Bloc, Vide } from "./Bloc";
import { Clients } from "./Clients";
import { Enveloppe } from "./Enveloppe";
import { SansDroit } from "./securite/SansDroit";
import { Tete } from "./Tete";

// Écran Clients (lot L4), rendu sous <Suspense> : un agent voit les fiches de ses dossiers, un admin toutes. Données
// réelles seulement (table clients, remplie depuis les demandes) ; si la base ne répond pas, on le dit.
export async function EcranClients({ role }: { role: Role }) {
  const s = await exigerDroit("demandes", role); // droit de l'agent (lot « securite ») ; un admin les a tous
  if (!s) return <SansDroit role={role} actif={"clients"} />;
  const clients = await lireClients(s);
  const C = T.clients;
  return (
    <Enveloppe role={role} session={s} actif="clients" minute={minuteServeur()}>
      <Tete titre={C.titre[role]} sous={C.sous[role]} />
      {clients ? (
        <Clients role={role} clients={clients} admin={s.role === "admin"} />
      ) : (
        <div className="esp-grille">
          <Bloc id="t-cli" titre={C.liste} s={12} i={1}>
            <Vide texte={[T.vides.indisponible, ""]} />
          </Bloc>
        </div>
      )}
    </Enveloppe>
  );
}
