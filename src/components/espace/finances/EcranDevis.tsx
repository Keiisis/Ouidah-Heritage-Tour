import type { Role } from "@/content/equipe";
import { espace as T } from "@/content/espace";
import { finances as F } from "@/content/espace-finances";
import { minuteServeur } from "@/lib/serveur/equipe/espace";
import { devisPayables, lireDevisListe, lireFactures } from "@/lib/serveur/equipe/finances/lectures";
import { emettreFacture } from "@/lib/serveur/equipe/finances/actions";
import { exigerDroit } from "@/lib/serveur/equipe/securite/droits";
import { Bloc, Vide } from "../Bloc";
import { Enveloppe } from "../Enveloppe";
import { SansDroit } from "../securite/SansDroit";
import { Tete } from "../Tete";
import { dateFr, Montant } from "./commun";
import { BoutonAction } from "./Envoi";
import { ListeDevis } from "./ListeDevis";
import { ListeFactures } from "./ListeFactures";
import "./finances.css";

// Devis (lot L7) : la liste de la table devis, filtrée par état et par agent (admin) ; un agent ne voit que les siens.
// Le devis se rédige dans le dossier (lot L4). Rendu sous <Suspense> ; sans session, retour à l'entrée.
export async function EcranDevis({ role }: { role: Role }) {
  const s = await exigerDroit("demandes", role); // droit « Demandes et devis » (lot « securite ») ; un admin les a tous
  if (!s) return <SansDroit role={role} actif="devis" />;
  const lignes = await lireDevisListe(s);
  const admin = s.role === "admin" && role === "admins";
  const D = F.devis;
  return (
    <Enveloppe role={role} session={s} actif="devis" minute={minuteServeur()}>
      <Tete titre={admin ? D.titreAdmin : D.titreAgent} sous={admin ? D.sousAdmin : D.sousAgent} />
      <div className="esp-finances">
        <div className="esp-grille">
          <Bloc id="d-liste" titre={admin ? D.titreAdmin : D.titreAgent} compte={lignes ? lignes.length : null} s={12} i={1}>
            {lignes ? <ListeDevis role={role} lignes={lignes} admin={admin} /> : <Vide texte={[T.vides.indisponible, ""]} />}
          </Bloc>
        </div>
      </div>
    </Enveloppe>
  );
}

// Factures et reçus de l'agent (lot L7) : ceux de ses dossiers, lus par le serveur ; il facture lui-même un devis envoyé.
export async function EcranFactures({ recherche }: { recherche?: Promise<{ facture?: string | string[] }> }) {
  const s = await exigerDroit("demandes", "agents");
  if (!s) return <SansDroit role="agents" actif="factures" />;
  const cible = (await recherche)?.facture;
  const [factures, devis] = await Promise.all([lireFactures(s, cible), devisPayables(s)]);
  const Fa = F.factures;
  const aFacturer = devis?.filter((d) => !d.facture) ?? null;
  const indispo = <Vide texte={[T.vides.indisponible, ""]} />;
  return (
    <Enveloppe role="agents" session={s} actif="factures" minute={minuteServeur()}>
      <Tete titre={Fa.titreAgent} sous={Fa.sousAgent} />
      <div className="esp-finances">
        <div className="esp-grille">
          <Bloc id="fa-afa" titre={Fa.aEmettre} compte={aFacturer ? aFacturer.length : null} s={12} i={1}>
            {!aFacturer ? (
              indispo
            ) : aFacturer.length ? (
              <ul className="liste">
                {aFacturer.map((d) => (
                  <li key={d.id} className="rangee">
                    <span className="texte">
                      <span className="titre">
                        {d.numero ?? ""} {d.client}
                      </span>
                      <span className="meta">{d.publie ? dateFr(d.publie) : ""}</span>
                    </span>
                    <Montant n={d.montant} />
                    <BoutonAction action={emettreFacture} args={[d.id]} libelle={Fa.emettre} nom={`${Fa.emettre} · ${d.client}`} reussite={Fa.emiseOk} />
                  </li>
                ))}
              </ul>
            ) : (
              <Vide texte={[Fa.aEmettreVide, ""]} />
            )}
          </Bloc>
          <Bloc id="fa-liste" titre={Fa.titreAgent} compte={factures ? factures.length : null} s={12} i={2}>
            {factures ? <ListeFactures factures={factures} admin={false} vide={Fa.videAgent} /> : indispo}
          </Bloc>
        </div>
      </div>
    </Enveloppe>
  );
}
