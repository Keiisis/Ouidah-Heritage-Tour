import type { Role } from "@/content/equipe";
import { espace as T } from "@/content/espace";
import { lireDemandes, lireDossier, membresActifs } from "@/lib/serveur/equipe/dossiers";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { exigerDroit } from "@/lib/serveur/equipe/securite/droits";
import { Bloc, Vide } from "./Bloc";
import { Demandes } from "./Demandes";
import { Dossier } from "./Dossier";
import { Enveloppe } from "./Enveloppe";
import { SansDroit } from "./securite/SansDroit";
import { Tete } from "./Tete";

// Écran Demandes (et Dossiers voyage, rangés par étape) du lot L4, rendu sous <Suspense> : sans session valable pour ce
// rôle, retour à l'entrée. `ouvert` : identifiant du dossier dont le tiroir est ouvert (/agents/demandes/<id>). Le dossier
// est lu AVANT la liste : un dossier hors de portée (celui d'un autre agent, un identifiant forgé) donne notFound() et
// rien n'est rendu, ni la liste ni le dossier. Données réelles seulement ; si la base ne répond pas, on le dit.
export async function EcranDemandes({ role, ouvert, vue = "demandes" }: { role: Role; ouvert?: string; vue?: "demandes" | "dossiers" }) {
  const s = await exigerDroit("demandes", role); // droit de l'agent (lot « securite ») ; un admin les a tous
  if (!s) return <SansDroit role={role} actif={vue === "dossiers" ? "dossiers" : "demandes"} />;
  const admin = s.role === "admin";
  const dossier = ouvert === undefined ? null : await lireDossier(s, ouvert);
  const [liste, membres] = await Promise.all([lireDemandes(s), admin ? membresActifs() : Promise.resolve(null)]);
  const D = T.demandes;
  return (
    <Enveloppe role={role} session={s} actif={vue === "dossiers" ? "dossiers" : "demandes"} minute={minuteServeur()}>
      <Tete titre={vue === "dossiers" ? D.titreDossiers : D.titre[role]} sous={vue === "dossiers" ? D.sousDossiers : D.sous[role]} />
      {liste ? (
        <Demandes role={role} demandes={liste} membres={membres} admin={admin} parEtape={vue === "dossiers"} />
      ) : (
        <div className="esp-grille">
          <Bloc id="t-dem" titre={D.liste} s={12} i={1}>
            <Vide texte={[T.vides.indisponible, ""]} />
          </Bloc>
        </div>
      )}
      {ouvert !== undefined &&
        (dossier ? (
          <Dossier key={dossier.id} role={role} d={dossier} admin={admin} membres={membres} />
        ) : (
          <p className="mention" role="alert">
            {T.dossier.indisponible}
          </p>
        ))}
    </Enveloppe>
  );
}
