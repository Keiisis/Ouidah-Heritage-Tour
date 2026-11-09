import Link from "next/link";
import { espace as T } from "@/content/espace";
import { terrain } from "@/content/espace-terrain";
import { jourOuidah } from "@/lib/jours";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { exigerDroit } from "@/lib/serveur/equipe/securite/droits";
import { lireControle } from "@/lib/serveur/equipe/terrain/billets";
import { vars, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { SansDroit } from "../securite/SansDroit";
import { Tete } from "../Tete";
import { Controle } from "./Controle";
import "./terrain.css";

// Écran « Contrôle des billets » (lot terrain L5), rendu sous <Suspense> : sans session valable, retour à l'entrée
// /agents. Éditions du jour, billets vendus, entrées et dernières entrées lus par le serveur ; sans événement aujourd'hui,
// l'écran le dit. Si la base ne répond pas, on le dit aussi, sans chiffre inventé.
const K = terrain.billets;
const leJour = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Porto-Novo" });

export async function EcranBillets() {
  const s = await exigerDroit("billets"); // droit de l'agent (lot « securite ») ; un admin les a tous
  if (!s) return <SansDroit role="agents" actif="billets" />;
  const minute = minuteServeur(); // l'heure de la requête, lue après la session (comme les autres écrans)
  const ms = minute * 60_000;
  const editions = await lireControle(jourOuidah(ms));
  return (
    <Enveloppe role="agents" session={s} actif="billets" minute={minute}>
      <Tete titre={K.titre} sous={editions?.length ? K.sous(editions[0].titre, leJour.format(ms)) : leJour.format(ms)} />
      {editions?.length ? (
        <Controle editions={editions} />
      ) : (
        <div className="esp-terrain construit" style={vars({ "--i": 1 })}>
          <Vide texte={editions ? K.vide : [T.vides.indisponible, ""]} />
          <Link className="bouton" href="/agents">
            {K.retour}
          </Link>
        </div>
      )}
    </Enveloppe>
  );
}
