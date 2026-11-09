import { lireContenu } from "@/lib/contenu";
import { cleGroq } from "@/lib/serveur/assistant/fournisseur";
import { etatTraductions, lireReglagesTraduction } from "@/lib/serveur/traduction-auto/reglages";
import { ReglagesTraduction } from "./ReglagesTraduction";
import "./traduction-auto.css";

/** L'écran parent a déjà vérifié le rôle admin. Aucune clé n'est envoyée au navigateur. */
export async function TraductionAutomatique() {
  const [T, reg, etat] = await Promise.all([lireContenu("traduction-auto.interface"), lireReglagesTraduction(), etatTraductions()]);
  return <section className="tr-auto" aria-labelledby="tr-auto-titre">
    <h2 id="tr-auto-titre">{T.titre}</h2><p>{T.description}</p>
    {!reg ? <p role="status">{T.indisponible}</p> : <>
      {!cleGroq() && <p className="aide">{T.sansCle}</p>}
      {!(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 32) && <p className="aide">{T.sansCron}</p>}
      <dl className="tr-auto-etats">{(["attente", "enCours", "termines", "echecs"] as const).map(c => <div key={c}><dt>{T[c]}</dt><dd>{etat[c] ?? "—"}</dd></div>)}</dl>
      <ReglagesTraduction reg={reg} textes={T} />
    </>}
  </section>;
}
