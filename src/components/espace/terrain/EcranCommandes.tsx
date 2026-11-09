import { espace as T } from "@/content/espace";
import { terrain } from "@/content/espace-terrain";
import { jourOuidah } from "@/lib/jours";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { exigerDroit } from "@/lib/serveur/equipe/securite/droits";
import { lireCommandes } from "@/lib/serveur/equipe/terrain/commandes";
import { UUID } from "@/lib/serveur/equipe/dossiers-regles";
import { Bloc, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { SansDroit } from "../securite/SansDroit";
import { Tete } from "../Tete";
import { type CarteCommande, Commandes } from "./Commandes";
import "./terrain.css";

// Écran « Commandes boutique » de l'agent (lot terrain L5), rendu sous <Suspense> : sans session valable, retour à
// l'entrée /agents. Commandes lues par le serveur ; dates et montants formatés ici. Si la base ne répond pas, on le dit.
const C = terrain.commandes;
const lePaye = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: T.ouidah.fuseau });
const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const fcfa = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const MIN = 60_000;
/** « Aujourd'hui, 09 h 05 », « Hier, 18 h 40 » ou « 28 oct., 10 h 12 », à l'heure de Ouidah. */
function quand(t: number, ms: number) {
  const m = Math.floor(((t + T.ouidah.decalage * MIN) % 86_400_000) / MIN);
  const ecart = jourOuidah(ms) - jourOuidah(t);
  const jour = ecart === 0 ? T.aujourdhui : ecart === 1 ? T.hier : lePaye.format(t);
  return `${jour}, ${String(Math.floor(m / 60)).padStart(2, "0")} h ${String(m % 60).padStart(2, "0")}`;
}

export async function EcranCommandes({ recherche }: { recherche?: Promise<{ commande?: string | string[] }> }) {
  const s = await exigerDroit("boutique"); // droit de l'agent (lot « securite ») ; un admin les a tous
  if (!s) return <SansDroit role="agents" actif="commandes" />;
  const minute = minuteServeur(); // l'heure de la requête, lue après la session (comme les autres écrans)
  const ms = minute * 60_000;
  const parametre = (await recherche)?.commande;
  const cible = typeof parametre === "string" && UUID.test(parametre) ? parametre : undefined;
  const liste = await lireCommandes(cible);
  const cartes: CarteCommande[] | null = liste
    ? liste.map((c) => ({
        id: c.id,
        reference: c.reference,
        etat: c.etat,
        client: c.client,
        telephone: c.telephone,
        articles: c.articles,
        mode: c.mode,
        adresse: c.adresse,
        message: c.message,
        total: c.totalXof === null ? null : `${fcfa.format(c.totalXof)} ${T.monnaie.fcfa} (${euro.format(c.totalXof / T.taux)})`,
        paiement: c.paiement,
        frais: c.frais,
        zone: c.zone,
        echeance: c.echeance,
        quand: c.remise ? C.remiseLe(quand(c.remise, ms)) : C.recue(quand(c.recue, ms)),
      }))
    : null;
  return (
    <Enveloppe role="agents" session={s} actif="commandes" minute={minute}>
      <Tete titre={C.titre} sous={C.sous} />
      <div className="esp-grille">
        <Bloc id="t-com" titre={C.titre} compte={cartes ? cartes.filter((c) => c.etat !== "remise").length : null} s={12} i={1}>
          {cartes ? <Commandes key={cible ?? "liste"} commandes={cartes} admin={s.role === "admin"} /> : <Vide texte={[T.vides.indisponible, ""]} />}
        </Bloc>
      </div>
    </Enveloppe>
  );
}
